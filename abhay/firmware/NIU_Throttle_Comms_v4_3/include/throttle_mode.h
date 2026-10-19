#pragma once
#include <stdint.h>
#include <math.h>

// One persistent throttle mode. No PC lease, test stages or session deadline.
struct ThrottleMode {
    enum InputFault {None, Signal, Stale, Watchdog};
    static constexpr float IDLE_V=.50f,FULL_V=2.50f,MAX_CURRENT_A=2.0f;
    bool requested=true,armed=false,valid=false,haveSample=false,demand=false;
    bool idleTracking=false,badTracking=false;
    uint32_t sampledMs=0,idleSince=0,badSince=0;
    float volts=0,filteredVolts=0,target=0,reference=0;
    InputFault inputFault=None;

    void forgetIdle() {idleTracking=false;}
    void sample(float v,uint32_t now) {
        const bool wasValid=valid;
        volts=v;sampledMs=now;haveSample=true;
        valid=isfinite(v) && v>=.20f && v<=3.10f;
        if(!valid) {
            demand=false;target=reference=0;forgetIdle();
            if(!badTracking) {badTracking=true;badSince=now;}
            if(armed && uint32_t(now-badSince)>=50) fail(Signal);
            return;
        }
        badTracking=false;
        filteredVolts=wasValid?filteredVolts+.25f*(v-filteredVolts):v;
        if(v>=.35f && v<=.60f) {
            if(!idleTracking) {idleTracking=true;idleSince=now;}
        } else forgetIdle();
        // Immediate release, hysteresis on reapplication. Idle never disarms.
        if(v<=.60f) {demand=false;reference=0;filteredVolts=v;}
        else if(v>=.65f) demand=true;
        target=demand?fminf(MAX_CURRENT_A,fmaxf(0.0f,(filteredVolts-IDLE_V))):0;
    }
    bool fresh(uint32_t now) const {return haveSample && uint32_t(now-sampledMs)<50;}
    bool idleReady(uint32_t now) const {
        return fresh(now) && valid && idleTracking && !demand && uint32_t(now-idleSince)>=500;
    }
    bool canArm(uint32_t now) const {return requested && !armed && inputFault==None && idleReady(now);}
    bool authorize(uint32_t now) {
        if(!canArm(now))return false;
        armed=true;reference=0;return true;
    }
    bool enable(uint32_t now) {
        if(inputFault!=None || !idleReady(now))return false;
        requested=true;return true;
    }
    void stop() {requested=false;armed=false;reference=0;}
    void suspend() {armed=false;reference=0;forgetIdle();}
    void fail(InputFault why) {inputFault=why;stop();}
    void checkFresh(uint32_t now) {if(armed && !fresh(now))fail(Stale);}
    bool clear(uint32_t now) {
        if(!idleReady(now))return false;
        inputFault=None;stop();return true; // explicit Enable afterwards
    }
    bool wantsDrive(uint32_t now) const {
        return requested && armed && inputFault==None && fresh(now) && valid && demand;
    }
    float step(float dt) {
        if(!armed || !valid || !demand || !isfinite(dt) || dt<=0) return reference=0;
        // Current request rises at 2 A/s; releasing the request is immediate.
        return reference=fminf(target,reference+2.0f*fminf(dt,.05f));
    }
};

inline float median3(float a,float b,float c) {
    if(a>b) {float t=a;a=b;b=t;}
    if(b>c) {float t=b;b=c;c=t;}
    return a>b?a:b;
}

