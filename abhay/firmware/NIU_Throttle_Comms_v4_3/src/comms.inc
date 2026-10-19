// One shared signal; ESP TX must join upstream of U2 using J6.1 -> J5.3.
// Both transmitters are OPEN DRAIN. Retain U2 and the board's pullups.
static char commWire[comms::MAX_FRAME];
static size_t commLength=0,commNext=0;
static uint32_t commToken=0;
static bool commSending=false;
static comms::CommandParser commParser;

static void beginCommUart() {
    // PA7 shares J4.3 with PB10: it must never drive this net.
    pinMode(PA7,INPUT);pinMode(PA5,INPUT);pinMode(PB11,INPUT);pinMode(PA6,INPUT);
    __HAL_RCC_DAC_CLK_ENABLE();DAC->CR &= ~DAC_CR_EN2;
    motorLink.begin(comms::BAUD); // one-pin constructor selects HAL half duplex
    GPIO_InitTypeDef p{};p.Pin=GPIO_PIN_10;p.Mode=GPIO_MODE_AF_OD;
    p.Pull=GPIO_NOPULL;p.Speed=GPIO_SPEED_FREQ_LOW;p.Alternate=GPIO_AF7_USART3;
    HAL_GPIO_Init(GPIOB,&p);
    HAL_NVIC_SetPriority(USART3_IRQn,2,0); // below the motor's TIM2 ISR
    motorLink.enableHalfDuplexRx(); // nothing has been transmitted yet
}

static bool telemetryVmValid(uint32_t nowUs) {
    return isfinite(vin) && vin>=0 && vin<=60 && vmAdc<4088 && uint32_t(nowUs-vmReadUs)<20000;
}
static int32_t snapshotValue(float v,float max) {
    return isfinite(v) && v>=0 && v<=max?int32_t(v*1000+.5f):-1;
}
static size_t encodeStatus(uint32_t now) {
    const float dt=float(uint32_t(now-lastCommMs))/1000.0f;lastCommMs=now;
    bool r;Fault fault;{Lock l;r=drive.running;fault=drive.fault;}
    const bool ch=charging(),vmOk=telemetryVmValid(micros());
    const bool ampsOk=r && currentSampleValid && currentCalibrated &&
        uint32_t(now-currentSampleMs)<20 && isfinite(currentFiltered) && currentFiltered>=0 && currentFiltered<=100;
    demoBattery.update(vin,vmOk,ch,r,currentFiltered,dutyPct,ampsOk,dt);
    comms::Status s;auto& f=s.data;
    f.sequence=commSequence++;commToken=f.sequence;f.uptimeMs=now;f.fault=unsigned(fault);
    s.inputFault=unsigned(throttle.inputFault);s.state=stateCode();
    s.ackId=commRequests.lastId;s.ackResult=commRequests.lastResult;
    if(faultSnapshot.valid) {
        s.faultVmMv=snapshotValue(faultSnapshot.vm,60);
        s.faultPhaseMa=snapshotValue(faultSnapshot.amps,100);
    }
    if(r)f.flags|=telemetry::RUNNING;
    if(ch)f.flags|=telemetry::CHARGING;
    if(fault!=Fault::None || s.inputFault)f.flags|=telemetry::FAULT;
    if(driverReady && throttle.armed && throttle.requested && !ch && !faultIrq &&
       fault==Fault::None && !s.inputFault &&
       (s.state==comms::Ready || s.state==comms::Driving || s.state==comms::Coasting || s.state==comms::WaitTorque))
        f.flags|=comms::ENABLED_FLAG;
    if(speedValid && isfinite(measuredMph) && measuredMph>=0 && measuredMph<=100) {
        f.flags|=telemetry::SPEED_VALID;f.speedCentiMph=int32_t(measuredMph*100+.5f);
    }
    if(vmOk) {f.flags|=telemetry::VM_VALID;f.vmMilliVolts=int32_t(vin*1000+.5f);}
    if(ampsOk) {f.flags|=telemetry::PHASE_VALID;f.phaseMilliAmps=int32_t(currentFiltered*1000+.5f);}
    if(demoBattery.busValid) {
        f.flags|=telemetry::BUS_EST_VALID;f.busEstimateMilliAmps=int32_t(demoBattery.busAmps*1000+.5f);
    }
    if(demoBattery.valid) {
        f.flags|=telemetry::SOC_VALID;f.socCentiPercent=int32_t(demoBattery.percent*100+.5f);
    }
    return comms::encode(s,commWire,sizeof(commWire));
}

static void serviceComms(uint32_t now) {
    if(commSending) {
        // Single-byte writes only after space is available: never wait for TX.
        for(unsigned n=0;n<16 && commNext<commLength && motorLink.availableForWrite()>0;++n)
            motorLink.write(uint8_t(commWire[commNext++]));
        if(commNext==commLength && motorLink.availableForWrite()==SERIAL_TX_BUFFER_SIZE-1 &&
           (USART3->SR&USART_SR_TC)) {
            // The core's direction switch calls flush(); it cannot wait here,
            // because the queue is empty AND the last stop bit has completed.
            motorLink.enableHalfDuplexRx();
            commSending=false;commParser.clear();commRequests.begin(commToken,now);
        }
        return;
    }
    // RX interrupt buffers commands even during ADC/SPI work. Ignore everything
    // outside the granted slot. Bound CPU work even with a noisy/stuck peer.
    if(!commRequests.active(now)) {commRequests.close();commParser.clear();}
    for(unsigned n=0;n<32 && motorLink.available();++n) {
        const int c=motorLink.read(); // only in RX; no queued TX to flush
        comms::Command cmd;
        if(commRequests.active(now) && commParser.feed(char(c),cmd)) {
            if(commRequests.accept(cmd,now)==comms::Requests::New)
                commRequests.completed(cmd,handleRemoteCommand(cmd));
        }
    }
    if(commRequests.active(now) || uint32_t(now-lastCommMs)<comms::PERIOD_MS)return;
    // Finish discarding an out-of-slot backlog before starting another frame.
    if(motorLink.available())return;
    commRequests.close();commParser.clear();
    commLength=encodeStatus(now);commNext=0;commSending=commLength!=0;
}
