static void phasesOff() {
    // OSSI+reset idle states hold ALL high inputs LOW when MOE is cleared.
    // Unlike analogWrite(0), this takes effect without waiting for PWM rollover.
    if(pwmReady) {TIM1->BDTR &= ~TIM_BDTR_MOE;TIM1->CCR1=TIM1->CCR2=TIM1->CCR3=0;}
    GPIOB->BSRR=uint32_t(GPIO_PIN_13|GPIO_PIN_14|GPIO_PIN_15)<<16u;
}

static void killHardware() {
    GPIOB->BSRR=GPIO_PIN_5<<16u;
    phasesOff();
}

static void phaseSector(int sector,uint16_t compare) {
    // TIM2 is the sole writer while running. Each sector change was blanked
    // for >=one50us tick by Sequencer; MOE remains off until LS/CCR are ready.
    static int applied=-1;
    if(sector<0) {phasesOff();applied=-1;return;}
    if(sector!=applied) {
        phasesOff();
        static const uint16_t low[6]={GPIO_PIN_14,GPIO_PIN_13,GPIO_PIN_13,
                                      GPIO_PIN_15,GPIO_PIN_15,GPIO_PIN_14};
        GPIOB->BSRR=low[sector];applied=sector;
    }
    TIM1->CCR3=(sector==0||sector==1)?compare:0; // U
    TIM1->CCR2=(sector==2||sector==3)?compare:0; // V
    TIM1->CCR1=(sector==4||sector==5)?compare:0; // W
    TIM1->BDTR |= TIM_BDTR_MOE;
}

static uint8_t spiByte(uint8_t x) {
    uint8_t rx=0;
    for(unsigned b=0;b<8;++b) {
        digitalWrite(pin::SCK,LOW);
        digitalWrite(pin::MOSI,(x&0x80)?HIGH:LOW);x<<=1;
        delayMicroseconds(2);
        digitalWrite(pin::SCK,HIGH);delayMicroseconds(2);
        rx=(rx<<1)|(digitalRead(pin::MISO)?1:0);
    }
    return rx;
}

static uint32_t transaction(uint8_t addr,uint32_t val) {
    digitalWrite(pin::NCS,LOW);delayMicroseconds(2);
    spiByte(addr);
    uint32_t result=0;
    for(int shift=24;shift>=0;shift-=8) result=(result<<8)|spiByte((uint8_t)(val>>shift));
    digitalWrite(pin::NCS,HIGH);delayMicroseconds(2);return result;
}

static uint32_t tmcRead(uint8_t addr) {return transaction(addr&0x7F,0);}

static void tmcWrite(uint8_t addr,uint32_t value) {transaction(addr|0x80,value);}

static void snapshotDriver() {
    gstat=tmcRead(reg::GSTAT);ioin=tmcRead(reg::IOIN);gconf=tmcRead(reg::GCONF);
    shortconf=tmcRead(reg::SHORT_CONF);drvconf=tmcRead(reg::DRV_CONF);
}

static bool initDriver() {
    {
        Lock l;
        if(charging() || drive.charge || drive.fault!=Fault::None) return false;
        phasesOff();preparing=true;heartbeat=drive.ticks;faultIrq=false;
        GPIOB->BSRR=GPIO_PIN_5; // no PWM; allow reset flag to be cleared
    }
    delay(3);
    if(!preparing || charging()) return false;
    ioin=tmcRead(reg::IOIN);
    if((ioin>>24)!=0x10) {trip(Fault::DriverConfig);return false;}
    tmcWrite(reg::GCONF,reg::GCONF_VALUE);
    // Short detector sensitivity/default gate strength are retained, never disabled.
    // Remove automatic retries and stop all bridges together on a short.
    shortconf=tmcRead(reg::SHORT_CONF);
    shortconf=(shortconf&~(reg::SHORT_DISABLE|(3u<<24)))|(1u<<28);
    tmcWrite(reg::SHORT_CONF,shortconf);
    tmcWrite(reg::GSTAT,0x7FFF);delay(2);
    snapshotDriver();
    if(gconf!=reg::GCONF_VALUE || (gstat&reg::BAD_STATUS) ||
       (shortconf&reg::SHORT_DISABLE) || digitalRead(pin::FAULT)) {
        trip(Fault::DriverConfig);return false;
    }
    return preparing && !charging();
}

