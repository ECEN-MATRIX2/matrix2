// Compile the ACTUAL comms.inc against a simulated UART/HAL, without hardware.
#include <cassert>
#include <deque>
#include <string>
#include "comms_protocol.h"
#include "throttle_mode.h"
#include "demo_battery.h"
constexpr int PA7=7,PA5=5,PB11=27,PA6=6,INPUT=0,GPIO_PIN_10=1024;
constexpr int GPIO_MODE_AF_OD=2,GPIO_NOPULL=0,GPIO_SPEED_FREQ_LOW=0,GPIO_AF7_USART3=7;
constexpr int USART3_IRQn=39,SERIAL_TX_BUFFER_SIZE=64,DAC_CR_EN2=1,USART_SR_TC=1;
struct {unsigned SR=USART_SR_TC;} uart;
auto USART3=&uart;
struct {unsigned CR=0;} dac;
auto DAC=&dac;
int gpio;auto GPIOB=&gpio;
struct GPIO_InitTypeDef {int Pin,Mode,Pull,Speed,Alternate;};
void pinMode(int,int) {}
void __HAL_RCC_DAC_CLK_ENABLE() {}
void HAL_GPIO_Init(int*,GPIO_InitTypeDef* p){assert(p->Mode==GPIO_MODE_AF_OD);}
void HAL_NVIC_SetPriority(int,int priority,int){assert(priority==2);}
struct FakeSerial {
    std::deque<char> tx,rx;std::string output;bool receive=true;
    unsigned reads=0,writes=0;
    void begin(unsigned baud){assert(baud==9600);}
    int availableForWrite(){return SERIAL_TX_BUFFER_SIZE-1-int(tx.size());}
    int available(){return int(rx.size());}
    void write(uint8_t c){assert(availableForWrite()>0);receive=false;uart.SR=0;tx.push_back(char(c));++writes;}
    void enableHalfDuplexRx(){assert(tx.empty() && (uart.SR&USART_SR_TC));receive=true;}
    int read(){assert(receive && tx.empty());char c=rx.front();rx.pop_front();++reads;return c;}
    void drain(){if(!tx.empty()){output+=tx.front();tx.pop_front();}if(tx.empty())uart.SR=USART_SR_TC;}
    void inject(const std::string& s){assert(receive);for(char c:s)rx.push_back(c);}
} motorLink;
struct Lock {Lock(){} ~Lock(){}};
enum class Fault {None=0,Overcurrent=6};
struct {bool running=false;Fault fault=Fault::None;} drive;
static ThrottleMode throttle;
static DemoBattery demoBattery;
static comms::Requests commRequests;
static uint32_t clockMs=0,lastCommMs=0,commSequence=0,currentSampleMs=0,vmReadUs=0;
static bool currentSampleValid=false,currentCalibrated=false,speedValid=true;
static bool driverReady=false,faultIrq=false;
static unsigned vmAdc=3000;
static float vin=36,currentFiltered=0,dutyPct=0,measuredMph=0;
static struct {bool valid=false;float vm=0,amps=0;} faultSnapshot;
uint32_t micros(){return clockMs*1000;}
bool charging(){return false;}
bool waitTorque=false;
comms::State stateCode(){return drive.fault!=Fault::None?comms::Faulted:(waitTorque?comms::WaitTorque:comms::Stopped);}
static unsigned clears=0;
comms::Result clearFaultRequest(){++clears;drive.fault=Fault::None;throttle.stop();return comms::Cleared;}
comms::Result handleRemoteCommand(comms::Command c){assert(c.action==comms::Reset);return clearFaultRequest();}
#include "../src/comms.inc"
static void tick(){++clockMs;vmReadUs=micros();motorLink.drain();serviceComms(clockMs);}
static void nextSlot(){
    auto previous=commRequests.token;
    for(unsigned n=0;n<1000;++n){tick();if(commRequests.active(clockMs) && commRequests.token!=previous)return;}
    assert(false);
}
static std::string request(uint32_t token,uint32_t id){
    char line[64];auto n=comms::encodeCommand({token,id},line,sizeof(line));return {line,n};
}
int main(){
    beginCommUart();nextSlot();
    assert(motorLink.receive && motorLink.output.back()=='\n');
    auto end=motorLink.output.size();auto start=motorLink.output.rfind('$');
    comms::Status status;
    assert(comms::decode(motorLink.output.data()+start,end-start,status));
    assert(status.data.sequence==commRequests.token);
    drive.fault=Fault::Overcurrent;
    motorLink.inject(request(commRequests.token,1));
    auto reads=motorLink.reads;serviceComms(clockMs);assert(motorLink.reads-reads<=32);
    serviceComms(clockMs);assert(clears==1 && commRequests.lastResult==comms::Cleared);
    assert(!throttle.requested && !throttle.armed);
    motorLink.inject(request(commRequests.token,2));serviceComms(clockMs);serviceComms(clockMs);
    assert(clears==1); // second request in same slot rejected
    nextSlot();drive.fault=Fault::Overcurrent;
    motorLink.inject(request(commRequests.token,1));serviceComms(clockMs);serviceComms(clockMs);
    assert(clears==1 && drive.fault==Fault::Overcurrent); // cached ACK cannot clear new fault
    nextSlot();
    motorLink.inject(request(commRequests.token-1,2));serviceComms(clockMs);serviceComms(clockMs);
    assert(clears==1);
    clockMs=commRequests.openedAt+comms::RX_WINDOW_MS;
    motorLink.inject(request(commRequests.token,2));serviceComms(clockMs);serviceComms(clockMs);
    assert(clears==1); // late packet rejected
    nextSlot(); // verify subsequent status still shows fault and previous ACK
    end=motorLink.output.size();start=motorLink.output.rfind('$');
    assert(comms::decode(motorLink.output.data()+start,end-start,status));
    assert(status.data.fault==6 && status.ackId==1 && status.ackResult==comms::Cleared);
    drive.fault=Fault::None;waitTorque=true;nextSlot();
    end=motorLink.output.size();start=motorLink.output.rfind('$');
    assert(comms::decode(motorLink.output.data()+start,end-start,status));
    assert(status.state==comms::WaitTorque && !(status.data.flags&telemetry::FAULT));
    // Stalled TX hardware does not cause a blocking flush/read/write call.
    clockMs+=300;serviceComms(clockMs);assert(commSending);
    for(unsigned i=0;i<10000;++i)serviceComms(clockMs);
    assert(!motorLink.tx.empty() && !commRequests.active(clockMs));
    puts("PASS: actual UART scheduler with simulated backpressure, turnaround, ACK, duplicate, stale and late packets");
}
