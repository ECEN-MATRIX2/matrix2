#pragma once
#include "control.h"
#include "config.h"

// Continuous feed-forward plus PI regulation. Small tracking overshoots reduce
// the request proportionally; hard overspeed faults are handled by the caller.
inline float regulatedDuty(float ff,float error,float dt,float cap,float maxDuty,
                           float previous,float &integral,float riseRate=cfg::DUTY_RISE_PCT_PER_S) {
    const float u=ff+cfg::KP*error+integral;
    if((u<cap && u>0) || (u>=cap && error<0) || (u<=0 && error>0))
        integral=control::clamp(integral+cfg::KI*error*dt,-maxDuty,maxDuty);
    const float requested=control::clamp(ff+cfg::KP*error+integral,0,cap);
    // Retain slow increases and immediate current/temperature cap reductions.
    return fminf(requested,previous+riseRate*dt);
}

// Control feed-forward only. Raw samples still trip VM protection immediately.
struct BusControlFilter {
    float volts=36;
    void reset(float v) {volts=v;}
    void update(float v,float dt) {
        if(isfinite(v) && isfinite(dt) && dt>0)volts+=(v-volts)*dt/(0.050f+dt);
    }
};
