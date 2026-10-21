# Arty Z7-20 - FOUR PWM DRIVER BENCH - 250 ns

This is a SEPARATE bench-test program. Keep the older eight-output packages.
Converter 120 VAC / main power input must remain disconnected. This release
is not an AC matrix commutation controller or a transformer power-test program.
Driver output supplies must be correct and independent of the disconnected
main power path. If they cannot be powered independently, test Arty outputs only.

## Signals and behavior

| Arty physical pin | New signal | Intended driver input |
|---|---|---|
| JA1 | SA | Driver 1 INA |
| JA2 | SB | Driver 1 INB |
| JA3 | SC | Driver 2 INA (your INC) |
| JA4 | SD | Driver 2 INB (your IND) |
| JB1 | EN, active high | Both drivers' enable inputs |
| JA5/JA11 or JB5/JB11 | GND | Driver input-side ground |
| J1 A0 | Voltage-monitor input | WaveGen signal |
| J7 labeled GND | GND | WaveGen return |

JA7-JA10 are UNUSED in this bitstream. Disconnect old signal wiring from them;
they are not assigned low outputs. JA/JB pins 6 and 12 are 3.3 V supply pins,
not ground. Identify physical pin 1 from the board marking before counting.
Do not connect any two FPGA outputs together.

SA/SB are complementary. SC/SD are complementary. SA and SD rise together;
SB and SC rise together one half-period later. All four outputs are 100 kHz.
They use 250 ns both-OFF time at each transition, so each high pulse is
4.75 us (47.5% actual high duty), and the repetition period is 10 us.
This is dead time, NOT four-step commutation. Both commands to a given driver
are never intentionally high simultaneously, which avoids the overlapping-input
conflict with grounded DT. Verify actual driver outputs and their delays.

| Repeating time interval | SA | SB | SC | SD |
|---|---|---|---|---|
| 0 to 0.25 us | 0 | 0 | 0 | 0 |
| 0.25 to 5.00 us | 1 | 0 | 0 | 1 |
| 5.00 to 5.25 us | 0 | 0 | 0 | 0 |
| 5.25 to 10.00 us | 0 | 1 | 1 | 0 |

Intervals are relative to the repeating pattern boundary, not USB programming
or SW0 timing. EN has an initial all-low arming interval before pulses begin.
SW0 OFF or a fault disables all commands; no inductive-current parking sequence
is provided. This is another reason not to use this release for powered conversion.

A0 monitoring remains: nominal 1.65 V threshold, 3-sample qualification,
hysteresis, ADC rail and missing-update faults. Polarity is displayed on LD2
but does NOT choose PWM order or alter frequency. The WaveGen must provide
valid input for startup; exactly 1.65 V DC may not qualify. Input polarity
is not a measurement of current direction. No overcurrent protection is provided.

## Numbered steps

1. Extract Capstone_ArtyZ7_20_4PWM_Bench_250ns.zip into C:\FPGA.
   Confirm the resulting path is:
   C:\FPGA\Capstone_ArtyZ7_20_4PWM_Bench_250ns\prebuilt\arty_z7_top.bit
   Do not overwrite or use the earlier eight-output bitstream.

2. To simulate, double-click scripts\run_standalone.cmd inside the new folder.
   It opens XSim, adds SA/SB/SC/SD, and runs to 430 us. Expect
   "PASS: FOUR PWM BENCH" followed by $finish. No board is needed.
   Use 60-90 us for steady PWM. A 20 us view shows two periods; a 1-2 us
   window around a transition shows the 250 ns both-OFF gap. Simulation
   models clock/XADC and digital commands, not MOSFET/driver analog behavior.

3. Optional source project: open MAIN Vivado 2025.2, close any existing project,
   and enter this in its Tcl Console (not PowerShell or standalone XSim):

   source {C:/FPGA/Capstone_ArtyZ7_20_4PWM_Bench_250ns/scripts/create_project.tcl}

   Reopen later with build\capstone_arty_z7_20_4pwm_bench_250ns.xpr.
   You can use Hardware Manager and the prebuilt bitstream without this project.

