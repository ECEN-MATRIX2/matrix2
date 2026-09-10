export type { TelemetryPacket as CustomReaderTelemetryPacket } from "./telemetryValidation";
export {
  isTelemetryV1 as isCustomReaderTelemetryPacket,
  parseTelemetryV1Line as parseCustomReaderTelemetryLine,
} from "./telemetryValidation";
