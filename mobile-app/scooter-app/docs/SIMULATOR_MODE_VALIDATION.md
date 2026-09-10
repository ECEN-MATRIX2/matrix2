# Simulator Mode Validation Workflow

This workflow validates the full software pipeline using the ESP32 simulator:

- BLE transport
- newline-delimited JSON parsing
- `TelemetryV1` validation
- shared telemetry store updates
- screen rendering from one global source of truth
- centralized alerts + freshness/disconnect handling

## Scope

`SET_MODE` commands only change ESP32 internal simulated state. They do not actuate real scooter hardware.

Pass criteria at this stage:

1. Telemetry packets change to mode-consistent values.
2. App shared telemetry state updates from valid packets.
3. Dashboard, Ride, Charging, and Diagnostics reflect the same packet correctly.
4. Alerts/freshness/disconnect behavior matches shared-store rules.

## Data Contract Guardrails

Always validate against canonical fields:

- `ts_ms`
- `pack_voltage_v`
- `pack_current_a`
- `board_temp_c`
- `wheel_speed_kph`
- `brake_active`
- `charging_state`
- `fault_flags`

Important:

- Do not infer charging from current sign.
- Distinguish REGEN vs CHARGING using `charging_state`.
- Invalid packets must be dropped without overwriting last good packet.

## Commands

- `PING` (expect `PONG` or equivalent liveness response)
- `SET_MODE IDLE`
- `SET_MODE RIDE`
- `SET_MODE BRAKE`
- `SET_MODE CHARGING`
- `SET_MODE FULL`
- `SET_MODE FAULT`
- `FAULT_CLEAR`

## Preconditions

1. ESP32 simulator is running and advertising.
2. App launches and BLE connects to the target ESP32.
3. BLE Console shows one complete JSON packet line per second.
4. Shared telemetry store is receiving packets (`latest` changes each second).

## Step-by-Step Mode Validation

Use BLE tab or serial console to send each command. After each command, observe 2-3 packets before judging.

### IDLE (`SET_MODE IDLE`)

Expected packet traits:

- `wheel_speed_kph = 0.0`
- `brake_active = false`
- `charging_state = "disconnected"`
- `fault_flags = []`
- voltage/current/temp are calm baseline values

Expected UI:

- Dashboard: connected, no motion/fault indicators
- Ride: speed ~0, brake released
- Charging: not charging
- Diagnostics: no faults, no fault alerts

### RIDE (`SET_MODE RIDE`)

Expected packet traits:

- `wheel_speed_kph > 0`
- `pack_current_a > 0`
- `brake_active = false`
- `charging_state = "disconnected"`
- no faults

Expected UI:

- Dashboard: riding-like live values
- Ride: nonzero speed and brake released
- Charging: still not charging
- Diagnostics: still no faults

### BRAKE / REGEN (`SET_MODE BRAKE`)

Expected packet traits:

- `wheel_speed_kph > 0` (decelerating, not parked instantly)
- `pack_current_a < 0`
- `brake_active = true`
- `charging_state = "disconnected"`
- no faults

Expected UI:

- Ride: brake active, speed still above zero
- Charging: must remain not charging
- Dashboard: should show changed current and brake state only
- Diagnostics: no fault alerts

Critical assertion:

- Negative current here must not trigger charging UI.

### CHARGING (`SET_MODE CHARGING`)

Expected packet traits:

- `wheel_speed_kph = 0`
- `pack_current_a < 0`
- `brake_active = false`
- `charging_state = "charging"`
- no faults

Expected UI:

- Charging: active charging state
- Ride: zero speed
- Dashboard: incoming charge current visible
- Diagnostics: no fault alerts

Critical assertion:

- Charging classification comes from `charging_state`, not current sign.

### FULL (`SET_MODE FULL`)

Expected packet traits:

- `wheel_speed_kph = 0`
- `pack_current_a` near zero (small magnitude)
- `brake_active = false`
- `charging_state = "full"`
- no faults

