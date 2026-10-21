# Capstone temporary Arty Z7-20 platform

**Start with START_HERE.md for the fully labeled, numbered setup instructions.**
The latest Capstone_ArtyZ7_20_Verified.zip contains the Capstone_ArtyZ7_20 folder;
extract that ZIP into C:/FPGA after backing up your previous extracted folder.

Use this package separately from Capstone_RevB. Target: xc7z020clg400-1,
Vivado 2025.2. Your TE0725 project has not been modified.

## What changed

- New Arty clock wrapper: 125 MHz input, MMCM/BUFG 100 MHz controller clock.
- Existing commutation_cell and dab_mc_controller retained byte-for-byte.
- Internal XADC reads A0 instead of the carrier's external ADS7042.
- SW0 requests run/stop; BTN0 resets and clears a latched fault.
- Eight gate commands on JA, active-high EN on JB1, four status LEDs.
- Fixed 100 kHz pattern: each PWM command is high for 2.5 us; B is 5 us after A.
  Gate commutation actions are separated by 100 ns, not a 100 ns PWM period.

## Wiring

| Signal | Physical connector pin | FPGA pin |
|---|---|---|
| SA1 | JA1 | Y18 |
| SA2 | JA2 | Y19 |
| SB1 | JA3 | Y16 |
| SB2 | JA4 | Y17 |
| SC1 | JA7 | U18 |
| SC2 | JA8 | U19 |
| SD1 | JA9 | W18 |
| SD2 | JA10 | W19 |
| EN, active high | JB1 | W14 |
| Conditioned voltage input | J1 A0 (pin 1, use printed A0 label) | VAUX1 via onboard divider |
| Signal ground | JA5/JA11 or JB5/JB11 | GND |

Pmod signal pins are 1,2,3,4,7,8,9,10. Pins 6 and 12 are 3.3 V power,
not PWM outputs. All gate/EN outputs are 3.3 V logic, for the converter's
logic/driver interface, not direct MOSFET gate drive. Check the receiving
board's input levels, polarity and EN behavior before connecting it.

Only A0 and a suitable signal-ground connection are needed for sensing.
Do not wire the signal into XVREF/XGND. The Rev D.0 schematic labels J7 as
the power header, so the reference-header identification in the supplied
table should not be used for wiring. A0-A5 use onboard attenuation;
the inner A6-A11 connections have a different input range.

## Voltage polarity and calibration

Default assumption: the conditioned signal at A0 crosses **1.650 V** when
the sensed power voltage crosses zero. This temporary setting is for the waveform generator. Confirm this on the actual sensing
circuit before integration; it is not inferred from current.

The Rev D.0 A0 divider is nominally 2.32 kohm / 1 kohm:

    code approximately A0_voltage / 3.32 * 4096
    ADC_ZERO_CODE = round(1.650 / 3.32 * 4096) = 2036

This replaces the ADS7042-path threshold of 2256. Do not reuse that value
without accounting for the full signal chain. If another external divider
remains in the path, calibrate for its effect too.

- Above code 2044: candidate positive voltage.
- Below code 2028: candidate negative voltage.
- Between: retain the last qualified polarity; startup waits for qualification.
- Three consecutive qualifying conversions are required.
- Codes outside 16..4079 latch a fault; 20 us without updates after initialization
  also latches a fault. These are limited digital checks, not overcurrent protection.

For the waveform generator, use a 1.65 V DC offset. Start with 1.0 V peak-to-peak (1.15..2.15 V); set the generator load setting to High-Z and verify amplitude/offset with a scope at A0. Connect generator signal to A0 and its return to Arty GND. Stay within 0..3.3 V at A0. This is a conditioned, ground-referenced measurement,
not a connection to raw grid or converter voltage. XADC reference pins are not
signal inputs. The initial bench test can use a low-voltage source at 1.0 V
(negative polarity) or 2.5 V (positive polarity), measured relative to Arty GND.

## Open and simulate

1. Extract the ZIP to its own folder. Keep rtl, sim, constraints and scripts together.
2. Open Vivado 2025.2 and close any existing project.
3. In Tcl Console run, changing the path if you extract elsewhere:

```tcl
source {C:/Users/mrric/Documents/Codex/2026-09-12/oka/outputs/Capstone_ArtyZ7_20/scripts/create_project.tcl}
source {C:/Users/mrric/Documents/Codex/2026-09-12/oka/outputs/Capstone_ArtyZ7_20/scripts/run_simulation.tcl}
```

