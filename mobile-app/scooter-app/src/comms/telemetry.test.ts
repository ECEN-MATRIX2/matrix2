import {
  parseTelemetryV1Line,
  type TelemetryV1,
} from "../lib/telemetryValidation";
import { createBleTelemetryBuffer } from "../lib/bleTelemetryBuffer";

describe("Unified telemetry parser", () => {
  const sampleTelemetry: TelemetryV1 = {
    ts_ms: 444800,
    vsense_adc_v: 0,
    curr_out_v: 0,
    board_temp_f: 85.71,
    wheel_speed_mph: 0,
    speed_hall_raw: 1,
    brake_active: false,
    gnss_fix: false,
    lat: null,
    lng: null,
    alt_m: null,
    gnss_speed_kph: null,
    sats: 0,
    hdop: 25.5,
    date: "2026-04-14",
    time_utc: "09:32:43",
  };
  const samplePacket = JSON.stringify(sampleTelemetry);

  test("valid full line with trailing newline parses to exactly one packet", () => {
    const parser = createBleTelemetryBuffer();
    expect(parser.consumeBleChunk(`${samplePacket}\n`)).toEqual([sampleTelemetry]);
  });

  test("partial chunk with no complete JSON object parses to zero packets", () => {
    const parser = createBleTelemetryBuffer();
    expect(parser.consumeBleChunk(samplePacket.slice(0, 20))).toEqual([]);
  });

  test("complete JSON object with no newline still parses", () => {
    const parser = createBleTelemetryBuffer();
    expect(parser.consumeBleChunk(samplePacket)).toEqual([sampleTelemetry]);
  });

  test("two packets in one chunk parses to two packets", () => {
    const parser = createBleTelemetryBuffer();
    expect(parser.consumeBleChunk(`${samplePacket}\n${samplePacket}\n`)).toEqual([
      sampleTelemetry,
      sampleTelemetry,
    ]);
  });

  test("invalid line is ignored", () => {
    const parser = createBleTelemetryBuffer();
    expect(parser.consumeBleChunk(`{bad json}\n${samplePacket}\n`)).toEqual([sampleTelemetry]);
  });

  test("wrong type such as brake_active string is ignored", () => {
    const parser = createBleTelemetryBuffer();
    const badType = JSON.stringify({
      ...sampleTelemetry,
      brake_active: "false",
    });
    expect(parser.consumeBleChunk(`${badType}\n${samplePacket}\n`)).toEqual([sampleTelemetry]);
  });

  test("missing required key is ignored", () => {
    const parser = createBleTelemetryBuffer();
    const { date, ...badPacket } = sampleTelemetry;
    void date;
    expect(parser.consumeBleChunk(`${JSON.stringify(badPacket)}\n${samplePacket}\n`)).toEqual([
      sampleTelemetry,
    ]);
  });

  test("standalone parser returns null for invalid line", () => {
    expect(parseTelemetryV1Line("{bad json}")).toBeNull();
  });
});
