#include <cassert>
#include <cstdio>
#include <string>
#include "motor_client.h"
#include "command_stream.h"
using namespace motorclient;
static unsigned checks=0;
#define CHECK(x) do{++checks;assert(x);}while(0)
static comms::Status frame(unsigned seq,unsigned ack=0,unsigned result=0,bool enabled=false){
    comms::Status s;s.data.sequence=seq;s.data.uptimeMs=10000+seq*300;
    s.state=enabled?comms::Ready:comms::Stopped;s.ackId=ack;s.ackResult=result;
    if(enabled)s.data.flags|=comms::ENABLED_FLAG;
    return s;
}
static Client begin(){Client c;CHECK(c.receive(frame(1),0,true));CHECK(c.request(1,true));
    CHECK(c.receive(frame(2),300,true));CHECK(c.maySend(320));c.sent();return c;}
static Client cleared(){auto c=begin();CHECK(c.receive(frame(3,1,comms::Cleared),600,true));
    CHECK(c.pending && c.action==comms::Enable && c.requestId==2 && c.operationId==1);
    CHECK(c.reset==Cleared && c.result==1 && !c.maySend(620));return c;}
static Client enabling(){auto c=cleared();CHECK(c.receive(frame(4,1,comms::Cleared),900,true));
    CHECK(c.maySend(920));c.sent();return c;}
