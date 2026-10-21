# Separate four-PWM gate-driver bench program

Read START_HERE.md for the wiring table and numbered setup instructions.

- Arty Z7-20 only; Vivado 2025.2; 100 MHz internal controller clock.
- Four named outputs: SA/SB complementary, SC/SD complementary.
- 100 kHz, 250 ns dead time, 4.75 us high pulses (47.5% actual duty).
- SA/SD in phase; SB/SC in phase, half a period later.
- JA1=SA, JA2=SB, JA3=SC, JA4=SD. JB1=EN. JA7-JA10 unused.
- SW0 run request; BTN0 reset; 10 ms switch qualification and OFF-before-ON arming.
- A0 WaveGen input: 60 Hz, 1 Vpp, +1.65 V offset. Polarity monitoring only;
  it does not change the PWM waveform. Input qualification/fault checks remain.
- No matrix four-step algorithm, powered AC conversion, current control,
  transformer flux control, or load protection is claimed.
- Converter 120 VAC must be disconnected. Independent driver supplies only.

Key source: rtl/four_pwm_bench.v. Precompiled image: prebuilt/arty_z7_top.bit.
Original eight-output packages are unchanged. Test uses real XADC/MMCM models.
