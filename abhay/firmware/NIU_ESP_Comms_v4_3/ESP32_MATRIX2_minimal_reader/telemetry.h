#pragma once
// Shared, allocation-free wire protocol. No Arduino dependency; use this same
// decoder in the comm application. All values are decimal integers on the wire.
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

namespace telemetry {
constexpr unsigned BAUD=9600, PERIOD_MS=200, STALE_MS=1000;
constexpr size_t MAX_FRAME=128;
enum Flag : uint32_t {
    SPEED_VALID=1, SOC_VALID=2, VM_VALID=4, PHASE_VALID=8,
    BUS_EST_VALID=16, RUNNING=32, CHARGING=64, FAULT=128,
    DEMO_SOC=256, SIMULATED=512
};
struct Frame {
    uint32_t sequence=0, uptimeMs=0;
    int32_t speedCentiMph=-1, socCentiPercent=-1, vmMilliVolts=-1;
    int32_t phaseMilliAmps=-1, busEstimateMilliAmps=-1;
    uint32_t flags=DEMO_SOC, fault=0;
};
inline uint16_t crc16(const char *s,size_t n) {
    uint16_t crc=0xffff;
    while(n--) {
        crc^=uint16_t(uint8_t(*s++))<<8;
        for(unsigned b=0;b<8;++b)crc=uint16_t((crc&0x8000)?(crc<<1)^0x1021:crc<<1);
    }
    return crc;
}
inline bool fieldValid(int32_t value,int32_t maximum,uint32_t flags,Flag flag) {
    return (flags&flag)?(value>=0 && value<=maximum):value==-1;
}
inline bool valid(const Frame& f) {
    return !(f.flags&~1023u) && f.fault<=16 &&
        bool(f.flags&FAULT)==bool(f.fault) &&
        fieldValid(f.speedCentiMph,10000,f.flags,SPEED_VALID) &&
        fieldValid(f.socCentiPercent,10000,f.flags,SOC_VALID) &&
        fieldValid(f.vmMilliVolts,60000,f.flags,VM_VALID) &&
        fieldValid(f.phaseMilliAmps,100000,f.flags,PHASE_VALID) &&
        fieldValid(f.busEstimateMilliAmps,100000,f.flags,BUS_EST_VALID);
}
inline size_t encode(const Frame& f,char *out,size_t capacity) {
    if(!valid(f) || capacity<8)return 0;
    int n=snprintf(out,capacity,"$NIU1,%lu,%lu,%ld,%ld,%ld,%ld,%ld,%lu,%lu",
        (unsigned long)f.sequence,(unsigned long)f.uptimeMs,
        (long)f.speedCentiMph,(long)f.socCentiPercent,(long)f.vmMilliVolts,
        (long)f.phaseMilliAmps,(long)f.busEstimateMilliAmps,
        (unsigned long)f.flags,(unsigned long)f.fault);
    if(n<0 || size_t(n)+7>capacity)return 0;
    const uint16_t crc=crc16(out+1,size_t(n)-1);
    snprintf(out+n,capacity-size_t(n),"*%04X\n",unsigned(crc));
    return size_t(n)+6;
}
inline int hex(char c) {
    return c>='0'&&c<='9'?c-'0':c>='A'&&c<='F'?c-'A'+10:-1;
}
// Strict decimal parser, including overflow detection. No whitespace or '+'.
inline bool number(const char *&p,const char *end,bool allowNegative,uint32_t& v,bool& negative) {
    negative=false;v=0;
    if(p<end && *p=='-') {if(!allowNegative)return false;negative=true;++p;}
    const char *start=p;
    const uint32_t limit=allowNegative?2147483647u:0xffffffffu;
    while(p<end && *p>='0' && *p<='9') {
        const uint32_t digit=uint32_t(*p++-'0');
        if(v>(limit-digit)/10)return false;
        v=v*10+digit;
    }
    return p!=start && (!negative || v==1); // only permitted negative is invalid=-1
}
inline bool decode(const char *line,size_t length,Frame& result) {
    if(length && line[length-1]=='\n')--length;
    if(length<12 || length>=MAX_FRAME || memcmp(line,"$NIU1,",6))return false;
    const char *end=line+length-5;
    if(*end!='*')return false;
    uint16_t checksum=0;
    for(unsigned i=1;i<=4;++i) {
        const int h=hex(end[i]);if(h<0)return false;
        checksum=uint16_t((checksum<<4)|h);
    }
    if(checksum!=crc16(line+1,size_t(end-line-1)))return false;
    uint32_t values[9];bool minus[9];const char *p=line+6;
    for(unsigned i=0;i<9;++i) {
        if(!number(p,end,i>=2&&i<=6,values[i],minus[i]))return false;
        if(i!=8) {if(p>=end || *p++!=',')return false;}
    }
    if(p!=end)return false;
    Frame f;f.sequence=values[0];f.uptimeMs=values[1];
    f.speedCentiMph=minus[2]?-1:int32_t(values[2]);
    f.socCentiPercent=minus[3]?-1:int32_t(values[3]);
    f.vmMilliVolts=minus[4]?-1:int32_t(values[4]);
    f.phaseMilliAmps=minus[5]?-1:int32_t(values[5]);
    f.busEstimateMilliAmps=minus[6]?-1:int32_t(values[6]);
    f.flags=values[7];f.fault=values[8];
    if(!valid(f))return false;
    result=f;return true;
}
struct Receiver {
    char buffer[MAX_FRAME]{};size_t used=0;
    Frame latest{};bool received=false;
    uint32_t receivedMs=0, rejected=0;
    bool feed(char c,uint32_t now) {
        if(c=='$') {used=0;buffer[used++]=c;return false;}
        if(!used)return false;
        if(c=='\n') {
            Frame candidate;const bool ok=decode(buffer,used,candidate);used=0;
            if(!ok) {++rejected;return false;}
            latest=candidate;receivedMs=now;received=true;return true;
        }
        if(used>=MAX_FRAME-1 || c<' ' || c>'~') {used=0;++rejected;return false;}
        buffer[used++]=c;return false;
    }
    bool fresh(uint32_t now) const {return received && uint32_t(now-receivedMs)<STALE_MS;}
};
// One complete frame at a time. A slow/broken peripheral cannot block control.
struct TxQueue {
    char buffer[MAX_FRAME]{};size_t next=0,length=0;uint32_t dropped=0;
    bool push(const Frame& f) {
        if(next<length) {++dropped;return false;}
        length=encode(f,buffer,sizeof(buffer));next=0;
        if(!length) {++dropped;return false;}
        return true;
    }
    bool ready() const {return next<length;}
    char pop() {return buffer[next++];} // caller must check ready()
};
}
