set root [file dirname [file dirname [file join [pwd] [info script]]]]
if {[current_project -quiet] eq ""} {source [file join $root scripts create_project.tcl]}
if {[get_property NAME [current_project]] ne "capstone_arty_z7_20_4pwm_bench_250ns" ||
    [get_property PART [current_project]] ne "xc7z020clg400-1"} {
    error "Open the Capstone Arty Z7-20 project before rebuilding."
}
reset_run synth_1
launch_runs synth_1 -jobs 4
wait_on_run synth_1
if {[get_property PROGRESS [get_runs synth_1]] ne "100%"} {error "Synthesis failed."}
launch_runs impl_1 -to_step write_bitstream -jobs 4
wait_on_run impl_1
if {[get_property PROGRESS [get_runs impl_1]] ne "100%"} {error "Implementation failed."}
open_run impl_1
report_timing_summary -file [file join $root build timing_summary.txt]
report_drc -file [file join $root build drc.txt]
puts "Review timing and DRC reports before programming."

