export type RideMode = "Eco" | "Normal" | "Sport";
export type SafetyStatus = "Safe" | "Watch" | "Critical";
export type TheftRiskLevel = "Low" | "Medium" | "High";
export type AlertLevel = "info" | "warning" | "critical";
export type DegradationTrend = "Stable" | "Watch" | "Declining";

export type TelemetryAlert = {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  timestamp: string;
};

export type EventLogItem = {
  id: string;
  category: "system" | "charging" | "ride" | "safety" | "security";
  message: string;
  timestamp: string;
};

export type SecurityEvent = {
  id: string;
  message: string;
  timestamp: string;
  severity: AlertLevel;
};

export type AiRideCoach = {
  suggestedMode: RideMode;
  reason: string;
  observations: string[];
  tips: string[];
  accelerationSmoothness: number;
  efficiencyScore: number;
};

export type ChargingInsight = {
  mode: "Standard" | "Fast" | "Taper";
  efficiencyInsight: string;
  safetyRecommendation: string;
  batteryRecommendation: string;
};

export type TheftProtectionInsight = {
  risk: TheftRiskLevel;
  summary: string;
  suspiciousMovement: boolean;
  trustedDeviceNearby: boolean;
  unauthorizedMovement: boolean;
};

export type PredictiveMaintenance = {
  overallScore: number;
  subsystemScores: {
    battery: number;
    charging: number;
    sensing: number;
    thermal: number;
    communications: number;
  };
  recommendation: string;
};

export type BatteryHealthEstimation = {
  healthPercent: number;
  degradationStatus: string;
  trend: DegradationTrend;
  summary: string;
};

export type AiInsights = {
  dashboardSummary: string[];
  rideCoach: AiRideCoach;
  charging: ChargingInsight;
  theftProtection: TheftProtectionInsight;
  predictiveMaintenance: PredictiveMaintenance;
  batteryHealth: BatteryHealthEstimation;
  diagnosticsSummary: string;
};

export type GnssLocation = {
  latitude: number;
  longitude: number;
  updatedAt: string;
};

export type TelemetrySnapshot = {
  timestamp: string;
  connectionStatus: "Offline" | "Connecting" | "Online";
  scooterOnline: boolean;
  soc: number;
  batteryVoltage: number;
  batteryCurrent: number;
  power: number;
  temperatureC: number;
  speedKmh: number;
  brakeActive: boolean;
  chargingActive: boolean;
  chargingStage: "Idle" | "Bulk" | "Absorption" | "Taper" | "Complete";
  elapsedChargeSeconds: number;
  etaToFullMinutes: number;
  sessionEnergyWh: number;
  location: GnssLocation;
  lockStatus: "Locked" | "Unlocked";
  geofenceStatus: "Inside" | "Boundary" | "Outside";
  faultFlags: string[];
  warnings: string[];
  activeAlerts: TelemetryAlert[];
  eventLog: EventLogItem[];
  securityEvents: SecurityEvent[];
  rideMode: RideMode;
  estimatedRangeKm: number;
  maintenanceScore: number;
  batteryHealthScore: number;
  theftRiskLevel: TheftRiskLevel;
  chargingRecommendation: string;
  safetyStatus: SafetyStatus;
  ai: AiInsights;
};
