# Arty Z7-20: separate eight-output 10 kHz / 5 us test

SOURCE RELEASE, NOT YET FULLY VERIFIED. No prebuilt bitstream is included.
Read START_HERE.md for extraction, simulation, building and programming.

- Internal clock: 100 MHz; PWM repetition: 10 kHz (100 us).
- PWM A/B requests: 25 us active, B starts 50 us after A.
- Commutation step: 500 clocks = 5 us. Actions at 0, 5, 10, 15 us.
- Each leg remains busy for 20 us including the final hold interval.
- Eight original gate outputs and JB1 EN remain unchanged.
- A0 zero threshold remains nominally 1.65 V, ADC code 2036.
- SW0 arming, BTN0 reset, ADC fault handling and 200 ns PREPARE unchanged.
- Physical gate pulse widths include commutation staggering; not all are 25 us.

Only three functional parameter defaults changed in dab_mc_controller.v:
PWM_PERIOD_CYCLES 1000 -> 10000, ACTIVE_CYCLES 250 -> 2500,
STEP_DELAY_CYCLES 10 -> 500. The standalone commutation_cell default also
changes to 500. No gate ordering or pin assignment changes.

Use for logic/gate-driver observation with main AC disconnected. Lowering
switching frequency does not establish safe transformer operation. This code
requires eight independently driven transistor gates, which the previously
reviewed shared-gate matrix PCB does not provide.

See PAPER_COMPARISON.md for the paper/table audit and VALIDATION.md for limits.
