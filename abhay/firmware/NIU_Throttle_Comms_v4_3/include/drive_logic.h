#pragma once
#include "control.h"
#include "config.h"

enum class Fault : uint8_t {
    None, Driver, HallInvalid, HallSequence, Stall, LoopTimeout,
    Overcurrent, CurrentSensor, MotorSensor, PcbSensor, MotorHot,
    PcbHot, BusVoltage, Overspeed, DriverConfig, HostTimeout, TestTracking
};

// Called only by the fast timer, or from a main-thread critical section.
// Independent of STM32 registers so the same state machine can be host-tested.
struct DriveLogic {
    control::HallFilter hall;
    control::Sequencer sequencer;
    bool running=false, charge=false;
    Fault fault=Fault::None;
    uint32_t ticks=0, lastEdge=0, period=0, edges=0, validEdges=0;
    uint32_t started=0, chargeReleased=0, lastUnpowered=0;
    uint8_t mask=0, previousRunHall=0;
    uint16_t duty=0; // PWM compare ticks; written by speed controller
    const int8_t *map;
    explicit DriveLogic(const int8_t *m) : map(m) {}
    void stop() { running=false; duty=0; sequencer.reset(); }
    void trip(Fault f) { if(fault==Fault::None) fault=f; stop(); }
    bool arm() {
        if(charge || fault!=Fault::None || !control::validHall(hall.stable) ||
           !control::validMap(map) || ticks-chargeReleased<cfg::TICK_HZ) return false;
        stop(); running=true; started=lastEdge=lastUnpowered=ticks; period=0;
        previousRunHall=hall.stable;validEdges=0;
        return true;
    }
    int tick(uint8_t raw,bool charging,bool driverFault,uint32_t heartbeat) {
        ++ticks;
        const uint8_t old=hall.stable;
        if(hall.update(raw,cfg::HALL_STABLE_TICKS)) {
            ++edges; mask |= uint8_t(1u<<hall.stable);
            if(control::validHall(old) && control::validHall(hall.stable) &&
               control::oneBitChanged(old,hall.stable)) {
                // First partial sector after arm is excluded from speed estimation.
                if(!running || validEdges>0) period=ticks-lastEdge;
                lastEdge=ticks;
                if(running) ++validEdges;
            }
        }
        if(charging) { charge=true; chargeReleased=ticks; stop(); return -1; }
        charge=false;
        if(!running) return -1;
        if(driverFault) {trip(Fault::Driver);return -1;}
        if(ticks-heartbeat>cfg::MAIN_TIMEOUT_TICKS) {trip(Fault::LoopTimeout);return -1;}
        if(!control::validHall(hall.stable)) {trip(Fault::HallInvalid);return -1;}
        if(hall.stable!=previousRunHall) {
            if(!control::forwardEdge(previousRunHall,hall.stable,map,cfg::REVERSE,cfg::FORWARD_SECTOR_INCREMENT)) {
                trip(Fault::HallSequence);return -1;
            }
            previousRunHall=hall.stable;
        }
        // Coasting at zero duty is normal. Require continuous applied drive
        // without a Hall edge before declaring a stall.
        if(!duty) lastUnpowered=ticks;
        if(duty && ticks-lastEdge>cfg::STALL_TICKS && ticks-lastUnpowered>cfg::STALL_TICKS) {trip(Fault::Stall);return -1;}
        // Drop drive while a changed word is being qualified (including 000/111).
        if(raw!=hall.stable || !duty) return sequencer.update(-1);
        return sequencer.update(control::torqueSector(hall.stable,map,cfg::REVERSE));
    }
};
