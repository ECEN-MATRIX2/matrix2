import { TelemetrySnapshot } from "../types/telemetry";

export type TelemetryUpdateCallback = (snapshot: TelemetrySnapshot) => void;

export interface TelemetrySource {
  getSnapshot(): TelemetrySnapshot;
  start(onUpdate: TelemetryUpdateCallback): () => void;
}

// TODO(BLE): Add a real BLE telemetry source that implements TelemetrySource
// and maps ESP32 packets into TelemetrySnapshot.
