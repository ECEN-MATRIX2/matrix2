`timescale 1ns/1ps
module arty_z7_tb;
    reg clk_125mhz=0,reset_btn=0,run_sw=1;
    wire [3:0] gates;
    wire gate_en;
    wire [3:0] led;
    wire SA=gates[3],SB=gates[2],SC=gates[1],SD=gates[0];
    arty_z7_top #(.DEBOUNCE_CYCLES(20)) dut (
        .clk_125mhz(clk_125mhz),.reset_btn(reset_btn),.run_sw(run_sw),
        .a0_p(1'b0),.a0_n(1'b0),.gates(gates),.gate_en(gate_en),.led(led));
    always #4 clk_125mhz=~clk_125mhz;
    integer samples=0,period_checks=0,width_checks=0,dead_checks=0;
    realtime last_rise[4],last_fall[4];
    bit checking=0;
    always @(posedge dut.clk) begin
        #0.001;
        if(dut.data_valid) samples++;
        if((SA && SB) || (SC && SD)) $fatal(1,"Complementary pair overlap");
        if(SA!==SD || SB!==SC) $fatal(1,"Diagonal pairing mismatch");
        if(!gate_en && gates!==0) $fatal(1,"Gates active without EN");
    end
    // Measure all four physical outputs; check both dead-time directions per pair.
    for(genvar i=0;i<4;i++) begin: measurements
        localparam integer partner=i^1;
        always @(posedge gates[i]) if(checking) begin
            if(last_rise[i]>0) begin
                if($realtime-last_rise[i]<9999.999 || $realtime-last_rise[i]>10000.001)
                    $fatal(1,"Output %0d period not 10 us",i);
                period_checks++;
            end
            if(last_fall[partner]>0) begin
                if($realtime-last_fall[partner]<249.999 || $realtime-last_fall[partner]>250.001)
                    $fatal(1,"Output %0d dead time not 250 ns",i);
                dead_checks++;
            end
            last_rise[i]=$realtime;
        end
        always @(negedge gates[i]) if(checking) begin
            if(last_rise[i]>0) begin
                if($realtime-last_rise[i]<4749.999 || $realtime-last_rise[i]>4750.001)
                    $fatal(1,"Output %0d high width not 4.75 us",i);
                width_checks++;
            end
            last_fall[i]=$realtime;
        end
    end
    task automatic clear_measurements;
        for(integer j=0;j<4;j++) begin last_rise[j]=0; last_fall[j]=0; end
    endtask
    initial begin
        clear_measurements();
        #50000;
        if(gate_en || gates!==0 || dut.off_seen) $fatal(1,"High-at-boot arming failed");
        if(!dut.adc_initialized || dut.adc_raw<2215 || dut.adc_raw>2227 || !dut.vg_pol)
            $fatal(1,"Real XADC positive input failed");
        run_sw=0; #2000; checking=1; run_sw=1;
        #5000;
        if(!gate_en) $fatal(1,"Start failed");
        #80000;
        if(dut.vg_pol!==0 || !gate_en || dut.fault_latched)
            $fatal(1,"Negative voltage monitoring failed");
        // Frequency and pulse measurements continue across polarity changes.
        #10000; checking=0; run_sw=0; #200;
        if(gate_en || gates!==0) $fatal(1,"SW0 stop failed");
        #2000; clear_measurements(); run_sw=1;
        #5000;
        if(!gate_en) $fatal(1,"Restart failed");
        // Asynchronous BTN0 must mask outputs before the next controller clock.
        @(posedge SA); #3; reset_btn=1; #0.001;
        if(gates!==0 || gate_en) $fatal(1,"BTN0 immediate mask failed");
        #100; reset_btn=0; #20000;
        if(gate_en || gates!==0) $fatal(1,"Reset with SW0 high rearmed");
        run_sw=0; #2000; run_sw=1; #5000;
        if(!gate_en) $fatal(1,"Rearm after reset failed");
        force dut.data_valid=0; #22000;
        if(!dut.fault_latched || gate_en || gates!==0) $fatal(1,"ADC timeout failed");
        release dut.data_valid; #5000;
        if(!dut.fault_latched || gate_en) $fatal(1,"Fault did not stay latched");
        run_sw=0; reset_btn=1; #100; reset_btn=0;
        #20000; run_sw=1; #5000;
        if(!gate_en || dut.fault_latched) $fatal(1,"Fault recovery failed");
        clear_measurements(); checking=1;
        #100000; checking=0;
        #(430000-$realtime);
        if(!dut.fault_latched || gate_en || gates!==0) $fatal(1,"ADC rail fault failed");
        if(samples<30 || period_checks<20 || width_checks<20 || dead_checks<20)
            $fatal(1,"Insufficient timing coverage");
        $display("PASS: FOUR PWM BENCH: real MMCM/XADC, all four 100 kHz periods and 4.75 us widths, 250 ns dead time both directions, no overlap, diagonal pairing, polarity monitoring, arming, stop, reset, ADC timeout/rail faults. periods=%0d widths=%0d deadtimes=%0d samples=%0d",period_checks,width_checks,dead_checks,samples);
        $finish;
    end
    initial begin #600000; $fatal(1,"Simulation timeout"); end
endmodule
