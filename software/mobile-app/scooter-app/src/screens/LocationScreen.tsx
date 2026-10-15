import { useCallback, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Camera,
  CircleLayer,
  MapView,
  RasterLayer,
  RasterSource,
  ShapeSource,
} from "@maplibre/maplibre-react-native";
import Screen from "../components/Screen";
import Card from "../components/Card";
import SectionHeader from "../components/SectionHeader";
import StatusChip from "../components/StatusChip";
import MetricCard from "../components/MetricCard";
import { useConnection } from "../context/ConnectionContext";
import { useGnss, type GnssMapMode } from "../context/GnssContext";
import { useGnssMapBehavior } from "../hooks/useGnssMapBehavior";
import type { GnssTelemetryPacket } from "../lib/gnssTelemetryValidation";
import { theme } from "../styles/theme";

const CENTRAL_TIME_ZONE = "America/Chicago";
const CENTRAL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const CENTRAL_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const AUTO_SWITCH_TO_LOOK_AROUND_ON_PAN = false;

function formatMetricNumber(value: number | null | undefined, decimals = 6): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(decimals);
}

function isValidCoordinate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUserInteractionEvent(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;

  const typed = event as {
    properties?: {
      isUserInteraction?: unknown;
      isGestureActive?: unknown;
      gestureActive?: unknown;
    };
  };

  return Boolean(
    typed.properties?.isUserInteraction ||
    typed.properties?.isGestureActive ||
    typed.properties?.gestureActive
  );
}

function formatCentralDateTime(
  date: string | undefined,
  timeUtc: string | undefined
): { date: string; time: string } {
  if (!date || !timeUtc) return { date: "--", time: "--" };

  const asUtc = new Date(`${date}T${timeUtc}Z`);
  if (!Number.isFinite(asUtc.getTime())) return { date: "--", time: "--" };

  return {
    date: CENTRAL_DATE_FORMATTER.format(asUtc),
    time: CENTRAL_TIME_FORMATTER.format(asUtc),
  };
}

