#pragma once
#include "drive_logic.h"

namespace thermal {
inline Fault fault(control::Temperature motor,control::Temperature pcb,bool useMotor) {
    if(useMotor && !motor.valid)return Fault::MotorSensor;
    if(!pcb.valid)return Fault::PcbSensor;
    if(useMotor && motor.c>=cfg::MOTOR_TRIP_C)return Fault::MotorHot;
    if(pcb.c>=cfg::PCB_TRIP_C)return Fault::PcbHot;
    return Fault::None;
}
inline bool ready(control::Temperature motor,control::Temperature pcb,bool useMotor,float margin=0) {
    return pcb.valid && pcb.c<cfg::PCB_DERATE_C-margin &&
           (!useMotor || (motor.valid && motor.c<cfg::MOTOR_DERATE_C-margin));
}
inline float scale(control::Temperature motor,control::Temperature pcb,bool useMotor) {
    if(!pcb.valid || (useMotor && !motor.valid))return 0;
    const float pcbScale=control::thermalScale(pcb.c,cfg::PCB_DERATE_C,cfg::PCB_TRIP_C);
    return useMotor?fminf(pcbScale,control::thermalScale(motor.c,cfg::MOTOR_DERATE_C,cfg::MOTOR_TRIP_C)):pcbScale;
}
}