4. With USB disconnected, set JP4 to JTAG, JP5 to USB, JP1 CK_RST open,
   JP2 open. J19 is a ground test point, not the power jumper.
   Set SW0 OFF (toward the lower board edge, away from the Zynq chip with
   HDMI connectors at the top). Connect a data cable to J14 PROG/UART
   Micro-USB, not USB HOST. LD13 indicates board power.

5. Keep the driver PCB disconnected initially. Set WaveGen output OFF.
   Select Sine, 60 Hz, High-Z load, 1.0 Vpp, +1.65 V offset.
   Verify 1.15-2.15 V with the scope and matching probe attenuation.
   Scope input should be high impedance and DC coupled. Turn output OFF,
   connect signal to A0 and return to regular Arty GND (J7 GND is suitable),
   then turn output ON with the Arty powered. Leave XGND and XVREF unused.

6. Main Vivado: Hardware Manager -> Open Target -> Auto Connect.
   Right-click xc7z020_1 -> Program Device. Select:

   C:\FPGA\Capstone_ArtyZ7_20_4PWM_Bench_250ns\prebuilt\arty_z7_top.bit

   Leave debug-probes empty. Use JTAG, not Add Configuration Memory Device.

7. Connect scope probes to JA1-JA4, ground to regular Arty GND. With valid
   WaveGen input, keep SW0 OFF, press/release BTN0, wait 1 second, then
   set SW0 ON. LD3=clock locked; LD1=fault (normally OFF); LD0=EN;
   LD2=qualified voltage polarity. If faulted, fix input and repeat reset.

8. For Arty logic measurements use approximately 1 V/div, 2 us/div,
   DC coupling and a rising-edge trigger around 1.5 V. Measure 10 us
   between successive rising edges of each signal. At 250 ns/div,
   compare SA/SB and SC/SD: both must be low for 250 ns at each handoff.
   Measure JB1 EN: approximately 3.3 V running, 0 V stopped.

9. Driver test ONLY when main AC input is physically disconnected and stored
   energy discharged. Set SW0 OFF and remove driver power before wiring.
   Connect the four signals and input-side common ground using the table.
   Connect JB1 to both EN inputs. Verify input-side VCCI and isolated
   output-side supplies and their polarity against the PCB schematic.
   Do not apply logic to an unpowered driver; establish supplies with EN low.
   Confirm the receiving EN defaults low during Arty startup/programming.
   If those supply/EN conditions are not established, stop at step 8.

10. With correct driver supplies stable and valid A0 input, repeat step 7.
    Measure each gate relative to its OWN source using suitable differential
    or isolated probes. Ordinary grounded probe clips on floating sources
    can short circuit nodes together. Gate voltage is set by the driver
    supplies, not the 3.3 V FPGA levels. This program does not untie gates:
    each existing PCB gate pair still switches together.

11. Stop: SW0 OFF, confirm EN low, remove driver power, turn WaveGen OFF,
    then remove Arty USB power. Turn the generator off before Arty loses
    power. JTAG configuration is volatile; reprogram after a power cycle.

12. If source is edited, rerun simulation and build in MAIN Vivado:

    source {C:/FPGA/Capstone_ArtyZ7_20_4PWM_Bench_250ns/scripts/build_bitstream.tcl}

    Program the rebuilt file at:
    C:\FPGA\Capstone_ArtyZ7_20_4PWM_Bench_250ns\build\capstone_arty_z7_20_4pwm_bench_250ns.runs\impl_1\arty_z7_top.bit

    Editing RTL does not update the supplied prebuilt file automatically.

No terminal commands are required for normal use. Optional automated regression:

    & "C:\FPGA\Capstone_ArtyZ7_20_4PWM_Bench_250ns\scripts\run_standalone.cmd" --check

## Sources

- Digilent Arty Z7 Rev D schematic:
  https://files.digilent.com/resources/programmable-logic/arty-z7/arty-z7-d0-sch.PDF
- UCC21530 driver specifications and DT behavior:
  https://www.ti.com/lit/ds/symlink/ucc21530.pdf

See VALIDATION.md for checks and limitations. 250 ns is a programmed digital gap,
not a guarantee of safe timing for a powered converter.
