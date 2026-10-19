NIU INTERMEDIATE BOARD - REV O - RELAY 12 V PASS-THROUGH
Prepared 2026-10-08. Extract the complete ZIP, then open NIU_Intermediate_RevO.kicad_pro in KiCad 9.
Local symbol/footprint libraries and all fitted-component 3D models are included.

Rev O adds J14 beside J5. It is a second regular two-pin male header wired
directly in parallel with the external relay-control input, before diode D3.
All Rev N components, their values/MPNs, placements and original traces remain.
The 36 V buck, isolated 5 V, local sensing 3.3 V, SOC circuit and 5 V throttle
are unchanged. J13 remains removed; J14 is NOT a 3.3 V power connector.

  ONE external switched 12 V source -> J5
                                       | parallel, raw +12 V / coil return
                                       +-> J14 -> motor-board J11 pins 1 and 2

Header          Pin 1                    Pin 2
J5 12V IN       external +12 V           external coil return
J14 12V OUT     same external +12 V      same external coil return
Motor J11       Relay+                   Relay-

Connect J14 pin 1 to motor J11 pin 1 and J14 pin 2 to motor J11 pin 2.
Do not add a second power supply to J14, or connect COIL_RET to battery or
SYSTEM_RET. This is a pass-through, not a 12 V regulator. It applies the same
ON/OFF command to both boards and adds no intentional delay.

With five actual 12 V G5Q-1 SPDT motor-board coils, the combined nominal load
is about 0.20 A: 5 x 33.3 mA plus about 37 mA for this board. The motor CAD says
G5Q-1 but does not identify the fitted coil-voltage suffix; verify the parts.
Use a switched 12 V output rated for at least 0.3 A, preferably 0.5 A, and verify
voltage at both boards when all coils are on. This combined load exceeds the
earlier 100 mA preference for the intermediate board alone.
D3 and D4 protect only this board's branch; they do not provide reverse-polarity
or flyback protection for the raw J14 output. Retain/check the motor board and
source driver's appropriate coil suppression. Do not add an unreviewed common
clamp, since suppression can change relay release timing.

U11 generates the sensing interface's 3.3 V locally from the always-on isolated
5 V rail. U11/C36/C37 and the separate battery-domain U10 supply are retained.
No external 3.3 V feed is needed. Mode-switched grounding remains as below.

84 x 128 mm rectangle (3.31 x 5.04 in), four layers, 1 oz copper each layer.
No board growth. 120 fitted components plus four mounting holes: exactly one
extra header versus Rev N. Motor PCB and installed firmware were not modified
or operated while preparing this revision.

Ordering
Purchasing/NIU_RevO_BOM.xlsx: 57 Mouser SKUs, 119 purchased pieces for one board.
User-supplied XT60 makes 120 fitted parts. No spares included.
- New/empty cart: Mouser_RevO_Full_1Board.csv.
- Already bought Rev N: Mouser_RevO_Added_Since_RevN.csv, one extra header.
- Already bought Rev M: Mouser_RevO_Added_Since_RevM.csv, U11/C36/C37 only.
  Reuse the spare two-pin header previously assigned to removed J13 for J14.
- Already bought Rev L: Mouser_RevO_Added_Since_RevL.csv, 34 extra pieces.
Use only the list appropriate to the order already placed.
J14 is Harwin M20-9990245 / Mouser 855-M20-9990245, the existing header SKU.
There are 12 fitted two-pin headers. No new part number is introduced in Rev O.
Prior stock evidence is retained; the increased header quantity was not
rechecked in a live cart. No component or PCB order was placed.

Integration
J12.1 is SDA, J12.2 is SCL. SYSTEM_RET reaches the motor/comm boards through
the existing two-wire 5 V power connections. No connection to motor J3.1
or any other external 3.3 V rail is required. Do not tie 3.3 V regulators together.
SOC requires firmware integration and calibration. FIRMWARE_INTEGRATION.txt
retains the proposed motor-MCU bridge and GNSS-preserving UART arrangement.
That proposal repurposes PA5 from analog speed to software-I2C clock; do not
connect J12 while the old firmware drives PA5 as a DAC.

Power and mode operation
  Battery -> F1 10 A -> R33 sense shunt -> LM70860 synchronous buck -> D7 -> K1 NC -> VM
  Charger output -> R34 sense shunt -> K1 NO -> F3 10 A -> battery charge port
K1 NC 11-12 carries drive positive; NC 21-22 carries drive return.
K1 NO 33-34 carries charge positive; NO 43-44 carries charge return.
Coil 0 is positive; coil 1 is negative. One 12 V / 30 mA nominal coil is powered
only by the external mode source. LED/opto current is additional and the total
is about 37 mA for this board alone. J14 motor-coil current is additional.
12 V absent: NC drive contacts closed, NO charging contacts open.
12 V present: NC drive contacts open, NO charging contacts closed.
The forcibly guided NC/NO mechanism replaces independent relay timing. All four
contacts are used for power paths; there is no feedback contact or welded-contact
diagnostic circuit. This is not a certified complete safety control system.

