`timescale 1ns/1ps
// Arty Z7 SYSCLK: 125 MHz -> MMCM VCO 1000 MHz -> 100 MHz.
module arty_clock(input wire clk_125mhz, output wire clk, output wire locked);
    wire clkin, feedback, feedback_buf, clkout;
    IBUF input_buffer (.I(clk_125mhz), .O(clkin));
    BUFG feedback_buffer (.I(feedback), .O(feedback_buf));
    BUFG clock_buffer (.I(clkout), .O(clk));
    MMCME2_BASE #(.CLKIN1_PERIOD(8.0), .CLKFBOUT_MULT_F(8.0),
        .DIVCLK_DIVIDE(1), .CLKOUT0_DIVIDE_F(10.0), .STARTUP_WAIT("FALSE")) mmcm (
        .CLKIN1(clkin), .CLKFBIN(feedback_buf), .CLKFBOUT(feedback),
        .CLKOUT0(clkout), .LOCKED(locked), .PWRDWN(1'b0), .RST(1'b0),
        .CLKFBOUTB(), .CLKOUT0B(), .CLKOUT1(), .CLKOUT1B(),
        .CLKOUT2(), .CLKOUT2B(), .CLKOUT3(), .CLKOUT3B(),
        .CLKOUT4(), .CLKOUT5(), .CLKOUT6());
endmodule
