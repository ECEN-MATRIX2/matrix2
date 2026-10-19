#include <Arduino.h>
#include <HardwareTimer.h>
#include <IWatchdog.h>
#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include "drive_logic.h"
#include "lab_rtt.h"
#include "speed_output.h"
#include "thermal_policy.h"
#include "current_calibration.h"
#include "speed_regulator.h"
#include "telemetry.h"
#include "demo_battery.h"
#include "throttle_mode.h"
#include "current_regulator.h"
#include "launch_support.h"
#include "comms_protocol.h"
#if !defined(HAL_UART_MODULE_ENABLED) || defined(HAL_UART_MODULE_ONLY)
#error "Full STM32 UART HAL configuration required; incomplete HardwareSerial layout."
#endif
static_assert(cfg::CURRENT_LIMIT_A==ThrottleMode::MAX_CURRENT_A,"Current request must match bench limit");

namespace pin {
constexpr uint32_t MISO=PB3,MOSI=PB4,SCK=PC10,NCS=PC9,ENABLE=PB5;
constexpr uint32_t UH=PA10,VH=PA9,WH=PA8,UL=PB15,VL=PB14,WL=PB13;
constexpr uint32_t FAULT=PB7,LED=PB0,H1=PC8,H2=PC7,H3=PC6;
constexpr uint32_t MOTOR_TEMP=PC4,PCB_TEMP=PA3,VM=PC3,MODE=PC13;
constexpr uint32_t CURRENT[3]={PC2,PC1,PC0};
}
namespace reg {
constexpr uint8_t GCONF=0x00,GSTAT=0x01,IOIN=0x04,SHORT_CONF=0x09,DRV_CONF=0x0A;
constexpr uint32_t GCONF_VALUE=0x04,BAD_STATUS=0x777F;
constexpr uint32_t SHORT_DISABLE=(1u<<29)|(1u<<30);
}
struct Lock {
    uint32_t saved;
    Lock():saved(__get_PRIMASK()) {__disable_irq();__DMB();}
    ~Lock(){__DMB();__set_PRIMASK(saved);}
};
static HardwareTimer pwm(TIM1),tickTimer(TIM2);
static DriveLogic drive(cfg::HALL_TO_SECTOR);
static SpeedObserver speedObserver;
static ThrottleMode throttle;
static LaunchSupport launch;
static volatile uint32_t heartbeat=0;
static volatile bool faultIrq=false,preparing=false,driverReady=false;
static bool pwmReady=false,currentCalibrated=false,currentSampleValid=false,speedValid=false;
static uint32_t pwmPeriod=0,lastControlMs=0,lastSampleUs=0,lastThermalMs=0,lastLogMs=0,lastDriverMs=0;
static uint32_t gstat=0,ioin=0,gconf=0,shortconf=0,drvconf=0;
static unsigned vmAdc=0,motorAdc=0,pcbAdc=0;
static uint32_t vmReadUs=0,lastAdcPin=0xffffffffu,vmPreviousAdcPin=0xffffffffu;
static float vin=0,phaseA=0,currentFiltered=0,measuredMph=0,setpointAmps=0;
static float integral=0,dutyPct=0,currentCap=20,rawMph=0,cycleMph=0;
static uint32_t speedPeriod=0,speedCycleSum=0;
static unsigned speedCycleCount=0;
static BusControlFilter controlBus;
static uint32_t controlBusUs=0;
static int zeroCurrent[3]={},zeroMinimum[3]={},zeroMaximum[3]={};
static control::Temperature motorTemp{false,NAN,NAN},pcbTemp{false,NAN,NAN};
static HardwareSerial motorLink(uint32_t(PB10)); // USART3 single-pin half duplex
static comms::Requests commRequests;
static bool remoteClearPermit=false;
static uint32_t remoteClearMs=0;
static uint32_t remoteClearId=0;
static DemoBattery demoBattery;
static uint32_t commSequence=0,lastCommMs=0,currentSampleMs=0;
static struct {bool valid=false;float vm=0,amps=0,duty=0;uint32_t ms=0;} faultSnapshot;

