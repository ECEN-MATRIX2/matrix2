import {
  computeGnssFreshness,
  hasValidGnssFix,
  isReturningToFollowMode,
  shouldAutoCenterMap,
  shouldRefreshReverseGeocode,
  shouldShowLiveMarker,
  type ReverseGeocodeCoordinate,
} from "./gnssLocationUtils";
import { parseGnssTelemetryLine } from "./gnssTelemetryValidation";
import { createNominatimReverseGeocoder } from "../services/reverseGeocoding";

describe("GNSS location edge-case helpers", () => {
  const validPacketLine =
    '{"ts_ms":1305000,"gnss_fix":true,"lat":29.763045,"lng":-95.706335,"alt_m":32.2,"speed_kph":0,"sats":6,"hdop":2.8,"date":"2026-04-12","time_utc":"06:35:36"}';

  test("valid fix with good coordinates is accepted", () => {
    const packet = parseGnssTelemetryLine(validPacketLine);
    expect(packet).not.toBeNull();
    expect(hasValidGnssFix(packet)).toBe(true);
    expect(shouldShowLiveMarker({ packet, connectionFreshness: "fresh" })).toBe(true);
  });

  test("no-fix with null coordinates is valid contract but not a live marker", () => {
    const packet = parseGnssTelemetryLine(
      '{"ts_ms":1305001,"gnss_fix":false,"lat":null,"lng":null,"alt_m":null,"speed_kph":null,"sats":3,"hdop":null,"date":"2026-04-12","time_utc":"06:35:37"}'
    );
    expect(packet).not.toBeNull();
    expect(hasValidGnssFix(packet)).toBe(false);
    expect(shouldShowLiveMarker({ packet, connectionFreshness: "fresh" })).toBe(false);
  });

  test("malformed or incomplete JSON line safely returns null", () => {
    expect(parseGnssTelemetryLine('{"ts_ms":1305002')).toBeNull();
    expect(parseGnssTelemetryLine('{"ts_ms":1305002,"gnss_fix":true}')).toBeNull();
  });

  test("stale data and telemetry-lost/disconnected freshness are computed correctly", () => {
    const lastUpdateMs = 1000;
    expect(computeGnssFreshness(lastUpdateMs, 2000).connectionFreshness).toBe("fresh");
    expect(computeGnssFreshness(lastUpdateMs, 4100).connectionFreshness).toBe("stale");
    expect(computeGnssFreshness(lastUpdateMs, 6200).connectionFreshness).toBe("lost");
    expect(computeGnssFreshness(lastUpdateMs, 6200).isTelemetryLost).toBe(true);
    expect(computeGnssFreshness(null, 6200).connectionFreshness).toBe("lost");
  });

  test("reverse geocoder failure surfaces error path", async () => {
    const geocoder = createNominatimReverseGeocoder({
      fetchImpl: async () =>
        ({
          ok: false,
          status: 503,
          json: async () => ({}),
        } as Response),
    });

    await expect(
      geocoder.reverseGeocode({ lat: 29.763045, lng: -95.706335 })
    ).rejects.toThrow("Reverse geocoding request failed");
  });

  test("reverse geocode refresh is skipped for near-identical coordinates until interval passes", () => {
    const coordA: ReverseGeocodeCoordinate = { lat: 29.763045, lng: -95.706335 };
    const coordB: ReverseGeocodeCoordinate = { lat: 29.763046, lng: -95.706336 };

    const shouldSkip = shouldRefreshReverseGeocode({
      nowMs: 20_000,
      coordinate: coordB,
      lastSuccess: { coordinate: coordA, atMs: 10_000 },
      lastAttempt: { coordinate: coordA, atMs: 12_000 },
      minMoveMeters: 35,
      refreshMs: 90_000,
      minRequestGapMs: 15_000,
    });
    expect(shouldSkip).toBe(false);

    const shouldRefreshByTime = shouldRefreshReverseGeocode({
      nowMs: 120_000,
      coordinate: coordB,
      lastSuccess: { coordinate: coordA, atMs: 10_000 },
      lastAttempt: { coordinate: coordA, atMs: 90_000 },
      minMoveMeters: 35,
      refreshMs: 90_000,
      minRequestGapMs: 15_000,
    });
    expect(shouldRefreshByTime).toBe(true);
  });

  test("follow/look-around switching helpers are deterministic", () => {
    expect(shouldAutoCenterMap("follow")).toBe(true);
    expect(shouldAutoCenterMap("look_around")).toBe(false);
    expect(isReturningToFollowMode("look_around", "follow")).toBe(true);
    expect(isReturningToFollowMode("follow", "look_around")).toBe(false);
  });
});
