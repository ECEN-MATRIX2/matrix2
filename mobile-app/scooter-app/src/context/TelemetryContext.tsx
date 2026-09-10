import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePause } from "./PauseContext";
import { useRideSession } from "./RideSessionContext";
import { createMockTelemetrySource } from "../services/mockTelemetrySource";
import { TelemetrySnapshot } from "../types/telemetry";
import type { TelemetryV1 } from "../lib/telemetryValidation";

export type ConnectionState = "disconnected" | "connecting" | "connected";

export type SharedTelemetryState = {
  latest: TelemetryV1 | null;
  lastPacketReceivedAtMs: number | null;
  connectionState: ConnectionState;
  isStale: boolean;
  isTelemetryLost: boolean;
  linkHealthMessage: string;
  linkHealthTone: "ok" | "warn" | "bad";
  activeAlerts: string[];
  setConnectionState: (next: ConnectionState) => void;
  applyTelemetryPacket: (pkt: TelemetryV1) => void;
  markDisconnected: () => void;
  recomputeFreshness: (nowMs: number) => void;
};

type TelemetryContextType = {
  telemetry: TelemetrySnapshot;
  telemetryState: SharedTelemetryState;
};

const TelemetryContext = createContext<TelemetryContextType | null>(null);

function buildActiveAlerts(args: {
  latest: TelemetryV1 | null;
  isStale: boolean;
  isTelemetryLost: boolean;
  connectionState: ConnectionState;
}): string[] {
  const alerts: string[] = [];

  if (args.isStale && !args.isTelemetryLost) alerts.push("Telemetry stale");
  if (args.isTelemetryLost) alerts.push("Telemetry lost");
  if (args.connectionState === "disconnected") alerts.push("Device disconnected");
  if (args.latest?.brake_active) alerts.push("Brake active");
  if (args.latest && !args.latest.gnss_fix) alerts.push("No GNSS fix");

  return Array.from(new Set(alerts));
}

function buildLinkHealth(args: {
  connectionState: ConnectionState;
  isStale: boolean;
  isTelemetryLost: boolean;
}): { message: string; tone: "ok" | "warn" | "bad" } {
  if (args.connectionState === "disconnected") {
    return { message: "Device disconnected", tone: "bad" };
  }
  if (args.isTelemetryLost) {
    return { message: "Telemetry lost", tone: "bad" };
  }
  if (args.isStale) {
    return { message: "Telemetry stale", tone: "warn" };
  }
  return { message: "Telemetry fresh", tone: "ok" };
}

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const { isPaused } = usePause();
  const { captureTelemetryForRide } = useRideSession();
  const source = useMemo(() => createMockTelemetrySource(), []);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(source.getSnapshot());

  const [latest, setLatest] = useState<TelemetryV1 | null>(null);
  const [lastPacketReceivedAtMs, setLastPacketReceivedAtMs] = useState<number | null>(null);
  const [connectionState, setConnectionStateRaw] = useState<ConnectionState>("disconnected");
  const [isStale, setIsStale] = useState(false);
  const [isTelemetryLost, setIsTelemetryLost] = useState(false);
  // Keep stable hook order across Fast Refresh edits.
  const [_linkHealthMessageState] = useState("Device disconnected");
  const [_linkHealthToneState] = useState<"ok" | "warn" | "bad">("bad");
  const [_activeAlertsState] = useState<string[]>([]);

  const setConnectionState = useCallback(
    (next: ConnectionState) => {
      setConnectionStateRaw(next);
      if (next === "disconnected") {
        setIsTelemetryLost(true);
      } else if (lastPacketReceivedAtMs === null) {
        setIsTelemetryLost(false);
      }
    },
    [lastPacketReceivedAtMs]
  );

  const applyTelemetryPacket = useCallback(
    (pkt: TelemetryV1) => {
      const nowMs = Date.now();
      setLatest(pkt);
      setLastPacketReceivedAtMs(nowMs);
      setIsStale(false);
      setIsTelemetryLost(false);
      captureTelemetryForRide(pkt);
    },
    [captureTelemetryForRide]
  );

  const markDisconnected = useCallback(() => {
    setConnectionStateRaw("disconnected");
    setIsTelemetryLost(true);
  }, []);

  const recomputeFreshness = useCallback(
    (nowMs: number) => {
      if (lastPacketReceivedAtMs === null) {
        if (isStale) setIsStale(false);
        const nextIsTelemetryLost = connectionState === "disconnected";
        if (isTelemetryLost !== nextIsTelemetryLost) {
          setIsTelemetryLost(nextIsTelemetryLost);
        }
        return;
      }

      const ageMs = nowMs - lastPacketReceivedAtMs;
      const nextIsStale = ageMs >= 3000;
      const nextIsTelemetryLost = ageMs >= 5000 || connectionState === "disconnected";

      if (isStale !== nextIsStale) setIsStale(nextIsStale);
      if (isTelemetryLost !== nextIsTelemetryLost) setIsTelemetryLost(nextIsTelemetryLost);
    },
    [connectionState, isStale, isTelemetryLost, lastPacketReceivedAtMs]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      recomputeFreshness(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [recomputeFreshness]);

  useEffect(() => {
    if (isPaused) return;
    return source.start((snapshot) => {
      setTelemetry(snapshot);
    });
  }, [isPaused, source]);

  const linkHealth = useMemo(
    () =>
      buildLinkHealth({
        connectionState,
        isStale,
        isTelemetryLost,
      }),
    [connectionState, isStale, isTelemetryLost]
  );

  const activeAlerts = useMemo(
    () =>
      buildActiveAlerts({
        latest,
        isStale,
        isTelemetryLost,
        connectionState,
      }),
    [connectionState, isStale, isTelemetryLost, latest]
  );

  const telemetryState = useMemo<SharedTelemetryState>(
    () => ({
      latest,
      lastPacketReceivedAtMs,
      connectionState,
      isStale,
      isTelemetryLost,
      linkHealthMessage: linkHealth.message,
      linkHealthTone: linkHealth.tone,
      activeAlerts,
      setConnectionState,
      applyTelemetryPacket,
      markDisconnected,
      recomputeFreshness,
    }),
    [
      activeAlerts,
      applyTelemetryPacket,
      connectionState,
      isStale,
      isTelemetryLost,
      linkHealth,
      lastPacketReceivedAtMs,
      latest,
      markDisconnected,
      recomputeFreshness,
      setConnectionState,
    ]
  );

  return (
    <TelemetryContext.Provider value={{ telemetry, telemetryState }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error("useTelemetry must be used within TelemetryProvider");
  return ctx;
}
