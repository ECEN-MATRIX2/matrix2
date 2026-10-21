# Validation status - 2026-10-08

SOURCE-ONLY release. No prebuilt bitstream is included.

Completed checks:
- Visual review of both paper tables, all sixteen actions match the RTL.
- Only requested timing defaults changed in functional RTL (see diff).
- Clock, XADC, top-level logic and pin constraints are byte-for-byte unchanged.
- 500 clocks at 100 MHz = 5 us; 10000 clocks = 100 us (10 kHz).
- Both 25 us request intervals exceed the 20.02 us sequencer parameter guard.
- Vivado xvlog parsed RTL and testbenches; xelab completed static elaboration.
- ZIP contents and SHA-256 hashes verified byte-for-byte.

Blocked checks:
- Behavioral regression did NOT run: XSim could not execute installed GCC
  to compile generated C (XSIM 43-3409). Direct GCC invocation reported
  Windows Illegal System DLL Relocation.
- Synthesis/routing/bitstream were blocked by local Vivado TclStore errors:
  Could not open 'C' for writing / tclapp::load_apps failed.
- No simulation PASS, timing closure, DRC pass or hardware result is claimed.
- No old bitstream is included as a substitute.

Supplied tests:
- commutation_cell_tb checks all four Table I cases, each 10 ns sample through
  the 5 us holds, polarity latching and a pending target reversal.
- arty_z7_tb uses real MMCM/XADC models, checks 100 us PWM periods and 5 us
  steps, audits table vectors on BOTH legs, and exercises arming, stop,
  reset/restart, ADC timeout and rail faults. Intended finish: 4300 us.
- Simulation debounce is shortened; hardware debounce remains 10 ms.

Run the regression and build locally using START_HERE.md before programming.
Digital tests do not validate the older power board or operation at 120 VAC.
