import { useCallback, useEffect, useMemo, useState } from "react";
import type { GnssMapMode } from "../context/GnssContext";
import type { GnssTelemetryPacket } from "../lib/gnssTelemetryValidation";
import { shouldAutoCenterMap } from "../lib/gnssLocationUtils";

const DEFAULT_CENTER: [number, number] = [-95.706152, 29.763051];
const DEFAULT_ZOOM = 15.5;
const FOLLOW_ANIMATION_MS = 700;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasValidFix(
  packet: GnssTelemetryPacket | null
): packet is GnssTelemetryPacket & { lat: number; lng: number } {
  return (
    !!packet &&
    packet.gnss_fix === true &&
    isFiniteNumber(packet.lat) &&
    isFiniteNumber(packet.lng)
  );
}

function coordinatesEqual(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function extractCenterCoordinate(event: unknown): [number, number] | null {
  if (!event || typeof event !== "object") return null;
  const typed = event as {
    geometry?: { coordinates?: unknown };
  };
  const coordinates = typed.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return null;
  return [lng, lat];
}

function extractZoomLevel(event: unknown): number | null {
  if (!event || typeof event !== "object") return null;
  const typed = event as {
    properties?: { zoomLevel?: unknown };
  };
  const zoom = typed.properties?.zoomLevel;
  return isFiniteNumber(zoom) ? zoom : null;
}

export type GnssMapBehavior = {
  cameraCenter: [number, number];
  cameraZoom: number;
  markerCoordinate: [number, number] | null;
  cameraAnimationDurationMs: number;
  onMapRegionDidChange: (event: unknown) => void;
};

export function useGnssMapBehavior(args: {
  mapMode: GnssMapMode;
  latestPacket: GnssTelemetryPacket | null;
}): GnssMapBehavior {
  const [cameraCenter, setCameraCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [cameraZoom, setCameraZoom] = useState(DEFAULT_ZOOM);
  const [markerCoordinate, setMarkerCoordinate] = useState<[number, number] | null>(null);

  const latestValidFixCoordinate = useMemo<[number, number] | null>(() => {
    if (!hasValidFix(args.latestPacket)) return null;
    return [args.latestPacket.lng, args.latestPacket.lat];
  }, [args.latestPacket]);

  useEffect(() => {
    if (!latestValidFixCoordinate) return;
    setMarkerCoordinate((current) =>
      current && coordinatesEqual(current, latestValidFixCoordinate)
        ? current
        : latestValidFixCoordinate
    );

    if (shouldAutoCenterMap(args.mapMode)) {
      setCameraCenter((current) =>
        coordinatesEqual(current, latestValidFixCoordinate) ? current : latestValidFixCoordinate
      );
    }
  }, [args.mapMode, latestValidFixCoordinate]);

  useEffect(() => {
    if (!shouldAutoCenterMap(args.mapMode)) return;
    if (!markerCoordinate) return;
    setCameraCenter((current) =>
      coordinatesEqual(current, markerCoordinate) ? current : markerCoordinate
    );
  }, [args.mapMode, markerCoordinate]);

  const onMapRegionDidChange = useCallback(
    (event: unknown) => {
      if (args.mapMode !== "look_around") return;

      const center = extractCenterCoordinate(event);
      if (center) {
        setCameraCenter((current) => (coordinatesEqual(current, center) ? current : center));
      }

      const zoom = extractZoomLevel(event);
      if (zoom !== null) {
        setCameraZoom(zoom);
      }
    },
    [args.mapMode]
  );

  return {
    cameraCenter,
    cameraZoom,
    markerCoordinate,
    cameraAnimationDurationMs: args.mapMode === "follow" ? FOLLOW_ANIMATION_MS : 0,
    onMapRegionDidChange,
  };
}
