#include <cassert>
#include <cstdio>
#include "launch_support.h"
int main(){
    LaunchSupport x;x.begin(0,10);
    assert(x.request(.16f,0,10)==1);
    assert(!x.waitForMore(.16f,.19f,899,10,899));
    assert(x.waitForMore(.16f,.19f,900,10,900));
    for(unsigned n=0;n<10000;++n)assert(!x.allow(.16f));
    assert(!x.allow(.4f));assert(x.allow(.42f));
    x.begin(1000,10);assert(!x.waitForMore(1,1,1900,10,900));
    x.begin(2000,10);assert(x.request(.16f,2200,13)==1);
    assert(x.request(.16f,2350,14)==.5f);
    assert(x.request(.16f,2500,15)==.16f);
    assert(!x.waitForMore(.16f,.19f,2600,15,599));
    assert(x.waitForMore(.16f,.19f,2700,15,600));
    x.idle();assert(!x.waiting && !x.active && x.allow(.16f));
    x.begin(UINT32_MAX-500,10);assert(x.waitForMore(.16f,.19f,400,10,901));
    x.begin(0,10);assert(!x.waitForMore(.16f,1,900,10,900)); // meaningful blocked torque remains a fault
    puts("PASS: bounded launch/fade, low-request wait, no automatic retry, increased-request retry, rollover");
}
