# Arty Z7-20: complete bench setup

Release: 2026-10-08, separate 10 kHz / 5 us eight-output logic test.
Hardware: Arty Z7-20, xc7z020clg400-1. Software: Vivado 2025.2.
Zero crossing: 1.65 V at A0. Outputs: 10 kHz PWM with 5 us commutation steps.
EN: active-high 3.3 V logic on JB pin 1.

Use this slow version for logic/driver observation with the main AC source disconnected.
It does not authorize powering the older matrix PCB or its transformer. Eight independent
gate inputs are required; the old shared-gate wiring cannot reproduce this sequence.
The 5 us interval is not an all-off dead time. Actions occur at 0, 5, 10, 15 us,
then busy clears at 20 us. Startup PREPARE remains 200 ns.

The instructions below use C:\FPGA\Capstone_ArtyZ7_20_8PWM_Test_5us throughout.
No PowerShell, serial terminal, Vitis, QSPI programming or external JTAG adapter
is needed for the normal procedure. The simulation works without the board.

1. **Close the old files and extract the replacement ZIP.**

   Close the simulator/project. Extract Capstone_ArtyZ7_20_8PWM_Test_5us.zip
   into C:\FPGA. Keep the original 100 ns project separately; do not replace it.
   This ZIP contains its own Capstone_ArtyZ7_20_8PWM_Test_5us folder.

   Confirm these files exist before continuing:

   ```text
   C:\FPGA\Capstone_ArtyZ7_20_8PWM_Test_5us\START_HERE.md
   C:\FPGA\Capstone_ArtyZ7_20_8PWM_Test_5us\scripts\run_standalone.cmd
   C:\FPGA\Capstone_ArtyZ7_20_8PWM_Test_5us\scripts\build_bitstream.tcl
   ```

   There should not be two nested Capstone_ArtyZ7_20_8PWM_Test_5us folders. Do not run directly
   inside the ZIP. Build this source before programming; no prebuilt bitstream is included.

2. **Start the simulation from File Explorer.**

   Open C:\FPGA\Capstone_ArtyZ7_20_8PWM_Test_5us\scripts and double-click run_standalone.cmd.
   Windows opens a command window, compiles the files, then opens XSim's graphical
   simulator. Wait for compilation to finish. You do not type a command into
   PowerShell and do not need to connect the Arty for this step.

   This release uses forward slashes in the Tcl script argument, fixing the
   earlier "..scriptsstandalone_waves.tcl" error. Existing Board 49-26 warnings
   about other board models are not the simulation result.

3. **Confirm that simulation passed.**

   The simulator is configured to add signals and run to 4300 us. This revised
   regression has not completed here because of the local XSim compiler error.
   Look in its Tcl Console for a line beginning:

   ```text
   PASS: Arty clock/XADC integration
   ```

   "$finish called" after that PASS is the normal end of the test, not an error.
   If a Fatal or Error appears instead, resolve it before proceeding on the basis
   of a supposed passing simulation. Detailed logs are under build_xsim.

4. **Read the waveform signals.**

   | Signal | Meaning |
   |---|---|
   | vg_pol | 1 = above the qualified 1.65 V threshold; 0 = below |
   | adc_raw | Sampled 12-bit voltage code, not volts |
   | pwm_a, pwm_b | Internal PWM requests for the two legs |
   | gate_en | The enable signal that appears on JB1 in hardware |
   | fault_latched | 1 indicates a latched fault |
   | sa1, sa2, sb1, sb2 | Left-leg physical gate commands |
   | sc1, sc2, sd1, sd2 | Right-leg physical gate commands |

   Click the waveform pane and use Zoom Fit if the trace is not visible. Zoom
   into 55-80 us for positive-polarity switching, or 1450-1500 us for negative
   polarity. Center on a group of staggered gate edges and zoom until the entire
   displayed interval is about 25-40 us; neighboring actions are 5 us apart.
   The main PWM repetition period is 100 us (10 kHz). Later deliberate fault,
   reset and stop tests interrupt PWM. The generator connected to the board does
   not influence this simulation; the test uses its own XADC stimulus file.

5. **Open the source project in Vivado.**

   Open Vivado 2025.2, close any unrelated project, and use the Tcl Console at
   the bottom of the main Vivado window. This command is for Vivado, not PowerShell
   and not the standalone XSim window:

   ```tcl
   if {[current_project -quiet] ne ""} {close_project}
   source {C:/FPGA/Capstone_ArtyZ7_20_8PWM_Test_5us/scripts/create_project.tcl}
   ```

   Expect the project capstone_arty_z7_20_8pwm_test_5us, part xc7z020clg400-1 and design top
   arty_z7_top. The .xpr will be at:

   ```text
   C:\FPGA\Capstone_ArtyZ7_20_8PWM_Test_5us\build\capstone_arty_z7_20_8pwm_test_5us.xpr
   ```

   The standalone simulation in steps 2-4 is the recommended simulation route.
   You do not need to run it a second time through Flow Navigator.

