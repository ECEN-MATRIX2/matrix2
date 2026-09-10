import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConnection } from "./ConnectionContext";
import { useTelemetry } from "./TelemetryContext";
import type { GnssTelemetryPacket } from "../lib/gnssTelemetryValidation";
import {
  createNominatimReverseGeocoder,
  type ReverseGeocodeCoordinate,
} from "../services/reverseGeocoding";
import {
  computeGnssFreshness,
  distanceBetweenCoordinatesMeters,
  shouldRefreshReverseGeocode,
} from "../lib/gnssLocationUtils";

export type GnssMapMode = "follow" | "look_around";
export type GnssConnectionFreshness = "fresh" | "stale" | "lost";

type GnssContextType = {
  latestPacket: GnssTelemetryPacket | null;
  lastUpdateTimestampMs: number | null;
  connectionFreshness: GnssConnectionFreshness;
  isStale: boolean;
  isTelemetryLost: boolean;
  reverseGeocodeAddress: string;
  isReverseGeocodeLoading: boolean;
  reverseGeocodeError: string | null;
  mapMode: GnssMapMode;
  shouldAutoCenter: boolean;
  setMapMode: (mode: GnssMapMode) => void;
  updateGnssPacket: (packet: GnssTelemetryPacket) => void;
  setReverseGeocodeAddress: (address: string) => void;
};

// Immediate reverse geocoding for live UX.
const REVERSE_GEOCODE_MIN_MOVE_METERS = 0;
// Keep updates close to telemetry cadence.
const REVERSE_GEOCODE_REFRESH_MS = 1000;
// Allow up to ~1 request/sec while moving.
const REVERSE_GEOCODE_MIN_REQUEST_GAP_MS = 1000;
// No debounce: fire immediately on fresh coordinates.
const REVERSE_GEOCODE_DEBOUNCE_MS = 0;
const REVERSE_GEOCODE_CACHE_TTL_MS = 10 * 60 * 1000;
const REVERSE_GEOCODE_CACHE_RADIUS_METERS = 30;

const GnssContext = createContext<GnssContextType | null>(null);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toValidCoordinate(packet: GnssTelemetryPacket | null): ReverseGeocodeCoordinate | null {
  if (!packet || packet.gnss_fix !== true) return null;
  if (!isFiniteNumber(packet.lat) || !isFiniteNumber(packet.lng)) return null;
  return { lat: packet.lat, lng: packet.lng };
}

function buildPacketFingerprint(packet: GnssTelemetryPacket): string {
  return [
    packet.ts_ms,
    packet.date,
    packet.time_utc,
    packet.gnss_fix,
    packet.lat ?? "null",
    packet.lng ?? "null",
    packet.alt_m ?? "null",
    packet.speed_kph ?? "null",
    packet.sats,
    packet.hdop ?? "null",
  ].join("|");
}