Keep the external sequence: disable drive before transfer; assert 12 V, wait
one second, then start AC. Stop AC, wait one second, then remove 12 V. No precharge
was added. Near-zero steady load does not eliminate capacitor charging inrush.
The G7SA has a 6 A carry rating, but its full-current resistive DC switching
rating is 6 A at 30 VDC. Its 125 VDC maximum switching voltage is NOT permission
to switch 6 A at 125 V. Loaded 36-54.6 V transfer and capacitive making current
have not been qualified. Measure inrush and obtain an applicable load rating
before using this prototype for repeated high-voltage load transfer.

Isolation meaning
Both conductors of the inactive drive/charge path are disconnected by contacts.
The unchanged motor PCB joins VM, charge-input and MCU returns as SYSTEM_RET.
Battery charge/discharge negatives may also be internally shared. As accepted
by the user, the active mode can connect SYSTEM_RET to that mode's battery return.
U1 provides an isolated conversion barrier, but its output return is SYSTEM_RET;
it does not make MCU/comm/throttle permanently isolated from VM/charging ground.
The external coil circuit remains separate. No mains isolation claim is made.

Voltage and current limits
36 V is the nominal loaded VM target: the buck regulates about 36.48 V before
D7 and the delivered voltage depends on diode drop, load and tolerance. Maximum
battery input is 54.6 V. Nominal enable threshold is about 39.3 V; this buck needs
input headroom and cannot boost a depleted battery.
The converter IC is rated 6 A; this is NOT a 6 A or 10 A complete-board rating.
The two-pin headers are rated 3 A per contact MAXIMUM. The mating jumper contacts
and wire may be rated lower or have no documented current rating. Use an external
current limit chosen for the actual harness. Start bench checks at low current.
The retained 10 A fuses do not protect these jumper wires against overload.
No continuous current or peak-duration qualification has been performed.
The motor PCB's separate phase-contact limits remain unchanged.

D7 still dissipates heat (about 1 W at 2 A, dependent on temperature). Wider
copper does not replace thermal testing. The VM shunt remains limited incidental-
energy protection: about 38.5 V on, 37.5 V off and 0.31 A at threshold. It is not
a regen brake, guaranteed 40 V ceiling, or sustained-backdrive/buck-fault absorber.

Connections: pin 1 / pin 2
J1  XT60 battery positive / battery discharge negative
J2  VM nominal 36 V / SYSTEM_RET
J3  charger-IC output positive / SYSTEM_RET
J4  battery charge-port positive / battery charge-port negative
J5  external charge-mode 12 V INPUT / isolated coil return
J6  MCU 5 V / SYSTEM_RET
J7  communication-board 5 V / SYSTEM_RET
J8  throttle 5 V / SYSTEM_RET
J9  raw throttle signal / SYSTEM_RET
J10 divided throttle ADC signal / SYSTEM_RET
J11 active-low charge command / SYSTEM_RET (MCU 3.3 V pull-up)
J12 SOC SDA / SOC SCL (3.3 V I2C signals, NOT a power connector)
J14 external charge-mode 12 V PASS-THROUGH / isolated coil return
J2-J12 and J14 use regular 2-pin 2.54 mm male headers. They are unkeyed: follow pin numbers
and the +/return markings when mating jumper wires. Auxiliary 5 V stays on in
both modes. J11 is a mode input, not an MCU shutoff or contact-position feedback.
See FIRMWARE_INTEGRATION.txt for the existing motor-board GPIO connection.


Package and CAD checks
Seven schematic sheets, PCB/project, local libraries/models, BOM and ordering
files, schematic PDF, filled-copper/3D previews, Gerbers, PTH/NPTH drills,
assembly positions and verification reports are included.
ERC 0, DRC 0, unconnected 0, parity 0; 334 electrical pads match schematic/model.
45 filled zones, 182 through vias, 237 round holes. Minimum drill 0.30 mm.
No slots, overlapping holes, blind/buried vias or internal cutouts. Projected
3 mm copper spacing checked across all four layers and all isolation domains.
See FABRICATION.txt for the retained AdvancedPCB special process constraints.

Hardware validation
This is a CAD-checked prototype. BENCH_CHECKS.txt retains the existing thermal,
inrush, transient and sensing checks and adds local 3.3 V startup/shutdown tests.
J5/J14 wiring, combined coil load and turn-off transients also require checks.
No assembled Rev O board has been powered or tested.
