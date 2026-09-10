import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { TelemetryV1 } from "../lib/telemetryValidation";
import {
  computeSessionSummaryFromSamples,
  createSession,
  insertSessionSample,
  finalizeSession,
} from "../db/sessions";

const MPH_TO_KPH = 1.60934;

function fahrenheitToCelsius(tempF: number): number {
  return ((tempF - 32) * 5) / 9;
}

type RideSessionPacket = {
  session_id: string;
  received_at: string;
  telemetry: TelemetryV1;
};

type RideSession = {
  session_id: string;
  sessionStartTime: string;
  sessionEndTime: string | null;
  packetCount: number;
};

type RideSessionContextType = {
  isRideActive: boolean;
  currentRide: RideSession | null;
  lastCompletedRide: RideSession | null;
  startRide: () => void;
  stopRide: () => void;
  captureTelemetryForRide: (pkt: TelemetryV1) => void;
};

const RideSessionContext = createContext<RideSessionContextType | null>(null);

function buildSessionId(): string {
  const now = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `session_${now}_${random}`;
}

export function RideSessionProvider({ children }: { children: ReactNode }) {
  const [currentRide, setCurrentRide] = useState<RideSession | null>(null);
  const [lastCompletedRide, setLastCompletedRide] = useState<RideSession | null>(null);
  const [activeRidePackets, setActiveRidePackets] = useState<RideSessionPacket[]>([]);

  const startRide = useCallback(() => {
    const sessionId = buildSessionId();
    const sessionStartTime = new Date().toISOString();

    createSession(sessionId, sessionStartTime);

    const nextRide: RideSession = {
      session_id: sessionId,
      sessionStartTime,
      sessionEndTime: null,
      packetCount: 0,
    };
    setActiveRidePackets([]);
    setCurrentRide(nextRide);
  }, []);

  const stopRide = useCallback(() => {
    const endTime = new Date().toISOString();

    setCurrentRide((prev) => {
      if (!prev) return null;

      try {
        const summary = computeSessionSummaryFromSamples(
          prev.session_id,
          prev.sessionStartTime,
          endTime
        );
        finalizeSession(prev.session_id, endTime, summary);
      } catch (error) {
        console.error("[session] stop/finalize failed", error);
      }

      const finalizedRide: RideSession = {
        ...prev,
        sessionEndTime: endTime,
      };

      setLastCompletedRide(finalizedRide);
      setActiveRidePackets([]);
      return null;
    });
  }, []);

  const captureTelemetryForRide = useCallback((pkt: TelemetryV1) => {
    setCurrentRide((prev) => {
      if (!prev) return prev;

      insertSessionSample(prev.session_id, {
        ts_ms: pkt.ts_ms,
        pack_voltage_v: pkt.vsense_adc_v,
        // Current parser currently exposes curr_out_v; this maps directly for now.
        pack_current_a: pkt.curr_out_v,
        board_temp_c: fahrenheitToCelsius(pkt.board_temp_f),
        board_temp_f: pkt.board_temp_f,
        wheel_speed_kph: pkt.wheel_speed_mph * MPH_TO_KPH,
        wheel_speed_mph: pkt.wheel_speed_mph,
        brake_active: pkt.brake_active,
        gnss_fix: pkt.gnss_fix,
        lat: pkt.lat,
        lng: pkt.lng,
        alt_m: pkt.alt_m,
        gnss_speed_kph: pkt.gnss_speed_kph,
        sats: pkt.sats,
        hdop: pkt.hdop,
        date: pkt.date,
        time_utc: pkt.time_utc,
        charging_state: pkt.wheel_speed_mph > 0 ? "discharging" : "idle",
        fault_flags: [],
      });

      const nextPacket: RideSessionPacket = {
        session_id: prev.session_id,
        received_at: new Date().toISOString(),
        telemetry: pkt,
      };

      setActiveRidePackets((packets) => [...packets, nextPacket]);
      return { ...prev, packetCount: prev.packetCount + 1 };
    });
  }, []);

  const value = useMemo<RideSessionContextType>(
    () => ({
      isRideActive: currentRide !== null,
      currentRide,
      lastCompletedRide,
      startRide,
      stopRide,
      captureTelemetryForRide,
    }),
    [captureTelemetryForRide, currentRide, lastCompletedRide, startRide, stopRide]
  );

  return <RideSessionContext.Provider value={value}>{children}</RideSessionContext.Provider>;
}

export function useRideSession() {
  const ctx = useContext(RideSessionContext);
  if (!ctx) throw new Error("useRideSession must be used within RideSessionProvider");
  return ctx;
}
