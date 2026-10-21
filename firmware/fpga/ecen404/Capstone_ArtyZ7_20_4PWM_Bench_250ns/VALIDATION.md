# Four-PWM bench validation - 2026-09-23

Vivado/XSim 2025.2, Arty Z7-20 xc7z020clg400-1.

- Shipped run_standalone.cmd --check completed successfully, using real UNISIM
  MMCM and XADC. 157 ADC samples, 70 output-period checks, 74 pulse-width
  checks, 76 dead-time checks. Each measurement covers actual top-level outputs.
- Checked all four outputs: 100 kHz, 4.75 us high, both directions of 250 ns
  dead time; continuously checked no overlap and correct diagonal pairing.
- Passed positive/negative A0 monitoring without disrupting PWM timing,
  high-at-boot arming prevention, SW0 stop/restart, asynchronous BTN0 masking,
  reset while SW0 stays ON, ADC timeout/latching/recovery and ADC rail fault.
- New project creation script completed in main Vivado batch mode.
- Synthesis, placement, routing and bitstream generation completed.
- Internal timing passed: WNS +4.647 ns, WHS +0.131 ns, zero failing endpoints.
- DRC: zero errors; one unsuppressed ZPS7-1 warning (no PS7 block, PL-only).
- This host's existing TclStore catalog corruption warning remains; the
  session-only lookup helper allows these scripts to complete. No installation
  changes were made. Extract to the documented C:/FPGA path to avoid long paths.

## Limits

No physical board, gate-driver or MOSFET testing was performed. No analog driver
or MOSFET model is included. External gate/EN/LED timing is not constrained to a
receiver specification; internal timing closure does not validate physical gate
voltage, output skew, driver delay, dead-time margin, or converter operation.
Hardware uses the original full 10 ms switch filter; simulation shortens it.

The converter 120 VAC input must remain disconnected. This is four complementary
bench PWM, not the matrix four-step commutator. ADC polarity is diagnostic only.
The controller shuts all gates off on stop/fault; it has no inductive-current
parking sequence, current protection or transformer power-transfer control.

The bench dead time avoids intentionally simultaneous high commands at each
UCC21530 pair. It does not alter DT wiring or untie the existing PCB gates.
Original eight-output source/ZIP files were not modified.
