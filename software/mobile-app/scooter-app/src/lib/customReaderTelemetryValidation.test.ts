import {
  isCustomReaderTelemetryPacket,
  parseCustomReaderTelemetryLine,
  type CustomReaderTelemetryPacket,
} from "./customReaderTelemetryValidation";

describe("custom reader telemetry parser", () => {
  const samplePacket: CustomReaderTelemetryPacket = {
    ts_ms: 258800,
    vsense_adc_v: 0,
    curr_out_v: 1.16,
    board_temp_f: 83.33,
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
    time_utc: "09:09:58",
  };

  test("accepts the sample payload shape", () => {
    expect(isCustomReaderTelemetryPacket(samplePacket)).toBe(true);
    expect(parseCustomReaderTelemetryLine(JSON.stringify(samplePacket))).toEqual(samplePacket);
  });

  test("rejects invalid packet types", () => {
    const badPacket = {
      ...samplePacket,
      speed_hall_raw: 1.5,
    };

    expect(isCustomReaderTelemetryPacket(badPacket)).toBe(false);
    expect(parseCustomReaderTelemetryLine(JSON.stringify(badPacket))).toBeNull();
  });
});