export function GnssProvider({ children }: { children: ReactNode }) {
  const { latestGnssTelemetry } = useConnection();
  const { telemetryState } = useTelemetry();
  const { latest: latestTelemetry } = telemetryState;
  const reverseGeocoder = useMemo(() => createNominatimReverseGeocoder(), []);
  const [latestPacket, setLatestPacket] = useState<GnssTelemetryPacket | null>(null);
  const [lastUpdateTimestampMs, setLastUpdateTimestampMs] = useState<number | null>(null);
  const [connectionFreshness, setConnectionFreshness] = useState<GnssConnectionFreshness>("lost");
  const [isStale, setIsStale] = useState(false);
  const [isTelemetryLost, setIsTelemetryLost] = useState(true);
  const [reverseGeocodeAddress, setReverseGeocodeAddressRaw] = useState("");
  const [isReverseGeocodeLoading, setIsReverseGeocodeLoading] = useState(false);
  const [reverseGeocodeError, setReverseGeocodeError] = useState<string | null>(null);
  const [mapMode, setMapModeRaw] = useState<GnssMapMode>("follow");
  const lastAppliedPacketFingerprintRef = useRef<string>("");
  const reverseGeocodeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseGeocodeRequestSeqRef = useRef(0);
  const lastGeocodeAttemptRef = useRef<{
    coordinate: ReverseGeocodeCoordinate;
    atMs: number;
  } | null>(null);
  const lastGeocodeSuccessRef = useRef<{
    coordinate: ReverseGeocodeCoordinate;
    label: string;
    atMs: number;
  } | null>(null);

  const refreshFreshness = useCallback((nowMs: number) => {
    const freshness = computeGnssFreshness(lastUpdateTimestampMs, nowMs);
    setConnectionFreshness(freshness.connectionFreshness);
    setIsStale(freshness.isStale);
    setIsTelemetryLost(freshness.isTelemetryLost);
  }, [lastUpdateTimestampMs]);

  const updateGnssPacket = useCallback((packet: GnssTelemetryPacket) => {
    setLatestPacket(packet);
    setLastUpdateTimestampMs(Date.now());
    setConnectionFreshness("fresh");
    setIsStale(false);
    setIsTelemetryLost(false);
  }, []);

  const setMapMode = useCallback((mode: GnssMapMode) => {
    setMapModeRaw(mode);
  }, []);

  const setReverseGeocodeAddress = useCallback((address: string) => {
    setReverseGeocodeAddressRaw(address);
    setReverseGeocodeError(null);
  }, []);

  const scheduleReverseGeocode = useCallback(
    (coordinate: ReverseGeocodeCoordinate) => {
      const nowMs = Date.now();
      const cached = lastGeocodeSuccessRef.current;
      if (cached) {
        const cacheAgeMs = nowMs - cached.atMs;
        const cacheDistanceM = distanceBetweenCoordinatesMeters(cached.coordinate, coordinate);
        if (
          cacheAgeMs <= REVERSE_GEOCODE_CACHE_TTL_MS &&
          cacheDistanceM <= REVERSE_GEOCODE_CACHE_RADIUS_METERS
        ) {
          setReverseGeocodeAddressRaw(cached.label);
          setReverseGeocodeError(null);
        }
      }

      const previousAttempt = lastGeocodeAttemptRef.current;
      const lastSuccess = lastGeocodeSuccessRef.current;
      if (!shouldRefreshReverseGeocode({
        nowMs,
        coordinate,
        lastSuccess,
        lastAttempt: previousAttempt,
        minMoveMeters: REVERSE_GEOCODE_MIN_MOVE_METERS,
        refreshMs: REVERSE_GEOCODE_REFRESH_MS,
        minRequestGapMs: REVERSE_GEOCODE_MIN_REQUEST_GAP_MS,
      })) {
        return;
      }

      const runReverseGeocode = () => {
        const requestId = reverseGeocodeRequestSeqRef.current + 1;
        reverseGeocodeRequestSeqRef.current = requestId;
        lastGeocodeAttemptRef.current = {
          coordinate,
          atMs: Date.now(),
        };

        setIsReverseGeocodeLoading(true);
        setReverseGeocodeError(null);

        void reverseGeocoder
          .reverseGeocode(coordinate)
          .then((result) => {
            if (requestId !== reverseGeocodeRequestSeqRef.current) return;
            if (!result?.label) {
              setReverseGeocodeError("Address unavailable for current coordinates.");
              return;
            }
            setReverseGeocodeAddressRaw(result.label);
            setReverseGeocodeError(null);
            lastGeocodeSuccessRef.current = {
              coordinate,
              label: result.label,
              atMs: Date.now(),
            };
          })
          .catch((error: unknown) => {
            if (requestId !== reverseGeocodeRequestSeqRef.current) return;
            const message =
              error instanceof Error && error.message
                ? error.message
                : "Reverse geocoding failed.";
            setReverseGeocodeError(message);
          })
          .finally(() => {
            if (requestId !== reverseGeocodeRequestSeqRef.current) return;
            setIsReverseGeocodeLoading(false);
          });
      };

      if (reverseGeocodeDebounceRef.current) {
        clearTimeout(reverseGeocodeDebounceRef.current);
        reverseGeocodeDebounceRef.current = null;
      }

      if (REVERSE_GEOCODE_DEBOUNCE_MS <= 0) {
        runReverseGeocode();
        return;
      }

      reverseGeocodeDebounceRef.current = setTimeout(
        runReverseGeocode,
        REVERSE_GEOCODE_DEBOUNCE_MS
      );
    },
    [reverseGeocoder]
  );

  useEffect(() => {
    const candidates: GnssTelemetryPacket[] = [];

    if (latestGnssTelemetry) {
      candidates.push(latestGnssTelemetry);
    }

    if (latestTelemetry) {
      // Skip telemetry fallback when satellite count is unknown to avoid pinning UI at 0.
      if (typeof latestTelemetry.sats === "number") {
        candidates.push({
          ts_ms: latestTelemetry.ts_ms,
          gnss_fix: latestTelemetry.gnss_fix,
          lat: latestTelemetry.lat,
          lng: latestTelemetry.lng,
          alt_m: latestTelemetry.alt_m,
          speed_kph: latestTelemetry.gnss_speed_kph,
          sats: latestTelemetry.sats,
          hdop: latestTelemetry.hdop,
          date: latestTelemetry.date,
          time_utc: latestTelemetry.time_utc,
        });
      }
    }

    for (const packet of candidates) {
      const packetFingerprint = buildPacketFingerprint(packet);
      if (packetFingerprint === lastAppliedPacketFingerprintRef.current) {
        continue;
      }
      lastAppliedPacketFingerprintRef.current = packetFingerprint;
      updateGnssPacket(packet);
      return;
    }
  }, [latestGnssTelemetry, latestTelemetry, updateGnssPacket]);

  useEffect(() => {
    const coordinate = toValidCoordinate(latestPacket);
    if (!coordinate) return;
    scheduleReverseGeocode(coordinate);
  }, [latestPacket, scheduleReverseGeocode]);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshFreshness(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [refreshFreshness]);

  useEffect(() => {
    return () => {
      if (reverseGeocodeDebounceRef.current) {
        clearTimeout(reverseGeocodeDebounceRef.current);
      }
    };
  }, []);

  const value = useMemo<GnssContextType>(() => ({
    latestPacket,
    lastUpdateTimestampMs,
    connectionFreshness,
    isStale,
    isTelemetryLost,
    reverseGeocodeAddress,
    isReverseGeocodeLoading,
    reverseGeocodeError,
    mapMode,
    shouldAutoCenter: mapMode === "follow",
    setMapMode,
    updateGnssPacket,
    setReverseGeocodeAddress,
  }), [
    connectionFreshness,
    isStale,
    isTelemetryLost,
    isReverseGeocodeLoading,
    lastUpdateTimestampMs,
    latestPacket,
    mapMode,
    reverseGeocodeError,
    reverseGeocodeAddress,
    setMapMode,
    setReverseGeocodeAddress,
    updateGnssPacket,
  ]);

  return <GnssContext.Provider value={value}>{children}</GnssContext.Provider>;
}

export function useGnss() {
  const ctx = useContext(GnssContext);
  if (!ctx) throw new Error("useGnss must be used within GnssProvider");
  return ctx;
}