6. **Configure jumpers with USB power disconnected.**

   Keep converter power disconnected during these first logic-output checks.
   Set the board as follows, using its printed labels:

   | Board label | Required arrangement | Purpose |
   |---|---|---|
   | JP4, SD/QSPI/JTAG | One cap bridging the pair labeled JTAG | Temporary USB/JTAG programming |
   | JP5, USB/REG | Cap bridging the center pin and USB-side pin | USB supplies board power |
   | JP1, CK_RST | Open; remove cap or park it on one pin | UART reset link is unused |
   | JP2 | Leave open | Normal cascaded JTAG mode |
   | J19, GND | No power-selection cap here | This is a ground test point, not JP5 |

   Do not bridge the QSPI or SD pairs for this procedure. Move jumpers only while
   unpowered. Power must be cycled after changing the boot-mode jumper.

7. **Set SW0 OFF and connect USB power.**

   With the board oriented like your photograph (HDMI/Pmod connectors at the top),
   slide SW0 down toward the lower board edge, away from the large Zynq chip.
   SW0 controls this program's run request; it is not the board's power switch.
   SW1 is unused by this program.

   Connect the known-good USB data cable:

   ```text
   Computer USB-A -> Arty PROG/UART Micro-USB connector J14
   ```

   Do not connect the computer to USB HOST. The board has no power-on button.
   LD13, near the barrel power connector, should light. LD13 is the power
   indicator; user LEDs LD0-LD3 and DONE have different meanings and need not
   be lit before programming. If LD13 is dark, recheck JP5, cable and USB port.

8. **Configure the waveform generator, initially with output OFF.**

   | Generator control | Initial setting |
   |---|---|
   | Shape | Sine |
   | Frequency | 60 Hz |
   | Amplitude units | Vpp, not peak or RMS |
   | Amplitude | 1.0 Vpp |
   | DC offset | +1.65 V |
   | Output load setting | High-Z |

   Check the generator output with the scope. Use DC coupling and a high-impedance
   scope input, not 50-ohm termination. The waveform should range from about
   1.15 V to 2.15 V. Verify the actual voltage rather than relying only on the
   generator display. Keep the eventual A0 voltage within 0-3.3 V. Turn generator
   output OFF again while making the connection to the Arty.

9. **Connect the generator to the powered Arty.**

   | Cable connection | Board connection |
   |---|---|
   | Generator signal / BNC center | J1 pin labeled A0 |
   | Generator return / BNC shield | Regular GND, for example JB5 |
   | XGND | Leave unconnected |
   | XVREF | Leave unconnected |
   | V_P and V_N | Leave unconnected |

   Use the printed A0 label; A0 is not JA pin 0, and there is no JA pin 0.
   The A0 divider and XADC reference circuitry are already on the board. Nothing
   external needs to be supplied to XVREF. Once connected, turn generator output
   ON and check the voltage at A0 relative to regular GND. Turn generator output
   OFF before removing Arty power to avoid driving an unpowered input.

10. **Connect Vivado to the Arty.**

    In the main Vivado window choose Open Hardware Manager -> Open Target ->
    Auto Connect. Look for a device named xc7z020 or xc7z020_1. If the device
    is not found, confirm LD13 is on, the cable is connected to PROG/UART, and
    the Vivado/Digilent cable drivers are installed. No UART terminal is needed.

11. **Build this version, then program the resulting bitstream.**

    No prebuilt .bit is included: this environment could not complete Vivado
    verification. Do not substitute a bitstream from another project.
    In the main Vivado Tcl Console, with the project from step 5 open:

    ```tcl
    source {C:/FPGA/Capstone_ArtyZ7_20_8PWM_Test_5us/scripts/build_bitstream.tcl}
    ```

    Wait for synthesis and implementation to complete. Check the generated
    timing_summary.txt for nonnegative setup/hold slack and drc.txt for errors.
    Resolve any errors before programming. The existing PL-only ZPS7 warning
    and unconstrained external output timing must be reviewed in context.
    In Hardware Manager right-click xc7z020 -> Program Device, then select:

    ```text
    C:\FPGA\Capstone_ArtyZ7_20_8PWM_Test_5us\build\capstone_arty_z7_20_8pwm_test_5us.runs\impl_1\arty_z7_top.bit
    ```

    Leave debug probes empty and click Program. Use temporary JTAG programming.

