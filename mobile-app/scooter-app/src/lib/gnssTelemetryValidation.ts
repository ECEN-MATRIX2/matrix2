export interface GnssTelemetryPacket {
  /** Monotonic device timestamp in milliseconds from the ESP32 session start. */
  ts_ms: number;
  /** True when the receiver currently has a valid position fix. */
  gnss_fix: boolean;
  /** Latitude in decimal degrees (WGS84). May be null when no fix is available. */
  lat: number | null;
  /** Longitude in decimal degrees (WGS84). May be null when no fix is available. */
  lng: number | null;
  /** Altitude in meters above mean sea level. May be null if unavailable. */
  alt_m: number | null;
  /** Ground speed in kilometers per hour. May be null if unavailable. */
  speed_kph: number | null;
  /** Number of satellites used/tracked for the current GNSS solution. */
  sats: number;
  /** Horizontal dilution of precision. Lower is better. May be null if unavailable. */
  hdop: number | null;
  /** UTC date in ISO format: YYYY-MM-DD. */
  date: string;
  /** UTC time in 24-hour format: HH:mm:ss. */
  time_utc: string;
}

const GNSS_PACKET_KEYS: Array<keyof GnssTelemetryPacket> = [
  "ts_ms",
  "gnss_fix",
  "lat",
  "lng",
  "alt_m",
  "speed_kph",
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function normalizeGnssPacket(value: unknown): Record<string, unknown> | null {
  if (!isObjectRecord(value)) return null;
  const packet = { ...value };

  // Backward-compatible alias from custom firmware payloads.
  if (!Object.prototype.hasOwnProperty.call(packet, "speed_kph")) {
    packet.speed_kph = packet.gnss_speed_kph;
  }

  return packet;
}

function hasAllGnssKeys(packet: Record<string, unknown>): boolean {
  return GNSS_PACKET_KEYS.every((key) => Object.prototype.hasOwnProperty.call(packet, key));
}

function hasValidLatLngByFixState(packet: Record<string, unknown>): boolean {
  const { gnss_fix, lat, lng } = packet;

  if (gnss_fix === true) {
    return isFiniteNumber(lat) && isFiniteNumber(lng);
  }

  if (gnss_fix === false) {
    return isFiniteNumberOrNull(lat) && isFiniteNumberOrNull(lng);
  }

  return false;
}

export function isGnssTelemetryPacket(value: unknown): value is GnssTelemetryPacket {
  const packet = normalizeGnssPacket(value);
  if (!packet) return false;
  if (!hasAllGnssKeys(packet)) return false;

  if (typeof packet.gnss_fix !== "boolean") return false;

  return (
    isFiniteNumber(packet.ts_ms) &&
    packet.ts_ms >= 0 &&
    hasValidLatLngByFixState(packet) &&
    isFiniteNumberOrNull(packet.alt_m) &&
    isFiniteNumberOrNull(packet.speed_kph) &&
    Number.isInteger(packet.sats) &&
    (packet.sats as number) >= 0 &&
    isFiniteNumberOrNull(packet.hdop) &&
    typeof packet.date === "string" &&
    ISO_DATE_REGEX.test(packet.date) &&
    typeof packet.time_utc === "string" &&
    UTC_TIME_REGEX.test(packet.time_utc)
  );
}

/**
 * Runtime-safe parser for already JSON-parsed GNSS telemetry.
 * Returns a fully validated packet or null when invalid.
 */
export function validateGnssTelemetryPacket(value: unknown): GnssTelemetryPacket | null {
  const normalized = normalizeGnssPacket(value);
  if (!normalized || !isGnssTelemetryPacket(normalized)) return null;
  return {
    ts_ms: normalized.ts_ms as number,
    gnss_fix: normalized.gnss_fix as boolean,
    lat: normalized.lat as number | null,
    lng: normalized.lng as number | null,
    alt_m: normalized.alt_m as number | null,
    speed_kph: normalized.speed_kph as number | null,
    sats: normalized.sats as number,
    hdop: normalized.hdop as number | null,
    date: normalized.date as string,
    time_utc: normalized.time_utc as string,
  };
}

/**
 * Parses one newline-delimited JSON line from BLE and validates it.
 */
export function parseGnssTelemetryLine(line: string): GnssTelemetryPacket | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const tryParse = (value: string): unknown | null => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const normalizeParsed = (value: unknown): unknown | null => {
    if (typeof value !== "string") return value;

    const secondPass = tryParse(value.trim());
    if (secondPass !== null) return secondPass;
    return null;
  };

  const direct = tryParse(trimmed);
  const normalizedDirect = normalizeParsed(direct);
  if (normalizedDirect !== null) {
    return validateGnssTelemetryPacket(normalizedDirect);
  }

  // Fallback for framed lines like: "RX: {...}" or similar wrappers.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const jsonSlice = trimmed.slice(firstBrace, lastBrace + 1);
    const sliced = tryParse(jsonSlice);
    const normalizedSliced = normalizeParsed(sliced);
    if (normalizedSliced !== null) {
      return validateGnssTelemetryPacket(normalizedSliced);
    }
  }

  return null;
}
