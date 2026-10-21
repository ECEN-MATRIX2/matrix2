`timescale 1ns/1ps
// DRIVER BENCH ONLY: not a matrix-converter commutation controller.
// gates[3:0] = {SA, SB, SC, SD}; pairs SA/SB and SC/SD never overlap.
// 100 MHz clock: 1000 cycles = 10 us; 25 cycles = 250 ns dead time.
// SA and SD are in phase; SB and SC are in phase, half a period later.
module four_pwm_bench #(
    parameter integer PERIOD_CYCLES=1000,
    parameter integer DEAD_CYCLES=25,
    parameter integer ARM_CYCLES=100
)(
    input wire clk, reset, run_request, input_ready, fault,
    output wire [3:0] gates,
    output wire gate_en
);
    localparam OFF=0, ARM=1, RUN=2;
    reg [1:0] state=OFF;
    integer count=0, arm_count=0;
    reg [3:0] registered_gates=0;
    wire allowed=run_request && input_ready && !fault && !reset;
    assign gate_en=allowed && (state==ARM || state==RUN);
    assign gates=(allowed && state==RUN) ? registered_gates : 4'b0000;

    always @(posedge clk) begin
        if (!allowed) begin
            state<=OFF; count<=0; arm_count<=0; registered_gates<=0;
        end else case(state)
            OFF: begin
                state<=ARM; count<=0; arm_count<=0; registered_gates<=0;
            end
            ARM: begin
                // EN high with all commands low before the first pulse.
                registered_gates<=0;
                if(arm_count==ARM_CYCLES-1) begin state<=RUN; count<=0; end
                else arm_count<=arm_count+1;
            end
            RUN: begin
                // Registered outputs avoid glitches from a combinational counter decoder.
                if(count>=DEAD_CYCLES && count<PERIOD_CYCLES/2)
                    registered_gates<=4'b1001;
                else if(count>=PERIOD_CYCLES/2+DEAD_CYCLES)
                    registered_gates<=4'b0110;
                else registered_gates<=0;
                if(count==PERIOD_CYCLES-1) count<=0;
                else count<=count+1;
            end
            default: begin state<=OFF; registered_gates<=0; count<=0; arm_count<=0; end
        endcase
    end
    // synthesis translate_off
    initial begin
        if(PERIOD_CYCLES<4 || PERIOD_CYCLES%2 || DEAD_CYCLES<1 ||
           DEAD_CYCLES>=PERIOD_CYCLES/2 || ARM_CYCLES<1)
            $fatal(1,"Invalid four-PWM bench parameters");
    end
    // synthesis translate_on
endmodule
