#pragma once
#include "config.h"
inline bool validCurrentZero(unsigned mean,unsigned minimum,unsigned maximum) {
    return minimum<=mean && mean<=maximum && minimum>8 && maximum<4087 &&
           mean>=cfg::CURRENT_ZERO_MIN_ADC && mean<=cfg::CURRENT_ZERO_MAX_ADC &&
           maximum-minimum<=cfg::CURRENT_ZERO_MAX_SPAN;
}
