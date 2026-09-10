import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, Device } from "react-native-ble-plx";
import { Buffer } from "buffer";
import type { Subscription } from "react-native-ble-plx";
import { usePause } from "./PauseContext";
import { useTelemetry, type ConnectionState } from "./TelemetryContext";
import { createBleLineBuffer } from "../lib/bleTelemetryBuffer";
import { parseTelemetryV1Line, type TelemetryV1 } from "../lib/telemetryValidation";
import {
  parseGnssTelemetryLine,
  type GnssTelemetryPacket,
  validateGnssTelemetryPacket,
} from "../lib/gnssTelemetryValidation";
import { getLastScooterId, saveLastScooterId } from "../lib/cache";

const DEVICE_NAME = "ESP32_MATRIX2";
const TARGET_ID = "";
const NUS_SERVICE = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const NUS_RX_CHAR = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";
const NUS_TX_CHAR = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
const DEBUG_SAMPLE_TELEMETRY_V1_LINE =
  '{"ts_ms":444800,"vsense_adc_v":0.000,"curr_out_v":0.000,"board_temp_f":85.71,"wheel_speed_mph":0.00,"speed_hall_raw":1,"brake_active":false,"gnss_fix":false,"lat":null,"lng":null,"alt_m":null,"gnss_speed_kph":null,"sats":0,"hdop":25.50,"date":"2026-04-14","time_utc":"09:32:43"}';
const VSENSE_R_TOP_OHM = 1_000_000;
const VSENSE_R_BOTTOM_OHM = 51_000;
const VSENSE_DIVIDER_SCALE = (VSENSE_R_TOP_OHM + VSENSE_R_BOTTOM_OHM) / VSENSE_R_BOTTOM_OHM;
const BLE_EVENT_LOG_LIMIT = 120;
const RX_LINE_HISTORY_LIMIT = 80;

export type ScannedBleDevice = {
  id: string;
  name: string;
  rssi: number | null;
  isTarget: boolean;
};

type ConnectionContextType = {
  connectionState: ConnectionState;
  connectedSeconds: number;
  isScanning: boolean;
  scanStatus: string;
  latestTelemetry: TelemetryV1 | null;
  latestGnssTelemetry: GnssTelemetryPacket | null;
  latestBrakeActive: boolean | null;
  latestBoardTempF: number | null;
  latestWheelSpeedMph: number | null;
  latestVsenseAdcV: number | null;
  latestCurrOutV: number | null;
  scooterState: string;
  targetName: string;
  discoveredDevices: ScannedBleDevice[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendCommand: (command: string) => Promise<void>;
  injectDebugTelemetryV1Sample: () => void;
};

type BleDebugContextType = {
  latestRx: string;
  latestRxLine: string;
  latestRawLine: string;
  parseErrorCount: number;
  lastPacketValid: boolean;
  bleEventLog: string[];
};

const ConnectionContext = createContext<ConnectionContextType | null>(null);
const BleDebugContext = createContext<BleDebugContextType | null>(null);

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const granted = PermissionsAndroid.RESULTS.GRANTED;
  const api = Number(Platform.Version);

  if (api >= 31) {
    const res = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return (
      res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === granted &&
      res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === granted
    );
  }

  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return res === granted;
}

function normalizeId(id?: string | null): string {
  return (id ?? "").toLowerCase().replace(/:/g, "");
}

function normalizeName(name?: string | null): string {
  return (name ?? "").toUpperCase().replace(/[\s_-]+/g, "");
}

function isTargetNameMatch(name?: string | null): boolean {
  const candidate = normalizeName(name);
  if (!candidate) return false;
  const target = normalizeName(DEVICE_NAME);
  return candidate === target || candidate.includes(target) || target.includes(candidate);
}

