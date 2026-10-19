// The runner extracts the actual firmware functions, not a reimplementation.
#include <cassert>
#include <cstdio>
#include "comms_protocol.h"
#include "throttle_mode.h"
enum class Fault {None,Driver};
static ThrottleMode throttle;
static bool remoteClearPermit=false,driverReady=false,run=false,still=true,vm=true,sensors=true;
static uint32_t remoteClearMs=0,remoteClearId=0,now=600;
static Fault fault=Fault::None;
static int prepareBehavior=0,prepareCalls=0;
static comms::Result clearAnswer=comms::Cleared;
uint32_t millis(){return now;}
bool running(){return run;}
bool stationary(){return still;}
bool startVoltage(){return vm;}
bool readySensors(){return sensors;}
Fault motorFault(){return fault;}
void stop(){remoteClearPermit=false;throttle.stop();driverReady=false;}
comms::Result clearFaultRequest(){if(clearAnswer==comms::Cleared){stop();fault=Fault::None;throttle.clear(now);}return clearAnswer;}
void prepareAtIdle(){
    ++prepareCalls;
    if(prepareBehavior==1)return; // unavailable calibration/configuration
    if(prepareBehavior==2){fault=Fault::Driver;return;}
    if(prepareBehavior==3)throttle.sample(1.5f,now); // throttle moves during preparation
    if(prepareBehavior==4)vm=false;
    if(prepareBehavior==5)sensors=false; // includes charging
    if(prepareBehavior==6)still=false;
    driverReady=throttle.authorize(now);
}
#include "remote_functions.generated.h"
static unsigned checks=0;
#define CHECK(x) do{++checks;assert(x);}while(0)
static void setup(){
    throttle={};throttle.stop();now=600;throttle.sample(.5f,100);throttle.sample(.5f,600);
    remoteClearPermit=true;remoteClearMs=600;remoteClearId=10;driverReady=run=false;
    still=vm=sensors=true;fault=Fault::None;prepareBehavior=prepareCalls=0;clearAnswer=comms::Cleared;
}
int main(){
    for(unsigned bits=0;bits<32;++bits){setup();run=bits&1;still=bits&2;vm=bits&8;sensors=bits&16;
        if(!(bits&4))throttle.sample(1.5f,now);
        auto answer=enableThrottleRequest();bool good=!run&&still&&(bits&4)&&vm&&sensors;
        CHECK((answer==comms::Enabled)==good);CHECK(!remoteClearPermit);
        CHECK(!throttle.wantsDrive(now));
        CHECK(good?throttle.armed:!throttle.requested);
    }
    setup();CHECK(enableThrottleRequest()==comms::Enabled);CHECK(throttle.armed && !run && throttle.reference==0);
    CHECK(!throttle.wantsDrive(now));throttle.sample(.60f,610);CHECK(!throttle.wantsDrive(610));
    throttle.sample(.7f,620);CHECK(throttle.wantsDrive(620));
    setup();fault=Fault::Driver;CHECK(enableThrottleRequest()==comms::FaultPresent && !throttle.requested);
    setup();throttle.fail(ThrottleMode::Signal);CHECK(enableThrottleRequest()==comms::FaultPresent);
    setup();remoteClearPermit=false;CHECK(enableThrottleRequest()==comms::ClearRequired);
    setup();now=2600;CHECK(enableThrottleRequest()==comms::ClearRequired);
    for(int mode=1;mode<=6;++mode){setup();prepareBehavior=mode;
        CHECK(enableThrottleRequest()!=comms::Enabled);CHECK(!throttle.armed && !throttle.requested && !driverReady);}
    // Existing VM-off/idle-forgotten behavior must refuse, not postpone a start.
    setup();vm=false;throttle.forgetIdle();CHECK(enableThrottleRequest()==comms::NotIdle);
    setup();throttle.forgetIdle();throttle.sample(.5f,now);CHECK(enableThrottleRequest()==comms::NotIdle);
    setup();CHECK(handleRemoteCommand({1,10,comms::Reset})==comms::Cleared);
    CHECK(!throttle.armed && remoteClearPermit);
    CHECK(handleRemoteCommand({2,11,comms::Enable})==comms::Enabled);
    CHECK(handleRemoteCommand({3,11,comms::Enable})==comms::ClearRequired); // normal UART duplicates handled by Requests
    setup();CHECK(handleRemoteCommand({1,99,comms::Enable})==comms::ClearRequired && !throttle.requested);
    for(unsigned r=2;r<=6;++r){setup();clearAnswer=comms::Result(r);
        CHECK(handleRemoteCommand({1,10,comms::Reset})==r);CHECK(!remoteClearPermit);
        CHECK(handleRemoteCommand({2,11,comms::Enable})==comms::ClearRequired);}
    // Shared GUI request helper preserves deferred preparation and idle checks.
    setup();CHECK(requestThrottleEnable() && throttle.requested && !throttle.armed);
    setup();throttle.sample(1.5f,now);CHECK(!requestThrottleEnable());
    setup();fault=Fault::Driver;CHECK(!requestThrottleEnable());
    printf("PASS: %u checks of actual remote-enable firmware functions with simulated hardware prerequisites\n",checks);
}
