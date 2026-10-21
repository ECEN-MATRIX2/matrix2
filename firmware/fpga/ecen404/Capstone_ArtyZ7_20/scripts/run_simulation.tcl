set root [file dirname [file dirname [file join [pwd] [info script]]]]
if {[current_project -quiet] eq ""} {source [file join $root scripts create_project.tcl]}
launch_simulation
add_wave /arty_z7_tb/dut/vg_pol /arty_z7_tb/dut/adc_raw
add_wave /arty_z7_tb/dut/pwm_a /arty_z7_tb/dut/pwm_b
add_wave /arty_z7_tb/gate_en /arty_z7_tb/dut/fault_latched
add_wave /arty_z7_tb/sa1 /arty_z7_tb/sa2 /arty_z7_tb/sb1 /arty_z7_tb/sb2
add_wave /arty_z7_tb/sc1 /arty_z7_tb/sc2 /arty_z7_tb/sd1 /arty_z7_tb/sd2
run all