// Nonblocking RTT console: loss of the PC cannot stall the motor control loop.
static char tx[4096];static unsigned txHead=0,txTail=0;
static void say(const char *fmt,...) {
    char s[640];va_list a;va_start(a,fmt);int n=vsnprintf(s,sizeof(s),fmt,a);va_end(a);
    if(n<0 || unsigned(n)>=sizeof(s))return;
    if(unsigned(n)>(txTail+sizeof(tx)-txHead-1)%sizeof(tx))return;
    for(int i=0;i<n;++i) {tx[txHead]=s[i];txHead=(txHead+1)%sizeof(tx);}
}
static void serviceTx() {
    unsigned n=txHead>=txTail?txHead-txTail:sizeof(tx)-txTail;
    if(n>64)n=64;
    if(n)txTail=(txTail+labrtt::write(tx+txTail,n))%sizeof(tx);
}
static bool running() {Lock l;return drive.running;}
static Fault motorFault() {Lock l;return drive.fault;}
static bool charging() {return cfg::USE_CHARGE_INPUT && !(GPIOC->IDR&GPIO_PIN_13);}
static uint8_t readHall() {
    uint32_t b=GPIOC->IDR;return ((b>>8)&1u)|((b>>6)&2u)|((b>>4)&4u);
}
static void phasesOff();static void killHardware();
static void captureFault() {
    if(!faultSnapshot.valid)faultSnapshot={true,vin,phaseA,dutyPct,millis()};
}
static void trip(Fault f) {
    remoteClearPermit=false;
    captureFault();
    Lock l;drive.trip(f);preparing=driverReady=false;killHardware();
    throttle.stop();dutyPct=setpointAmps=integral=0;
}
// Proven PWM, SPI and calibration routines retained without changing pins.
#include "hardware.inc"