static int readADC(uint32_t p) {
    const int raw=analogRead(p);lastAdcPin=p;return raw;
}

static float readVin() {
    vmPreviousAdcPin=lastAdcPin;
    vmAdc=readADC(pin::VM);vmReadUs=micros();
    return vmAdc*cfg::ADC_VREF/4095.0f*cfg::VM_DIVIDER;
}

static void temperatures() {
    motorAdc=readADC(pin::MOTOR_TEMP);pcbAdc=readADC(pin::PCB_TEMP);
    motorTemp=cfg::USE_MOTOR_TEMPERATURE?control::ntc(motorAdc,true,10000,cfg::MOTOR_R25,cfg::MOTOR_BETA):control::Temperature{false,NAN,NAN};
    pcbTemp=control::ntc(pcbAdc,false,10000,cfg::PCB_R25,cfg::PCB_BETA);
    if(!driverReady && !running()) return;
    const Fault f=thermal::fault(motorTemp,pcbTemp,cfg::USE_MOTOR_TEMPERATURE);
    if(f!=Fault::None)trip(f);
}

static bool calibrateCurrentZero() {
    currentCalibrated=false;currentSampleValid=false;
    bool valid=true;
    for(unsigned p=0;p<3;++p) {
        // Discard first conversion after changing ADC channels.
        readADC(pin::CURRENT[p]);delayMicroseconds(50);
        uint32_t sum=0;int min=4095,max=0;
        for(unsigned n=0;n<64;++n) {
            int a=readADC(pin::CURRENT[p]);sum+=a;if(a<min)min=a;if(a>max)max=a;
            {Lock l;heartbeat=drive.ticks;}
            IWatchdog.reload();
            if(!preparing || charging()) return false;
        }
        zeroCurrent[p]=sum/64;
        zeroMinimum[p]=min;zeroMaximum[p]=max;
        if(!validCurrentZero(zeroCurrent[p],min,max))valid=false;
    }
    say("I_ZERO U=%d[%d..%d] V=%d[%d..%d] W=%d[%d..%d] allowed=%u..%u span<=%u result=%s\n",
        zeroCurrent[0],zeroMinimum[0],zeroMaximum[0],zeroCurrent[1],zeroMinimum[1],zeroMaximum[1],
        zeroCurrent[2],zeroMinimum[2],zeroMaximum[2],cfg::CURRENT_ZERO_MIN_ADC,cfg::CURRENT_ZERO_MAX_ADC,
        cfg::CURRENT_ZERO_MAX_SPAN,valid?"PASS":"FAIL");
    if(!valid)trip(Fault::CurrentSensor);
    currentCalibrated=valid;
    return valid;
}

static void updateSpeedMeasurement() {
    uint8_t hall;
    {Lock l;hall=drive.hall.stable;
        rawMph=speedObserver.mph(drive.ticks,cfg::WHEEL_DIAMETER_IN,cfg::POLE_PAIRS);
        cycleMph=speedObserver.cycleMph(drive.ticks,cfg::WHEEL_DIAMETER_IN,cfg::POLE_PAIRS);
        speedPeriod=speedObserver.period;speedCycleSum=speedObserver.sum;speedCycleCount=speedObserver.count;}
    speedValid=cfg::SPEED_GEOMETRY_CONFIRMED && control::validHall(hall);
    const float mph=speedValid?cycleMph:0;
    measuredMph+=0.2f*(mph-measuredMph);
    if(!speedValid || mph==0)measuredMph=0;
}

