import type { GnssTelemetryPacket } from "./gnssTelemetryValidation";

export type GnssConnectionFreshness = "fresh" | "stale" | "lost";
export type GnssMapMode = "follow" | "look_around";

export type ReverseGeocodeCoordinate = {
  lat: number;
  lng: number;
};

export const GNSS_STALE_AFTER_MS = 3000;
export const GNSS_LOST_AFTER_MS = 5000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasValidGnssFix(packet: GnssTelemetryPacket | null): boolean {
  return !!packet && packet.gnss_fix === true && isFiniteNumber(packet.lat) && isFiniteNumber(packet.lng);
}

export function computeGnssFreshness(
  lastUpdateTimestampMs: number | null,
  nowMs: number
): {
  connectionFreshness: GnssConnectionFreshness;
  isStale: boolean;
  isTelemetryLost: boolean;
} {
  if (lastUpdateTimestampMs === null) {
    return { connectionFreshness: "lost", isStale: false, isTelemetryLost: true };
  }

  const ageMs = nowMs - lastUpdateTimestampMs;
  if (ageMs >= GNSS_LOST_AFTER_MS) {
    return { connectionFreshness: "lost", isStale: false, isTelemetryLost: true };
  }

  if (ageMs >= GNSS_STALE_AFTER_MS) {
    return { connectionFreshness: "stale", isStale: true, isTelemetryLost: false };
  }

  return { connectionFreshness: "fresh", isStale: false, isTelemetryLost: false };
}

export function shouldShowLiveMarker(args: {
  packet: GnssTelemetryPacket | null;
  connectionFreshness: GnssConnectionFreshness;
}): boolean {
  return args.connectionFreshness === "fresh" && hasValidGnssFix(args.packet);
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceBetweenCoordinatesMeters(
  a: ReverseGeocodeCoordinate,
  b: ReverseGeocodeCoordinate
): number {
  const earthRadiusM = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function shouldRefreshReverseGeocode(args: {
  nowMs: number;
  coordinate: ReverseGeocodeCoordinate;
  lastSuccess: { coordinate: ReverseGeocodeCoordinate; atMs: number } | null;
  lastAttempt: { coordinate: ReverseGeocodeCoordinate; atMs: number } | null;
  minMoveMeters: number;
  refreshMs: number;
  minRequestGapMs: number;
}): boolean {
  const movementAnchor = args.lastSuccess?.coordinate ?? args.lastAttempt?.coordinate ?? null;
  const movedEnough =
    !movementAnchor ||
    distanceBetweenCoordinatesMeters(movementAnchor, args.coordinate) >= args.minMoveMeters;
  const enoughTimePassed = !args.lastSuccess || args.nowMs - args.lastSuccess.atMs >= args.refreshMs;
  const requestGapSatisfied =
    !args.lastAttempt || args.nowMs - args.lastAttempt.atMs >= args.minRequestGapMs;

  return (movedEnough || enoughTimePassed) && requestGapSatisfied;
}

export function shouldAutoCenterMap(mapMode: GnssMapMode): boolean {
  return mapMode === "follow";
}

export function isReturningToFollowMode(previousMode: GnssMapMode, nextMode: GnssMapMode): boolean {
  return previousMode === "look_around" && nextMode === "follow";
}
