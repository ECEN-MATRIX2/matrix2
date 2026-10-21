`timescale 1ns/1ps
// Bench input qualification; polarity is diagnostic, not PWM commutation control.
module voltage_monitor #(
 parameter integer ADC_ZERO_CODE=2036,
 parameter integer ADC_HYSTERESIS=8, QUALIFY_SAMPLES=3,
 parameter integer ADC_TIMEOUT_CYCLES=2000,
 parameter integer ADC_MIN_CODE=16, ADC_MAX_CODE=4079
)(input wire clk, reset,
 input wire [11:0] adc_raw,
 input wire data_valid, adc_initialized,
 output reg fault_latched=0, vg_pol=1, polarity_ready=0);
 integer age=0, stable_count=0;
 reg candidate_pol=1;
 wire sample_positive=adc_raw>ADC_ZERO_CODE+ADC_HYSTERESIS;
 wire sample_negative=adc_raw<ADC_ZERO_CODE-ADC_HYSTERESIS;
 wire sample_in_range=adc_raw>=ADC_MIN_CODE && adc_raw<=ADC_MAX_CODE;
    always @(posedge clk) begin
        if (reset) begin
            fault_latched <= 0; age <= 0;
            vg_pol <= 1; polarity_ready <= 0;
            candidate_pol <= 1; stable_count <= 0;
        end else begin
            if (!adc_initialized) age <= 0;
            else if (data_valid) age <= 0;
            else if (age < ADC_TIMEOUT_CYCLES) age <= age+1;
            if ((adc_initialized && age >= ADC_TIMEOUT_CYCLES-1 && !data_valid))
                fault_latched <= 1;
            if (data_valid) begin
                if (!sample_in_range) begin
                    fault_latched <= 1; stable_count <= 0;
                end else if (sample_positive || sample_negative) begin
                    if (candidate_pol != sample_positive) begin
                        candidate_pol <= sample_positive; stable_count <= 1;
                        if (QUALIFY_SAMPLES == 1) begin
                            vg_pol <= sample_positive; polarity_ready <= 1;
                        end
                    end else begin
                        if (stable_count < QUALIFY_SAMPLES) stable_count <= stable_count+1;
                        if (stable_count >= QUALIFY_SAMPLES-1) begin
                            vg_pol <= sample_positive; polarity_ready <= 1;
                        end
                    end
                end else stable_count <= 0; // hold polarity inside zero-crossing band
            end
        end
    end
endmodule
