#pragma once
#include "control.h"
#include "config.h"
#include <string.h>

// Independent of arm/stop: reports hand rotation and coasting as well as drive.
// Unsigned speed magnitude, qualified adjacent Hall transitions only.
struct SpeedObserver {
    uint8_t previous=0;
    uint32_t lastEdge=0, period=0;
    bool haveEdge=false;
    uint32_t intervals[6]={},sum=0;
    unsigned count=0,next=0;
    void clearCycle() {sum=0;count=next=0;}
    void observe(uint8_t h,uint32_t now) {
        if(h==previous)return;
        if(control::validHall(previous) && control::validHall(h) &&
           control::oneBitChanged(previous,h)) {
            const uint32_t gap=now-lastEdge;
            period=haveEdge && gap<=cfg::STALL_TICKS?gap:0;
            if(period) {
                if(count==6)sum-=intervals[next];else ++count;
                intervals[next]=period;sum+=period;next=(next+1)%6;
            } else clearCycle();
            lastEdge=now;haveEdge=true;
        } else {period=0;haveEdge=false;clearCycle();}
        previous=h;
    }
    float mph(uint32_t now,float diameter,unsigned poles) const {
        const uint32_t age=now-lastEdge;
        if(!period || age>cfg::STALL_TICKS || !control::validHall(previous))return 0;
        return control::mphForHallHz(float(cfg::TICK_HZ)/(age>period?age:period),diameter,poles);
    }
    float cycleMph(uint32_t now,float diameter,unsigned poles) const {
        const uint32_t age=now-lastEdge;
        if(count<6)return mph(now,diameter,poles);
        if(!sum || age>cfg::STALL_TICKS || !control::validHall(previous))return 0;
        const float average=float(sum)/6.0f;
        return control::mphForHallHz(float(cfg::TICK_HZ)/fmaxf(average,float(age)),diameter,poles);
    }
};