Expected UI:

- Charging: shows full/complete (not active bulk charging)
- Ride: stationary
- Dashboard: calm topped-off values
- Diagnostics: no fault alerts

### FAULT (`SET_MODE FAULT`)

Expected packet traits:

- `charging_state = "fault"`
- `fault_flags` contains at least one flag (for example `overtemp`)
- motion likely zero

Expected UI:

- Dashboard: visible alert state
- Diagnostics: shows fault flags + fault-related alerts
- Charging: reflects fault state
- Ride: non-normal status messaging

Critical assertion:

- Fault must propagate from centralized shared store to all relevant screens.

### Clear Fault (`FAULT_CLEAR`)

Expected packet traits:

- Return to `charging_state = "disconnected"`
- `fault_flags = []`
- IDLE-like values

Expected UI:

- Fault alerts clear
- Diagnostics clears fault indicators
- Dashboard returns to normal baseline

## Transition Validation Path

Run this full path and verify smooth mode semantics:

1. `SET_MODE IDLE`
2. `SET_MODE RIDE`
3. `SET_MODE BRAKE`
4. `SET_MODE IDLE`
5. `SET_MODE CHARGING`
6. `SET_MODE FULL`
7. `SET_MODE FAULT`
8. `FAULT_CLEAR`

Transition checks:

- IDLE -> RIDE: speed rises, current positive.
- RIDE -> BRAKE: brake true, current flips negative, speed still >0 briefly.
- BRAKE -> IDLE: speed returns to 0, brake false.
- IDLE -> CHARGING: `charging_state` flips to `"charging"`.
- CHARGING -> FULL: `charging_state` flips to `"full"`.
- Any -> FAULT: alerts appear quickly.
- FAULT_CLEAR -> IDLE: alerts/fault flags clear.

## Freshness and Disconnect Validation

Validate shared-store timer behavior:

1. While connected and receiving packets, health should remain fresh.
2. Pause packet stream for >= 3s:
   - expect `isStale = true`
   - expect stale warning
3. Continue paused to >= 5s:
   - expect `isTelemetryLost = true`
   - expect telemetry-lost warning
4. Disconnect BLE:
   - expect `connectionState = "disconnected"`
   - expect `isTelemetryLost = true`
   - last valid packet remains available for display/debug
5. Resume valid packets:
   - expect stale/lost cleared on next valid packet

## Validation Log Template

Use this table during runs:

| Step | Command | Expected packet traits | Dashboard | Ride | Charging | Diagnostics | Result |
|---|---|---|---|---|---|---|---|
| 1 | `SET_MODE IDLE` | speed 0, brake false, disconnected, no faults | baseline | 0 speed | not charging | no faults | pass/fail |
| 2 | `SET_MODE RIDE` | speed>0, current>0, brake false | active ride values | moving | not charging | no faults | pass/fail |
| 3 | `SET_MODE BRAKE` | speed>0, current<0, brake true, disconnected | regen-like current | brake active | still not charging | no faults | pass/fail |
| 4 | `SET_MODE CHARGING` | speed 0, current<0, charging | charging values | stopped | charging on | no faults | pass/fail |
| 5 | `SET_MODE FULL` | speed 0, near-zero current, full | topped-off | stopped | full state | no faults | pass/fail |
| 6 | `SET_MODE FAULT` | fault state, flags set | alert visible | non-normal state | fault state | fault flags shown | pass/fail |
| 7 | `FAULT_CLEAR` | returns to idle traits | alerts clear | normal | not charging | faults clear | pass/fail |

## Common Fail Signatures

- Charging shown during BRAKE/REGEN because current is negative.
- Ride screen stuck at zero speed in RIDE.
- Fault appears on only one screen.
- Old fault alert persists after `FAULT_CLEAR`.
- Stale/lost logic differs between screens.
- Invalid packets replacing `latest` in global state.
