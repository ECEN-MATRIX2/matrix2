#pragma once
#include "motor_client.h"
#include <driver/gpio.h>
#include <esp_rom_gpio.h>
#include <soc/gpio_struct.h>
#include <soc/gpio_sig_map.h>

static constexpr int MOTOR_RX_PIN=5,MOTOR_TX_PIN=4;
static constexpr uart_port_t MOTOR_UART=UART_NUM_2;
static QueueHandle_t motorEvents=nullptr,motorActions=nullptr;
static portMUX_TYPE motorMux=portMUX_INITIALIZER_UNLOCKED;
struct MotorView {
    motorclient::Client client;
    uint32_t badFrames=0,uartErrors=0,echoes=0;
    bool ready=false,openDrain=false;
};
static MotorView motorView;
static std::atomic<bool> cancelMotorRequest{false};
static std::atomic<uint32_t> commandEpoch{1};
struct MotorAction {uint32_t epoch;uint8_t kind;};
static MotorView motorSnapshot(){
    portENTER_CRITICAL(&motorMux);MotorView s=motorView;portEXIT_CRITICAL(&motorMux);return s;
}
static void publishMotor(const MotorView& v){
    portENTER_CRITICAL(&motorMux);motorView=v;portEXIT_CRITICAL(&motorMux);
}
static bool motorTxIsOpenDrain(){
    return GPIO.pin[MOTOR_TX_PIN].pad_driver &&
        GPIO.func_out_sel_cfg[MOTOR_TX_PIN].func_sel==U2TXD_OUT_IDX;
}
static bool requestMotorClear(bool recover,uint32_t epoch){
    if(epoch!=commandEpoch.load())return false;
    MotorAction action{epoch,uint8_t(recover?2:1)};
    return motorActions && xQueueSend(motorActions,&action,0)==pdTRUE;
}
static void motorTask(void*) {
    MotorView v=motorSnapshot();motorclient::Parser parser;
    uint32_t lastPoll=millis(),activeEpoch=commandEpoch.load();
    for(;;) {
        const uint32_t now=millis();const bool recent=uint32_t(now-lastPoll)<=5;lastPoll=now;
        if(!recent)v.client.slot=false;
        if(cancelMotorRequest.exchange(false) || activeEpoch!=commandEpoch.load()){
            xQueueReset(motorActions);v.client.cancel();
            activeEpoch=commandEpoch.load();
        }
        MotorAction action{};
        if(xQueueReceive(motorActions,&action,0)==pdTRUE && action.epoch==commandEpoch.load()){
            if(v.client.request(now,action.kind==2))activeEpoch=action.epoch;
        }
        uart_event_t e;
        for(unsigned i=0;i<16 && xQueueReceive(motorEvents,&e,0)==pdTRUE;++i) {
            if(e.type==UART_FIFO_OVF || e.type==UART_BUFFER_FULL || e.type==UART_FRAME_ERR ||
               e.type==UART_PARITY_ERR || e.type==UART_BREAK) {
                ++v.uartErrors;uart_flush_input(MOTOR_UART);xQueueReset(motorEvents);
                parser.used=0;v.client.invalidate();break;
            }
        }
        uint8_t bytes[128];
        for(unsigned batch=0;batch<4;++batch) {
            int count=uart_read_bytes(MOTOR_UART,bytes,sizeof(bytes),0);if(count<=0)break;
            // A queued frame after a scheduling gap may update display, never grant TX.
            for(int i=0;i<count;++i) {
                comms::Status frame;bool slotSafe=false;
                if(parser.feed(char(bytes[i]),now,recent,frame,slotSafe))
                    v.client.receive(frame,now,slotSafe);
            }
        }
        const uint32_t sendNow=millis();
        if(uint32_t(sendNow-now)>5)v.client.slot=false;
        v.client.tick(sendNow);
        if(activeEpoch!=commandEpoch.load())v.client.cancel();
        if(v.client.maySend(sendNow)) {
            size_t unread=0;
            const bool quiet=uart_get_buffered_data_len(MOTOR_UART,&unread)==ESP_OK && !unread && !parser.used;
            v.openDrain=motorTxIsOpenDrain();
            if(!v.openDrain){gpio_set_direction(GPIO_NUM_4,GPIO_MODE_INPUT);v.client.txFailed();v.ready=false;}
            else if(quiet && gpio_get_level(GPIO_NUM_4) && uart_wait_tx_done(MOTOR_UART,0)==ESP_OK && v.client.maySend(millis())) {
                char line[comms::MAX_COMMAND];
                comms::Command command;command.token=v.client.status.data.sequence;command.id=v.client.requestId;
                command.action=v.client.action;
                size_t n=comms::encodeCommand(command,line,sizeof(line));
                // No TX ring buffer: bounded command fits the 128-byte hardware FIFO.
                // Never queue a retry to be sent outside the reserved receive window.
                if(n && uart_tx_chars(MOTOR_UART,line,n)==int(n))v.client.sent();
                else v.client.txFailed();
            }
        }
        v.badFrames=parser.rejected;v.echoes=parser.echoes;publishMotor(v);
        vTaskDelay(1);
    }
}
static void setupMotorUart() {
    MotorView v;
    // Configure OD while using the high GPIO latch, BEFORE routing UART TX.
    // uart_set_pin TX is deliberately left unchanged because it configures push-pull.
    gpio_set_level(GPIO_NUM_4,1);
    gpio_config_t pad{};pad.pin_bit_mask=1ULL<<MOTOR_TX_PIN;
    pad.mode=GPIO_MODE_INPUT_OUTPUT_OD;pad.pull_up_en=GPIO_PULLUP_DISABLE;
    pad.pull_down_en=GPIO_PULLDOWN_DISABLE;pad.intr_type=GPIO_INTR_DISABLE;
    esp_err_t err=gpio_config(&pad);
    uart_config_t config{};config.baud_rate=comms::BAUD;config.data_bits=UART_DATA_8_BITS;
    config.parity=UART_PARITY_DISABLE;config.stop_bits=UART_STOP_BITS_1;
    config.flow_ctrl=UART_HW_FLOWCTRL_DISABLE;config.source_clk=UART_SCLK_APB;
    if(err==ESP_OK)err=uart_param_config(MOTOR_UART,&config);
    if(err==ESP_OK)err=uart_set_pin(MOTOR_UART,UART_PIN_NO_CHANGE,MOTOR_RX_PIN,UART_PIN_NO_CHANGE,UART_PIN_NO_CHANGE);
    if(err==ESP_OK)err=uart_driver_install(MOTOR_UART,1024,0,16,&motorEvents,0);
    if(err==ESP_OK)err=uart_set_rx_full_threshold(MOTOR_UART,1);
    if(err==ESP_OK)err=uart_set_rx_timeout(MOTOR_UART,1);
    if(err==ESP_OK) {
        esp_rom_gpio_connect_out_signal(MOTOR_TX_PIN,U2TXD_OUT_IDX,false,false);
        v.openDrain=motorTxIsOpenDrain();
        if(!v.openDrain)err=ESP_FAIL;
    }
    if(err==ESP_OK){motorActions=xQueueCreate(1,sizeof(MotorAction));if(!motorActions)err=ESP_ERR_NO_MEM;}
    v.ready=err==ESP_OK;publishMotor(v);
    if(v.ready && xTaskCreatePinnedToCore(motorTask,"motor_uart",6144,nullptr,3,nullptr,1)!=pdPASS){
        v.ready=false;err=ESP_ERR_NO_MEM;publishMotor(v);
    }
    if(!v.ready)gpio_set_direction(GPIO_NUM_4,GPIO_MODE_INPUT);
    Serial.printf("{\"motor_uart_ready\":%s,\"motor_tx_open_drain\":%s,\"uart_error\":%d}\n",
        v.ready?"true":"false",v.openDrain?"true":"false",int(err));
}
