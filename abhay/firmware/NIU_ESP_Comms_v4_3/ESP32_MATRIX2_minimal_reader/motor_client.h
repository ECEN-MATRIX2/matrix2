#pragma once
#include "comms_protocol.h"

// Pure protocol state: all mutations belong to the dedicated UART task.
namespace motorclient {
enum ResetState {Idle,Pending,Cleared,Refused,TimedOut,Rebooted,Cancelled,LinkUnavailable,Busy,IdExhausted,TxFailed};
inline const char* resetName(ResetState s) {
    const char* names[]={"idle","pending","cleared","refused","unacknowledged","cancelled_motor_reboot",
        "cancelled","link_unavailable","busy","request_id_exhausted","uart_tx_failed"};
    return names[s];
}
inline const char* stateName(unsigned s) {
    const char* names[]={"WAIT_VM","WAIT_SENSORS","WAIT_STILL","WAIT_IDLE","READY","DRIVING",
        "COASTING","STOPPED","CHARGE","FAULT","WAIT_TORQUE"};
    return s<=10?names[s]:"UNKNOWN";
}
inline const char* faultName(unsigned f) {
    const char* names[]={"none","Gate-driver fault","Invalid Hall code","Hall sequence / reverse rotation",
        "Stall under applied drive","Control loop stalled","Phase current >= 4 A","Current sensor / calibration",
        "Motor temperature sensor","PCB temperature sensor","Motor overtemperature","PCB >= 80 C",
        "VM outside permitted range","Legacy overspeed","Gate-driver configuration","Legacy host timeout","Legacy tracking error"};
    return f<=16?names[f]:"Unknown motor fault";
}
inline const char* inputName(unsigned f) {
    const char* names[]={"none","Throttle outside 0.20-3.10 V for 50 ms","Throttle samples stale","Watchdog reset - inspect before clearing"};
    return f<=3?names[f]:"Unknown throttle fault";
}
inline const char* resultName(unsigned r) {
    const char* names[]={"no request","Fault cleared; motor stopped","Drive running","Wheel moving",
        "Throttle not idle","VM not in 34-38 V startup range","Sensors or charge prerequisites not ready",
        "Throttle enabled; waiting for throttle movement","Fault still active","Fresh successful clear required",
        "Enable preparation failed"};
    return r<=10?names[r]:"Unknown acknowledgement";
}
enum Operation {OpIdle,OpPending,OpSucceeded,OpFailed,OpCancelled,OpUnknown};
inline const char* operationName(Operation s) {
    const char* names[]={"idle","pending","succeeded","failed","cancelled","unknown"};return names[s];
}
struct Client {
    comms::Status status{};
    bool have=false,slot=false,pending=false,healthy=true;
    uint32_t receivedMs=0,packets=0,requestId=0,highestId=0,requestedMs=0;
    uint32_t attempts=0,lastAttemptToken=0,lastFaultMs=0,lastMotorFault=0,lastInputFault=0;
    ResetState reset=Idle;uint32_t result=0;
    bool recovery=false,watchEnableAck=false;
    comms::Action action=comms::Reset;
    uint32_t operationId=0,clearRequestId=0,clearAttempts=0,enableResult=0;
    Operation operation=OpIdle;
    const char* reason="none";
    const char* stage()const{return !operationId?"idle":action==comms::Reset?"clear":"enable";}
    bool enabled()const{return (status.data.flags&comms::ENABLED_FLAG)!=0;}
    void finish(Operation state,const char* why) {
        pending=false;slot=false;operation=state;reason=why;
    }
    void abort(ResetState legacy,const char* why) {
        if(!pending)return;
        if(action==comms::Reset)reset=legacy;
        watchEnableAck=action==comms::Enable && attempts>0;
        finish(watchEnableAck?OpUnknown:OpCancelled,why);
    }
    bool fresh(uint32_t now)const{return healthy && have && uint32_t(now-receivedMs)<comms::STALE_MS;}
    bool receive(const comms::Status& s,uint32_t now,bool timely) {
        if(!comms::valid(s))return false;
        tick(now); // A late clear ACK must never advance an expired operation.
        bool reboot=false;
        if(have) {
            const int32_t seq=int32_t(s.data.sequence-status.data.sequence);
            const int32_t up=int32_t(s.data.uptimeMs-status.data.uptimeMs);
            if(seq==0 && up==0)return false;
            if(seq<=0 || up<0) {
                // UART preserves order. Both counters regressing identifies reboot;
                // signed deltas distinguish normal uint32 rollover.
                if(seq<=0 && up<0) {
                    abort(Rebooted,"Motor reboot; operation cancelled; inspect current enable status");
                    watchEnableAck=false;reboot=true;
                    highestId=0;
                } else return false;
            }
        }
        const bool newFault=(s.data.fault && s.data.fault!=status.data.fault) ||
            (s.inputFault && s.inputFault!=status.inputFault);
        status=s;have=true;healthy=true;receivedMs=now;++packets;slot=timely;
        if(s.ackId>highestId)highestId=s.ackId;
        if(s.data.fault || s.inputFault) {
            lastFaultMs=now;lastMotorFault=s.data.fault;lastInputFault=s.inputFault;
        }
        if(recovery && pending && (newFault || (action==comms::Enable &&
            (s.data.fault || s.inputFault || (s.data.flags&telemetry::CHARGING))))) {
            abort(Cancelled,"Fault or charging interrupted recovery; inspect current enable status");
        }
        if(!reboot && timely && watchEnableAck && s.ackId==requestId && s.ackResult) {
            enableResult=s.ackResult;watchEnableAck=false;
            finish(OpCancelled,"Late enable acknowledgement received; inspect current MCU enable status");
        }
        if(pending && attempts && (!recovery || timely) && s.ackId==requestId && s.ackResult) {
            if(action==comms::Reset) {
                result=s.ackResult;clearAttempts=attempts;
                reset=result==comms::Cleared?Cleared:Refused;
                if(result!=comms::Cleared){finish(OpFailed,resultName(result));return true;}
                if(!recovery){finish(OpSucceeded,"Fault cleared; motor stopped");return true;}
                if(s.data.fault || s.inputFault || s.state!=comms::Stopped ||
                   (s.data.flags&(telemetry::RUNNING|telemetry::CHARGING|comms::ENABLED_FLAG))) {
                    finish(OpFailed,"Clear acknowledgement conflicts with MCU state; enable not sent");return true;
                }
                if(highestId==UINT32_MAX){finish(OpFailed,"Fault cleared; request IDs exhausted");return true;}
                action=comms::Enable;requestId=++highestId;requestedMs=now;
                attempts=0;slot=false;reason="Fault cleared; waiting for enable acknowledgement";
            } else {
                enableResult=s.ackResult;
                if(enableResult==comms::Enabled && enabled())
                    finish(OpSucceeded,"Fault cleared; throttle enabled; waiting for throttle movement");
                else finish(OpFailed,enableResult==comms::Enabled?
                    "Fault cleared; enable acknowledgement conflicts with MCU state":"Fault cleared; enable refused");
            }
        }
        return true;
    }
    bool request(uint32_t now,bool recover=false) {
        if(pending)return false; // duplicate tap cannot replace a pending action
        result=0;attempts=0;clearAttempts=0;enableResult=0;watchEnableAck=false;
        recovery=recover;action=comms::Reset;operationId=0;operation=OpFailed;
        reason="Motor link unavailable";
        if(!fresh(now) || (status.data.flags&telemetry::SIMULATED)){reset=LinkUnavailable;return false;}
        if(highestId==UINT32_MAX){reset=IdExhausted;reason="Request IDs exhausted";return false;}
        requestId=++highestId;requestedMs=now;pending=true;reset=Pending;slot=false;
        clearRequestId=operationId=requestId;operation=OpPending;reason="Waiting for clear acknowledgement";
        return true; // wait for a NEW status slot, never transmit on app arrival
    }
    void cancel(){abort(Cancelled,"Cancelled by disconnect; inspect current MCU enable status");slot=false;}
    void invalidate(){slot=false;healthy=false;}
    void tick(uint32_t now) {
        if(pending && uint32_t(now-requestedMs)>=2000){
            if(action==comms::Reset){reset=TimedOut;finish(OpFailed,"Clear acknowledgement missing; enable not sent");}
            else {watchEnableAck=attempts>0;finish(watchEnableAck?OpUnknown:OpFailed,
                attempts?"Fault cleared; enable acknowledgement missing":"Fault cleared; enable could not be sent");}
        }
    }
    bool maySend(uint32_t now) {
        tick(now);
        const uint32_t age=uint32_t(now-receivedMs);
        if(age>30)slot=false;
        return pending && fresh(now) && slot && age>=20 && age<=30 && attempts<3 &&
            (!attempts || lastAttemptToken!=status.data.sequence);
    }
    void sent(){++attempts;if(action==comms::Reset)clearAttempts=attempts;lastAttemptToken=status.data.sequence;slot=false;}
    void txFailed(){
        if(action==comms::Reset){reset=TxFailed;finish(OpFailed,"Clear UART transmit failed; enable not sent");}
        else {watchEnableAck=true;finish(OpUnknown,"Fault cleared; enable UART transmit uncertain");}
    }
};
struct Parser {
    char buffer[comms::MAX_FRAME]{};size_t used=0;uint32_t rejected=0,echoes=0;
    bool timely=false;uint32_t started=0;
    bool feed(char c,uint32_t now,bool recent,comms::Status& out,bool& slotSafe) {
        if(c=='$'){used=0;buffer[used++]=c;timely=recent;started=now;return false;}
        if(!used)return false;
        timely=timely && recent;
        if(c=='\n') {
            const bool echo=used>=6 && !memcmp(buffer,"$NIC1,",6);
            const bool ok=!echo && comms::decode(buffer,used,out);
            slotSafe=timely && uint32_t(now-started)<150;
            used=0;if(echo)++echoes;else if(!ok)++rejected;
            return ok;
        }
        if(c<32 || c>126 || used>=sizeof(buffer)-1){used=0;++rejected;return false;}
        buffer[used++]=c;return false;
    }
};
}
