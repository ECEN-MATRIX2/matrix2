# Paper and code comparison

Reviewed both supplied PDFs, including rendered page 3 tables and diagrams.

1. Huang et al., A New Integrated Onboard Battery Charger For Electric Scooters,
   INTELEC 2024: Table I, page 3; Fig. 3 and Fig. 4 on the same page.
2. A New Integrated Onboard Battery Charger for LEVs Featuring FPGA-Enhanced
   Precision Delay Time Control for Four-Step Switching AC-AC Converter:
   Table I, PDF page 3 (printed 2432); implementation section III; section V.

## Action order: matches both Table I tables

HS=SA and LS=SB on the left; HS=SC and LS=SD on the right.

| Transition | Polarity | Step 1 | Step 2 | Step 3 | Step 4 |
|---|---|---|---|---|---|
| HS to LS | Positive | LS2 on | HS1 off | LS1 on | HS2 off |
| LS to HS | Positive | HS2 on | LS1 off | HS1 on | LS2 off |
| HS to LS | Negative | LS1 on | HS2 off | LS2 on | HS1 off |
| LS to HS | Negative | HS1 on | LS2 off | HS2 on | LS1 off |

The RTL latches the voltage polarity and requested direction at the beginning
of each transaction. It applies these actions with a counter-based FSM.
The papers illustrate delay paths, polarity selection and state-machine logic;
the RTL is a different implementation of the table, not a literal gate-level
copy of the figure. Reset, arming, final busy hold and fault behavior are added
implementation choices, not a reproduction of the whole paper.

Voltage polarity is the sequence selector. The IL > 0 / IL < 0 effects explain
current paths, not an additional measured-current selector. This does NOT mean
that current direction equals voltage polarity. The FPGA cannot certify actual
zero-current switching or a diode-current path from the voltage input alone.

## A real discrepancy in the first paper

Fig. 3(b), labeled Vg > 0, lists SC1 on, SD2 off, SC2 on, SD1 off.
Mapping HS=SC, LS=SD into Table I's positive LS-to-HS row instead gives
SC2 on, SD1 off, SC1 on, SD2 off. The code follows Table I. Thus it would be
incorrect to say the code matches every diagram and caption exactly. Confirm
transistor numbering and physical wiring before treating either as a hardware
commissioning instruction. The second paper's Table I reinforces the same
four action orders used by the code.

## Scope differences

The scooter paper describes the eight-transistor matrix bridge, transformer
and TPS charger control. The LEV paper describes a two-bidirectional-switch
AC step-down stage (four independently gated MOSFETs), filtering, rectification
and PI output-voltage regulation. It is useful evidence for the per-leg
commutation method, not a drop-in complete topology for this transformer design.
Our code has fixed duty and phase requests; no PI regulation, TPS optimization,
secondary bridge control or current measurement is implemented.

The LEV paper section V reports measured transistor switching times below
20 ns on its own setup and selects 100 ns steps afterward. That supports
characterizing actual hardware; it does not establish a universal safe delay
for this different MOSFET/driver/PCB combination.

## This temporary release

5 us replaces 100 ns as the interval between actions; 10 kHz replaces 100 kHz
as the PWM repetition rate. This is deliberately slower than the paper's
100 ns / 100 kHz configuration, for observing logic transitions. It is not
claimed to improve efficiency or to authorize the older board at 120 VAC.