async function waitForBluetoothPoweredOn(manager: BleManager, timeoutMs: number): Promise<boolean> {
  try {
    const state = await manager.state();
    if (state === "PoweredOn") return true;
  } catch {}

  return await new Promise<boolean>((resolve) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      sub.remove();
      resolve(false);
    }, timeoutMs);

    const sub = manager.onStateChange((state) => {
      if (state !== "PoweredOn" || done) return;
      done = true;
      clearTimeout(timeout);
      sub.remove();
      resolve(true);
    }, true);
  });
}

function describeBleError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const maybe = error as {
      message?: unknown;
      reason?: unknown;
      errorCode?: unknown;
      attErrorCode?: unknown;
      androidErrorCode?: unknown;
    };
    const details = [
      maybe.message,
      maybe.reason,
      maybe.errorCode,
      maybe.attErrorCode,
      maybe.androidErrorCode,
    ]
      .filter((v) => v !== undefined && v !== null)
      .map((v) => String(v));
    if (details.length > 0) return details.join(" | ");
  }
  return "Unknown BLE error";
}

function parseBrakeActiveFromLine(line: string): boolean | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const fromRegex = trimmed.match(/"brake_active"\s*:\s*(true|false)/i);
  if (fromRegex) {
    return fromRegex[1].toLowerCase() === "true";
  }

  try {
    const parsed = JSON.parse(trimmed) as { brake_active?: unknown };
    if (typeof parsed.brake_active === "boolean") {
      return parsed.brake_active;
    }

    // Fallback for framed lines like `RX: {...}`.
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as {
        brake_active?: unknown;
      };
      if (typeof sliced.brake_active === "boolean") return sliced.brake_active;
    }

    return null;
  } catch {
    return null;
  }
}

function parseBrakeActiveFromChunk(chunk: string): boolean | null {
  let match: RegExpExecArray | null = null;
  const regex = /"brake_active"\s*:\s*(true|false)/gi;
  let latest: boolean | null = null;

  // Keep the last value seen in the chunk so we track newest packet state.
  while (true) {
    match = regex.exec(chunk);
    if (!match) break;
    latest = match[1].toLowerCase() === "true";
  }

  return latest;
}

function parseBoardTempFFromLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const fromRegex = trimmed.match(/"board_temp_f"\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if (fromRegex) {
    const value = Number(fromRegex[1]);
    if (Number.isFinite(value)) return value;
  }

  try {
    const parsed = JSON.parse(trimmed) as { board_temp_f?: unknown };
    if (typeof parsed.board_temp_f === "number" && Number.isFinite(parsed.board_temp_f)) {
      return parsed.board_temp_f;
    }
    return null;
  } catch {
    return null;
  }
}

function parseBoardTempFFromChunk(chunk: string): number | null {
  let match: RegExpExecArray | null = null;
  const regex = /"board_temp_f"\s*:\s*(-?\d+(?:\.\d+)?)/gi;
  let latest: number | null = null;

  while (true) {
    match = regex.exec(chunk);
    if (!match) break;
    const value = Number(match[1]);
    if (Number.isFinite(value)) latest = value;
  }

  return latest;
}

function parseWheelSpeedMphFromLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const fromRegex = trimmed.match(/"wheel_speed_mph"\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if (fromRegex) {
    const value = Number(fromRegex[1]);
    if (Number.isFinite(value)) return value;
  }

  try {
    const parsed = JSON.parse(trimmed) as { wheel_speed_mph?: unknown };
    if (typeof parsed.wheel_speed_mph === "number" && Number.isFinite(parsed.wheel_speed_mph)) {
      return parsed.wheel_speed_mph;
    }
    return null;
  } catch {
    return null;
  }
}

function parseWheelSpeedMphFromChunk(chunk: string): number | null {
  let match: RegExpExecArray | null = null;
  const regex = /"wheel_speed_mph"\s*:\s*(-?\d+(?:\.\d+)?)/gi;
  let latest: number | null = null;

  while (true) {
    match = regex.exec(chunk);
    if (!match) break;
    const value = Number(match[1]);
    if (Number.isFinite(value)) latest = value;
  }

  return latest;
}

function parseVsenseAdcVFromLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const fromRegex = trimmed.match(/"vsense_adc_v"\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if (fromRegex) {
    const value = Number(fromRegex[1]);
    if (Number.isFinite(value)) return value;
  }

  try {
    const parsed = JSON.parse(trimmed) as { vsense_adc_v?: unknown };
    if (typeof parsed.vsense_adc_v === "number" && Number.isFinite(parsed.vsense_adc_v)) {
      return parsed.vsense_adc_v;
    }
    return null;
  } catch {
    return null;
  }
}

function parseVsenseAdcVFromChunk(chunk: string): number | null {
  let match: RegExpExecArray | null = null;
  const regex = /"vsense_adc_v"\s*:\s*(-?\d+(?:\.\d+)?)/gi;
  let latest: number | null = null;

  while (true) {
    match = regex.exec(chunk);
    if (!match) break;
    const value = Number(match[1]);
    if (Number.isFinite(value)) latest = value;
  }

  return latest;
}

function parseCurrOutVFromLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const fromRegex = trimmed.match(/"curr_out_v"\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if (fromRegex) {
    const value = Number(fromRegex[1]);
    if (Number.isFinite(value)) return value;
  }

  try {
    const parsed = JSON.parse(trimmed) as { curr_out_v?: unknown };
    if (typeof parsed.curr_out_v === "number" && Number.isFinite(parsed.curr_out_v)) {
      return parsed.curr_out_v;
    }
    return null;
  } catch {
    return null;
  }
}

function parseCurrOutVFromChunk(chunk: string): number | null {
  let match: RegExpExecArray | null = null;
  const regex = /"curr_out_v"\s*:\s*(-?\d+(?:\.\d+)?)/gi;
  let latest: number | null = null;

  while (true) {
    match = regex.exec(chunk);
    if (!match) break;
    const value = Number(match[1]);
    if (Number.isFinite(value)) latest = value;
  }

  return latest;
}

function parseGnssTelemetryFromChunk(chunk: string): GnssTelemetryPacket | null {
  const matches = chunk.match(/\{[^{}]*"gnss_fix"[^{}]*\}/g);
  if (!matches || matches.length === 0) return null;
  const candidate = matches[matches.length - 1];
  return parseGnssTelemetryLine(candidate);
}

function formatUtcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function formatUtcTime(now: Date): string {
  return now.toISOString().slice(11, 19);
}

