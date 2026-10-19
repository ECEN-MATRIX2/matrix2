#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
#include "comms_protocol.h"
#include "throttle_mode.h"

static unsigned checks=0;
#define CHECK(x) do {++checks;assert(x);} while(0)
static std::string framed(const std::string& payload) {
    char crc[8];snprintf(crc,sizeof(crc),"*%04X\n",telemetry::crc16(payload.data(),payload.size()));
    return "$"+payload+crc;
}
int main() {
    char out[comms::MAX_FRAME];comms::Status s,decoded;
    s.data.sequence=42;s.data.uptimeMs=10000;
    s.data.speedCentiMph=1500;s.data.socCentiPercent=5000;s.data.vmMilliVolts=36000;
    s.data.phaseMilliAmps=1200;s.data.busEstimateMilliAmps=300;
    s.data.flags=telemetry::DEMO_SOC|31;
    s.state=comms::Ready;
    auto n=comms::encode(s,out,sizeof(out));CHECK(n);CHECK(comms::decode(out,n,decoded));
    CHECK(decoded.data.speedCentiMph==1500 && decoded.data.socCentiPercent==5000);
    printf("EXAMPLE normal: %s",out);
    for(unsigned fault=0;fault<=16;++fault)for(unsigned input=0;input<=3;++input) {
        s.data.fault=fault;s.inputFault=input;s.data.flags=telemetry::DEMO_SOC|31;
        if(fault || input)s.data.flags|=telemetry::FAULT;
        s.state=(fault || input)?comms::Faulted:comms::Ready;
        n=comms::encode(s,out,sizeof(out));CHECK(n);CHECK(comms::decode(out,n,decoded));
        CHECK(decoded.data.fault==fault && decoded.inputFault==input);
        for(size_t i=1;i<n-1;++i) {
            auto old=out[i];out[i]^=1;CHECK(!comms::decode(out,n,decoded));out[i]=old;
        }
    }
    s.data.fault=6;s.inputFault=0;s.ackId=7;s.ackResult=comms::NotIdle;
    s.faultVmMv=36200;s.faultPhaseMa=4100;
    n=comms::encode(s,out,sizeof(out));CHECK(n);CHECK(comms::decode(out,n,decoded));
    printf("EXAMPLE fault: %s",out);
    CHECK(!comms::encode(s,out,10));
    s.data.flags&=~telemetry::FAULT;CHECK(!comms::encode(s,out,sizeof(out)));
    s=comms::Status{};n=comms::encode(s,out,sizeof(out));CHECK(n);CHECK(comms::decode(out,n,decoded));
    CHECK(decoded.data.vmMilliVolts==-1);
    for(auto payload:{"NIU2,0,0,4294967295,-1,-1,-1,-1,256,0,0,0,0,0,-1,-1",
                      "NIU2,0,0,-1,-1,-1,-1,-1,256,0,0,0,0,0,4294967295,-1",
                      "NIU2,0,0,-1,-1,-1,-1,-1,256,0,4,0,0,0,-1,-1",
                      "NIU2,0,0,-1,-1,-1,-1,-1,256,0,0,99,0,0,-1,-1",
                      "NIU2,0,0,-1,-1,-1,-1,-1,256,0,0,0,7,0,-1,-1"}) {
        auto f=framed(payload);CHECK(!comms::decode(f.data(),f.size(),decoded));
    }
    s=comms::Status{};s.state=comms::WaitTorque;
    n=comms::encode(s,out,sizeof(out));CHECK(n);CHECK(comms::decode(out,n,decoded));
    CHECK(decoded.state==10 && decoded.data.fault==0 && !(decoded.data.flags&telemetry::FAULT));
    s.state=11;CHECK(!comms::encode(s,out,sizeof(out)));
    auto invalidState=framed("NIU2,0,0,-1,-1,-1,-1,-1,256,0,0,11,0,0,-1,-1");
    CHECK(!comms::decode(invalidState.data(),invalidState.size(),decoded));
    s=comms::Status{};
    // Maximum values fit a full TX + granted RX slot inside the 300 ms period.
    s.data.sequence=s.data.uptimeMs=UINT32_MAX;s.data.speedCentiMph=10000;
    s.data.socCentiPercent=10000;s.data.vmMilliVolts=60000;s.data.phaseMilliAmps=100000;
    s.data.busEstimateMilliAmps=100000;s.data.flags=1023;s.data.fault=16;s.inputFault=3;
    s.state=comms::Faulted;s.ackId=UINT32_MAX;s.ackResult=comms::EnableFailed;
    s.faultVmMv=60000;s.faultPhaseMa=100000;
    n=comms::encode(s,out,sizeof(out));CHECK(n && n<comms::MAX_FRAME);
    CHECK(comms::decode(out,n,decoded));
    CHECK((n*10000+comms::BAUD-1)/comms::BAUD+comms::RX_WINDOW_MS<comms::PERIOD_MS);
    printf("Maximum status bytes=%zu\n",n);

    comms::Command command{42,7},received;
    n=comms::encodeCommand(command,out,sizeof(out));CHECK(n);printf("EXAMPLE reset: %s",out);
    CHECK(comms::decodeCommand(out,n,received));CHECK(received.token==42 && received.id==7);
    comms::CommandParser parser;unsigned complete=0;
    for(size_t i=0;i<n;++i)if(parser.feed(out[i],received))++complete;
    CHECK(complete==1);CHECK(received.id==7);
    for(size_t i=1;i<n-1;++i) {
        auto old=out[i];out[i]^=1;CHECK(!comms::decodeCommand(out,n,received));out[i]=old;
    }
    for(auto payload:{"NIC1,42,0,RESET","NIC1,42,7,START","NIC1,42,7,reset",
                      "NIC1,-1,7,RESET","NIC1,42,4294967296,RESET","NIC1,42,7,RESET,1"}) {
        auto f=framed(payload);CHECK(!comms::decodeCommand(f.data(),f.size(),received));
    }
    parser.feed('$',received);
    for(unsigned i=0;i<100;++i)CHECK(!parser.feed('x',received));
    CHECK(!parser.feed('\n',received));
    n=comms::encodeCommand({UINT32_MAX,UINT32_MAX},out,sizeof(out));CHECK(n);
    CHECK((n*10000+comms::BAUD-1)/comms::BAUD+20<90);

    comms::Requests requests;CHECK(requests.accept(command,0)==comms::Requests::Reject);
    requests.begin(42,1000);
    CHECK(requests.accept({41,7},1010)==comms::Requests::Reject);
    CHECK(requests.accept(command,1020)==comms::Requests::New);
    requests.completed(command,comms::Cleared);
    CHECK(requests.accept({42,8},1030)==comms::Requests::Reject);
    requests.begin(43,1300);
    CHECK(requests.accept({43,7},1320)==comms::Requests::Duplicate);
    CHECK(requests.lastId==7 && requests.lastResult==comms::Cleared);
    requests.begin(44,1600);
    CHECK(requests.accept({44,6},1610)==comms::Requests::Reject);
    CHECK(requests.accept({44,8},1700)==comms::Requests::Reject); // endpoint excluded
    requests.begin(45,UINT32_MAX-40);
    CHECK(requests.active(20));CHECK(!requests.active(60)); // millis rollover
    requests.close();CHECK(!requests.active(0));
    n=comms::encodeCommand({46,8,comms::Enable},out,sizeof(out));CHECK(n);
    CHECK(comms::decodeCommand(out,n,received) && received.action==comms::Enable);
    requests.begin(46,2000);
    CHECK(requests.accept({46,7,comms::Enable},2020)==comms::Requests::Reject);
    CHECK(requests.accept({46,8,comms::Enable},2020)==comms::Requests::New);
    requests.completed({46,8,comms::Enable},comms::Enabled);
    requests.begin(47,2300);
    CHECK(requests.accept({47,8,comms::Enable},2320)==comms::Requests::Duplicate);
    CHECK(requests.lastResult==comms::Enabled);
    requests.begin(48,2600);
    CHECK(requests.accept({48,7},2620)==comms::Requests::Reject);
    CHECK(requests.accept({48,8},2620)==comms::Requests::Reject);
    s=comms::Status{};s.state=comms::Ready;s.data.flags|=comms::ENABLED_FLAG;
    s.ackId=8;s.ackResult=comms::Enabled;
    CHECK(comms::encode(s,out,sizeof(out)));
    s.state=comms::Stopped;CHECK(!comms::encode(s,out,sizeof(out)));
    s.state=comms::Ready;s.data.flags|=telemetry::CHARGING;CHECK(!comms::encode(s,out,sizeof(out)));
    for(unsigned bits=0;bits<32;++bits) {
        bool run=bits&1,still=bits&2,idle=bits&4,vm=bits&8,sensors=bits&16;
        auto result=comms::resetCheck(run,still,idle,vm,sensors);
        CHECK((result==comms::Cleared)==(!run && still && idle && vm && sensors));
        if(run)CHECK(result==comms::Running);
    }
    ThrottleMode throttle;throttle.fail(ThrottleMode::Signal);
    throttle.sample(.5f,100);throttle.sample(.5f,600);
    CHECK(throttle.clear(600));CHECK(!throttle.requested && !throttle.armed);
    throttle.sample(2.5f,610);CHECK(!throttle.wantsDrive(610));
    printf("PASS: %u communications/reset checks\n",checks);
}
