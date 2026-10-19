#pragma once
#include <math.h>
#include <stdint.h>

// Bench display estimate only. The hardware samples PHASE current, not pack
// current. Six-step duty * filtered phase magnitude is only a motor-input proxy.
// No signed charge current, energy integration, BMS or real pack SOC is claimed.
struct DemoBattery {
    static constexpr float EMPTY_V=30.0f,FULL_V=42.0f;
    static constexpr float DEMO_RESISTANCE_OHM=0.10f; // assumed, NOT pack calibration
    bool valid=false,busValid=false;
    float percent=0,filteredVolts=0,busAmps=0;
    void update(float vm,bool vmValid,bool charge,bool running,float phase,
                float duty,bool currentFresh,float dt) {
        busValid=!running || (currentFresh && isfinite(phase) && phase>=0 &&
                             isfinite(duty) && duty>=0 && duty<=100);
        busAmps=running && busValid?phase*duty/100.0f:0;
        const bool usable=vmValid && !charge && isfinite(vm) && vm>=5 && vm<=50 &&
                          (!running || busValid) && isfinite(dt) && dt>0;
        if(!usable) {valid=false;percent=0;return;}
        const float corrected=vm+busAmps*DEMO_RESISTANCE_OHM;
        if(!valid)filteredVolts=corrected;
        else {const float limitedDt=fminf(dt,0.25f);filteredVolts+=limitedDt/(1.0f+limitedDt)*(corrected-filteredVolts);}
        percent=fminf(100.0f,fmaxf(0.0f,100.0f*(filteredVolts-EMPTY_V)/(FULL_V-EMPTY_V)));
        valid=true;
    }
};
