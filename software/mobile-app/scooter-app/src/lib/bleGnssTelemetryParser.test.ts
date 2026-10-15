import { createBleGnssTelemetryParser } from "./bleGnssTelemetryParser";
import {
  INITIAL_GNSS_TELEMETRY_STREAM_STATE,
  applyGnssPacketsToState,
  applyGnssParserLogToState,
} from "./gnssTelemetryStreamState";
import type { BleNdjsonLogEvent } from "./bleNdjsonParser";

describe("BLE GNSS telemetry parser", () => {
  const validGnssPacket = {
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

  test("buffers partial chunks until newline and parses complete lines only", () => {
    const parser = createBleGnssTelemetryParser({ onLog: () => {} });
    const line = JSON.stringify(validGnssPacket);

    expect(parser.consumeChunk(line.slice(0, 24))).toEqual([]);
    expect(parser.getRemainingBuffer().length).toBeGreaterThan(0);
    expect(parser.consumeChunk(`${line.slice(24)}\n`)).toEqual([validGnssPacket]);
    expect(parser.getRemainingBuffer()).toBe("");
  });

  test("returns only valid GNSS packets and drops malformed lines safely", () => {
    const logs: BleNdjsonLogEvent[] = [];
    const parser = createBleGnssTelemetryParser({
      onLog: (event) => logs.push(event),
    });

    const badJson = '{"ts_ms":202001';
    const invalidSchema = JSON.stringify({
      ts_ms: 202001,
      gnss_fix: true,
      lat: "29.7",
      lng: -95.7,
      alt_m: 96.9,
      speed_kph: 0,
      sats: 7,
      hdop: 3.6,
      date: "2026-04-10",
      time_utc: "14:45:32",
    });

    const out = parser.consumeChunk(
      `${JSON.stringify(validGnssPacket)}\n${badJson}\n${invalidSchema}\n${JSON.stringify(
        validGnssPacket
      )}\n`
    );

    expect(out).toEqual([validGnssPacket, validGnssPacket]);
    expect(logs.map((entry) => entry.code)).toEqual([
      "bad_json",
      "dropped_packet",
      "invalid_schema",
      "dropped_packet",
    ]);
  });

  test("supports stream state updates for valid and dropped packets", () => {
    const logs: BleNdjsonLogEvent[] = [];
    const parser = createBleGnssTelemetryParser({
      onLog: (event) => logs.push(event),
    });

    const packets = parser.consumeChunk(
      `${JSON.stringify(validGnssPacket)}\n{"bad":\n${JSON.stringify({
        ...validGnssPacket,
        lat: "bad",
      })}\n`
    );

    let state = INITIAL_GNSS_TELEMETRY_STREAM_STATE;
    state = applyGnssPacketsToState(state, packets, 1234);
    for (const event of logs) {
      state = applyGnssParserLogToState(state, event);
    }

    expect(state.latestPacket).toEqual(validGnssPacket);
    expect(state.lastPacketReceivedAtMs).toBe(1234);
    expect(state.validPacketCount).toBe(1);
    expect(state.badJsonCount).toBe(1);
    expect(state.invalidSchemaCount).toBe(1);
    expect(state.droppedPacketCount).toBe(2);
  });
});
