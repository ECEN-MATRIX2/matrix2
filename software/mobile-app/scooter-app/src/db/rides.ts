import { db } from "./database";

export type RideSummary = {
  duration_s: number;
  total_distance_km: number;
  max_speed_kph: number;
  avg_speed_kph: number;
  min_voltage_v: number;
  max_temp_c: number;
};

export type CompletedRideLog = {
  id: string;
  start_time: string;
  end_time: string | null;
  duration_s: number | null;
  total_distance_km: number | null;
  max_speed_kph: number | null;
  avg_speed_kph: number | null;
  min_voltage_v: number | null;
  max_temp_c: number | null;
  status: string | null;
  sample_count: number;
};

export type RideSampleLog = {
  id: number;
  ts_ms: number;
  pack_voltage_v: number | null;
  pack_current_a: number | null;
  board_temp_c: number | null;
  wheel_speed_kph: number | null;
  brake_active: number | null;
  charging_state: string | null;
  fault_flags: string | null;
  created_at: string | null;
};

export function createRide(rideId: string, startTime: string) {
  db.runSync(
    `INSERT INTO rides (id, start_time, status) VALUES (?, ?, ?)`,
    [rideId, startTime, "active"]
  );
}

export function insertRideSample(
  rideId: string,
  packet: {
    ts_ms: number;
    pack_voltage_v: number;
    pack_current_a: number;
    board_temp_c: number;
    wheel_speed_kph: number;
    brake_active: boolean;
    charging_state: string;
    fault_flags: string[];
  }
) {
  db.runSync(
    `INSERT INTO ride_samples (
      ride_id, ts_ms, pack_voltage_v, pack_current_a, board_temp_c,
      wheel_speed_kph, brake_active, charging_state, fault_flags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rideId,
      packet.ts_ms,
      packet.pack_voltage_v,
      packet.pack_current_a,
      packet.board_temp_c,
      packet.wheel_speed_kph,
      packet.brake_active ? 1 : 0,
      packet.charging_state,
      JSON.stringify(packet.fault_flags),
    ]
  );
}

export function computeRideSummaryFromSamples(
  rideId: string,
  startTime: string,
  endTime: string
): RideSummary {
  const aggregate = db.getFirstSync<{
    max_speed_kph: number | null;
    avg_speed_kph: number | null;
    min_voltage_v: number | null;
    max_temp_c: number | null;
  }>(
    `SELECT
      MAX(wheel_speed_kph) AS max_speed_kph,
      AVG(wheel_speed_kph) AS avg_speed_kph,
      MIN(pack_voltage_v) AS min_voltage_v,
      MAX(board_temp_c) AS max_temp_c
    FROM ride_samples
    WHERE ride_id = ?`,
    [rideId]
  );

  const speedSeries = db.getAllSync<{ ts_ms: number; wheel_speed_kph: number }>(
    `SELECT ts_ms, wheel_speed_kph
     FROM ride_samples
     WHERE ride_id = ?
     ORDER BY ts_ms ASC`,
    [rideId]
  );

  let totalDistanceKm = 0;
  for (let i = 1; i < speedSeries.length; i += 1) {
    const prev = speedSeries[i - 1];
    const cur = speedSeries[i];
    const dtSeconds = (cur.ts_ms - prev.ts_ms) / 1000;
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) continue;

    const avgSpeedKph = (prev.wheel_speed_kph + cur.wheel_speed_kph) / 2;
    totalDistanceKm += (avgSpeedKph * dtSeconds) / 3600;
  }

  const durationMs = Date.parse(endTime) - Date.parse(startTime);
  const durationS =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 0;

  return {
    duration_s: durationS,
    total_distance_km: totalDistanceKm,
    max_speed_kph: aggregate?.max_speed_kph ?? 0,
    avg_speed_kph: aggregate?.avg_speed_kph ?? 0,
    min_voltage_v: aggregate?.min_voltage_v ?? 0,
    max_temp_c: aggregate?.max_temp_c ?? 0,
  };
}

export function stopRide(
  rideId: string,
  endTime: string,
  summary: {
    duration_s: number;
    total_distance_km: number;
    max_speed_kph: number;
    avg_speed_kph: number;
    min_voltage_v: number;
    max_temp_c: number;
  }
) {
  db.runSync(
    `UPDATE rides
     SET end_time = ?, duration_s = ?, total_distance_km = ?,
         max_speed_kph = ?, avg_speed_kph = ?, min_voltage_v = ?,
         max_temp_c = ?, status = ?
     WHERE id = ?`,
    [
      endTime,
      summary.duration_s,
      summary.total_distance_km,
      summary.max_speed_kph,
      summary.avg_speed_kph,
      summary.min_voltage_v,
      summary.max_temp_c,
      "completed",
      rideId,
    ]
  );
}

export function getCompletedRideLogs(limit = 50): CompletedRideLog[] {
  return db.getAllSync<CompletedRideLog>(
    `SELECT
      r.id,
      r.start_time,
      r.end_time,
      r.duration_s,
      r.total_distance_km,
      r.max_speed_kph,
      r.avg_speed_kph,
      r.min_voltage_v,
      r.max_temp_c,
      r.status,
      (
        SELECT COUNT(*)
        FROM ride_samples rs
        WHERE rs.ride_id = r.id
      ) AS sample_count
    FROM rides r
    WHERE r.status = ?
    ORDER BY COALESCE(r.end_time, r.start_time) DESC
    LIMIT ?`,
    ["completed", limit]
  );
}

export function getRideSamplesForRide(
  rideId: string,
  limit = 10
): RideSampleLog[] {
  return db.getAllSync<RideSampleLog>(
    `SELECT
      id,
      ts_ms,
      pack_voltage_v,
      pack_current_a,
      board_temp_c,
      wheel_speed_kph,
      brake_active,
      charging_state,
      fault_flags,
      created_at
    FROM ride_samples
    WHERE ride_id = ?
    ORDER BY ts_ms DESC
    LIMIT ?`,
    [rideId, limit]
  );
}
