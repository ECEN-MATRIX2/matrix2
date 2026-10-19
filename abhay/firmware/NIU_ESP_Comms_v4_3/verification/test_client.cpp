#include <cassert>
#include <cstdio>
#include <string>
#include "motor_client.h"
using namespace motorclient;
static unsigned checks=0;
#define CHECK(x) do{++checks;assert(x);}while(0)
static comms::Status status(uint32_t seq,uint32_t ms){
    comms::Status s;s.data.sequence=seq;s.data.uptimeMs=ms;
    s.data.speedCentiMph=750;s.data.vmMilliVolts=36000;s.data.socCentiPercent=5000;
    s.data.flags=telemetry::DEMO_SOC|telemetry::SPEED_VALID|telemetry::VM_VALID|telemetry::SOC_VALID;
    s.state=comms::Ready;return s;
}
int main(){
    Client c;CHECK(!c.request(0));CHECK(c.reset==LinkUnavailable);
    auto s=status(100,10000);CHECK(c.receive(s,0,true));CHECK(c.fresh(999));CHECK(!c.fresh(1000));
    CHECK(!c.pending && !c.maySend(25)); // unsolicited status never causes TX
    CHECK(c.request(10));CHECK(!c.request(11));CHECK(c.requestId==1);
    CHECK(!c.maySend(25)); // request waits for next fresh status
    s=status(101,10300);CHECK(c.receive(s,300,true));
    CHECK(!c.maySend(319));CHECK(c.maySend(320));
    c.sent();CHECK(!c.maySend(321));
    CHECK(!c.receive(s,400,true));CHECK(c.receivedMs==300); // duplicate not fresh
    s=status(102,10600);s.ackId=1;s.ackResult=comms::Cleared;s.state=comms::Stopped;
    CHECK(c.receive(s,600,true));CHECK(!c.pending && c.reset==Cleared && c.result==1);
    CHECK(!c.maySend(620));CHECK(c.request(601));CHECK(c.requestId==2);
    s=status(103,10900);CHECK(c.receive(s,900,false));CHECK(!c.maySend(920)); // delayed buffered status
    s=status(104,11200);CHECK(c.receive(s,1200,true));CHECK(!c.maySend(1231));
    s=status(105,11500);CHECK(c.receive(s,1500,true));CHECK(c.maySend(1520));c.sent();
    s=status(106,11800);s.ackId=2;s.ackResult=comms::NotIdle;
    CHECK(c.receive(s,1800,true));CHECK(c.reset==Refused && !c.pending);
    CHECK(!c.maySend(1820)); // refusal never auto-retries
    CHECK(c.request(1810));CHECK(c.requestId==3);
    for(unsigned i=0;i<3;++i){s=status(107+i,12100+i*300);CHECK(c.receive(s,2100+i*300,true));CHECK(c.maySend(2120+i*300));c.sent();}
    s=status(110,13000);CHECK(c.receive(s,3000,true));CHECK(!c.maySend(3020));
    c.tick(3810);CHECK(c.reset==TimedOut && !c.pending && c.attempts==3);
    s=status(111,13300);CHECK(c.receive(s,3900,true));CHECK(c.request(3900));
    CHECK(c.receive(status(0,300),4000,true));CHECK(c.reset==Rebooted && !c.pending);
    CHECK(!c.maySend(4020));CHECK(c.request(4010));CHECK(c.requestId==1);
    c.cancel();CHECK(c.reset==Cancelled && !c.pending && !c.maySend(4025));
    CHECK(c.request(4020));c.invalidate();CHECK(!c.fresh(4030) && !c.maySend(4030));
    c.tick(6020);CHECK(c.reset==TimedOut);
    Client rollover;CHECK(rollover.receive(status(UINT32_MAX,UINT32_MAX-100),UINT32_MAX-50,true));
    CHECK(rollover.receive(status(0,199),249,true));CHECK(rollover.packets==2);
    CHECK(rollover.request(250));CHECK(rollover.receive(status(1,499),549,true));CHECK(rollover.maySend(569));
    Client bad;auto sim=status(1,300);sim.data.flags|=telemetry::SIMULATED;
    CHECK(bad.receive(sim,0,true));CHECK(!bad.request(1));
    sim.data.flags&=~telemetry::SIMULATED;sim.data.sequence++;sim.ackId=UINT32_MAX;sim.ackResult=comms::Cleared;
    CHECK(bad.receive(sim,300,true));CHECK(!bad.request(301));CHECK(bad.reset==IdExhausted);
    Client fault;auto f=status(1,300);f.data.fault=6;f.inputFault=1;f.state=comms::Faulted;f.data.flags|=telemetry::FAULT;
    CHECK(fault.receive(f,100,true));CHECK(fault.lastMotorFault==6 && fault.lastInputFault==1 && fault.lastFaultMs==100);
    CHECK(fault.receive(status(2,600),400,true));CHECK(fault.lastMotorFault==6); // preserve history separately
    CHECK(!fault.receive(status(1,610),500,true)); // out-of-order sequence, no reboot
    Parser parser;char line[192];comms::Status decoded;bool timely=false;
    s=status(999,30000);s.state=comms::WaitTorque;size_t n=comms::encode(s,line,sizeof(line));
    unsigned frames=0;for(size_t i=0;i<n;++i)if(parser.feed(line[i],100+i,true,decoded,timely))++frames;
    CHECK(frames==1 && timely && decoded.state==10);
    comms::Command cmd;cmd.token=999;cmd.id=9;n=comms::encodeCommand(cmd,line,sizeof(line));
    for(size_t i=0;i<n;++i)CHECK(!parser.feed(line[i],300+i,true,decoded,timely));
    CHECK(parser.echoes==1 && parser.rejected==0);
    n=comms::encode(s,line,sizeof(line));line[8]^=1;
    for(size_t i=0;i<n;++i)CHECK(!parser.feed(line[i],500+i,true,decoded,timely));
    CHECK(parser.rejected==1);
    n=comms::encode(s,line,sizeof(line));
    for(size_t i=0;i<n;++i)parser.feed(line[i],700+i,i!=n/2,decoded,timely);
    CHECK(!timely);
    CHECK(std::string(stateName(10))=="WAIT_TORQUE");
    CHECK(std::string(inputName(1)).find("Throttle")!=std::string::npos);
    printf("PASS: %u ESP client checks: turnaround, stale/duplicate/corrupt frames, echo, ACK/refusal, bounded retries, reboot, cancellation, rollover, state 10\n",checks);
}
