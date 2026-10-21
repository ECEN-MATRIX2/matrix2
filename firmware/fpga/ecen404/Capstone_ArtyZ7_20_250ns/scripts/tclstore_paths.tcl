# Some Windows installations fail to discover the installed simulator Tcl apps.
# This changes only this Vivado session's package search path, not the installation.
if {[info exists ::env(XILINX_VIVADO)]} {
    set store [file join $::env(XILINX_VIVADO) data XilinxTclStore]
    foreach d [glob -nocomplain -type d [file join $store support *] [file join $store tclapp * *]] {
        if {[lsearch -exact $::auto_path $d]<0} {lappend ::auto_path $d}
    }
}
