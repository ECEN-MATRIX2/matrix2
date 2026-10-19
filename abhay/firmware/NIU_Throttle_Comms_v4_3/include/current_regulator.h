#pragma once
#include <math.h>

// Bench six-step current-magnitude regulation, not calibrated FOC/q-axis torque.
// Incremental integral controller: no speed target and no speed-based chopping.
inline float currentDuty(float requestA,float measuredA,float dt,float cap,float previous) {
    if(!isfinite(requestA) || !isfinite(measuredA) || !isfinite(dt) ||
       !isfinite(cap) || !isfinite(previous) || requestA<=0 || measuredA<0 || dt<=0)return 0;
    dt=fminf(dt,.02f);cap=fmaxf(0,fminf(cap,95));
    float error=fminf(requestA,2.0f)-measuredA;
    // Small measurement ripple holds duty rather than turning the bridge off.
    if(fabsf(error)<=.04f)error=0;
    const float change=fmaxf(-80.0f*dt,fminf(20.0f*dt,20.0f*error*dt));
    // The bounded output IS the integrator: no hidden windup at either rail.
    return fmaxf(0,fminf(cap,previous+change));
}
