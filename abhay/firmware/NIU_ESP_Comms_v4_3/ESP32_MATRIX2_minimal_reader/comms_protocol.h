#pragma once
#include "telemetry.h"

// NIU2: speed/SOC + all fault sources, state and reset acknowledgement.
// One motor-master half-duplex bus; 9600 8N1. NIC1 is ESP -> motor.
namespace comms {
constexpr unsigned BAUD=9600,PERIOD_MS=300,RX_WINDOW_MS=100,STALE_MS=1000;
constexpr size_t MAX_FRAME=192,MAX_COMMAND=64;
enum State : uint8_t {WaitVm,WaitSensors,WaitStill,WaitIdle,Ready,Driving,Coasting,Stopped,Charge,Faulted,WaitTorque};
enum Result : uint8_t {NoRequest,Cleared,Running,Moving,NotIdle,VmUnsafe,SensorsUnsafe,Enabled,FaultPresent,ClearRequired,EnableFailed};
enum Action : uint8_t {Reset,Enable};
constexpr uint32_t ENABLED_FLAG=1024;
inline Result resetCheck(bool running,bool stationary,bool idle,bool vm,bool sensors) {
    if(running)return Running;
    if(!stationary)return Moving;
    if(!idle)return NotIdle;
    if(!vm)return VmUnsafe;
    if(!sensors)return SensorsUnsafe;
    return Cleared;
}
struct Status {
    telemetry::Frame data;
    uint32_t inputFault=0,state=WaitVm,ackId=0,ackResult=NoRequest;
    int32_t faultVmMv=-1,faultPhaseMa=-1;
};
inline bool valid(const Status& s) {
    const auto& f=s.data;
    return !(f.flags&~2047u) && f.fault<=16 && s.inputFault<=3 && s.state<=WaitTorque &&
        (!(f.flags&ENABLED_FLAG) || (!f.fault && !s.inputFault && !(f.flags&telemetry::CHARGING) &&
          (s.state==Ready || s.state==Driving || s.state==Coasting || s.state==WaitTorque))) &&
        s.ackResult<=EnableFailed && bool(s.ackId)==bool(s.ackResult) &&
        bool(f.flags&telemetry::FAULT)==bool(f.fault || s.inputFault) &&
        telemetry::fieldValid(f.speedCentiMph,10000,f.flags,telemetry::SPEED_VALID) &&
        telemetry::fieldValid(f.socCentiPercent,10000,f.flags,telemetry::SOC_VALID) &&
        telemetry::fieldValid(f.vmMilliVolts,60000,f.flags,telemetry::VM_VALID) &&
        telemetry::fieldValid(f.phaseMilliAmps,100000,f.flags,telemetry::PHASE_VALID) &&
        telemetry::fieldValid(f.busEstimateMilliAmps,100000,f.flags,telemetry::BUS_EST_VALID) &&
        s.faultVmMv>=-1 && s.faultVmMv<=60000 && s.faultPhaseMa>=-1 && s.faultPhaseMa<=100000;
}
inline size_t finish(char* out,size_t capacity,int n) {
    if(n<0 || size_t(n)+7>capacity)return 0;
    auto crc=telemetry::crc16(out+1,size_t(n)-1);
    snprintf(out+n,capacity-size_t(n),"*%04X\n",unsigned(crc));return size_t(n)+6;
}
inline size_t encode(const Status& s,char* out,size_t capacity) {
    if(!valid(s))return 0;
    const auto& f=s.data;
    return finish(out,capacity,snprintf(out,capacity,
        "$NIU2,%lu,%lu,%ld,%ld,%ld,%ld,%ld,%lu,%lu,%lu,%lu,%lu,%lu,%ld,%ld",
        (unsigned long)f.sequence,(unsigned long)f.uptimeMs,(long)f.speedCentiMph,
        (long)f.socCentiPercent,(long)f.vmMilliVolts,(long)f.phaseMilliAmps,
        (long)f.busEstimateMilliAmps,(unsigned long)f.flags,(unsigned long)f.fault,
        (unsigned long)s.inputFault,(unsigned long)s.state,(unsigned long)s.ackId,
        (unsigned long)s.ackResult,(long)s.faultVmMv,(long)s.faultPhaseMa));
}
inline bool checked(const char* text,size_t length,const char* prefix,const char*& end) {
    if(length && text[length-1]=='\n')--length;
    if(length<12 || length>=MAX_FRAME || memcmp(text,prefix,6))return false;
    end=text+length-5;if(*end!='*')return false;
    uint16_t crc=0;
    for(unsigned i=1;i<=4;++i) {int v=telemetry::hex(end[i]);if(v<0)return false;crc=uint16_t((crc<<4)|v);}
    return crc==telemetry::crc16(text+1,size_t(end-text-1));
}
inline bool decode(const char* text,size_t length,Status& result) {
    const char* end;if(!checked(text,length,"$NIU2,",end))return false;
    uint32_t values[15];bool negative[15];const char* p=text+6;
    for(unsigned i=0;i<15;++i) {
        if(!telemetry::number(p,end,(i>=2 && i<=6) || i>=13,values[i],negative[i]))return false;
        if(((i>=2 && i<=6) || i>=13) && values[i]>2147483647u)return false;
        if(i<14 && (p>=end || *p++!=','))return false;
    }
    if(p!=end)return false;
    Status s;auto& f=s.data;f.sequence=values[0];f.uptimeMs=values[1];
    f.speedCentiMph=negative[2]?-1:int32_t(values[2]);f.socCentiPercent=negative[3]?-1:int32_t(values[3]);
    f.vmMilliVolts=negative[4]?-1:int32_t(values[4]);f.phaseMilliAmps=negative[5]?-1:int32_t(values[5]);
    f.busEstimateMilliAmps=negative[6]?-1:int32_t(values[6]);f.flags=values[7];f.fault=values[8];
    s.inputFault=values[9];s.state=values[10];s.ackId=values[11];s.ackResult=values[12];
    s.faultVmMv=negative[13]?-1:int32_t(values[13]);s.faultPhaseMa=negative[14]?-1:int32_t(values[14]);
    if(!valid(s))return false;
    result=s;return true;
}
struct Command {uint32_t token=0,id=0;Action action=Reset;};
inline size_t encodeCommand(Command c,char* out,size_t capacity) {
    if(!c.id || c.action>Enable)return 0;
    return finish(out,capacity,snprintf(out,capacity,"$NIC1,%lu,%lu,%s",(unsigned long)c.token,(unsigned long)c.id,c.action==Reset?"RESET":"ENABLE"));
}
inline bool decodeCommand(const char* text,size_t length,Command& result) {
    if(length>=MAX_COMMAND)return false;
    const char* end;if(!checked(text,length,"$NIC1,",end))return false;
    const char* p=text+6;Command c;bool negative;
    if(!telemetry::number(p,end,false,c.token,negative) || p>=end || *p++!=',')return false;
    if(!telemetry::number(p,end,false,c.id,negative) || !c.id || p>=end || *p++!=',')return false;
    if(end-p==5 && !memcmp(p,"RESET",5))c.action=Reset;
    else if(end-p==6 && !memcmp(p,"ENABLE",6))c.action=Enable;
    else return false;
    result=c;return true;
}
struct CommandParser {
    char data[MAX_COMMAND]{};size_t used=0;
    void clear(){used=0;}
    bool feed(char c,Command& command) {
        if(c=='$') {used=0;data[used++]=c;return false;}
        if(!used)return false;
        if(c=='\n') {bool ok=decodeCommand(data,used,command);used=0;return ok;}
        if(c<32 || c>126 || used>=MAX_COMMAND-1) {used=0;return false;}
        data[used++]=c;return false;
    }
};
// At most one accepted request per receive slot. Retries use a new token and
// the same request ID; they repeat the saved result without clearing a new fault.
struct Requests {
    bool open=false,used=false;uint32_t token=0,openedAt=0,lastId=0;
    Result lastResult=NoRequest;
    Action lastAction=Reset;
    void begin(uint32_t sequence,uint32_t now) {token=sequence;openedAt=now;open=true;used=false;}
    bool active(uint32_t now) const {return open && uint32_t(now-openedAt)<RX_WINDOW_MS;}
    void close(){open=false;}
    enum Decision {Reject,New,Duplicate};
    Decision accept(Command c,uint32_t now) {
        if(!active(now) || used || c.token!=token || !c.id || c.id<lastId)return Reject;
        if(c.id==lastId && c.action!=lastAction)return Reject;
        used=true;
        return c.id==lastId?Duplicate:New;
    }
    void completed(Command c,Result result) {lastId=c.id;lastResult=result;lastAction=c.action;}
};
}
