void setup() {
    // First action: driver OFF. Board R29 also pulls PB5 low during reset.
    pinMode(pin::ENABLE,OUTPUT);digitalWrite(pin::ENABLE,LOW);
    const uint32_t outputs[]={pin::UH,pin::VH,pin::WH,pin::UL,pin::VL,pin::WL,pin::LED};
    for(uint32_t p:outputs) {pinMode(p,OUTPUT);digitalWrite(p,LOW);}
    pinMode(pin::H1,INPUT);pinMode(pin::H2,INPUT);pinMode(pin::H3,INPUT); // external5V pullups, FT pins
    pinMode(pin::MODE,INPUT_PULLUP);pinMode(pin::FAULT,INPUT);
    pinMode(pin::MISO,INPUT);pinMode(pin::MOSI,OUTPUT);
    pinMode(pin::SCK,OUTPUT);digitalWrite(pin::SCK,HIGH);
    pinMode(pin::NCS,OUTPUT);digitalWrite(pin::NCS,HIGH);
    analogReadResolution(12);
    labrtt::begin();
    beginCommUart();

    pwm.setMode(1,TIMER_OUTPUT_COMPARE_PWM1,pin::WH);
    pwm.setMode(2,TIMER_OUTPUT_COMPARE_PWM1,pin::VH);
    pwm.setMode(3,TIMER_OUTPUT_COMPARE_PWM1,pin::UH);
    pwm.setOverflow(cfg::PWM_HZ,HERTZ_FORMAT);
    for(unsigned c=1;c<=3;++c)pwm.setCaptureCompare(c,0,TICK_COMPARE_FORMAT);
    pwm.resume();pwmReady=true;
    // Direct CCR writes are immediate. No complementary PWM outputs are used.
    TIM1->CCMR1 &= ~(TIM_CCMR1_OC1PE|TIM_CCMR1_OC2PE);
    TIM1->CCMR2 &= ~TIM_CCMR2_OC3PE;
    TIM1->CR2 &= ~(TIM_CR2_OIS1|TIM_CR2_OIS2|TIM_CR2_OIS3);
    TIM1->BDTR |= TIM_BDTR_OSSI|TIM_BDTR_OSSR;
    pwmPeriod=TIM1->ARR+1;killHardware();

    attachInterrupt(digitalPinToInterrupt(pin::FAULT),faultISR,RISING);
    HAL_NVIC_SetPriority(EXTI9_5_IRQn,0,0);
    tickTimer.setOverflow(cfg::TICK_HZ,HERTZ_FORMAT);
    tickTimer.attachInterrupt(fastTick);tickTimer.setInterruptPriority(0,0);tickTimer.resume();
    const bool watchdogReset=(RCC->CSR&(RCC_CSR_IWDGRSTF|RCC_CSR_WWDGRSTF))!=0;
    __HAL_RCC_CLEAR_RESET_FLAGS();
    IWatchdog.begin(250000);
    if(watchdogReset) { throttle.inputFault=ThrottleMode::Watchdog; throttle.requested=false; }
    temperatures();vin=readVin();
    say("NIU standalone v%s. Idle first; no USB or host heartbeat required.\n",cfg::REVISION);
}
