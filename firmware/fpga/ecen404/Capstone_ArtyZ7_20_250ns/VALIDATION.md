# Validation, 2026-09-23

Vivado/XSim 2025.2, xc7z020clg400-1.

## Passed

- Clock primitive simulation: 125 MHz input -> 100 MHz output, 100 periods checked.
- Commutation regression: all four per-leg sequences, polarity captured through a
  transition, pending requests and exactly 250 ns spacing; 405 checks.
- Arty top-level simulation using real UNISIM MMCM and XADC: 157 ADC updates,
  12 PWM-period checks, both polarity sequences, high-at-boot arming prevention,
  controlled stop, reset/restart, missing-update fault and ADC rail fault.
- Synthesis, placement, routing and bitstream generation completed.
- Internal timing met: WNS +3.751 ns, WHS +0.131 ns, no failing endpoints.
- Project creation script inherited from the tested 100 ns release, with a separate
  250 ns project name. This release was built with the batch validation script.
- Corrected launcher tested directly with run_standalone.cmd --check: passed.
  This compiles all RTL and both testbenches, loads the waveform Tcl script using
  the same forward-slash argument as GUI mode, and checks both PASS markers.

Reports and simulation logs are in validation/. The prebuilt bitstream uses
ADC_ZERO_CODE=2036 and the full 10 ms switch filter, not the shortened test filter.

## Limits and warnings

- No physical Arty, gate-driver or converter measurements were performed.
- DRC reported zero errors and one ZPS7-1 warning because this is a PL-only
  design with no PS7 block. Keep this as a JTAG bench design; there is no processor,
  DDR, Ethernet software or boot image configuration in the package. The warning
  was not suppressed. Digilent documents direct PL configuration over JTAG.
- External receiver timing is unknown. Gate/EN/LED ports therefore have no
  output-delay constraints; the timing summary reports 12 such ports. Internal
  timing closure does not certify output skew, driver delays or 250 ns safety
  margin in the converter. Measure the actual outputs and complete interface
  timing requirements before integrating a powered stage.
- Unused MMCM/XADC output connections are now explicitly listed as unused.
- This host has an existing TclStore catalog/lookup problem. The supplied
  tclstore_paths.tcl adds installed package locations only within the session;
  it does not modify or reset the user's installation.
- Project-managed launch_simulation hit a Windows Documents-path normalization
  problem in this automation environment (it dropped Documents when forming a
  memory-file export path). Standalone XSim compilation/elaboration/simulation
  passed. If this happens in your interactive Vivado, use scripts/run_standalone.cmd
  or extract the project to a short local path such as C:/FPGA/Capstone_ArtyZ7_20_250ns.

The original TE0725 project remains untouched. The only functional RTL changes from the prior Arty release are the two
STEP_DELAY_CYCLES defaults, from 10 to 25. Pin assignments, enable logic,
ADC threshold, PWM period and requested duty remain unchanged.

