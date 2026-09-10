import { TelemetrySnapshot, EventLogItem, SecurityEvent } from "../types/telemetry";
import { TelemetrySource, TelemetryUpdateCallback } from "./telemetrySource";

const TICK_MS = 1000;
const BASE_LAT = 30.62183;
const BASE_LON = -96.34037;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function jitter(value: number, amplitude: number, min: number, max: number) {
  return clamp(value + (Math.random() * 2 - 1) * amplitude, min, max);
}

function nowIso() {
  return new Date().toISOString();
}

function pushEvent(list: EventLogItem[], next: EventLogItem, max = 12) {
  return [next, ...list].slice(0, max);
}

function pushSecurityEvent(list: SecurityEvent[], next: SecurityEvent, max = 8) {
  return [next, ...list].slice(0, max);
}

function formatInsight(snapshot: TelemetrySnapshot): string[] {
  const items: string[] = [];
  if (snapshot.batteryHealthScore >= 90) {
    items.push("Battery health looks stable today.");
  } else {
    items.push("Battery health trend should be watched this week.");
  }
  if (snapshot.chargingActive) {
    items.push("Charging conditions are safe.");
  } else {
    items.push("Scooter is ready for next ride cycle.");
  }
  if (snapshot.speedKmh > 22) {
    items.push("Ride behavior suggests Normal mode over Sport.");
  } else {
    items.push(`Ride behavior suggests ${snapshot.rideMode} mode.`);
  }
  if (snapshot.faultFlags.length === 0) {
    items.push("No abnormal system behavior detected.");
  } else {
    items.push("Fault signals detected; diagnostics review is recommended.");
  }
  return items;
}

function createInitialSnapshot(): TelemetrySnapshot {
  const timestamp = nowIso();
  return {
    timestamp,
    connectionStatus: "Offline",
    scooterOnline: false,
    soc: 82,
    batteryVoltage: 51.4,
    batteryCurrent: -2.1,
    power: -108,
    temperatureC: 31.2,
    speedKmh: 0,
    brakeActive: true,
    chargingActive: false,
    chargingStage: "Idle",
    elapsedChargeSeconds: 0,
    etaToFullMinutes: 64,
    sessionEnergyWh: 0,
    location: {
      latitude: BASE_LAT,
      longitude: BASE_LON,
      updatedAt: timestamp,
    },
    lockStatus: "Locked",
    geofenceStatus: "Inside",
    faultFlags: [],
    warnings: [],
    activeAlerts: [],
    eventLog: [
      {
        id: "evt-boot",
        category: "system",
        message: "Telemetry simulation started",
        timestamp,
      },
    ],
    securityEvents: [
      {
        id: "sec-0",
        message: "Scooter movement is consistent with authorized use",
        timestamp,
        severity: "info",
      },
    ],
    rideMode: "Normal",
    estimatedRangeKm: 39.2,
    maintenanceScore: 92,
    batteryHealthScore: 94,
    theftRiskLevel: "Low",
    chargingRecommendation: "Temperature is normal; standard charge rate recommended.",
    safetyStatus: "Safe",
    ai: {
      dashboardSummary: [
        "Battery health looks stable today.",
        "Charging conditions are safe.",
        "Ride behavior suggests Normal mode.",
        "No abnormal system behavior detected.",
      ],
      rideCoach: {
        suggestedMode: "Normal",
        reason: "Recent acceleration and braking are balanced for Normal mode.",
        observations: ["Steady throttle usage in the last 5 minutes."],
        tips: [
          "Maintain smooth starts to preserve battery efficiency.",
          "Use regen early before hard braking.",
        ],
        accelerationSmoothness: 86,
        efficiencyScore: 88,
      },
      charging: {
        mode: "Standard",
        efficiencyInsight: "Charge efficiency is within expected range.",
        safetyRecommendation: "Pack temperature is normal for charging.",
        batteryRecommendation: "Avoid repeated fast-charge sessions above 90%.",
      },
      theftProtection: {
        risk: "Low",
        summary: "No suspicious movement pattern detected while locked.",
        suspiciousMovement: false,
        trustedDeviceNearby: true,
        unauthorizedMovement: false,
      },
      predictiveMaintenance: {
        overallScore: 92,
        subsystemScores: {
          battery: 93,
          charging: 91,
          sensing: 94,
          thermal: 90,
          communications: 93,
        },
        recommendation: "System health is strong; continue routine checks.",
      },
      batteryHealth: {
        healthPercent: 94,
        degradationStatus: "Low observed degradation",
        trend: "Stable",
        summary: "Cell performance is balanced and within nominal limits.",
      },
      diagnosticsSummary:
        "Scooter systems are healthy overall with no urgent safety concerns.",
    },
  };
}

