// ----------------------------------------------------------------------------
// commutation_cell.v
// Per-leg 4-step commutation cell for a 2-switch matrix converter leg.
// Implements all four sequences of Table I (Huang, Rana, Gupta, Enjeti, Basu,
// "A New Integrated Onboard Battery Charger For Electric Scooters",
// IEEE INTELEC 2024).
//
// Sequencing structure adapted from the 3-switch VHDL arm commutator by
// Pedro Costa (2021), reduced to a 2-switch cell and ported to Verilog-2001.
//
// HS = bidirectional switch tied to +Vg rail (SA on left leg, SC on right leg)
// LS = bidirectional switch tied to -Vg rail (SB on left leg, SD on right leg)
// Each switch is two common-source SiC MOSFETs: HS1/HS2 and LS1/LS2.
//
// Table I sequences (step actions):
//   HS on -> LS on, Vg > 0 : LS2 on, HS1 off, LS1 on, HS2 off
//   LS on -> HS on, Vg > 0 : HS2 on, LS1 off, HS1 on, LS2 off
//   HS on -> LS on, Vg < 0 : LS1 on, HS2 off, LS2 on, HS1 off
//   LS on -> HS on, Vg < 0 : HS1 on, LS2 off, HS2 on, LS1 off
//
// Vg polarity is latched at sequence start so a zero crossing mid-sequence
// cannot corrupt an in-flight commutation.
// After reset the cell parks in the LS-conducting freewheel state.
// ----------------------------------------------------------------------------

`timescale 1ns/1ps
module commutation_cell #(
    parameter STEP_DELAY_CYCLES = 10   // 10 x 10 ns = 100 ns per step
)(
    input  wire clk,
    input  wire reset,       // active-high synchronous reset
    input  wire target_ls,   // 1 = LS should conduct, 0 = HS should conduct
    input  wire vg_pol,      // 1 = Vg > 0, 0 = Vg < 0 (sampled at seq start)
    output reg  hs1,
    output reg  hs2,
    output reg  ls1,
    output reg  ls2,
    output wire busy         // high while a 4-step sequence is in progress
);

    // FSM state encoding (plain Verilog-2001, no SystemVerilog constructs)
    localparam [2:0] ST_IDLE  = 3'd0;
    localparam [2:0] ST_STEP1 = 3'd1;
    localparam [2:0] ST_STEP2 = 3'd2;
    localparam [2:0] ST_STEP3 = 3'd3;
    localparam [2:0] ST_STEP4 = 3'd4;

    reg [2:0] state         = ST_IDLE;
    integer delay_counter = 0;

    reg current_ls = 1'b1;   // which switch conducts now (1 = LS)
    reg seq_to_ls  = 1'b1;   // latched direction of the in-flight sequence
    reg seq_pol    = 1'b1;   // latched Vg polarity for the in-flight sequence

    assign busy = (state != ST_IDLE);

    wire step_done = (delay_counter >= STEP_DELAY_CYCLES - 1);

    always @(posedge clk) begin
        if (reset) begin
            state         <= ST_IDLE;
            delay_counter <= 8'd0;
            current_ls    <= 1'b1;
            seq_to_ls     <= 1'b1;
            seq_pol       <= 1'b1;
            // Park in freewheel: LS fully on, HS fully off
            hs1 <= 1'b0;
            hs2 <= 1'b0;
            ls1 <= 1'b1;
            ls2 <= 1'b1;
        end else begin
            case (state)

                ST_IDLE: begin
                    delay_counter <= 8'd0;
                    if (target_ls != current_ls) begin
                        // Latch direction and polarity, apply Step 1 action
                        seq_to_ls <= target_ls;
                        seq_pol   <= vg_pol;
                        state     <= ST_STEP1;
                        // Step 1: turn on incoming device at zero current
                        if (target_ls) begin
                            if (vg_pol) ls2 <= 1'b1;  // HS->LS, Vg>0
                            else        ls1 <= 1'b1;  // HS->LS, Vg<0
                        end else begin
                            if (vg_pol) hs2 <= 1'b1;  // LS->HS, Vg>0
                            else        hs1 <= 1'b1;  // LS->HS, Vg<0
                        end
                    end
                end

                ST_STEP1: begin
                    if (step_done) begin
                        delay_counter <= 8'd0;
                        state         <= ST_STEP2;
                        // Step 2: turn off outgoing device (freewheel begins)
                        if (seq_to_ls) begin
                            if (seq_pol) hs1 <= 1'b0;
                            else         hs2 <= 1'b0;
                        end else begin
                            if (seq_pol) ls1 <= 1'b0;
                            else         ls2 <= 1'b0;
                        end
                    end else begin
                        delay_counter <= delay_counter + 1'b1;
                    end
                end

                ST_STEP2: begin
                    if (step_done) begin
                        delay_counter <= 8'd0;
                        state         <= ST_STEP3;
                        // Step 3: turn on second incoming device (full conduction)
                        if (seq_to_ls) begin
                            if (seq_pol) ls1 <= 1'b1;
                            else         ls2 <= 1'b1;
                        end else begin
                            if (seq_pol) hs1 <= 1'b1;
                            else         hs2 <= 1'b1;
                        end
                    end else begin
                        delay_counter <= delay_counter + 1'b1;
                    end
                end

                ST_STEP3: begin
                    if (step_done) begin
                        delay_counter <= 8'd0;
                        state         <= ST_STEP4;
                        // Step 4: turn off second outgoing device at zero current
                        if (seq_to_ls) begin
                            if (seq_pol) hs2 <= 1'b0;
                            else         hs1 <= 1'b0;
                        end else begin
                            if (seq_pol) ls2 <= 1'b0;
                            else         ls1 <= 1'b0;
                        end
                    end else begin
                        delay_counter <= delay_counter + 1'b1;
                    end
                end

                ST_STEP4: begin
                    // Hold the final step delay, then declare the sequence done
                    if (step_done) begin
                        delay_counter <= 8'd0;
                        current_ls    <= seq_to_ls;
                        state         <= ST_IDLE;
                    end else begin
                        delay_counter <= delay_counter + 1'b1;
                    end
                end

                default: begin
                    state <= ST_IDLE;
                    delay_counter <= 0;
                    current_ls <= 1;
                    hs1 <= 0; hs2 <= 0; ls1 <= 1; ls2 <= 1;
                end
            endcase
        end
    end

    // synthesis translate_off
    initial if (STEP_DELAY_CYCLES < 1)
        $fatal(1, "STEP_DELAY_CYCLES must be positive");
    // synthesis translate_on

endmodule
