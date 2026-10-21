`timescale 1ns/1ps
module arty_z7_tb;
    reg clk_125mhz=0,reset_btn=0,run_sw=1;
    wire [7:0] gates;
    wire gate_en;
    wire [3:0] led;
    wire sa1=gates[7],sa2=gates[6],sb1=gates[5],sb2=gates[4];
    wire sc1=gates[3],sc2=gates[2],sd1=gates[1],sd2=gates[0];
    arty_z7_top #(.DEBOUNCE_CYCLES(20)) dut (
        .clk_125mhz(clk_125mhz),.reset_btn(reset_btn),.run_sw(run_sw),
        .a0_p(1'b0),.a0_n(1'b0),.gates(gates),.gate_en(gate_en),.led(led));
    // The real UNISIM XADC reads sim/arty_analog.txt, not these digital pins.
    always #4 clk_125mhz=~clk_125mhz;
    integer samples=0,period_checks=0,step_checks=0;
    realtime last_pwm=0,t0,t1;
    always @(negedge gate_en) last_pwm=0;
    always @(posedge dut.clk) if(dut.data_valid) samples++;
    always @(posedge dut.pwm_a) begin
        if(last_pwm!=0 && $realtime<1900000) begin
            if($realtime-last_pwm<99999.999 || $realtime-last_pwm>100000.001)
                $fatal(1,"PWM period is not 100 us");
            period_checks++;
        end
        last_pwm=$realtime;
    end
    task automatic check_four_steps(input bit positive);
        @(posedge dut.left_busy); #0.001;
        t0=$realtime;
        if(gates[7:4] !== (positive ? 4'b0111:4'b1011)) $fatal(1,"Step 1 mismatch");
        @(gates[7:4]); t1=$realtime;
        if(t1-t0<4999.998 || t1-t0>5000.002) $fatal(1,"Step 2 timing mismatch");
        if(gates[7:4] !== (positive ? 4'b0101:4'b1010)) $fatal(1,"Step 2 mismatch");
        t0=t1;
        @(gates[7:4]); t1=$realtime;
        if(t1-t0!=5000) $fatal(1,"Step 3 timing mismatch");
        if(gates[7:4] !== (positive ? 4'b1101:4'b1110)) $fatal(1,"Step 3 mismatch");
        t0=t1;
        @(gates[7:4]); t1=$realtime;
        if(t1-t0!=5000 || gates[7:4]!==4'b1100) $fatal(1,"Step 4 mismatch");
        step_checks++;
    endtask

    integer table_sequences=0;
    task automatic audit_leg(input bit right_leg);
        bit pol, to_ls, aborted;
        reg [3:0] expected [0:3];
        reg [3:0] actual;
        pol=dut.vg_pol;
        to_ls=right_leg ? !dut.pwm_b : !dut.pwm_a;
        if(pol && to_ls) begin
            expected[0]=4'b1101; expected[1]=4'b0101; expected[2]=4'b0111; expected[3]=4'b0011;
        end else if(pol) begin
            expected[0]=4'b0111; expected[1]=4'b0101; expected[2]=4'b1101; expected[3]=4'b1100;
        end else if(to_ls) begin
            expected[0]=4'b1110; expected[1]=4'b1010; expected[2]=4'b1011; expected[3]=4'b0011;
        end else begin
            expected[0]=4'b1011; expected[1]=4'b1010; expected[2]=4'b1110; expected[3]=4'b1100;
        end
        aborted=0;
        for(int cycle=0;cycle<2000;cycle++) begin
            #0.001;
            if(!gate_en) begin aborted=1; break; end
            actual=right_leg ? gates[3:0] : gates[7:4];
            if(actual!==expected[cycle/500])
                $fatal(1,"Table I leg=%0d cycle=%0d expected=%b got=%b",right_leg,cycle,expected[cycle/500],actual);
            @(posedge dut.clk);
        end
        if(!aborted) begin
            #0.001;
            if(right_leg ? dut.right_busy : dut.left_busy) $fatal(1,"Busy exceeded 20 us");
            table_sequences++;
        end
    endtask
    always @(posedge dut.left_busy) audit_leg(0);
    always @(posedge dut.right_busy) audit_leg(1);
    initial begin
        #50000;
        if(gate_en!==0 || dut.off_seen!==0) $fatal(1,"Started with SW0 already high");
        if(!dut.adc_initialized || dut.adc_raw<2215 || dut.adc_raw>2227)
            $fatal(1,"XADC positive voltage not acquired: %d",dut.adc_raw);
        run_sw=0; #2000; run_sw=1;
        check_four_steps(1);
        #1300000;
        if(dut.vg_pol!==0 || !gate_en || dut.fault_latched) $fatal(1,"Negative polarity failed");
        // Align to next rising PWM transition (rather than a falling transition).
        @(negedge dut.pwm_a); #1000;
        check_four_steps(0);
        #10000; run_sw=0; #50000;
        if(gate_en!==0 || gates!==0) $fatal(1,"Controlled stop failed");
        reset_btn=1; #100; reset_btn=0; run_sw=0; #10000; run_sw=1;
        #5000;
        if(!gate_en) $fatal(1,"Restart failed");
        // Missing ADC updates must latch a fault and disable outputs.
        force dut.data_valid=0;
        #22000;
        if(!dut.fault_latched || gate_en || gates!==0) $fatal(1,"ADC timeout fault failed");
        release dut.data_valid;
        run_sw=0; reset_btn=1; #100; reset_btn=0;
        #15000; run_sw=1; #5000;
        if(!gate_en || dut.fault_latched) $fatal(1,"Fault reset/restart failed");
        #(4300000-$realtime);
        if(!dut.fault_latched || gate_en || gates!==0) $fatal(1,"ADC rail fault failed");
        if(samples<20 || period_checks<3 || step_checks!=2 || table_sequences<20) $fatal(1,"Insufficient coverage");
        $display("Completed Table I transactions across both legs: %0d",table_sequences);
        $display("PASS: Arty clock/XADC integration, positive/negative 5 us sequences, 10 kHz PWM, arming, stop, reset, ADC timeout/rail faults. Samples=%d periods=%d",samples,period_checks);
        $finish;
    end
    initial begin #6000000; $fatal(1,"Arty simulation timeout"); end
endmodule