function parseLooseGnssTelemetryFromText(text: string): GnssTelemetryPacket | null {
  const candidateMatches = text.match(/\{[^{}]*"gnss_fix"[^{}]*\}/g);
  const candidate = candidateMatches?.[candidateMatches.length - 1] ?? text;
  if (!candidate.includes("\"gnss_fix\"")) return null;

  const boolMatch = candidate.match(/"gnss_fix"\s*:\s*(true|false)/i);
  if (!boolMatch) return null;

  const numberField = (name: string): number | null => {
    const m = candidate.match(new RegExp(`"${name}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };

  const stringField = (name: string): string | null => {
    const m = candidate.match(new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`, "i"));
    if (!m) return null;
    return m[1];
  };

  const now = new Date();
  const gnssFix = boolMatch[1].toLowerCase() === "true";
  const lat = numberField("lat");
  const lng = numberField("lng");
  const fallbackPacket = {
    ts_ms: numberField("ts_ms") ?? Date.now(),
    gnss_fix: gnssFix && typeof lat === "number" && typeof lng === "number",
    lat: typeof lat === "number" ? lat : null,
    lng: typeof lng === "number" ? lng : null,
    alt_m: numberField("alt_m"),
    speed_kph: numberField("speed_kph") ?? numberField("gnss_speed_kph"),
    sats: Math.max(0, Math.trunc(numberField("sats") ?? 0)),
    hdop: numberField("hdop"),
    date: stringField("date") || formatUtcDate(now),
    time_utc: stringField("time_utc") || formatUtcTime(now),
  };

  return validateGnssTelemetryPacket(fallbackPacket);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modeFromCommand(command: string): string | null {
  const normalized = command.trim().toUpperCase();
  if (normalized.startsWith("SET_MODE ")) {
    return normalized.replace("SET_MODE ", "").trim() || null;
  }
  if (normalized === "FAULT_CLEAR") return "IDLE";
  return null;
}

function modeFromPacket(packet: TelemetryV1): string | null {
  const speedMph = packet.wheel_speed_mph;
  const voltage = packet.vsense_adc_v;
  const current = packet.curr_out_v;

  if (packet.brake_active) return "BRAKE";
  if (speedMph > 0) return "RIDE";
  if (speedMph === 0 && voltage > 0 && current > 0) return "CHARGING";
  return "IDLE";
}

function toVsenseInputVoltage(vsenseAdcV: number): number {
  return vsenseAdcV * VSENSE_DIVIDER_SCALE;
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const { isPaused } = usePause();
  const { telemetryState } = useTelemetry();
  const manager = useMemo(() => new BleManager(), []);
  const {
    connectionState,
    latest: latestTelemetry,
    setConnectionState,
    applyTelemetryPacket,
    markDisconnected,
  } = telemetryState;
  const [connectedSeconds, setConnectedSeconds] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("Idle");
  const [latestRx, setLatestRx] = useState("");
  const [latestRxLine, setLatestRxLine] = useState("");
  const [latestRawLine, setLatestRawLine] = useState("");
  const [parseErrorCount, setParseErrorCount] = useState(0);
  const [lastPacketValid, setLastPacketValid] = useState(false);
  const [latestGnssTelemetry, setLatestGnssTelemetry] = useState<GnssTelemetryPacket | null>(null);
  const [latestBrakeActive, setLatestBrakeActive] = useState<boolean | null>(null);
  const [latestBoardTempF, setLatestBoardTempF] = useState<number | null>(null);
  const [latestWheelSpeedMph, setLatestWheelSpeedMph] = useState<number | null>(null);
  const [latestVsenseAdcV, setLatestVsenseAdcV] = useState<number | null>(null);
  const [latestCurrOutV, setLatestCurrOutV] = useState<number | null>(null);
  const [scooterState, setScooterState] = useState("IDLE");
  const [bleEventLog, setBleEventLog] = useState<string[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<ScannedBleDevice[]>([]);
  const [lastScooterId, setLastScooterId] = useState<string | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const notifSubRef = useRef<Subscription | null>(null);
  const lineBufferRef = useRef(createBleLineBuffer());
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false);
  const hasAttemptedAutoConnectRef = useRef(false);

  const addBleLog = useCallback((message: string) => {
    const stamp = new Date().toLocaleTimeString();
    setBleEventLog((prev) => [`[${stamp}] ${message}`, ...prev].slice(0, BLE_EVENT_LOG_LIMIT));
  }, []);

  useEffect(() => {
    void getLastScooterId()
      .then((cachedId) => {
        if (!cachedId) return;
        setLastScooterId(cachedId);
        addBleLog(`Cached scooter id: ${cachedId}`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (connectionState !== "connected" || isPaused) return;
    const timer = setInterval(() => setConnectedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [connectionState, isPaused]);

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      try {
        manager.stopDeviceScan();
      } catch {}
      notifSubRef.current?.remove();
      notifSubRef.current = null;
      if (deviceRef.current) {
        deviceRef.current.cancelConnection().catch(() => {});
        deviceRef.current = null;
      }
      manager.destroy();
    };
  }, [manager]);

  const connect = useCallback(async () => {
    if (isPaused || isConnectingRef.current || connectionState === "connected") return;

    const ok = await requestBlePermissions();
    if (!ok) {
      setConnectionState("disconnected");
      setIsScanning(false);
      setScanStatus("Bluetooth permissions denied");
      return;
    }

    const bluetoothReady = await waitForBluetoothPoweredOn(manager, 8000);
    if (!bluetoothReady) {
      setConnectionState("disconnected");
      setIsScanning(false);
      setScanStatus("Bluetooth is off. Turn Bluetooth on, then try again.");
      addBleLog("Bluetooth adapter not powered on");
      return;
    }

    setConnectionState("connecting");
    setIsScanning(true);
    setScanStatus(
      lastScooterId
        ? `Scanning for target "${DEVICE_NAME}" (last: ${lastScooterId})...`
        : `Scanning for target device "${DEVICE_NAME}"...`
    );
    setDiscoveredDevices([]);
    setLatestRx("");
    setLatestRxLine("");
    setLatestRawLine("");
    setLatestGnssTelemetry(null);
    setLatestBrakeActive(null);
    setLatestBoardTempF(null);
    setLatestWheelSpeedMph(null);
    setLatestVsenseAdcV(null);
    setLatestCurrOutV(null);
    setParseErrorCount(0);
    setLastPacketValid(false);
    lineBufferRef.current.resetBuffer();
    addBleLog(`Scanning for target device "${DEVICE_NAME}"`);
    isConnectingRef.current = false;

    try {
      manager.stopDeviceScan();
    } catch {}
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    scanTimeoutRef.current = setTimeout(() => {
      try {
        manager.stopDeviceScan();
      } catch {}
      isConnectingRef.current = false;
      hasAttemptedAutoConnectRef.current = false;
      setIsScanning(false);
      setScanStatus(`Scan timeout: "${DEVICE_NAME}" not found`);
      addBleLog(`Scan timeout: "${DEVICE_NAME}" not found`);
      markDisconnected();
      scanTimeoutRef.current = null;
    }, 15000);

    manager.startDeviceScan(null, null, async (err, dev) => {
      if (err) {
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = null;
        }
        isConnectingRef.current = false;
        hasAttemptedAutoConnectRef.current = false;
        setIsScanning(false);
        setScanStatus(`Scan error: ${err.message}`);
        addBleLog(`Scan error: ${err.message}`);
        markDisconnected();
        return;
      }
      if (!dev || isConnectingRef.current) return;

      const foundName = dev.name ?? dev.localName;
      const isTarget =
        isTargetNameMatch(foundName) ||
        (TARGET_ID.trim().length > 0 && normalizeId(dev.id) === normalizeId(TARGET_ID));

      setDiscoveredDevices((prev) => {
        const next: ScannedBleDevice = {
          id: dev.id,
          name: foundName ?? "Unknown",
          rssi: dev.rssi ?? null,
          isTarget,
        };
        const withoutCurrent = prev.filter((d) => d.id !== dev.id);
        return [next, ...withoutCurrent].slice(0, 12);
      });

      if (!isTarget) return;

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      try {
        manager.stopDeviceScan();
      } catch {}
      isConnectingRef.current = true;
      setIsScanning(false);
      setScanStatus(`Found BLE device. Connecting to ${foundName ?? dev.id}...`);
      addBleLog(`Found ${foundName ?? dev.id}. Connecting...`);

      try {
        let connectedDevice: Device | null = null;
        let lastConnectError = "Connect failed";
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            addBleLog(`Connect attempt ${attempt}/2`);
            const attemptDevice = await manager.connectToDevice(dev.id, {
              timeout: 12000,
              autoConnect: false,
            });
            if (Platform.OS === "android") {
              try {
                await manager.requestMTUForDevice(attemptDevice.id, 185);
                addBleLog("Requested MTU 185");
              } catch (mtuError) {
                addBleLog(`MTU request skipped: ${describeBleError(mtuError)}`);
              }
            }
            connectedDevice = attemptDevice;
            break;
          } catch (connectError) {
            lastConnectError = describeBleError(connectError);
            addBleLog(`Connect attempt ${attempt} failed: ${lastConnectError}`);
            try {
              await dev.cancelConnection();
            } catch {}
            if (attempt < 2) await wait(350);
          }
        }

        if (!connectedDevice) {
          throw new Error(lastConnectError);
        }

        await connectedDevice.discoverAllServicesAndCharacteristics();
        notifSubRef.current?.remove();
        notifSubRef.current = connectedDevice.monitorCharacteristicForService(
          NUS_SERVICE,
          NUS_TX_CHAR,
          (notifyErr, ch) => {
            if (notifyErr) {
              addBleLog(`TX notify error: ${notifyErr.message}`);
              return;
            }
            if (!ch?.value) return;
            try {
              const chunk = Buffer.from(ch.value, "base64")
                .toString("utf8")
                .replace(/\0/g, "");
              if (!chunk) return;

              const brakeFromChunk = parseBrakeActiveFromChunk(chunk);
              if (typeof brakeFromChunk === "boolean") {
                setLatestBrakeActive(brakeFromChunk);
              }
              const tempFromChunk = parseBoardTempFFromChunk(chunk);
              if (typeof tempFromChunk === "number") {
                setLatestBoardTempF(tempFromChunk);
              }
              const speedFromChunk = parseWheelSpeedMphFromChunk(chunk);
              if (typeof speedFromChunk === "number") {
                setLatestWheelSpeedMph(speedFromChunk);
              }
              const vsenseFromChunk = parseVsenseAdcVFromChunk(chunk);
              if (typeof vsenseFromChunk === "number") {
                setLatestVsenseAdcV(toVsenseInputVoltage(vsenseFromChunk));
              }
              const currOutFromChunk = parseCurrOutVFromChunk(chunk);
              if (typeof currOutFromChunk === "number") {
                setLatestCurrOutV(currOutFromChunk);
              }
              const gnssFromChunk = parseGnssTelemetryFromChunk(chunk);
              if (gnssFromChunk) {
                setLatestGnssTelemetry(gnssFromChunk);
              } else {
                const looseGnssFromChunk = parseLooseGnssTelemetryFromText(chunk);
                if (looseGnssFromChunk) {
                  setLatestGnssTelemetry(looseGnssFromChunk);
                }
              }

              const lines = lineBufferRef.current.consumeBleChunk(chunk);
              for (const line of lines) {
                const brakeActive = parseBrakeActiveFromLine(line);
                if (typeof brakeActive === "boolean") {
                  setLatestBrakeActive(brakeActive);
                }
                const boardTempF = parseBoardTempFFromLine(line);
                if (typeof boardTempF === "number") {
                  setLatestBoardTempF(boardTempF);
                }
                const wheelSpeedMph = parseWheelSpeedMphFromLine(line);
                if (typeof wheelSpeedMph === "number") {
                  setLatestWheelSpeedMph(wheelSpeedMph);
                }
                const vsenseAdcV = parseVsenseAdcVFromLine(line);
                if (typeof vsenseAdcV === "number") {
                  setLatestVsenseAdcV(toVsenseInputVoltage(vsenseAdcV));
                }
                const currOutV = parseCurrOutVFromLine(line);
                if (typeof currOutV === "number") {
                  setLatestCurrOutV(currOutV);
                }
                const gnssPacket = parseGnssTelemetryLine(line);
                if (gnssPacket) {
                  setLatestGnssTelemetry(gnssPacket);
                } else {
                  const looseGnssPacket = parseLooseGnssTelemetryFromText(line);
                  if (looseGnssPacket) {
                    setLatestGnssTelemetry(looseGnssPacket);
                  }
                }

                const telemetryPacket = parseTelemetryV1Line(line);
                if (telemetryPacket) {
                  const appTelemetryPacket: TelemetryV1 = {
                    ...telemetryPacket,
                    vsense_adc_v: toVsenseInputVoltage(telemetryPacket.vsense_adc_v),
                  };
                  const packetLine = JSON.stringify(appTelemetryPacket);
                  setLatestRawLine(line);
                  setLatestRxLine(packetLine);
                  setLatestRx((prev) => {
                    const merged = prev ? `${prev}\n${packetLine}` : packetLine;
                    const limited = merged.split("\n").slice(-RX_LINE_HISTORY_LIMIT);
                    return limited.join("\n");
                  });
                  applyTelemetryPacket(appTelemetryPacket);
                  const rxMode = modeFromPacket(appTelemetryPacket);
                  if (rxMode) setScooterState(rxMode);
                  setLastPacketValid(true);
                  continue;
                }

                setLastPacketValid(false);
                setParseErrorCount((count) => count + 1);
                if (__DEV__) {
                  console.warn(`[BLE telemetry] dropped invalid line: ${line}`);
                }
              }

              if (lineBufferRef.current.getRemainingBuffer().length > 2048) {
                addBleLog("RX buffer overflow guard triggered; clearing partial data");
                lineBufferRef.current.resetBuffer();
              }
            } catch {
              addBleLog("RX decode failed");
            }
          }
        );
        deviceRef.current = connectedDevice;
        setLastScooterId(dev.id);
        void saveLastScooterId(dev.id).catch(() => {});
        setConnectedSeconds(0);
        setConnectionState("connected");
        setScanStatus(`Connected to ${foundName ?? dev.id}`);
        addBleLog(`Connected to ${foundName ?? dev.id}`);

        connectedDevice.onDisconnected(() => {
          isConnectingRef.current = false;
          hasAttemptedAutoConnectRef.current = false;
          notifSubRef.current?.remove();
          notifSubRef.current = null;
          lineBufferRef.current.resetBuffer();
          deviceRef.current = null;
          setIsScanning(false);
          setScanStatus("Disconnected");
          markDisconnected();
          setConnectedSeconds(0);
          addBleLog("Disconnected");
        });
        isConnectingRef.current = false;
      } catch (connectFlowError) {
        const reason = describeBleError(connectFlowError);
        isConnectingRef.current = false;
        hasAttemptedAutoConnectRef.current = false;
        notifSubRef.current?.remove();
        notifSubRef.current = null;
        lineBufferRef.current.resetBuffer();
        deviceRef.current = null;
        setIsScanning(false);
        setScanStatus(`Connect failed: ${reason}`);
        addBleLog(`Connect failed: ${reason}`);
        markDisconnected();
      }
    });
  }, [
    applyTelemetryPacket,
    connectionState,
    isPaused,
    lastScooterId,
    manager,
    markDisconnected,
    setConnectionState,
    addBleLog,
  ]);

  useEffect(() => {
    if (hasAttemptedAutoConnectRef.current) return;
    if (isPaused) return;
    if (connectionState !== "disconnected") return;

    hasAttemptedAutoConnectRef.current = true;
    const timer = setTimeout(() => {
      void connect();
    }, 300);

    return () => clearTimeout(timer);
  }, [connectionState, isPaused]);

  const disconnect = useCallback(async () => {
    if (isPaused) return;
    // Manual disconnect: do not auto-reconnect until user explicitly reconnects.
    hasAttemptedAutoConnectRef.current = true;
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    try {
      manager.stopDeviceScan();
    } catch {}
    isConnectingRef.current = false;
    setIsScanning(false);
    setScanStatus("Disconnected");
    notifSubRef.current?.remove();
    notifSubRef.current = null;
    lineBufferRef.current.resetBuffer();

    if (deviceRef.current) {
      try {
        await deviceRef.current.cancelConnection();
      } catch {}
      deviceRef.current = null;
    }

    markDisconnected();
    setConnectedSeconds(0);
  }, [connectionState, isPaused, manager, markDisconnected]);

  const sendCommand = useCallback(async (command: string) => {
    const device = deviceRef.current;
    if (!device || connectionState !== "connected") {
      throw new Error("Not connected");
    }

    const line = command.endsWith("\n") ? command : `${command}\n`;
    const commandMode = modeFromCommand(line);
    if (commandMode) {
      setScooterState(commandMode);
    }
    const payload = Buffer.from(line, "utf8").toString("base64");
    try {
      await device.writeCharacteristicWithoutResponseForService(
        NUS_SERVICE,
        NUS_RX_CHAR,
        payload
      );
      addBleLog(`TX: ${line.trim()}`);
    } catch {
      await device.writeCharacteristicWithResponseForService(
        NUS_SERVICE,
        NUS_RX_CHAR,
        payload
      );
      addBleLog(`TX (with response): ${line.trim()}`);
    }
  }, [connectionState, addBleLog]);

  const injectDebugTelemetryV1Sample = useCallback(() => {
    if (!__DEV__) return;
    const sample = parseTelemetryV1Line(DEBUG_SAMPLE_TELEMETRY_V1_LINE);
    if (!sample) return;
    const appSample: TelemetryV1 = {
      ...sample,
      vsense_adc_v: toVsenseInputVoltage(sample.vsense_adc_v),
    };

    setLatestRawLine(DEBUG_SAMPLE_TELEMETRY_V1_LINE);
    setLatestRxLine(JSON.stringify(appSample));
    setLatestRx((prev) => {
      const merged = prev
        ? `${prev}\n${JSON.stringify(appSample)}`
        : JSON.stringify(appSample);
      return merged.split("\n").slice(-RX_LINE_HISTORY_LIMIT).join("\n");
    });
    setLatestVsenseAdcV(appSample.vsense_adc_v);
    applyTelemetryPacket(appSample);
    setLastPacketValid(true);
    const rxMode = modeFromPacket(appSample);
    if (rxMode) setScooterState(rxMode);
    addBleLog("DEBUG: injected TelemetryV1 sample packet");
  }, [applyTelemetryPacket, addBleLog]);

  const connectionValue = useMemo<ConnectionContextType>(
    () => ({
      connectionState,
      connectedSeconds,
      isScanning,
      scanStatus,
      latestTelemetry,
      latestGnssTelemetry,
      latestBrakeActive,
      latestBoardTempF,
      latestWheelSpeedMph,
      latestVsenseAdcV,
      latestCurrOutV,
      scooterState,
      targetName: DEVICE_NAME,
      discoveredDevices,
      connect,
      disconnect,
      sendCommand,
      injectDebugTelemetryV1Sample,
    }),
    [
      connectionState,
      connectedSeconds,
      isScanning,
      scanStatus,
      latestTelemetry,
      latestGnssTelemetry,
      latestBrakeActive,
      latestBoardTempF,
      latestWheelSpeedMph,
      latestVsenseAdcV,
      latestCurrOutV,
      scooterState,
      discoveredDevices,
      connect,
      disconnect,
      sendCommand,
      injectDebugTelemetryV1Sample,
    ]
  );

  const debugValue = useMemo<BleDebugContextType>(
    () => ({
      latestRx,
      latestRxLine,
      latestRawLine,
      parseErrorCount,
      lastPacketValid,
      bleEventLog,
    }),
    [latestRx, latestRxLine, latestRawLine, parseErrorCount, lastPacketValid, bleEventLog]
  );

  return (
    <ConnectionContext.Provider value={connectionValue}>
      <BleDebugContext.Provider value={debugValue}>
        {children}
      </BleDebugContext.Provider>
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}

export function useBleDebug() {
  const ctx = useContext(BleDebugContext);
  if (!ctx) throw new Error("useBleDebug must be used within ConnectionProvider");
  return ctx;
}