export class MockTelemetrySource implements TelemetrySource {
  private tick = 0;
  private eventCounter = 1;
  private state = createInitialSnapshot();
  private timer: ReturnType<typeof setInterval> | null = null;

  getSnapshot() {
    return this.state;
  }

  start(onUpdate: TelemetryUpdateCallback) {
    onUpdate(this.state);
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.tick += 1;
      this.state = this.advance(this.state);
      onUpdate(this.state);
    }, TICK_MS);

    return () => {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  private nextId(prefix: string) {
    this.eventCounter += 1;
    return `${prefix}-${this.eventCounter}`;
  }

  private advance(prev: TelemetrySnapshot): TelemetrySnapshot {
    const timestamp = nowIso();
    const cycle = this.tick % 180;
    const chargingWindow = cycle >= 85 && cycle <= 150 && prev.soc < 99;
    const chargingActive = chargingWindow;
    const lockStatus = chargingActive ? "Unlocked" : prev.speedKmh < 1.4 ? "Locked" : "Unlocked";

    const speedTarget = chargingActive ? 0 : 8 + Math.sin(this.tick / 7) * 10 + (Math.random() * 8 - 4);
    const speedKmh = clamp(jitter(speedTarget, 2.5, 0, 42), 0, 42);
    const brakeActive = speedKmh < 2 || Math.random() > 0.78;

    const batteryVoltage = jitter(prev.batteryVoltage, 0.08, 46, 54.5);
    const rideCurrent = -clamp(1.5 + speedKmh * 0.22 + Math.random() * 2.8, 0.4, 17);
    const chargeCurrent = clamp(3.8 + Math.random() * 3.4, 3.5, 8.2);
    const batteryCurrent = chargingActive ? chargeCurrent : rideCurrent;
    const power = Number((batteryVoltage * batteryCurrent).toFixed(1));

    let soc = prev.soc;
    let elapsedChargeSeconds = prev.elapsedChargeSeconds;
    let sessionEnergyWh = prev.sessionEnergyWh;

    if (chargingActive) {
      soc = clamp(soc + 0.045 + Math.random() * 0.02, 0, 100);
      elapsedChargeSeconds += 1;
      sessionEnergyWh += Math.max(0, power) / 3600;
    } else {
      soc = clamp(soc - (0.01 + speedKmh / 3000), 0, 100);
      elapsedChargeSeconds = 0;
      if (cycle < 15) {
        sessionEnergyWh = 0;
      }
    }

    const temperatureC = jitter(
      prev.temperatureC + Math.abs(batteryCurrent) * 0.01 - 0.03,
      0.22,
      26,
      49
    );

    const rideMode =
      speedKmh < 14 ? "Eco" : speedKmh < 29 ? "Normal" : "Sport";

    const estimatedRangeKm = clamp((soc / 100) * 58 - speedKmh * 0.09, 3, 60);
    const etaToFullMinutes = chargingActive
      ? Math.max(1, Math.round(((100 - soc) / 0.065)))
      : Math.round(((100 - soc) / 0.065));

    const chargingStage = chargingActive
      ? soc >= 96
        ? "Taper"
        : soc >= 88
          ? "Absorption"
          : "Bulk"
      : soc >= 99
        ? "Complete"
        : "Idle";

    const geofenceDrift = speedKmh > 2 ? 0.00015 : 0.00004;
    const latitude = prev.location.latitude + (Math.random() * 2 - 1) * geofenceDrift;
    const longitude = prev.location.longitude + (Math.random() * 2 - 1) * geofenceDrift;
    const distanceFromBase = Math.sqrt(
      Math.pow((latitude - BASE_LAT) * 111, 2) + Math.pow((longitude - BASE_LON) * 94, 2)
    );
    const geofenceStatus = distanceFromBase > 0.7 ? "Outside" : distanceFromBase > 0.45 ? "Boundary" : "Inside";

    const warnings: string[] = [];
    const faultFlags: string[] = [];
    if (temperatureC > 41) warnings.push("Overtemperature warning");
    if (Math.abs(batteryCurrent) > 15.5) warnings.push("Abnormal current spike");
    if (this.tick % 95 >= 38 && this.tick % 95 <= 42) faultFlags.push("Communication timeout");
    if (this.tick % 120 >= 66 && this.tick % 120 <= 72) faultFlags.push("Sensor disconnect");
    if (chargingActive && chargingStage === "Bulk" && temperatureC > 39) {
      warnings.push("Charging instability");
    }
    if (Math.random() > 0.985) faultFlags.push("Brake signal fault");

    const unauthorizedMovement = lockStatus === "Locked" && speedKmh > 2.2;
    const theftRiskLevel =
      unauthorizedMovement || geofenceStatus === "Outside"
        ? "High"
        : geofenceStatus === "Boundary"
          ? "Medium"
          : "Low";
    const trustedDeviceNearby = this.tick % 70 < 55;

    const safetyStatus =
      faultFlags.length > 0 ? "Critical" : warnings.length > 0 ? "Watch" : "Safe";

    const batteryHealthScore = clamp(
      95 - temperatureC * 0.11 - (faultFlags.length > 0 ? 3 : 0),
      76,
      98
    );
    const maintenanceScore = clamp(
      95 - warnings.length * 3 - faultFlags.length * 9 - Math.max(0, temperatureC - 37) * 0.8,
      58,
      99
    );

    const chargingRecommendation = chargingActive
      ? temperatureC > 40
        ? "Fast charging not recommended at elevated temperature."
        : soc > 93
          ? "Battery near full; taper charging recommended."
          : "Temperature is normal; standard charge rate recommended."
      : "Optimize for battery longevity by charging before 25% SOC.";

    let eventLog = prev.eventLog;
    let securityEvents = prev.securityEvents;
    if (this.tick % 20 === 0) {
      eventLog = pushEvent(eventLog, {
        id: this.nextId("evt"),
        category: chargingActive ? "charging" : "ride",
        message: chargingActive
          ? "Energy entering battery with stable current profile."
          : "Live ride telemetry refreshed.",
        timestamp,
      });
    }
    if (warnings.length > 0 && this.tick % 12 === 0) {
      eventLog = pushEvent(eventLog, {
        id: this.nextId("evt"),
        category: "safety",
        message: warnings[0],
        timestamp,
      });
    }
    if (faultFlags.length > 0 && this.tick % 8 === 0) {
      eventLog = pushEvent(eventLog, {
        id: this.nextId("evt"),
        category: "system",
        message: faultFlags[0],
        timestamp,
      });
    }
    if (unauthorizedMovement && this.tick % 6 === 0) {
      securityEvents = pushSecurityEvent(securityEvents, {
        id: this.nextId("sec"),
        message: "Unexpected movement detected while locked",
        timestamp,
        severity: "critical",
      });
    } else if (this.tick % 25 === 0) {
      securityEvents = pushSecurityEvent(securityEvents, {
        id: this.nextId("sec"),
        message:
          theftRiskLevel === "Low"
            ? "Scooter movement is consistent with authorized use"
            : "Location pattern is outside normal usage window",
        timestamp,
        severity: theftRiskLevel === "Low" ? "info" : "warning",
      });
    }

    const activeAlerts = [
      ...warnings.map((message) => ({
        id: `warn-${message}`,
        level: "warning" as const,
        title: "Warning",
        detail: message,
        timestamp,
      })),
      ...faultFlags.map((message) => ({
        id: `fault-${message}`,
        level: "critical" as const,
        title: "Fault",
        detail: message,
        timestamp,
      })),
    ].slice(0, 4);

    const snapshot: TelemetrySnapshot = {
      ...prev,
      timestamp,
      soc: Number(soc.toFixed(1)),
      batteryVoltage: Number(batteryVoltage.toFixed(2)),
      batteryCurrent: Number(batteryCurrent.toFixed(2)),
      power,
      temperatureC: Number(temperatureC.toFixed(1)),
      speedKmh: Number(speedKmh.toFixed(1)),
      brakeActive,
      chargingActive,
      chargingStage,
      elapsedChargeSeconds,
      etaToFullMinutes,
      sessionEnergyWh: Number(sessionEnergyWh.toFixed(1)),
      location: {
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
        updatedAt: timestamp,
      },
      lockStatus,
      geofenceStatus,
      warnings,
      faultFlags,
      activeAlerts,
      eventLog,
      securityEvents,
      rideMode,
      estimatedRangeKm: Number(estimatedRangeKm.toFixed(1)),
      maintenanceScore: Number(maintenanceScore.toFixed(0)),
      batteryHealthScore: Number(batteryHealthScore.toFixed(0)),
      theftRiskLevel,
      chargingRecommendation,
      safetyStatus,
      ai: {
        dashboardSummary: formatInsight({
          ...prev,
          soc,
          speedKmh,
          chargingActive,
          batteryHealthScore,
          rideMode,
          faultFlags,
        } as TelemetrySnapshot),
        rideCoach: {
          suggestedMode:
            speedKmh > 28 || warnings.some((w) => w.includes("current spike"))
              ? "Normal"
              : rideMode,
          reason:
            speedKmh > 28
              ? "Frequent high-speed bursts detected; Normal mode improves efficiency."
              : "Throttle and braking pattern aligns with efficient riding.",
          observations: [
            brakeActive ? "Frequent braking detected in recent interval." : "Braking is smooth and controlled.",
            speedKmh > 24 ? "Aggressive acceleration spikes observed." : "Acceleration profile is stable.",
            `Current efficiency trend: ${speedKmh > 24 ? "Moderate" : "Strong"}.`,
          ],
          tips: [
            "Ease into acceleration for smoother current draw.",
            "Use regenerative braking early approaching stops.",
            "Maintain steady throttle between 18-24 km/h for best range.",
          ],
          accelerationSmoothness: clamp(Math.round(93 - speedKmh * 1.2), 62, 95),
          efficiencyScore: clamp(Math.round(90 - speedKmh * 0.7 - warnings.length * 2), 58, 94),
        },
        charging: {
          mode:
            !chargingActive || temperatureC > 40
              ? "Taper"
              : soc < 85
                ? "Fast"
                : "Standard",
          efficiencyInsight:
            chargingActive && power > 320
              ? "High power flow with good conversion efficiency."
              : "Charging efficiency is within normal bounds.",
          safetyRecommendation:
            temperatureC > 40
              ? "Temperature elevated. Reduce charge rate and monitor thermal state."
              : "Temperature is normal; standard charge rate recommended.",
          batteryRecommendation:
            soc > 92
              ? "Battery near full; taper charging recommended."
              : "Optimize for battery longevity by avoiding prolonged 100% hold.",
        },
        theftProtection: {
          risk: theftRiskLevel,
          summary:
            theftRiskLevel === "High"
              ? "Unexpected movement or geofence anomaly detected."
              : theftRiskLevel === "Medium"
                ? "Movement pattern slightly outside normal behavior window."
                : "Scooter movement is consistent with authorized use.",
          suspiciousMovement: unauthorizedMovement,
          trustedDeviceNearby,
          unauthorizedMovement,
        },
        predictiveMaintenance: {
          overallScore: Math.round(maintenanceScore),
          subsystemScores: {
            battery: clamp(Math.round(batteryHealthScore - Math.max(0, temperatureC - 38) * 1.5), 55, 99),
            charging: clamp(Math.round(93 - (chargingActive && temperatureC > 39 ? 10 : 2)), 60, 98),
            sensing: clamp(Math.round(faultFlags.includes("Sensor disconnect") ? 64 : 92), 50, 97),
            thermal: clamp(Math.round(95 - Math.max(0, temperatureC - 34) * 3), 45, 97),
            communications: clamp(Math.round(faultFlags.includes("Communication timeout") ? 61 : 91), 50, 96),
          },
          recommendation:
            maintenanceScore < 75
              ? "Schedule inspection for thermal and communication systems soon."
              : "No immediate maintenance action required; continue routine checks.",
        },
        batteryHealth: {
          healthPercent: Math.round(batteryHealthScore),
          degradationStatus:
            batteryHealthScore > 90
              ? "Low observed degradation"
              : batteryHealthScore > 82
                ? "Moderate degradation signal"
                : "Elevated degradation risk",
          trend:
            batteryHealthScore > 90
              ? "Stable"
              : batteryHealthScore > 82
                ? "Watch"
                : "Declining",
          summary:
            batteryHealthScore > 90
              ? "Battery condition remains strong for current duty profile."
              : "Battery stress indicators suggest closer health monitoring.",
        },
        diagnosticsSummary:
          safetyStatus === "Critical"
            ? "Critical fault indicators are active. Limit operation and inspect subsystems."
            : safetyStatus === "Watch"
              ? "Scooter is operational with warnings. Monitor thermal/current behavior."
              : "All monitored subsystems are operating within expected limits.",
      },
    };

    return snapshot;
  }
}

export function createMockTelemetrySource() {
  return new MockTelemetrySource();
}
