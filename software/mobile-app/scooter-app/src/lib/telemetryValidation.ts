export type TelemetryPacket = {
  ts_ms: number;
  vsense_adc_v: number;
  curr_out_v: number;
  board_temp_f: number;
  wheel_speed_mph: number;
  speed_hall_raw: number;
  brake_active: boolean;
  gnss_fix: boolean;
  lat: number | null;
  lng: number | null;
  alt_m: number | null;
  gnss_speed_kph: number | null;
  sats: number | null;
  hdop: number | null;
  date: string;
  time_utc: string;
};

// Backward-compatible alias while app code migrates naming.
export type TelemetryV1 = TelemetryPacket;

const TELEMETRY_KEYS: Array<keyof TelemetryPacket> = [
  "ts_ms",
  "vsense_adc_v",
  "curr_out_v",
  "board_temp_f",
  "wheel_speed_mph",
  "speed_hall_raw",
  "brake_active",
  "gnss_fix",
  "lat",
  "lng",
  "alt_m",
  "gnss_speed_kph",
  "sats",
  "hdop",
  "date",
  "time_utc",
];

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UTC_TIME_REGEX = /^\d{2}:\d{2}:\d{2}$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNonNegativeIntegerOrNull(value: unknown): value is number | null {
  if (value === null) return true;
  return Number.isInteger(value) && (value as number) >= 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function hasAllTelemetryKeys(packet: Record<string, unknown>): boolean {
  return TELEMETRY_KEYS.every((key) => Object.prototype.hasOwnProperty.call(packet, key));
}

function hasValidLatLngByFixState(packet: Record<string, unknown>): boolean {
  if (packet.gnss_fix === true) {
    return isFiniteNumber(packet.lat) && isFiniteNumber(packet.lng);
  }

  if (packet.gnss_fix === false) {
    return isFiniteNumberOrNull(packet.lat) && isFiniteNumberOrNull(packet.lng);
  }

  return false;
}

export function isTelemetryV1(value: unknown): value is TelemetryV1 {
  if (!isObjectRecord(value)) return false;
  if (!hasAllTelemetryKeys(value)) return false;

  const packet = value as Record<string, unknown>;

  return (
    isFiniteNumber(packet.ts_ms) &&
    packet.ts_ms >= 0 &&
    isFiniteNumber(packet.vsense_adc_v) &&
    isFiniteNumber(packet.curr_out_v) &&
    isFiniteNumber(packet.board_temp_f) &&
    isFiniteNumber(packet.wheel_speed_mph) &&
    Number.isInteger(packet.speed_hall_raw) &&
    typeof packet.brake_active === "boolean" &&
    typeof packet.gnss_fix === "boolean" &&
    hasValidLatLngByFixState(packet) &&
    isFiniteNumberOrNull(packet.alt_m) &&
    isFiniteNumberOrNull(packet.gnss_speed_kph) &&
    isNonNegativeIntegerOrNull(packet.sats) &&
    isFiniteNumberOrNull(packet.hdop) &&
    typeof packet.date === "string" &&
    ISO_DATE_REGEX.test(packet.date) &&
    typeof packet.time_utc === "string" &&
    UTC_TIME_REGEX.test(packet.time_utc)
  );
}

export function parseTelemetryV1Line(line: string): TelemetryV1 | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (!isTelemetryV1(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
