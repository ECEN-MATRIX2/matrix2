set root [file dirname [file dirname [file join [pwd] [info script]]]]
source [file join $root scripts tclstore_paths.tcl]
if {[current_project -quiet] ne ""} {error "Close the current project first."}
set part xc7z020clg400-1
if {![llength [get_parts -quiet $part]]} {error "Install Zynq-7000 support for $part."}
set xpr [file join $root build capstone_arty_z7_20_4pwm_bench_250ns.xpr]
if {[file exists $xpr]} {
    open_project $xpr
} else {
    create_project capstone_arty_z7_20_4pwm_bench_250ns [file join $root build] -part $part
    set_property target_language Verilog [current_project]
    add_files [glob [file join $root rtl *.v]]
    set_property top arty_z7_top [get_filesets sources_1]
    add_files -fileset constrs_1 [glob [file join $root constraints *.xdc]]
    add_files -fileset sim_1 [glob [file join $root sim *.sv]]
    add_files -fileset sim_1 [file join $root sim arty_analog.txt]
    set_property top arty_z7_tb [get_filesets sim_1]
    set_property xsim.simulate.runtime 0ns [get_filesets sim_1]
    update_compile_order -fileset sources_1
    update_compile_order -fileset sim_1
}

