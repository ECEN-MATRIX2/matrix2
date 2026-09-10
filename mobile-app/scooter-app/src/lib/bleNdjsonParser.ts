import { createBleLineBuffer } from "./bleTelemetryBuffer";

export type BleNdjsonLogCode = "bad_json" | "invalid_schema" | "dropped_packet";

export type BleNdjsonLogEvent = {
  code: BleNdjsonLogCode;
  line: string;
  message: string;
};

export type BleNdjsonParser<TPacket> = {
  consumeChunk: (chunk: string) => TPacket[];
  getRemainingBuffer: () => string;
  resetBuffer: () => void;
};

type BleNdjsonParserOptions<TPacket> = {
  validatePacket: (value: unknown) => TPacket | null;
  onLog?: (event: BleNdjsonLogEvent) => void;
};

function emitLog(onLog: ((event: BleNdjsonLogEvent) => void) | undefined, event: BleNdjsonLogEvent) {
  onLog?.(event);
}

export function createBleNdjsonParser<TPacket>(
  options: BleNdjsonParserOptions<TPacket>
): BleNdjsonParser<TPacket> {
  const lineBuffer = createBleLineBuffer();

  const consumeChunk = (chunk: string): TPacket[] => {
    const packets: TPacket[] = [];

    for (const line of lineBuffer.consumeBleChunk(chunk)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        emitLog(options.onLog, {
          code: "bad_json",
          line,
          message: "BLE packet is not valid JSON.",
        });
        emitLog(options.onLog, {
          code: "dropped_packet",
          line,
          message: "Dropped BLE packet due to JSON parse failure.",
        });
        continue;
      }

      const packet = options.validatePacket(parsed);
      if (!packet) {
        emitLog(options.onLog, {
          code: "invalid_schema",
          line,
          message: "BLE packet JSON failed schema validation.",
        });
        emitLog(options.onLog, {
          code: "dropped_packet",
          line,
          message: "Dropped BLE packet due to schema validation failure.",
        });
        continue;
      }

      packets.push(packet);
    }

    return packets;
  };

  return {
    consumeChunk,
    getRemainingBuffer: lineBuffer.getRemainingBuffer,
    resetBuffer: lineBuffer.resetBuffer,
  };
}
