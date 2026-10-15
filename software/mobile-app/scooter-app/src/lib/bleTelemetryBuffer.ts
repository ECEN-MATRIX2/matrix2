import type { TelemetryV1 } from "./telemetryValidation";
import { parseTelemetryV1Line } from "./telemetryValidation";

export type BleLineBuffer = {
  consumeBleChunk: (chunk: string) => string[];
  getRemainingBuffer: () => string;
  resetBuffer: () => void;
};

type BleTelemetryBufferOptions = {
  onInvalidLine?: (line: string) => void;
};

export type BleTelemetryBuffer = {
  consumeBleChunk: (chunk: string) => TelemetryV1[];
  getRemainingBuffer: () => string;
  resetBuffer: () => void;
};

function extractJsonObjectsFromBuffer(input: string): { objects: string[]; remainder: string } {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }

    if (ch === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(input.slice(start, i + 1));
        start = -1;
      }
    }
  }

  if (depth > 0 && start >= 0) {
    return { objects, remainder: input.slice(start) };
  }

  return { objects, remainder: "" };
}

export function createBleLineBuffer(): BleLineBuffer {
  let buffer = "";

  const consumeBleChunk = (chunk: string): string[] => {
    const merged = `${buffer}${chunk}`;
    const lines = merged.split(/\r\n|\n|\r/);
    buffer = lines.pop() ?? "";

    const normalizedLines = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (normalizedLines.length > 0) {
      return normalizedLines;
    }

    // Fallback: some firmware streams complete JSON objects without newline delimiters.
    const extracted = extractJsonObjectsFromBuffer(buffer);
    if (extracted.objects.length > 0) {
      buffer = extracted.remainder;
      return extracted.objects;
    }

    return [];
  };

  return {
    consumeBleChunk,
    getRemainingBuffer: () => buffer,
    resetBuffer: () => {
      buffer = "";
    },
  };
}

export function createBleTelemetryBuffer(options: BleTelemetryBufferOptions = {}): BleTelemetryBuffer {
  const lineBuffer = createBleLineBuffer();

  const consumeBleChunk = (chunk: string): TelemetryV1[] => {
    const packets: TelemetryV1[] = [];
    for (const line of lineBuffer.consumeBleChunk(chunk)) {
      const parsed = parseTelemetryV1Line(line);
      if (parsed) {
        packets.push(parsed);
      } else {
        options.onInvalidLine?.(line);
      }
    }

    return packets;
  };

  return {
    consumeBleChunk,
    getRemainingBuffer: lineBuffer.getRemainingBuffer,
    resetBuffer: lineBuffer.resetBuffer,
  };
}