static void coast() {
    Lock l;drive.stop();phasesOff();dutyPct=setpointAmps=integral=0;
}
static void disableDriver() {
    coast();Lock l;preparing=driverReady=false;killHardware();currentSampleValid=false;
}
static void stop() {remoteClearPermit=false;launch.idle();throttle.stop();disableDriver();}
static void fastTick() {
    bool ch=charging();bool f=faultIrq || (GPIOB->IDR&GPIO_PIN_7);
    int sector=drive.tick(readHall(),ch,f,heartbeat);
    speedObserver.observe(drive.hall.stable,drive.ticks);
    if(ch || drive.ticks-heartbeat>cfg::MAIN_TIMEOUT_TICKS || drive.fault!=Fault::None) {
        if(drive.ticks-heartbeat>cfg::MAIN_TIMEOUT_TICKS && driverReady)drive.trip(Fault::LoopTimeout);
        preparing=driverReady=false;killHardware();phaseSector(-1,0);return;
    }
    if(!drive.running) {
        phaseSector(-1,0);
        if(!preparing && !driverReady)GPIOB->BSRR=GPIO_PIN_5<<16u;
        return;
    }
    phaseSector(sector,drive.duty);
}
static void faultISR() {
    if(driverReady || drive.running) {
        faultIrq=true;drive.trip(Fault::Driver);preparing=driverReady=false;killHardware();
    }
}
static void sampleCurrentAndBus() {
    currentSampleValid=false;vin=readVin();
    if(!driverReady)return;
    if(!isfinite(vin) || vin>cfg::VM_MAX || (running() && vin<cfg::VM_MIN)) {trip(Fault::BusVoltage);return;}
    float peak=0;
    for(unsigned p=0;p<3;++p) {
        int raw=readADC(pin::CURRENT[p]);
        if(raw<8 || raw>4087) {trip(Fault::CurrentSensor);return;}
        float a=fabsf(raw-zeroCurrent[p])*cfg::ADC_VREF/4095.0f/(cfg::SHUNT_OHM*cfg::CURRENT_GAIN);
        peak=fmaxf(peak,a);
    }
    phaseA=peak;currentFiltered+=.2f*(peak-currentFiltered);
    currentSampleMs=millis();currentSampleValid=currentCalibrated;
    controlBus.update(vin,float(uint32_t(vmReadUs-controlBusUs))/1000000);controlBusUs=vmReadUs;
    if(peak>=cfg::CURRENT_TRIP_A)trip(Fault::Overcurrent);
}
static void sampleThrottle() {
    readADC(PA6); // discard after changing ADC mux
    float a=readADC(PA6),b=readADC(PA6),c=readADC(PA6);
    throttle.sample(median3(a,b,c)*cfg::ADC_VREF/4095.0f,millis());
}
static bool startVoltage() {return isfinite(vin) && vin>=cfg::VM_START_MIN && vin<=cfg::VM_START_MAX;}
static bool stationary() {Lock l;return drive.ticks-drive.lastEdge>=cfg::TICK_HZ;}
static bool readySensors() {
    Lock l;
    return cfg::HALL_MAP_CONFIRMED && cfg::SPEED_GEOMETRY_CONFIRMED &&
        control::validMap(cfg::HALL_TO_SECTOR) && control::validHall(drive.hall.stable) &&
        thermal::ready(motorTemp,pcbTemp,cfg::USE_MOTOR_TEMPERATURE) &&
        !charging() && drive.ticks-drive.chargeReleased>=cfg::TICK_HZ;
}
static void prepareAtIdle() {
    if(!throttle.canArm(millis()) || !startVoltage() || !readySensors() || !stationary())return;
    if(!initDriver() || !calibrateCurrentZero()) {
        if(motorFault()==Fault::None)trip(Fault::DriverConfig);
        disableDriver();return;
    }
    vin=readVin();sampleThrottle();
    if(!startVoltage() || charging() || !throttle.idleReady(millis())) {
        disableDriver();throttle.suspend();return;
    }
    // Publish readiness atomically against the charge and driver-fault IRQ paths.
    {Lock l;
        if(!preparing || drive.fault!=Fault::None || charging() || digitalRead(pin::FAULT)) {
            preparing=false;killHardware();throttle.suspend();return;
        }
        driverReady=throttle.authorize(millis());preparing=false;
    }
    controlBus.reset(vin);controlBusUs=vmReadUs;
    currentCap=20;currentFiltered=phaseA=0;
    say("READY: throttle controls motion. Idle coasts; USB is optional.\n");
}
static void serviceThrottle() {
    const uint32_t now=millis();throttle.checkFresh(now);
    if(motorFault()!=Fault::None || throttle.inputFault!=ThrottleMode::None) {captureFault();stop();return;}
    if(charging()) {launch.idle();disableDriver();throttle.suspend();return;}
    if(!throttle.requested) {disableDriver();return;}
    if(!driverReady) {
        // A charge transition/VM interruption cancels the previous idle permission.
        if(throttle.armed)throttle.suspend();
        if(!startVoltage()) {throttle.forgetIdle();return;}
        prepareAtIdle();return;
    }
    if(vin<cfg::VM_MIN) {disableDriver();throttle.suspend();return;}
    if(!throttle.wantsDrive(now)) {launch.idle();coast();return;}
    if(!launch.allow(throttle.target)) {coast();return;}
    if(!running()) {
        integral=0;throttle.reference=0;dutyPct=0;
        Lock l;heartbeat=drive.ticks;
        if(!drive.arm()) {driverReady=false;killHardware();throttle.suspend();}
        else launch.begin(now,drive.edges);
    }
}
static void currentControl(float dt) {
    if(!currentSampleValid || !currentCalibrated || uint32_t(millis()-currentSampleMs)>=20 ||
       !isfinite(currentFiltered)) {trip(Fault::CurrentSensor);return;}
    uint32_t edges,noEdgeMs;{Lock l;edges=drive.edges;noEdgeMs=(drive.ticks-drive.lastEdge)/20;}
    if(launch.waitForMore(throttle.target,currentFiltered,millis(),edges,noEdgeMs)) {
        coast();return;
    }
    const float request=launch.request(throttle.target,millis(),edges);
    setpointAmps=fminf(request,setpointAmps+2.0f*control::clamp(dt,0,.05f));
    throttle.reference=setpointAmps;
    const float requested=setpointAmps*thermal::scale(motorTemp,pcbTemp,cfg::USE_MOTOR_TEMPERATURE);
    dutyPct=currentDuty(requested,currentFiltered,dt,95,dutyPct);
    Lock l;if(drive.running)drive.duty=uint16_t(dutyPct*pwmPeriod/100);
}
static const char *faultName() {
    switch(motorFault()) {
    case Fault::None:break;
    case Fault::Driver:return "Gate-driver fault";
    case Fault::HallInvalid:return "Invalid Hall code";
    case Fault::HallSequence:return "Hall sequence / reverse rotation";
    case Fault::Stall:return "Stall under applied drive";
    case Fault::LoopTimeout:return "Control loop stalled";
    case Fault::Overcurrent:return "Phase current >= 4 A";
    case Fault::CurrentSensor:return "Current sensor / calibration";
    case Fault::MotorSensor:return "Motor temperature sensor";
    case Fault::PcbSensor:return "PCB temperature sensor";
    case Fault::MotorHot:return "Motor overtemperature";
    case Fault::PcbHot:return "PCB >= 80 C";
    case Fault::BusVoltage:return "VM outside 30-45 V";
    case Fault::DriverConfig:return "Gate-driver configuration";
    default:return "Motor protection";
    }
    switch(throttle.inputFault) {
    case ThrottleMode::Signal:return "Throttle outside 0.20-3.10 V for 50 ms";
    case ThrottleMode::Stale:return "Throttle samples stale";
    case ThrottleMode::Watchdog:return "Watchdog reset - inspect before clearing";
    default:return "none";
    }
}
static comms::State stateCode() {
    if(motorFault()!=Fault::None || throttle.inputFault!=ThrottleMode::None)return comms::Faulted;
    if(charging())return comms::Charge;
    if(!throttle.requested)return comms::Stopped;
    if(launch.waiting)return comms::WaitTorque;
    if(!driverReady) {
        if(!startVoltage())return comms::WaitVm;
        if(!readySensors())return comms::WaitSensors;
        if(!stationary())return comms::WaitStill;
        return comms::WaitIdle;
    }
    if(dutyPct>0 && running())return comms::Driving;
    return measuredMph>.1f?comms::Coasting:comms::Ready;
}
static const char *stateName() {
    static const char* names[]={"WAIT_VM","WAIT_SENSORS","WAIT_STILL","WAIT_IDLE","READY",
        "DRIVING","COASTING","STOPPED","CHARGE","FAULT","WAIT_TORQUE"};
    return names[stateCode()];
}
static comms::Result clearFaultRequest() {
    const auto result=comms::resetCheck(running(),stationary(),throttle.idleReady(millis()),
                                       startVoltage(),readySensors());
    if(result!=comms::Cleared)return result;
    disableDriver();
    if(!throttle.clear(millis()))return comms::NotIdle;
    {Lock l;drive.fault=Fault::None;faultIrq=false;}
    launch.idle();faultSnapshot={};
    return comms::Cleared; // clear only; explicit Enable required afterwards
}
// Shared with the local GUI: the same throttle qualification grants permission.
static bool requestThrottleEnable() {
    return motorFault()==Fault::None && throttle.enable(millis());
}
static comms::Result enableThrottleRequest() {
    const bool permitted=remoteClearPermit && uint32_t(millis()-remoteClearMs)<2000;
    remoteClearPermit=false; // single use; retries return the saved ACK
    if(!permitted)return comms::ClearRequired;
    if(motorFault()!=Fault::None || throttle.inputFault!=ThrottleMode::None)return comms::FaultPresent;
    auto result=comms::resetCheck(running(),stationary(),throttle.idleReady(millis()),startVoltage(),readySensors());
    if(result!=comms::Cleared)return result;
    if(!requestThrottleEnable())return comms::NotIdle;
    prepareAtIdle(); // existing driver configuration, current-zero calibration and final idle check
    if(motorFault()!=Fault::None || throttle.inputFault!=ThrottleMode::None){stop();return comms::FaultPresent;}
    if(!driverReady || !throttle.armed || !throttle.idleReady(millis()) ||
       !stationary() || !startVoltage() || !readySensors()) {stop();return comms::EnableFailed;}
    // No drive.arm(), PWM or torque command here. Idle demand remains zero.
    return comms::Enabled;
}
static comms::Result handleRemoteCommand(comms::Command cmd) {
    if(cmd.action==comms::Enable){
        if(!remoteClearId || remoteClearId==UINT32_MAX || cmd.id!=remoteClearId+1){
            remoteClearPermit=false;return comms::ClearRequired;
        }
        return enableThrottleRequest();
    }
    remoteClearPermit=false;
    const auto result=clearFaultRequest();
    if(result==comms::Cleared){remoteClearPermit=true;remoteClearMs=millis();remoteClearId=cmd.id;}
    return result;
}
static void printStatus() {
    unsigned hall;{Lock l;hall=drive.hall.stable;}
    say("{\"revision\":\"%s\",\"ms\":%lu,\"state\":\"%s\",\"fault\":\"%s\",\"requested\":%u,\"armed\":%u,\"idle\":%u,\"throttle\":%.3f,\"target\":%.2f,\"reference\":%.2f,\"speed\":%.2f,\"vm\":%.2f,\"current\":%.2f,\"pcb\":%.1f,\"duty\":%.2f,\"soc\":%.1f,\"hall\":%u,\"gstat\":%lu,\"fault_vm\":%.2f,\"fault_current\":%.2f,\"fault_duty\":%.2f}\n",
        cfg::REVISION,(unsigned long)millis(),stateName(),faultName(),throttle.requested,throttle.armed,
        throttle.idleReady(millis()),throttle.volts,throttle.target,setpointAmps,measuredMph,vin,
        driverReady?phaseA:0,pcbTemp.valid?pcbTemp.c:-999,dutyPct,demoBattery.valid?demoBattery.percent:-1,
        hall,(unsigned long)gstat,faultSnapshot.valid?faultSnapshot.vm:-1,
        faultSnapshot.valid?faultSnapshot.amps:-1,faultSnapshot.valid?faultSnapshot.duty:-1);
}
static void command(const char *s) {
    if(!strcmp(s,"start") || !strcmp(s,"throttle") || !strcmp(s,"stop") || !strcmp(s,"reset"))remoteClearPermit=false;
    if(!strcmp(s,"stop")) {stop();say("STOP accepted. Drive inhibited; wheel coasts.\n");}
    else if(!strcmp(s,"start") || !strcmp(s,"throttle")) {
        if(requestThrottleEnable())say("ENABLE accepted. Waiting for healthy VM/sensors.\n");
        else say("ENABLE blocked: clear faults and hold throttle at 0.35-0.60 V for 0.5 s.\n");
    } else if(!strcmp(s,"reset")) {
        if(clearFaultRequest()!=comms::Cleared)
            say("CLEAR blocked: idle throttle, stationary wheel, healthy VM/sensors required.\n");
        else {
            say("Fault cleared; remains STOPPED. Press Enable to recheck driver.\n");
        }
    } else if(!strncmp(s,"hello ",6))say("%s\n",s);
    else if(!strcmp(s,"ping"))say("pong\n");
    else if(strcmp(s,"status"))say("Commands: start | stop | reset | status | ping\n");
    printStatus();
}
static void serviceCommands() {
    static char line[32];static unsigned used=0;static bool overflow=false;
    for(unsigned i=0;i<32;++i) {
        int c=labrtt::read();if(c<0)break;
        if(c=='\r' || c=='\n') {
            if(!overflow && used) {line[used]=0;command(line);}
            used=0;overflow=false;
        } else if(c<32 || c>126 || used>=sizeof(line)-1)overflow=true;
        else line[used++]=char(c);
    }
}
#include "comms.inc"
#include "setup.inc"
void loop() {
    {Lock l;heartbeat=drive.ticks;}
    IWatchdog.reload();serviceCommands();
    uint32_t now=millis(),us=micros();
    if(uint32_t(us-lastSampleUs)>=1000) {lastSampleUs=us;sampleCurrentAndBus();}
    if(uint32_t(now-lastThermalMs)>=50) {lastThermalMs=now;temperatures();}
    if(uint32_t(now-lastControlMs)>=10) {
        float dt=float(now-lastControlMs)/1000;lastControlMs=now;
        updateSpeedMeasurement();sampleThrottle();serviceThrottle();
        if(running())currentControl(dt);
    }
    if(driverReady && uint32_t(now-lastDriverMs)>=100) {
        lastDriverMs=now;snapshotDriver();
        if(gstat&reg::BAD_STATUS)trip(Fault::Driver);
        else if(gconf!=reg::GCONF_VALUE || (shortconf&reg::SHORT_DISABLE))trip(Fault::DriverConfig);
    }
    serviceComms(millis());
    if(uint32_t(now-lastLogMs)>=200) {lastLogMs=now;printStatus();}
    digitalWrite(pin::LED,running()?((now/100)&1):((now/500)&1));serviceTx();
}
