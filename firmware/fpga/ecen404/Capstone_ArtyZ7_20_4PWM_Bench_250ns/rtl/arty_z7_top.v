`timescale 1ns/1ps
// FOUR PWM DRIVER BENCH ONLY. Converter AC input must be disconnected.
module arty_z7_top #(
    parameter integer ADC_ZERO_CODE=2036, // 1.650 V at A0 / 3.32 V * 4096
    parameter integer DEBOUNCE_CYCLES=1000000,
    parameter SIM_MONITOR_FILE="arty_analog.txt"
)(
    input wire clk_125mhz, reset_btn, run_sw,
    input wire a0_p, a0_n,
    output wire [3:0] gates,
    output wire gate_en,
    output wire [3:0] led
);
    wire clk, locked;
    arty_clock clocks(.clk_125mhz(clk_125mhz),.clk(clk),.locked(locked));
    (* ASYNC_REG="TRUE" *) reg [3:0] reset_pipe=4'hf;
    wire async_reset=reset_btn || !locked;
    always @(posedge clk or posedge async_reset)
        if(async_reset) reset_pipe<=4'hf;
        else reset_pipe<={reset_pipe[2:0],1'b0};
    wire reset=reset_pipe[3];
    (* ASYNC_REG="TRUE" *) reg run_meta=0, run_sync=0;
    always @(posedge clk) begin
        if(reset) begin run_meta<=0; run_sync<=0; end
        else begin run_meta<=run_sw; run_sync<=run_meta; end
    end
    // Require a stable OFF observation after reset, then stable ON to arm.
    reg run_filtered=0, off_seen=0;
    integer debounce_count=0;
    reg previous_run=0;
    always @(posedge clk) begin
        if(reset) begin
            run_filtered<=0; off_seen<=0; debounce_count<=0; previous_run<=0;
        end else begin
            previous_run<=run_sync;
            if(run_sync!=previous_run) debounce_count<=0;
            else if(debounce_count<DEBOUNCE_CYCLES) debounce_count<=debounce_count+1;
            if(!run_sync) run_filtered<=0; // stop immediately after synchronization
            if(debounce_count==DEBOUNCE_CYCLES && run_sync==previous_run) begin
                if(!run_sync) off_seen<=1;
                else if(off_seen) run_filtered<=1;
            end
        end
    end
    wire [11:0] adc_raw;
    wire data_valid, adc_initialized;
    arty_xadc #(.SIM_MONITOR_FILE(SIM_MONITOR_FILE)) sensing (
        .clk(clk),.reset(reset),.a0_p(a0_p),.a0_n(a0_n),
        .adc_raw(adc_raw),.data_valid(data_valid),.initialized(adc_initialized));
    wire [3:0] core_gates;
    wire core_en, fault_latched, vg_pol, polarity_ready;
    voltage_monitor #(.ADC_ZERO_CODE(ADC_ZERO_CODE)) monitor (
        .clk(clk),.reset(reset),.adc_raw(adc_raw),.data_valid(data_valid),
        .adc_initialized(adc_initialized),.fault_latched(fault_latched),
        .vg_pol(vg_pol),.polarity_ready(polarity_ready));
    four_pwm_bench pattern (
        .clk(clk),.reset(reset),.run_request(run_filtered),
        .input_ready(adc_initialized && polarity_ready),.fault(fault_latched),
        .gates(core_gates),.gate_en(core_en));
    assign gates=(async_reset || reset) ? 4'b0000 : core_gates;
    assign gate_en=core_en && !async_reset && !reset;
    assign led={locked,vg_pol,fault_latched,gate_en};
endmodule