The project is created under build/capstone_arty_z7_20.xpr. No board-file
download, processing-system block diagram, ARM software or Vitis is required
for this PL bench design. Zynq-7000 device support must be installed.

If Vivado reports an export/memory-file path error, double-click
scripts/run_standalone.cmd to launch the same simulation directly. The standalone
flow was tested here; see VALIDATION.md for the host's project-launch limitation.

The simulation uses AMD's MMCM and XADC models. arty_analog.txt contains the
voltage AFTER the onboard divider (approximately 0.542169 V corresponds to 1.8 V at A0;
approximately 0.451807 V corresponds to 1.5 V). Digital a0_p/a0_n waveform levels are not the
analog stimulus. The testbench shortens the switch debounce to keep the run short;
hardware uses 10 ms. Simulation ends at 430 us with a PASS message.

View about 50..80 us for positive-polarity PWM, 130..150 us for negative polarity.
Zoom to a 0.5..1 us window around one gate transition to measure 100 ns steps.
adc_raw shows the sampled voltage code. Later deliberate stop/reset/fault tests
interrupt PWM; those interruptions are expected.

## Program and bench-test

1. Initially leave the converter power stage disconnected; use a scope/logic analyzer.
2. With board power off, select the board's documented JTAG boot setting. Connect
   its USB PROG/UART port using a data cable and power it normally.
3. Set SW0 OFF. Connect a valid conditioned A0 voltage and signal ground.
4. Open Vivado Hardware Manager -> Open Target -> Auto Connect.
5. Select the xc7z020 device -> Program Device. Select prebuilt/arty_z7_top.bit.
   This file is for Arty Z7-20 only. It is temporary JTAG programming and is lost
   on power-off. No flash or SD-card programming is included.
6. LD3 should light (clock locked). LD1 should remain off (no fault).
   LD2 indicates voltage polarity; LD0 indicates EN.
7. Press/release BTN0, keep SW0 OFF for at least 20 ms, then turn SW0 ON.
   The design requires observing OFF after reset before it accepts ON.
8. Check all eight JA gate signals, EN on JB1, 10 us PWM repetition and 100 ns
   staggered gate actions. Turning SW0 OFF requests a controlled park, then EN drops.
9. For a fault, set SW0 OFF, correct the input, press/release BTN0, wait 20 ms,
   then set SW0 ON. BTN0 also immediately masks gate commands and EN.

During PREPARE the low-side commands are loaded while EN is still low. A receiving
driver must honor EN. FPGA pins are not actively controlled before configuration:
confirm the receiving interface defaults disabled during power-up/programming.

If LD3 stays off, verify board power/boot state and power-cycle in JTAG mode.
The 125 MHz source comes from the Ethernet PHY; prior processor software that
holds that PHY in reset can stop the PL clock. No Ethernet cable is required.

To rebuild after changing RTL, close simulation and run:

```tcl
source {C:/Users/mrric/Documents/Codex/2026-09-12/oka/outputs/Capstone_ArtyZ7_20/scripts/build_bitstream.tcl}
```

The rebuilt file is build/capstone_arty_z7_20.runs/impl_1/arty_z7_top.bit.
The prebuilt file does not update automatically when RTL is edited.

## Scope and remaining integration work

This is the existing fixed-pattern primary-side demonstrator, not a complete
closed-loop charger. Voltage polarity selects the commutation ordering; it does
not measure or prove current direction. Calibrate A0, verify driver propagation
and switching timing on hardware, and validate protection and the rest of the
converter controls before powered system integration. A simulated 100 ns interval
does not establish a safe margin for the physical switches.

See VALIDATION.md for actual results and remaining implementation warnings.

## References

- Digilent pin assignments: https://github.com/Digilent/digilent-xdc/blob/master/Arty-Z7-20-Master.xdc
- Digilent Rev D.0 schematic: https://files.digilent.com/resources/programmable-logic/arty-z7/arty-z7-d0-sch.PDF
- Digilent reference manual: https://digilent.com/reference/programmable-logic/arty-z7/reference-manual
- AMD XADC UG480: https://docs.amd.com/r/en-US/ug480_7Series_XADC/Single-Channel-Mode


