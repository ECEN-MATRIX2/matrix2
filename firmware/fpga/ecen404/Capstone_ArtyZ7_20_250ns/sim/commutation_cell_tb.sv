`timescale 1ns/1ps
module commutation_cell_tb;
    reg clk=0, reset=1, target_ls=1, vg_pol=1;
    wire [3:0] g;
    wire busy;
    integer checks=0;
    reg test_passed=0;
    always #5 clk=~clk;
    commutation_cell #(.STEP_DELAY_CYCLES(25)) dut (
        .clk(clk), .reset(reset), .target_ls(target_ls), .vg_pol(vg_pol),
        .hs1(g[3]), .hs2(g[2]), .ls1(g[1]), .ls2(g[0]), .busy(busy));
    task automatic tick; @(posedge clk); #1; endtask
    task automatic expect_g(input [3:0] expected);
        if (g !== expected) $fatal(1, "Sequence mismatch: expected %b got %b",expected,g);
        checks++;
    endtask
    task automatic transition(input bit pol, to_ls, flip_mid,
                              input [3:0] s1,s2,s3,s4);
        @(negedge clk); vg_pol=pol; target_ls=to_ls;
        tick(); expect_g(s1);
        if (!busy) $fatal(1,"Missing busy assertion");
        if (flip_mid) begin @(negedge clk); vg_pol=!pol; end
        for (int k=0;k<24;k++) begin tick(); expect_g(s1); end
        tick(); expect_g(s2);
        for (int k=0;k<24;k++) begin tick(); expect_g(s2); end
        tick(); expect_g(s3);
        for (int k=0;k<24;k++) begin tick(); expect_g(s3); end
        tick(); expect_g(s4);
        for (int k=0;k<24;k++) begin tick(); expect_g(s4); end
        tick(); expect_g(s4);
        if (busy) $fatal(1,"busy did not clear after 1000 ns");
    endtask
    initial begin
        repeat(4) tick(); @(negedge clk); reset=0;
        // Table I, vectors {HS1,HS2,LS1,LS2}, all four cases.
        transition(1,0,0,4'b0111,4'b0101,4'b1101,4'b1100);
        transition(1,1,1,4'b1101,4'b0101,4'b0111,4'b0011);
        transition(0,0,0,4'b1011,4'b1010,4'b1110,4'b1100);
        transition(0,1,1,4'b1110,4'b1010,4'b1011,4'b0011);
        // A request that remains asserted while busy is served after completion.
        @(negedge clk); vg_pol=1; target_ls=0;
        repeat(7) tick(); @(negedge clk); target_ls=1;
        repeat(230) tick(); expect_g(4'b0011);
        if(busy) $fatal(1,"Pending target did not settle");
        $display("PASS: all four sequences, 250 ns steps, polarity latch, pending target (%0d checks)",checks);
        test_passed=1;
        $finish;
    end
    initial begin #20000; $fatal(1,"Unit-test timeout"); end
endmodule
