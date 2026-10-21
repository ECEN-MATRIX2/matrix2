`timescale 1ns/1ps
// A0 is VAUX1 after the board's 2.32k/1k divider (nominal 3.32:1).
module arty_xadc #(parameter SIM_MONITOR_FILE = "arty_analog.txt") (
    input wire clk, reset, a0_p, a0_n,
    output reg [11:0] adc_raw=0,
    output reg data_valid=0, initialized=0
);
    wire [15:0] result;
    wire ready, eoc;
    wire [4:0] channel;
    // Single-channel continuous VAUX1, extended acquisition, no averaging.
    // ADCCLK=100 MHz/8=12.5 MHz; 32 ADCCLK per conversion ~2.56 us.
    XADC #(.INIT_40(16'h0111), .INIT_41(16'h3000), .INIT_42(16'h0800),
        .SIM_DEVICE("ZYNQ"), .SIM_MONITOR_FILE(SIM_MONITOR_FILE)) adc (
        .DCLK(clk), .RESET(reset), .DADDR(7'h11), .DEN(eoc && channel==5'h11),
        .DWE(1'b0), .DI(16'h0000), .DO(result), .DRDY(ready),
        .EOC(eoc), .CHANNEL(channel), .VAUXP({14'b0,a0_p,1'b0}),
        .VAUXN({14'b0,a0_n,1'b0}), .VP(1'b0), .VN(1'b0),
        .CONVST(1'b0), .CONVSTCLK(1'b0), .ALM(), .BUSY(), .EOS(),
        .JTAGBUSY(), .JTAGLOCKED(), .JTAGMODIFIED(), .MUXADDR(), .OT());
    always @(posedge clk) begin
        if(reset) begin adc_raw<=0; data_valid<=0; initialized<=0; end
        else begin
            data_valid<=ready;
            if(ready) begin adc_raw<=result[15:4]; initialized<=1; end
        end
    end
endmodule
