#pragma once
#include <stdint.h>
#include <math.h>

// One bounded launch assist per deliberate engagement. Never retries by itself.
struct LaunchSupport {
    bool active=false,waiting=false,fading=false;
    uint32_t started=0,baseEdges=0,fadeStarted=0;
    float heldRequest=0;
    void idle(){active=waiting=fading=false;}
    void begin(uint32_t now,uint32_t edges){active=true;waiting=fading=false;started=now;baseEdges=edges;}
    bool allow(float request) {
        if(!waiting)return true;
        if(request>=heldRequest+.25f){waiting=false;return true;}
        return false;
    }
    bool waitForMore(float request,float measured,uint32_t now,uint32_t edges,uint32_t noEdgeMs) {
        if(!active || !isfinite(measured))return false;
        const bool failedLaunch=uint32_t(now-started)>=900 && edges==baseEdges;
        const bool lostMotion=fading && uint32_t(now-fadeStarted)>=300 && noEdgeMs>=600;
        if(request<.5f && measured<.75f && (failedLaunch || lostMotion)) {
            waiting=true;heldRequest=request;active=false;return true;
        }
        return false;
    }
    float request(float user,uint32_t now,uint32_t edges) {
        if(!active)return user;
        if(!fading && (uint32_t(edges-baseEdges)>=3 || uint32_t(now-started)>=900)) {
            fading=true;fadeStarted=now;
        }
        float assist=1.0f;
        if(fading)assist=fmaxf(0,1.0f-float(uint32_t(now-fadeStarted))/300.0f);
        return fminf(2.0f,fmaxf(user,assist));
    }
};