12. **Connect scope probes to the gate/EN outputs.**

    Keep SW0 OFF while connecting. Use physical Pmod connector numbers, not
    the number of the signal in a software list. Identify the pin-1 marking
    before counting; do not assume a mirrored view of a connector.

    | Signal | Physical pin | FPGA package pin |
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
    | Probe ground | JA5, JA11, JB5 or JB11 | GND |

    The eight signal pins on JA are 1,2,3,4,7,8,9,10. Pins 5/11 are ground.
    Pins 6/12 are 3.3 V power: do not attach a ground clip to them. Use short
    probe ground leads for viewing 5 us intervals. Outputs are 3.3 V logic
    for a driver interface, not direct power-MOSFET gate drive.

13. **Reset and start the controller.**

    Ensure the generator is producing the valid A0 signal. Keep SW0 OFF.
    Press and release BTN0, the user pushbutton labeled BTN0. Do not substitute
    PROG or SRST. Wait one second, then slide SW0 up toward the Zynq chip (ON).
    The program requires OFF to be observed after reset before accepting ON.

    | Indicator | Meaning after programming |
    |---|---|
    | LD13 | Board supply rails ready |
    | LD3 | 100 MHz internal clock locked |
    | LD2 | Qualified positive voltage polarity; may flicker/glow at 60 Hz |
    | LD1 | Latched fault; should be OFF in normal operation |
    | LD0 | Actual EN output state; ON when enabled |

    If A0 was disconnected during programming, a fault may have latched.
    Correct the input, keep SW0 OFF, press/release BTN0, wait one second,
    then try SW0 ON again. Exactly 1.65 V DC is in the hysteresis band and
    will not qualify a startup polarity; the suggested sine crosses both sides.

14. **Measure PWM and the 5 us steps.**

    Use DC coupling and a high-impedance scope input with the correct probe ratio.
    Around 1 V/div and 20 us/div is a useful starting view. Trigger on a gate
    rising edge at roughly 1.5 V. The repeating command pattern is 10 kHz,
    or 100 us per period; the internal PWM requests have 25 us active intervals,
    and B begins 50 us after A. The eight physical gates include the staggered
    commutation transitions, so not all gates have the same high time.

    Display two or more gate signals together and zoom to about 2 us/div.
    Use time cursors to measure successive commutation actions. The designed
    separation is 5 us (500 controller clocks). Hardware propagation and
    output skew still need measurement. Changing the generator changes voltage
    polarity; it does not change this fixed PWM duty or 10 kHz frequency.

15. **Check EN as a simple ON/OFF output.**

    Measure JB1 relative to JB5 or another regular GND.

    | State | JB1 output |
    |---|---|
    | Normal running with SW0 ON | Approximately 3.3 V, ON |
    | Stopped with SW0 OFF | Approximately 0 V, OFF |
    | Reset or latched fault | Approximately 0 V, OFF |

    EN is a steady logic level, not PWM. It reports actual controller enable,
    not an unconditional copy of SW0. With SW0 OFF the controller first parks
    the switching sequence, then lowers EN. Startup preloads low-side commands
    while EN is low; the receiving driver must honor EN.

16. **Connect the PCB interface only after the logic checks pass.**

    With SW0 OFF and the converter power stage unpowered, the intended enable
    connection is JB1 -> PCB EN input, plus the appropriate common signal ground.
    Confirm that input accepts active-high 3.3 V logic and defaults disabled
    while the Arty is unprogrammed. Connect the eight gate commands according
    to the pin table and the PCB's actual gate-input labels. Do not assume a
    header ribbon cable automatically maps the Arty header to the PCB correctly.

    This package is a bench controller, not a fully commissioned charger.
    Powered integration still requires verification of the receiving interface,
    protection and actual gate-driver/switch timing.

17. **Stop, reset, and power down.**

    Set SW0 OFF and check LD0/JB1 go low after the controlled stop. To clear a
    fault, correct its cause and use BTN0 with SW0 OFF before enabling again.
    Before unplugging USB, switch the generator output OFF. JTAG configuration
    is lost when board power is removed. On the next session, repeat programming
    and the reset/start procedure; no simulation rerun is necessary unless
    you change the code or want to inspect it again.

18. **After any source edits, repeat verification.**

    Repeat simulation and step 11. The build script regenerates the project
    bitstream; this package does not contain a prebuilt copy.
    Optional PowerShell regression:

    ```powershell
    & "C:\FPGA\Capstone_ArtyZ7_20_8PWM_Test_5us\scripts\run_standalone.cmd" --check
    ```

## References and verification scope

- [Digilent reference manual](https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/2212/Arty_Z7_RM_Web.pdf)
- [Digilent Rev D.0 schematic](https://files.digilent.com/resources/programmable-logic/arty-z7/arty-z7-d0-sch.PDF)
- [Digilent pin constraints](https://github.com/Digilent/digilent-xdc/blob/master/Arty-Z7-20-Master.xdc)
- See VALIDATION.md and validation/ for measured software results, warnings and
  limits. A successful build/simulation is not a physical converter test.
