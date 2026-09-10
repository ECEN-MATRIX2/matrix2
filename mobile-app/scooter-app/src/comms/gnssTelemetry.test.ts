import {
  isGnssTelemetryPacket,
  parseGnssTelemetryLine,
  validateGnssTelemetryPacket,
  type GnssTelemetryPacket,
} from "../lib/gnssTelemetryValidation";

describe("GNSS telemetry contract", () => {
  const fixedPacket: GnssTelemetryPacket = {
    ts_ms: 202000,
    gnss_fix: true,
    lat: 29.763051,
    lng: -95.706152,
    alt_m: 96.9,
    speed_kph: 0,
    sats: 7,
    hdop: 3.6,
    date: "2026-04-10",
    time_utc: "14:45:32",
  };

  test("accepts a full fixed packet", () => {
    expect(isGnssTelemetryPacket(fixedPacket)).toBe(true);
    expect(validateGnssTelemetryPacket(fixedPacket)).toEqual(fixedPacket);
  });

  test("allows lat/lng to be null when fix is false", () => {
    const noFixPacket: GnssTelemetryPacket = {
      ...fixedPacket,
      gnss_fix: false,
      lat: null,
      lng: null,
    };
    expect(isGnssTelemetryPacket(noFixPacket)).toBe(true);
  });

  test("requires lat/lng to be numbers when fix is true", () => {
    const badPacket = {
      ...fixedPacket,
      lat: null,
      lng: null,
    };
    expect(isGnssTelemetryPacket(badPacket)).toBe(false);
  });

  test("allows alt_m, speed_kph, and hdop to be null", () => {
    const partialPacket: GnssTelemetryPacket = {
      ...fixedPacket,
      alt_m: null,
      speed_kph: null,
      hdop: null,
    };
    expect(isGnssTelemetryPacket(partialPacket)).toBe(true);
  });

  test("rejects packets missing required keys", () => {
    const { time_utc, ...missingKey } = fixedPacket;
    void time_utc;
    expect(isGnssTelemetryPacket(missingKey)).toBe(false);
  });

  test("parses and validates newline-delimited JSON lines", () => {
    expect(parseGnssTelemetryLine(`${JSON.stringify(fixedPacket)}\n`)).toEqual(fixedPacket);
  });

  test("parses gnss_speed_kph alias from custom payloads", () => {
    const withAlias = {
      ...fixedPacket,
      gnss_speed_kph: fixedPacket.speed_kph,
    };
    const { speed_kph, ...withoutCanonical } = withAlias;
    expect(parseGnssTelemetryLine(`${JSON.stringify(withoutCanonical)}\n`)).toEqual(fixedPacket);
  });
});
