#pragma once
#include <stdint.h>
#include <math.h>

namespace control {
inline float clamp(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }
inline bool validHall(uint8_t h) { return h > 0 && h < 7; }
inline bool oneBitChanged(uint8_t a, uint8_t b) {
    unsigned x = a ^ b;
    return x && !(x & (x-1));
}
inline bool validMap(const int8_t *m) {
    if (m[0] != -1 || m[7] != -1) return false;
    unsigned seen=0;
    for (unsigned h=1;h<7;++h) {
        if (m[h]<0 || m[h]>5 || (seen & (1u<<m[h]))) return false;
        seen |= 1u<<m[h];
    }
    // Each adjacent FORWARD torque sector must have a one-bit Hall edge.
    for (unsigned h=1;h<7;++h)
        for (unsigned n=1;n<7;++n)
            if (m[n] == (m[h]+1)%6 && !oneBitChanged(h,n)) return false;
    return seen == 63;
}
inline bool forwardEdge(uint8_t oldH, uint8_t h, const int8_t *m, bool reverse,int forwardIncrement=1) {
    if (!validHall(oldH) || !validHall(h) || !oneBitChanged(oldH,h)) return false;
    const int d = (m[h]-m[oldH]+6)%6;
    const int direction=reverse?-forwardIncrement:forwardIncrement;
    return d == (direction>0 ? 1 : 5);
}
inline int torqueSector(uint8_t h,const int8_t *m,bool reverse) {
    return validHall(h) && m[h]>=0 && m[h]<6 ? (m[h]+(reverse?3:0))%6 : -1;
}
inline float circumference(float diameterIn) { return 3.14159265359f * diameterIn * 0.0254f; }
inline float hallHzForMph(float mph,float diameterIn,unsigned poles) {
    return mph * 0.44704f * 6.0f * poles / circumference(diameterIn);
}
inline float mphForHallHz(float hz,float diameterIn,unsigned poles) {
    return hz * circumference(diameterIn) / (6.0f * poles * 0.44704f);
}
inline float ramp(float elapsed,float duration,float target) {
    const float t=clamp(elapsed/duration,0,1);
    return target*t*t*(3-2*t);
}
struct Temperature { bool valid; float ohms; float c; };
inline Temperature ntc(unsigned adc,bool sensorToGround,float fixedR,float r25,float beta) {
    Temperature t{false,NAN,NAN};
    if (adc <= 8 || adc >= 4087) return t;
    t.ohms = sensorToGround ? fixedR*adc/(4095.0f-adc) : fixedR*(4095.0f-adc)/adc;
    if (!(r25>0 && beta>0)) return t;
    const float invT=1.0f/298.15f+logf(t.ohms/r25)/beta;
    if (!(invT>0)) return t;
    t.c = 1.0f/invT-273.15f;
    t.valid=isfinite(t.c) && t.c>=-30 && t.c<=150;
    return t;
}
inline float thermalScale(float c,float derate,float trip) {
    return isfinite(c) && trip>derate ? clamp((trip-c)/(trip-derate),0,1) : 0;
}
// A changed Hall word must be sampled repeatedly; no time-based commutation.
struct HallFilter {
    uint8_t candidate=0, stable=0;
    uint32_t count=0;
    bool update(uint8_t raw,uint32_t required) {
        if(raw!=candidate) {candidate=raw; count=1;} else if(count<required) ++count;
        if(count>=required && stable!=candidate) {stable=candidate;return true;}
        return false;
    }
};
// Enforce a complete timer interval with ALL phases off on sector changes.
struct Sequencer {
    int active=-1, pending=-1;
    int update(int desired) {
        if(desired<0) {active=pending=-1;return -1;}
        if(desired==active) return active;
        if(desired!=pending) {active=-1;pending=desired;return -1;}
        active=desired;return active;
    }
    void reset() {active=pending=-1;}
};
}
