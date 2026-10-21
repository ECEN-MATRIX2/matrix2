# Digilent Arty Z7-20: physical Pmod numbers skip power and ground.
set_property -dict {PACKAGE_PIN H16 IOSTANDARD LVCMOS33} [get_ports clk_125mhz]
create_clock -name sysclk125 -period 8.000 [get_ports clk_125mhz]
set_property -dict {PACKAGE_PIN M20 IOSTANDARD LVCMOS33} [get_ports run_sw]
set_property -dict {PACKAGE_PIN D19 IOSTANDARD LVCMOS33} [get_ports reset_btn]
# FOUR PWM bench: SA/SB on driver 1, SC/SD on driver 2.
# Physical JA1 SA, JA2 SB, JA3 SC, JA4 SD.
set_property PACKAGE_PIN Y18 [get_ports {gates[3]}]
set_property PACKAGE_PIN Y19 [get_ports {gates[2]}]
set_property PACKAGE_PIN Y16 [get_ports {gates[1]}]
set_property PACKAGE_PIN Y17 [get_ports {gates[0]}]
# JB1 EN
set_property PACKAGE_PIN W14 [get_ports gate_en]
set_property -dict {IOSTANDARD LVCMOS33 DRIVE 8 SLEW FAST} [get_ports {gates[*] gate_en}]
set_property PACKAGE_PIN R14 [get_ports {led[0]}]
set_property PACKAGE_PIN P14 [get_ports {led[1]}]
set_property PACKAGE_PIN N16 [get_ports {led[2]}]
set_property PACKAGE_PIN M14 [get_ports {led[3]}]
set_property IOSTANDARD LVCMOS33 [get_ports {led[*]}]
# A0 single-ended connector feeds VAUX1 differential pair through onboard divider.
set_property -dict {PACKAGE_PIN E17 IOSTANDARD LVCMOS33} [get_ports a0_p]
set_property -dict {PACKAGE_PIN D18 IOSTANDARD LVCMOS33} [get_ports a0_n]
# Only the asynchronous input-to-first-stage paths are excluded.
set_false_path -from [get_ports run_sw] -to [get_cells -hierarchical -filter {NAME =~ *run_meta_reg}]
set_false_path -from [get_ports reset_btn]