export default function LocationScreen() {
  const { connectionState } = useConnection();
  const {
    latestPacket,
    mapMode,
    setMapMode,
    reverseGeocodeAddress,
    isReverseGeocodeLoading,
    reverseGeocodeError,
    connectionFreshness,
    isStale,
    isTelemetryLost,
    lastUpdateTimestampMs,
  } = useGnss();

  const hasCurrentFix =
    latestPacket?.gnss_fix === true &&
    isValidCoordinate(latestPacket.lat) &&
    isValidCoordinate(latestPacket.lng);

  const lastValidFixPacketRef = useRef<GnssTelemetryPacket | null>(null);
  if (hasCurrentFix && latestPacket) {
    lastValidFixPacketRef.current = latestPacket;
  }

  const effectivePacket =
    hasCurrentFix ? latestPacket : !isTelemetryLost ? lastValidFixPacketRef.current : null;
  const hasEffectiveFix =
    effectivePacket?.gnss_fix === true &&
    isValidCoordinate(effectivePacket.lat) &&
    isValidCoordinate(effectivePacket.lng);

  const {
    cameraCenter,
    cameraZoom,
    markerCoordinate,
    cameraAnimationDurationMs,
  } = useGnssMapBehavior({
    mapMode,
    latestPacket,
  });

  const statusTone = hasEffectiveFix ? "ok" : "warn";
  const freshnessLabel =
    connectionFreshness === "fresh"
      ? "Live"
      : connectionFreshness === "stale"
        ? "Stale"
        : "Telemetry Lost";

  const freshnessTone =
    connectionFreshness === "fresh" ? "ok" : connectionFreshness === "stale" ? "warn" : "bad";

  const connectionLabel =
    connectionState === "connected"
      ? "BLE Connected"
      : connectionState === "connecting"
        ? "BLE Connecting"
        : "BLE Disconnected";

  const connectionTone =
    connectionState === "connected" ? "ok" : connectionState === "connecting" ? "warn" : "bad";

  const noFixMessage = isTelemetryLost
    ? connectionState === "disconnected"
      ? "Telemetry disconnected. Reconnect BLE to resume GNSS updates."
      : "Telemetry lost. Waiting for new GNSS packets."
    : "";
  const showLiveMarker = hasEffectiveFix && !isTelemetryLost;

  const onMapModePress = (mode: GnssMapMode) => {
    setMapMode(mode);
  };

  const onMapRegionWillChange = useCallback(
    (event: unknown) => {
      if (!AUTO_SWITCH_TO_LOOK_AROUND_ON_PAN) return;
      if (mapMode !== "follow") return;
      if (!isUserInteractionEvent(event)) return;
      setMapMode("look_around");
    },
    [mapMode, setMapMode]
  );

  const centralDateTime = useMemo(
    () => formatCentralDateTime(effectivePacket?.date, effectivePacket?.time_utc),
    [effectivePacket?.date, effectivePacket?.time_utc]
  );

  return (
    <Screen>
      <Text style={styles.title}>Location</Text>

      <View style={styles.topBadgeRow}>
        <StatusChip label={hasEffectiveFix ? "GPS Fix" : "No Fix"} tone={statusTone} />
        <StatusChip label={freshnessLabel} tone={freshnessTone} />
        <StatusChip label={connectionLabel} tone={connectionTone} />
      </View>

      {(isStale || isTelemetryLost) && (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>
            {isTelemetryLost
              ? "GNSS telemetry is currently unavailable."
              : "GNSS telemetry is stale (no new packet for 3+ seconds)."}
          </Text>
        </Card>
      )}

      <SectionHeader title="Map" />
      <Card style={styles.mapCard}>
        <View style={styles.modeToggle}>
          {(["follow", "look_around"] as GnssMapMode[]).map((mode) => {
            const active = mapMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => onMapModePress(mode)}
                style={[styles.modeButton, active && styles.modeButtonActive]}
              >
                <Text style={[styles.modeText, active && styles.modeTextActive]}>
                  {mode === "follow" ? "Follow" : "Look Around"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.modeMetaRow}>
          <StatusChip
            label={mapMode === "follow" ? "Mode: Follow" : "Mode: Look Around"}
            tone={mapMode === "follow" ? "ok" : "neutral"}
          />
          <Text style={styles.modeHelperText}>
            {mapMode === "follow"
              ? "Follow: map stays locked to live position."
              : "Look Around: map no longer auto-centers."}
          </Text>
        </View>

        <View style={styles.mapWrap}>
          <MapView style={styles.map} onRegionWillChange={onMapRegionWillChange}>
            {mapMode === "follow" ? (
              <Camera
                centerCoordinate={cameraCenter}
                zoomLevel={cameraZoom}
                animationMode="easeTo"
                animationDuration={cameraAnimationDurationMs}
              />
            ) : (
              <Camera />
            )}
            <RasterSource
              id="osm-source"
              tileUrlTemplates={["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]}
              tileSize={256}
              maxZoomLevel={19}
            >
              <RasterLayer id="osm-layer" sourceID="osm-source" />
            </RasterSource>
            {showLiveMarker && markerCoordinate ? (
              <ShapeSource
                id="ble-gnss-location-source"
                shape={{
                  type: "Feature",
                  geometry: { type: "Point", coordinates: markerCoordinate },
                  properties: {},
                }}
              >
                <CircleLayer
                  id="ble-gnss-pin-outer"
                  style={{
                    circleRadius: 9,
                    circleColor: "#FFFFFF",
                    circleStrokeWidth: 2,
                    circleStrokeColor: theme.colors.primary,
                  }}
                />
                <CircleLayer
                  id="ble-gnss-pin-inner"
                  style={{ circleRadius: 4, circleColor: theme.colors.primary }}
                />
              </ShapeSource>
            ) : null}
          </MapView>
          {!hasEffectiveFix && isTelemetryLost && (
            <View style={styles.mapOverlay}>
              <Text style={styles.mapOverlayText}>{noFixMessage}</Text>
            </View>
          )}
        </View>
      </Card>

      <SectionHeader title="GNSS Metrics" />
      <View style={styles.metricGrid}>
        <View style={styles.metricRow}>
          <MetricCard label="Latitude" value={formatMetricNumber(effectivePacket?.lat, 6)} />
          <MetricCard label="Longitude" value={formatMetricNumber(effectivePacket?.lng, 6)} />
        </View>
        <View style={styles.metricRow}>
          <MetricCard label="Altitude" value={formatMetricNumber(effectivePacket?.alt_m, 2)} unit="m" />
          <MetricCard label="Speed" value={formatMetricNumber(effectivePacket?.speed_kph, 2)} unit="km/h" />
        </View>
        <View style={styles.metricRow}>
          <MetricCard label="Satellites" value={String(effectivePacket?.sats ?? "--")} />
          <MetricCard label="HDOP" value={formatMetricNumber(effectivePacket?.hdop, 2)} />
        </View>
        <View style={styles.metricRow}>
          <MetricCard label="Central Date" value={centralDateTime.date} />
          <MetricCard label="Central Time" value={centralDateTime.time} />
        </View>
      </View>

      <SectionHeader title="Address" />
      <Card>
        <Text style={styles.addressText}>
          {reverseGeocodeAddress.trim()
            ? reverseGeocodeAddress
            : "City will appear here when reverse geocoding is available."}
        </Text>
        {isReverseGeocodeLoading ? (
          <Text style={styles.addressLoadingText}>Refreshing city...</Text>
        ) : null}
        {!isReverseGeocodeLoading && reverseGeocodeError ? (
          <Text style={styles.addressErrorText}>Address lookup error: {reverseGeocodeError}</Text>
        ) : null}
        <Text style={styles.metaText}>
          Last update:{" "}
          {lastUpdateTimestampMs ? new Date(lastUpdateTimestampMs).toLocaleTimeString() : "No packets yet"}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.type.h1, fontWeight: "900", marginBottom: theme.spacing.s },
  topBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.s,
    marginBottom: theme.spacing.s,
  },
  warningCard: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    marginBottom: theme.spacing.s,
  },
  warningText: {
    color: theme.colors.warning,
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  mapCard: { marginTop: theme.spacing.s },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.s,
    padding: 4,
    marginBottom: theme.spacing.s,
  },
  modeMetaRow: {
    gap: theme.spacing.s,
    marginBottom: theme.spacing.s,
  },
  modeHelperText: {
    color: theme.colors.muted,
    fontSize: theme.type.caption,
    fontWeight: "600",
  },
  modeButton: {
    flex: 1,
    borderRadius: theme.radius.s,
    paddingVertical: 8,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modeText: {
    color: theme.colors.muted,
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  modeTextActive: {
    color: theme.colors.text,
  },
  mapWrap: {
    height: 290,
    borderRadius: theme.radius.m,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  map: { flex: 1 },
  mapOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "rgba(17, 24, 39, 0.78)",
    borderRadius: theme.radius.s,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mapOverlayText: {
    color: "#FFFFFF",
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  metricGrid: {
    gap: theme.spacing.s,
    marginTop: theme.spacing.s,
  },
  metricRow: {
    flexDirection: "row",
    gap: theme.spacing.s,
  },
  addressText: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 19,
  },
  addressLoadingText: {
    color: theme.colors.info,
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  addressErrorText: {
    color: theme.colors.warning,
    fontSize: theme.type.body,
    fontWeight: "700",
    lineHeight: 19,
  },
  metaText: {
    marginTop: theme.spacing.s,
    color: theme.colors.muted,
    fontSize: theme.type.caption,
  },
});
