`timescale 1ns/1ps
// Primary-side fixed-pattern demonstration controller, not a closed-loop charger.
// No current sensor. Vg polarity selects Table I sequences; no measured IL exists.
module dab_mc_controller #(
    parameter integer PWM_PERIOD_CYCLES = 1000,
    parameter integer ACTIVE_CYCLES = 250,
    parameter integer STEP_DELAY_CYCLES = 10,
    parameter integer ADC_ZERO_CODE = 2256,
    parameter integer ADC_HYSTERESIS = 8,
    parameter integer QUALIFY_SAMPLES = 3,
    parameter integer ADC_TIMEOUT_CYCLES = 2000,
    parameter integer ADC_MIN_CODE = 16,
    parameter integer ADC_MAX_CODE = 4079
)(
    input wire clk, reset,
    input wire run_request, // synchronous to clk; low requests a controlled park
    input wire [11:0] adc_raw,
    input wire data_valid, adc_initialized, adc_frame_error,
    output wire [7:0] gates,
    output wire gate_en,
    output reg fault_latched = 0,
    output reg vg_pol = 1,
    output reg polarity_ready = 0,
    output wire pwm_a, pwm_b,
    output wire left_busy, right_busy
);
    localparam OFF=0, PREPARE=1, RUN=2, PARK=3;
    reg [1:0] run_state = OFF;
    integer phase_count = 0;
    integer prepare_count = 0;
    integer age = 0;
    integer stable_count = 0;
    reg candidate_pol = 1;
    wire sample_positive = adc_raw > ADC_ZERO_CODE + ADC_HYSTERESIS;
    wire sample_negative = adc_raw < ADC_ZERO_CODE - ADC_HYSTERESIS;
    wire sample_in_range = adc_raw >= ADC_MIN_CODE && adc_raw <= ADC_MAX_CODE;
    wire [7:0] cell_gates;
    wire cells_reset = reset || fault_latched || run_state == OFF || run_state == PREPARE;
    // Same balanced pattern on both grid polarities: +Vg, zero, -Vg, zero.
    assign pwm_a = run_state == RUN && phase_count < ACTIVE_CYCLES;
    assign pwm_b = run_state == RUN && phase_count >= PWM_PERIOD_CYCLES/2 &&
                   phase_count < PWM_PERIOD_CYCLES/2 + ACTIVE_CYCLES;
    wire left_target_ls = !pwm_a;
    wire right_target_ls = !pwm_b;
    assign gate_en = !reset && !fault_latched && (run_state == RUN || run_state == PARK);
    // PREPARE sets the LS gate commands before enabling the drivers.
    assign gates = (reset || fault_latched || run_state == OFF) ? 8'h00 : cell_gates;

    always @(posedge clk) begin
        if (reset) begin
            fault_latched <= 0; age <= 0;
            vg_pol <= 1; polarity_ready <= 0;
            candidate_pol <= 1; stable_count <= 0;
        end else begin
            if (!adc_initialized) age <= 0;
            else if (data_valid) age <= 0;
            else if (age < ADC_TIMEOUT_CYCLES) age <= age+1;
            if (adc_frame_error || (adc_initialized && age >= ADC_TIMEOUT_CYCLES-1 && !data_valid))
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
    always @(posedge clk) begin
        if (reset || fault_latched) begin
            run_state <= OFF; phase_count <= 0; prepare_count <= 0;
        end else case (run_state)
            OFF: begin
                phase_count <= 0; prepare_count <= 0;
                if (run_request && polarity_ready && adc_initialized) run_state <= PREPARE;
            end
            PREPARE: begin
                if (!run_request) run_state <= OFF;
                else if (prepare_count == 19) run_state <= RUN;
                else prepare_count <= prepare_count+1;
            end
            RUN: begin
                if (phase_count == PWM_PERIOD_CYCLES-1) phase_count <= 0;
                else phase_count <= phase_count+1;
                if (!run_request) run_state <= PARK;
            end
            PARK: begin
                // A partial sequence finishes; both legs then commutate to LS.
                if (!left_busy && !right_busy && cell_gates == 8'h33) run_state <= OFF;
            end
            default: run_state <= OFF;
        endcase
    end
    commutation_cell #(.STEP_DELAY_CYCLES(STEP_DELAY_CYCLES)) left_leg (
        .clk(clk), .reset(cells_reset), .target_ls(left_target_ls), .vg_pol(vg_pol),
        .hs1(cell_gates[7]), .hs2(cell_gates[6]), .ls1(cell_gates[5]), .ls2(cell_gates[4]), .busy(left_busy));
    commutation_cell #(.STEP_DELAY_CYCLES(STEP_DELAY_CYCLES)) right_leg (
        .clk(clk), .reset(cells_reset), .target_ls(right_target_ls), .vg_pol(vg_pol),
        .hs1(cell_gates[3]), .hs2(cell_gates[2]), .ls1(cell_gates[1]), .ls2(cell_gates[0]), .busy(right_busy));
    // synthesis translate_off
    initial begin
        if (PWM_PERIOD_CYCLES % 2 != 0 || ACTIVE_CYCLES <= 4*STEP_DELAY_CYCLES+2 ||
            PWM_PERIOD_CYCLES/2-ACTIVE_CYCLES <= 4*STEP_DELAY_CYCLES+2 ||
            ADC_ZERO_CODE-ADC_HYSTERESIS <= ADC_MIN_CODE ||
            ADC_ZERO_CODE+ADC_HYSTERESIS >= ADC_MAX_CODE || QUALIFY_SAMPLES < 1)
            $fatal(1, "Invalid controller parameters");
    end
    // synthesis translate_on
endmodule
