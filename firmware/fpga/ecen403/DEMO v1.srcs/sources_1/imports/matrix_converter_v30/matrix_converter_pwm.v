// =============================================================================
// matrix_converter_pwm.v (v29)
//
// Changes from v28c:
//   - PWM_PERIOD = 1250 (125MHz / 100kHz = 1250 cycles)
//   - DT = 26 (~208ns at 125MHz, same as DT=5 at 24MHz)
//   - DUTY_MIN = 130 (> 4*DT = 104)
//   - Synchronous reset throughout (no negedge rst_n)
//   - No clk_wiz dependency
// =============================================================================

`timescale 1ns / 1ps

(* DONT_TOUCH = "TRUE" *)
module matrix_converter_pwm (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       en,
    input  wire       vg_pol,
    input  wire [7:0] duty,

    output reg  SA1, SA2,
    output reg  SB1, SB2,
    output reg  SC1, SC2,
    output reg  SD1, SD2
);

localparam PWM_PERIOD = 1250;
localparam DT         = 26;
localparam DUTY_MIN   = 130;

// ---------------------------------------------------------------------------
// PWM counter
// ---------------------------------------------------------------------------
reg [10:0] cnt;
always @(posedge clk) begin
    if (!rst_n) cnt <= 0;
    else if (cnt == PWM_PERIOD-1) cnt <= 0;
    else cnt <= cnt + 1;
end

// duty input is 8-bit so scale: duty_clamped in full period units
// duty=120 out of 240 = 50%, so 50% of 1250 = 625
wire [10:0] duty_scaled = (duty < 8'd1) ? DUTY_MIN :
                          (duty > 8'd239) ? (PWM_PERIOD - DUTY_MIN) :
                          ((duty * 1250) / 240);

wire [10:0] duty_clamped = (duty_scaled < DUTY_MIN)             ? DUTY_MIN :
                           (duty_scaled > PWM_PERIOD - DUTY_MIN) ? PWM_PERIOD - DUTY_MIN :
                           duty_scaled;

// ---------------------------------------------------------------------------
// vg_pol: 3-stage sync + sample one cycle before cnt==0
// ---------------------------------------------------------------------------
reg [2:0] vg_sync;
always @(posedge clk) begin
    if (!rst_n) vg_sync <= 3'b000;
    else        vg_sync <= {vg_sync[1:0], vg_pol};
end
wire vg_synced = vg_sync[2];

reg vg_sampled;
always @(posedge clk) begin
    if (!rst_n)                      vg_sampled <= 1'b0;
    else if (cnt == PWM_PERIOD - 1)  vg_sampled <= vg_synced;
end

// ---------------------------------------------------------------------------
// Registered edge pulses
// ---------------------------------------------------------------------------
reg pwm_rise_r, pwm_fall_r;
always @(posedge clk) begin
    if (!rst_n) begin
        pwm_rise_r <= 0;
        pwm_fall_r <= 0;
    end else begin
        pwm_rise_r <= (cnt == PWM_PERIOD - 1);
        pwm_fall_r <= (cnt == duty_clamped - 1);
    end
end

// ---------------------------------------------------------------------------
// FSM
// ---------------------------------------------------------------------------
localparam [2:0]
    IDLE  = 3'd0,
    STEP1 = 3'd1,
    STEP2 = 3'd2,
    STEP3 = 3'd3,
    STEP4 = 3'd4;

localparam T_RISE = 1'b1;
localparam T_FALL = 1'b0;

reg [2:0]  step_state;
reg [4:0]  step_cnt;
reg        trans_type;
reg        leg_sel;

always @(posedge clk) begin
    if (!rst_n) begin
        step_state <= IDLE;
        step_cnt   <= 0;
        trans_type <= T_RISE;
        leg_sel    <= 1'b1;
        SA1<=0; SA2<=0;
        SB1<=1; SB2<=1;
        SC1<=0; SC2<=0;
        SD1<=1; SD2<=1;
    end else if (!en) begin
        step_state <= IDLE;
        step_cnt   <= 0;
        SA1<=0; SA2<=0;
        SB1<=1; SB2<=1;
        SC1<=0; SC2<=0;
        SD1<=1; SD2<=1;
    end else begin
        case (step_state)

            IDLE: begin
                if (pwm_rise_r) begin
                    trans_type <= T_RISE;
                    leg_sel    <= vg_sampled;
                    step_state <= STEP1;
                    step_cnt   <= DT - 1;
                    // S1: incoming reverse blocker ON
                    if (vg_sampled) SA2 <= 1;  // left rise S1
                    else            SC2 <= 1;  // right rise S1
                end
                else if (pwm_fall_r) begin
                    trans_type <= T_FALL;
                    leg_sel    <= vg_sampled;
                    step_state <= STEP1;
                    step_cnt   <= DT - 1;
                    // S1: incoming reverse blocker ON
                    if (vg_sampled) SB2 <= 1;  // left fall S1
                    else            SD2 <= 1;  // right fall S1
                end
            end

            STEP1: begin
                if (step_cnt == 0) begin
                    step_state <= STEP2;
                    step_cnt   <= DT - 1;
                    // S2: outgoing forward blocker OFF
                    if (trans_type == T_RISE) begin
                        if (leg_sel) SB1 <= 0;  // left rise S2
                        else         SD1 <= 0;  // right rise S2
                    end else begin
                        if (leg_sel) SA1 <= 0;  // left fall S2
                        else         SC1 <= 0;  // right fall S2
                    end
                end else step_cnt <= step_cnt - 1;
            end

            STEP2: begin
                if (step_cnt == 0) begin
                    step_state <= STEP3;
                    step_cnt   <= DT - 1;
                    // S3: incoming forward blocker ON
                    if (trans_type == T_RISE) begin
                        if (leg_sel) SA1 <= 1;  // left rise S3
                        else         SC1 <= 1;  // right rise S3
                    end else begin
                        if (leg_sel) SB1 <= 1;  // left fall S3
                        else         SD1 <= 1;  // right fall S3
                    end
                end else step_cnt <= step_cnt - 1;
            end

            STEP3: begin
                if (step_cnt == 0) begin
                    step_state <= STEP4;
                    step_cnt   <= DT - 1;
                    // S4: outgoing reverse blocker OFF
                    if (trans_type == T_RISE) begin
                        if (leg_sel) SB2 <= 0;  // left rise S4
                        else         SD2 <= 0;  // right rise S4
                    end else begin
                        if (leg_sel) SA2 <= 0;  // left fall S4
                        else         SC2 <= 0;  // right fall S4
                    end
                end else step_cnt <= step_cnt - 1;
            end

            STEP4: begin
                if (step_cnt == 0)
                    step_state <= IDLE;
                else
                    step_cnt <= step_cnt - 1;
            end

            default: step_state <= IDLE;
        endcase
    end
end

endmodule
