import {
  createBleNdjsonParser,
  type BleNdjsonLogEvent,
  type BleNdjsonParser,
} from "./bleNdjsonParser";
import {
  type GnssTelemetryPacket,
  validateGnssTelemetryPacket,
} from "./gnssTelemetryValidation";

type BleGnssTelemetryParserOptions = {
  onLog?: (event: BleNdjsonLogEvent) => void;
};

function defaultGnssLog(event: BleNdjsonLogEvent): void {
  if (!__DEV__) return;
  console.warn(`[BLE GNSS][${event.code}] ${event.message} line=${event.line}`);
}

export type BleGnssTelemetryParser = BleNdjsonParser<GnssTelemetryPacket>;

export function createBleGnssTelemetryParser(
  options: BleGnssTelemetryParserOptions = {}
): BleGnssTelemetryParser {
  const onLog = options.onLog ?? defaultGnssLog;

  return createBleNdjsonParser<GnssTelemetryPacket>({
    validatePacket: validateGnssTelemetryPacket,
    onLog,
  });
}
