import type { BleNdjsonLogEvent } from "./bleNdjsonParser";
import type { GnssTelemetryPacket } from "./gnssTelemetryValidation";

export type GnssTelemetryStreamState = {
  latestPacket: GnssTelemetryPacket | null;
  lastPacketReceivedAtMs: number | null;
  validPacketCount: number;
  badJsonCount: number;
  invalidSchemaCount: number;
  droppedPacketCount: number;
  lastDroppedLine: string | null;
};

export const INITIAL_GNSS_TELEMETRY_STREAM_STATE: GnssTelemetryStreamState = {
  latestPacket: null,
  lastPacketReceivedAtMs: null,
  validPacketCount: 0,
  badJsonCount: 0,
  invalidSchemaCount: 0,
  droppedPacketCount: 0,
  lastDroppedLine: null,
};

export function applyGnssPacketsToState(
  state: GnssTelemetryStreamState,
  packets: GnssTelemetryPacket[],
  receivedAtMs: number = Date.now()
): GnssTelemetryStreamState {
  if (packets.length === 0) return state;

  return {
    ...state,
    latestPacket: packets[packets.length - 1],
    lastPacketReceivedAtMs: receivedAtMs,
    validPacketCount: state.validPacketCount + packets.length,
  };
}

export function applyGnssParserLogToState(
  state: GnssTelemetryStreamState,
  event: BleNdjsonLogEvent
): GnssTelemetryStreamState {
  if (event.code === "bad_json") {
    return {
      ...state,
      badJsonCount: state.badJsonCount + 1,
      lastDroppedLine: event.line,
    };
  }

  if (event.code === "invalid_schema") {
    return {
      ...state,
      invalidSchemaCount: state.invalidSchemaCount + 1,
      lastDroppedLine: event.line,
    };
  }

  return {
    ...state,
    droppedPacketCount: state.droppedPacketCount + 1,
    lastDroppedLine: event.line,
  };
}
