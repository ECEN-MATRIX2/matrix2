#pragma once
#include <stdint.h>

namespace cfg {
constexpr const char *REVISION = "4.3";
constexpr bool REVERSE = false;

// User accepted stock KQi2 Pro 10-inch nominal tire size for this bench demo.
// Speed is approximate until actual rolling circumference is measured.
// Pole pairs confirmed by two 90-edge / one-wheel-revolution lab trials.
// See verification/motor_lab_calibration.json. Actual mph depends on both.
constexpr float WHEEL_DIAMETER_IN = 10.0f;
constexpr unsigned POLE_PAIRS = 15;
constexpr bool SPEED_GEOMETRY_CONFIRMED = true;

// Hall number = HALL1 bit 0 | HALL2 bit 1 | HALL3 bit 2.
// Thin wires: blue -> J1.3/PC8, green -> J1.4/PC7, yellow -> J1.5/PC6.
// Thick phases: blue U, green V, yellow W.
// This board does not determine the motor's rotor-to-Hall offset!
// Fill each entry with the FORWARD torque sector for that Hall code:
// 0 U+V-, 1 U+W-, 2 V+W-, 3 V+U-, 4 W+U-, 5 W+V-.
// 000/111 are invalid for the supported 120-electrical-degree Hall system.
// Do NOT infer this array just by matching wire colors or hand-spin order.
// Passive captures and post-fall check agreed; direction verified in 24 V trials.
constexpr int8_t HALL_TO_SECTOR[8] = {-1,3,1,2,5,4,0,-1};
constexpr bool HALL_MAP_CONFIRMED = true;
constexpr int FORWARD_SECTOR_INCREMENT = 1; // +1 or -1; printed by passive 'map'

// PCB TH1 is Murata NCU18XH103F60RB: 10k at25C, B25/85 typ3434K.
// TH1 is ABOVE the ADC node; R41=10k to GND. Beta conversion approximate.
constexpr float PCB_R25 = 10000.0f;
constexpr float PCB_BETA = 3434.0f;
constexpr float PCB_DERATE_C = 60.0f;
constexpr float PCB_TRIP_C = 80.0f;

// External motor sensor: J1.2/PC4, R30=10k to3V3, sensor to J1.6/GND.
// Unknown sensor is reported as raw ADC and resistance, not invented Celsius.
// Supported profile: passive NTC to GND. Identify its R25 and beta first.
constexpr float MOTOR_R25 = 0.0f;
constexpr float MOTOR_BETA = 0.0f;
constexpr bool MOTOR_NTC_CONFIRMED = false;
// User-authorized bench option: unknown white wire stays insulated/disconnected.
// No motor temperature measurement, derating or overtemperature trip in this mode.
// PCB thermistor protection remains mandatory. Re-enable only with a known NTC.
constexpr bool USE_MOTOR_TEMPERATURE = false;
constexpr float MOTOR_DERATE_C = 70.0f;
constexpr float MOTOR_TRIP_C = 90.0f;

// Intermediate J11.1 -> motor J16.1/PC13; J11.2 -> motor GND.
// LOW disables motor immediately. HIGH must settle 1s, followed by a fresh idle qualification.
// The pullup cannot detect an unplugged mode cable.
constexpr bool USE_CHARGE_INPUT = true;

constexpr uint32_t PWM_HZ = 20000;
constexpr uint32_t TICK_HZ = 20000;
constexpr uint32_t TICK_US = 1000000 / TICK_HZ;
constexpr uint32_t HALL_STABLE_TICKS = 2;
constexpr uint32_t STALL_TICKS = 1200 * TICK_HZ / 1000;
constexpr uint32_t MAIN_TIMEOUT_TICKS = 50 * TICK_HZ / 1000;
constexpr float DUTY_RISE_PCT_PER_S = 20.0f; // current regulator rise ceiling, percentage points/s
constexpr float KP = 1.0f; // duty percentage points / mph; bench tuning required
constexpr float KI = 0.5f; // duty percentage points / (mph*s)


// Schematic: 33mOhm shunts, TMC gain5, divider 2.2k/(1.5k+2.2k).
constexpr float ADC_VREF = 3.3f;
constexpr float SHUNT_OHM = 0.033f;
constexpr float CURRENT_GAIN = 5.0f * 2200.0f / 3700.0f;
// R15=10k from 5VOUT and R14=10k to GND set VOFS near 2.5V; R13 is DNP.
// The weak internal divider lowers this slightly. CUR outputs then pass through
// 1k5/2k2 ADC dividers. Do not use the floating-VOFS internal 1.66V baseline.
constexpr float CURRENT_ZERO_EXPECTED_V = 2.5f * 2200.0f / 3700.0f;
constexpr float CURRENT_ZERO_TOLERANCE_V = 0.25f; // rail/reference, divider and amplifier offset allowance
constexpr unsigned CURRENT_ZERO_MIN_ADC = unsigned((CURRENT_ZERO_EXPECTED_V-CURRENT_ZERO_TOLERANCE_V)*4095.0f/ADC_VREF);
constexpr unsigned CURRENT_ZERO_MAX_ADC = unsigned((CURRENT_ZERO_EXPECTED_V+CURRENT_ZERO_TOLERANCE_V)*4095.0f/ADC_VREF);
constexpr unsigned CURRENT_ZERO_MAX_SPAN = 100; // unchanged noise rejection
// Phase-current bench limits, not battery current. Slow software protection
// supplements the TMC short detector; it does not replace hardware protection.
constexpr float CURRENT_LIMIT_A = 2.0f;
constexpr float CURRENT_TRIP_A = 4.0f;
// Dedicated 36 V bench profile. These are measured-ADC software limits, not
// component ratings or a hardware bus clamp. Both run modes use this window.
constexpr float VM_NOMINAL = 36.0f;
constexpr float VM_START_MIN = 34.0f;
constexpr float VM_START_MAX = 38.0f;
constexpr float VM_MIN = 30.0f;
constexpr float VM_MAX = 45.0f;
constexpr float VM_DIVIDER = (22000.0f + 1500.0f) / 1500.0f;


static_assert(CURRENT_LIMIT_A > 0 && CURRENT_TRIP_A > CURRENT_LIMIT_A, "Invalid current limits");
static_assert(VM_MIN < VM_START_MIN && VM_START_MAX < VM_MAX, "Invalid VM windows");
static_assert(POLE_PAIRS > 0, "Invalid motor geometry");
}