int main(){
    auto c=enabling();CHECK(c.receive(frame(5,2,comms::Enabled,true),1200,true));
    CHECK(c.operation==OpSucceeded && !c.pending && c.enabled() && c.enableResult==7);
    CHECK(c.result==1 && c.reset==Cleared && c.clearRequestId==1);
    CHECK(c.fresh(2199) && !c.fresh(2200));
    // Every clear refusal prevents ENABLE, including moving, idle, VM and sensors.
    for(unsigned r=2;r<=10;++r){auto x=begin();CHECK(x.receive(frame(3,1,r),600,true));
        CHECK(!x.pending && x.action==comms::Reset && !x.maySend(620));}
    auto timeout=begin();timeout.tick(2001);CHECK(!timeout.pending && timeout.operation==OpFailed);
    CHECK(timeout.receive(frame(3,1,1),2100,true));CHECK(timeout.action==comms::Reset && !timeout.maySend(2120));
    // Tick-before-ACK ordering also handles a late frame without an earlier tick.
    auto late=begin();CHECK(late.receive(frame(3,1,1),2001,true));CHECK(!late.pending && late.action==comms::Reset);
    for(unsigned r=2;r<=10;++r){if(r==7)continue;auto x=enabling();CHECK(x.receive(frame(5,2,r),1200,true));
        CHECK(x.operation==OpFailed && x.result==1 && x.enableResult==r && !x.pending);}
    auto missing=enabling();missing.tick(2600);CHECK(missing.operation==OpUnknown && !missing.pending);
    CHECK(missing.receive(frame(5,1,1,true),2700,true));CHECK(missing.enabled() && missing.operation==OpUnknown);
    CHECK(!missing.maySend(2720)); // status alone does not fabricate an ACK
    CHECK(missing.receive(frame(6,2,7,true),3000,true));CHECK(missing.enableResult==7 && missing.operation==OpCancelled);
    auto inconsistent=enabling();CHECK(inconsistent.receive(frame(5,2,7,false),1200,true));CHECK(inconsistent.operation==OpFailed);
    auto badClear=begin();auto s=frame(3,1,1,true);CHECK(badClear.receive(s,600,true));CHECK(!badClear.pending);
    // Stale/mismatched responses and duplicate app taps never advance a stage.
    auto mismatch=begin();CHECK(!mismatch.request(321,true));CHECK(mismatch.receive(frame(3,99,1),600,true));
    CHECK(mismatch.action==comms::Reset && mismatch.pending);
    CHECK(!mismatch.receive(frame(3,1,1),601,true));CHECK(mismatch.action==comms::Reset);
    auto buffered=begin();CHECK(buffered.receive(frame(3,1,1),600,false));
    CHECK(buffered.action==comms::Reset && buffered.pending && !buffered.maySend(620));
    CHECK(buffered.receive(frame(4,1,1),900,true));CHECK(buffered.action==comms::Enable);
    auto oldAck=enabling();CHECK(oldAck.receive(frame(5,1,1),1200,true));CHECK(oldAck.pending && oldAck.enableResult==0);
    // Three retries retain the same ID/action; the motor cache executes only once.
    comms::Requests cache;unsigned transitions=0;auto retry=cleared();
    for(unsigned i=0;i<4;++i){CHECK(retry.receive(frame(4+i,1,1),900+i*300,true));
        if(retry.maySend(920+i*300)){comms::Command cmd{4+i,retry.requestId,retry.action};
            cache.begin(4+i,900+i*300);auto d=cache.accept(cmd,920+i*300);
            if(d==comms::Requests::New){++transitions;cache.completed(cmd,comms::Enabled);}
            retry.sent();}}
    CHECK(transitions==1 && retry.attempts==3);
    // Disconnect/reboot before clear, between stages, and after ENABLE TX.
    for(unsigned phase=0;phase<3;++phase){auto x=phase==0?begin():phase==1?cleared():enabling();
        x.cancel();CHECK(!x.pending && !x.maySend(1220));CHECK(x.operation==(phase==2?OpUnknown:OpCancelled));
        CHECK(x.receive(frame(5,phase==2?2:1,phase==2?7:1,phase==2),1200,true));
        CHECK(!x.pending && !x.maySend(1220));
        auto y=phase==0?begin():phase==1?cleared():enabling();auto boot=frame(0);boot.data.uptimeMs=10;
        CHECK(y.receive(boot,1250,true));CHECK(!y.pending && !y.maySend(1270));
        CHECK(y.receive(frame(1),1550,true));CHECK(!y.pending);
        Client espReboot;CHECK(espReboot.receive(frame(10,2,7,true),1600,true));
        CHECK(!espReboot.pending && !espReboot.maySend(1620) && espReboot.enabled());
    }
    for(unsigned phase=0;phase<3;++phase){auto x=phase==0?begin():phase==1?cleared():enabling();
        auto fault=frame(5);fault.data.fault=6;fault.data.flags|=telemetry::FAULT;fault.state=comms::Faulted;
        CHECK(x.receive(fault,1200,true));CHECK(!x.pending && !x.maySend(1220));}
    auto charge=cleared();s=frame(4);s.state=comms::Charge;s.data.flags|=telemetry::CHARGING;
    CHECK(charge.receive(s,900,true));CHECK(!charge.pending);
    auto tx=enabling();tx.txFailed();CHECK(tx.operation==OpUnknown && !tx.pending);
    // Existing clear-only still never enables.
    Client legacy;CHECK(legacy.receive(frame(1),0,true));CHECK(legacy.request(1));
    CHECK(legacy.receive(frame(2),300,true));legacy.sent();CHECK(legacy.receive(frame(3,1,1),600,true));
    CHECK(!legacy.pending && legacy.action==comms::Reset && legacy.operation==OpSucceeded);
    // Every fragmentation boundary, LF enforcement, oversized/malformed input.
    const std::string command="{\"cmd\":\"motor_clear_fault_and_enable\"}\n";
    for(size_t split=0;split<command.size();++split){appcommand::Stream stream;unsigned count=0;
        auto consume=[&](const char* line){CHECK(appcommand::kind(line)==2);++count;};
        for(size_t i=0;i<split;++i)stream.feed(command[i],consume);
        stream.endWrite(consume);CHECK(count==0);
        for(size_t i=split;i<command.size();++i)stream.feed(command[i],consume);
        CHECK(count==1);}
    for(const char* invalid:{"{\"cmd\":\"motor_clear_fault_and_enable\",\"x\":1}","{cmd:motor_clear_fault_and_enable}",
        "{\"cmd\":\"motor_clear_fault_and_enable\"}junk","{\"cmd\":\"motor_ clear_fault\"}","MOTOR_CLEAR_FAULT_AND_ENABLE"})
        CHECK(appcommand::kind(invalid)==0);
    appcommand::Stream stream;unsigned count=0;auto consume=[&](const char*){++count;};
    for(int i=0;i<200;++i)stream.feed('x',consume);
    for(char ch:command)stream.feed(ch,consume);
    CHECK(count==0);
    for(char ch:command)stream.feed(ch,consume);
    CHECK(count==1);
    stream.feed('{',consume);stream.clear();for(char ch:command.substr(1))stream.feed(ch,[](const char* l){CHECK(appcommand::kind(l)==0);});
    for(char ch:std::string("{\"cmd\":\"motor_clear_fault\"}"))stream.feed(ch,consume);
    stream.endWrite(consume);CHECK(count==2);
    for(char ch:std::string("{\"cmd\":\"motor_clear_fault_and_\renable\"}\n"))stream.feed(ch,consume);
    CHECK(count==2);
    for(char ch:command.substr(0,command.size()-1)+"\r\n")stream.feed(ch,consume);
    CHECK(count==3);
    printf("PASS: %u recovery and BLE framing checks; simulated only\n",checks);
}
