## =============================================================================
## matrix_converter_zybo.xdc (v4 - block design wrapper port names)
## =============================================================================

## Waive PS7 DRC (PS configured via block design)
set_property SEVERITY {Warning} [get_drc_checks ZPS7-1]

## Reset - BTN0 (active high) - not needed, PS handles reset
## en - SW1
set_property -dict { PACKAGE_PIN P15 IOSTANDARD LVCMOS33 } [get_ports { en_0 }];

## vg_pol - PMOD JC pin 1
set_property -dict { PACKAGE_PIN V15 IOSTANDARD LVCMOS33 PULLDOWN TRUE } [get_ports { vg_pol_0 }];

## PMOD JD - left leg
set_property -dict { PACKAGE_PIN T14 IOSTANDARD LVCMOS33 } [get_ports { SA1_0 }]; # JD pin 1
set_property -dict { PACKAGE_PIN T15 IOSTANDARD LVCMOS33 } [get_ports { SA2_0 }]; # JD pin 2
set_property -dict { PACKAGE_PIN P14 IOSTANDARD LVCMOS33 } [get_ports { SB1_0 }]; # JD pin 3
set_property -dict { PACKAGE_PIN R14 IOSTANDARD LVCMOS33 } [get_ports { SB2_0 }]; # JD pin 4

## PMOD JE - right leg
set_property -dict { PACKAGE_PIN V12 IOSTANDARD LVCMOS33 } [get_ports { SC1_0 }]; # JE pin 1
set_property -dict { PACKAGE_PIN W16 IOSTANDARD LVCMOS33 } [get_ports { SC2_0 }]; # JE pin 2
set_property -dict { PACKAGE_PIN J15 IOSTANDARD LVCMOS33 } [get_ports { SD1_0 }]; # JE pin 3
set_property -dict { PACKAGE_PIN H15 IOSTANDARD LVCMOS33 } [get_ports { SD2_0 }]; # JE pin 4

## Prevent output optimization
set_false_path -to [get_ports {SA1_0 SA2_0 SB1_0 SB2_0 SC1_0 SC2_0 SD1_0 SD2_0}]
set_false_path -from [get_ports {en_0 vg_pol_0}]
