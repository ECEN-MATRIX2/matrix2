#include <stdio.h>
#include <math.h>
#include <initializer_list>
#include "throttle_mode.h"
#include "current_regulator.h"
#include "drive_logic.h"
#include "speed_output.h"
#include "speed_regulator.h"
#include "thermal_policy.h"
#include "current_calibration.h"
#include "telemetry.h"
static unsigned checks=0;
#define CHECK(x) do {++checks;if(!(x)){printf("FAILED line %d: %s\n",__LINE__,#x);return 1;}}while(0)
static void idle(ThrottleMode& t,uint32_t start=0) {for(unsigned i=0;i<=600;i+=10)t.sample(.5f,start+i);}
static void tick(DriveLogic& d,uint8_t h,unsigned count) {for(unsigned i=0;i<count;++i)d.tick(h,false,false,d.ticks);}
int main() {
    ThrottleMode t;
    CHECK(t.requested && !t.armed);
    for(unsigned n=0;n<1000;n+=10) {t.sample(2.5f,n);CHECK(!t.canArm(n));}
    idle(t,1000);CHECK(t.authorize(1600));
    // Real use: thousands of idle/full/idle cycles, no explicit re-arm or host.
    uint32_t now=1610;
    for(unsigned cycle=0;cycle<1000;++cycle) {
        for(unsigned i=0;i<20;++i) {t.sample(2.5f,now);CHECK(t.wantsDrive(now));t.step(.01f);now+=10;}
        t.sample(.5f,now);CHECK(!t.wantsDrive(now));CHECK(t.armed);CHECK(t.inputFault==ThrottleMode::None);now+=10;
    }
    CHECK(t.requested && t.armed);
    // Endpoint noise around 0.5 V cannot create demand or end the session.
    for(float v:{.35f,.49f,.5f,.51f,.59f,.60f}) {t.sample(v,now++);CHECK(!t.demand && t.armed);}
    for(unsigned i=0;i<150;++i)t.sample(2.5f,now++);
    CHECK(fabsf(t.target-2)<.01f);
    for(unsigned i=0;i<150;++i)t.sample(1.5f,now++);
    CHECK(fabsf(t.target-1.0f)<.01f);
    CHECK(median3(620,4095,621)==621);CHECK(median3(0,621,620)==620);
    CHECK(median3(621,620,0)==620);
    t.sample(2.928f,now++);CHECK(t.valid && t.armed); // observed prior nuisance sample
    t.sample(0,now);CHECK(!t.wantsDrive(now) && t.inputFault==ThrottleMode::None);
    t.sample(.5f,now+10);CHECK(t.armed && t.inputFault==ThrottleMode::None);now+=20;
    t.sample(0,now);t.sample(0,now+49);CHECK(t.armed);
    t.sample(0,now+50);CHECK(!t.armed && !t.requested && t.inputFault==ThrottleMode::Signal);
    t.sample(2.5f,now+60);CHECK(!t.clear(now+60) && !t.enable(now+60));
    idle(t,now+70);CHECK(t.clear(now+670));CHECK(!t.requested);
    CHECK(t.enable(now+670));CHECK(t.authorize(now+670));now+=680;
    t.stop();t.sample(2.5f,now);CHECK(!t.wantsDrive(now));CHECK(!t.enable(now));
    idle(t,now+10);CHECK(t.enable(now+610));CHECK(t.authorize(now+610));now+=620;
    t.checkFresh(now+50);CHECK(t.inputFault==ThrottleMode::Stale && !t.armed);
    // Charge/VM interruptions require a new idle qualification after release.
    ThrottleMode charge;idle(charge);CHECK(charge.authorize(600));charge.suspend();
    charge.sample(2.5f,610);CHECK(!charge.canArm(610));idle(charge,620);CHECK(charge.authorize(1220));
    // Time wrap is not a session deadline.
    ThrottleMode wrap;idle(wrap,0xfffffe00u);CHECK(wrap.authorize(uint32_t(0xfffffe00u+600)));
    t=ThrottleMode{};idle(t);CHECK(t.authorize(600));
    for(unsigned i=0;i<150;++i)t.sample(2.5f,610+i);
    CHECK(fabsf(t.step(.01f)-.02f)<.001f);
    for(unsigned i=0;i<100;++i)t.step(.01f);
    CHECK(fabsf(t.reference-2)<.01f);
    for(unsigned i=0;i<100;++i)t.sample(.66f,800+i);
    CHECK(t.step(.01f)<.17f); // no speed tracking or setpoint coast switch
    CHECK(currentDuty(1,1,.01f,95,40)==40); // steady current holds nonzero duty
    CHECK(currentDuty(1,1.02f,.01f,95,40)==40);
    CHECK(currentDuty(1,.5f,.01f,95,40)>40);
    CHECK(currentDuty(1,1.5f,.01f,95,40)<40);
    CHECK(currentDuty(0,0,.01f,95,40)==0);
    CHECK(currentDuty(1,NAN,.01f,95,40)==0);
    CHECK(currentDuty(2,0,.01f,95,0)<=.2001f);
    CHECK(currentDuty(2,0,.01f,95,95)==95);
    CHECK(currentDuty(1,2,.01f,95,95)<95); // no windup
    // Simple electrical plant with sensor lag; synthetic only, not motor validation.
    for(float gain:{.5f,1.0f,2.0f}) {
        float duty=0,amps=0,filtered=0;
        for(unsigned i=0;i<3000;++i) {
            amps+=.5f*(fmaxf(0,gain*(duty-2))-amps);
            filtered+=.5f*(amps-filtered);
            duty=currentDuty(1,filtered,.01f,95,duty);
            CHECK(duty>=0 && duty<=95 && amps<4);
        }
        CHECK(fabsf(amps-1)<.08f);
    }
    CHECK(cfg::CURRENT_TRIP_A==4 && cfg::CURRENT_LIMIT_A==2 && cfg::VM_MAX==45);
    CHECK(control::validMap(cfg::HALL_TO_SECTOR));
    // Zero PWM can remain armed indefinitely without a stall error.
    DriveLogic d(cfg::HALL_TO_SECTOR);tick(d,6,cfg::TICK_HZ+10);CHECK(d.arm());
    tick(d,6,cfg::STALL_TICKS*3);CHECK(d.running && d.fault==Fault::None);
    d.duty=100;tick(d,6,cfg::STALL_TICKS+2);CHECK(d.fault==Fault::Stall && !d.running);
    // All real gate/commutation faults still kill drive.
    for(unsigned which=0;which<5;++which) {
        DriveLogic x(cfg::HALL_TO_SECTOR);tick(x,6,cfg::TICK_HZ+10);CHECK(x.arm());x.duty=100;
        if(which==0)x.tick(6,false,true,x.ticks);
        if(which==1)tick(x,0,3);
        if(which==2)tick(x,1,3); // multi-sector jump
        if(which==3)x.tick(6,false,false,x.ticks-cfg::MAIN_TIMEOUT_TICKS-1);
        if(which==4)x.trip(Fault::Overcurrent);
        CHECK(!x.running && x.duty==0 && x.fault!=Fault::None);
        CHECK(!x.arm());
    }
    DriveLogic ch(cfg::HALL_TO_SECTOR);tick(ch,6,cfg::TICK_HZ+10);CHECK(ch.arm());ch.duty=100;
    ch.tick(6,true,false,ch.ticks);CHECK(!ch.running && ch.charge && ch.duty==0);CHECK(!ch.arm());
    // Forward mapping, including a coast interval and re-engagement.
    DriveLogic m(cfg::HALL_TO_SECTOR);tick(m,6,cfg::TICK_HZ+10);CHECK(m.arm());m.duty=100;
    for(unsigned c=0;c<100;++c)for(uint8_t h:{2,3,1,5,4,6}) {tick(m,h,100);CHECK(m.running);}
    m.stop();tick(m,2,100);CHECK(m.arm());m.duty=100;tick(m,3,100);CHECK(m.running);
    control::Temperature cool{true,10000,25},hot{true,1000,80},invalid{false,NAN,NAN};
    CHECK(thermal::fault(invalid,cool,false)==Fault::None);
    CHECK(thermal::fault(invalid,hot,false)==Fault::PcbHot);
    CHECK(thermal::fault(cool,invalid,false)==Fault::PcbSensor);
    CHECK(validCurrentZero(1850,1840,1860));CHECK(!validCurrentZero(100,90,110));
    telemetry::Frame f;char frame[128];f.sequence=123;
    f.flags|=telemetry::SPEED_VALID;f.speedCentiMph=1234;
    auto n=telemetry::encode(f,frame,sizeof(frame));telemetry::Frame decoded;
    CHECK(n && telemetry::decode(frame,n,decoded));CHECK(decoded.speedCentiMph==1234);
    printf("PASS: %u checks; throttle lifecycle, signal faults, coast, commutation, safety, telemetry.\n",checks);
}
