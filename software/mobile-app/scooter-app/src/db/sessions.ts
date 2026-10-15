import { db } from "./database";

export type SessionSummary = {
  duration_s: number;
  total_distance_km: number;
  max_speed_kph: number;
  avg_speed_kph: number;
  min_voltage_v: number;
  max_temp_c: number;
};

export type CompletedSessionLog = {
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

export type SessionSampleLog = {
  id: number;
  ts_ms: number;
  pack_voltage_v: number | null;
  pack_current_a: number | null;
  board_temp_c: number | null;
  board_temp_f: number | null;
  wheel_speed_kph: number | null;
  wheel_speed_mph: number | null;
  brake_active: number | null;
  gnss_fix: number | null;
  lat: number | null;
  lng: number | null;
  alt_m: number | null;
  gnss_speed_kph: number | null;
  sats: number | null;
  hdop: number | null;
  date: string | null;
  time_utc: string | null;
  charging_state: string | null;
  fault_flags: string | null;
  created_at: string | null;
};

export function createSession(sessionId: string, startTime: string) {
  db.runSync(
    `INSERT INTO sessions (id, start_time, status) VALUES (?, ?, ?)`,
    [sessionId, startTime, "active"]
  );
}

export function insertSessionSample(
  sessionId: string,
  packet: {
    ts_ms: number;
    pack_voltage_v: number;
    pack_current_a: number;
    board_temp_c: number;
    board_temp_f: number;
    wheel_speed_kph: number;
    wheel_speed_mph: number;
    brake_active: boolean;
    gnss_fix: boolean;
    lat: number | null;
    lng: number | null;
    alt_m: number | null;
    gnss_speed_kph: number | null;
    sats: number | null;
    hdop: number | null;
    date: string;
    time_utc: string;
    charging_state: string;
    fault_flags: string[];
  }
) {
  db.runSync(
    `INSERT INTO session_samples (
      session_id, ts_ms, pack_voltage_v, pack_current_a, board_temp_c, board_temp_f,
      wheel_speed_kph, wheel_speed_mph, brake_active, gnss_fix, lat, lng, alt_m,
      gnss_speed_kph, sats, hdop, date, time_utc, charging_state, fault_flags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      packet.ts_ms,
      packet.pack_voltage_v,
      packet.pack_current_a,
      packet.board_temp_c,
      packet.board_temp_f,
      packet.wheel_speed_kph,
      packet.wheel_speed_mph,
      packet.brake_active ? 1 : 0,
      packet.gnss_fix ? 1 : 0,
      packet.lat,
      packet.lng,
      packet.alt_m,
      packet.gnss_speed_kph,
      packet.sats,
      packet.hdop,
      packet.date,
      packet.time_utc,
      packet.charging_state,
      JSON.stringify(packet.fault_flags),
    ]
  );
}

export function computeSessionSummaryFromSamples(
  sessionId: string,
  startTime: string,
  endTime: string
): SessionSummary {
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
    FROM session_samples
    WHERE session_id = ?`,
    [sessionId]
  );

  const speedSeries = db.getAllSync<{ ts_ms: number; wheel_speed_kph: number }>(
    `SELECT ts_ms, wheel_speed_kph
     FROM session_samples
     WHERE session_id = ?
     ORDER BY ts_ms ASC`,
    [sessionId]
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

export function finalizeSession(
  sessionId: string,
  endTime: string,
  summary: SessionSummary
) {
  db.runSync(
    `UPDATE sessions
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
      sessionId,
    ]
  );
}

export function getCompletedSessionLogs(limit = 50): CompletedSessionLog[] {
  return db.getAllSync<CompletedSessionLog>(
    `SELECT
      s.id,
      s.start_time,
      s.end_time,
      s.duration_s,
      s.total_distance_km,
      s.max_speed_kph,
      s.avg_speed_kph,
      s.min_voltage_v,
      s.max_temp_c,
      s.status,
      (
        SELECT COUNT(*)
        FROM session_samples ss
        WHERE ss.session_id = s.id
      ) AS sample_count
    FROM sessions s
    WHERE s.status = ?
    ORDER BY COALESCE(s.end_time, s.start_time) DESC
    LIMIT ?`,
    ["completed", limit]
  );
}

export function getSessionSamples(sessionId: string, limit = 10): SessionSampleLog[] {
  return db.getAllSync<SessionSampleLog>(
    `SELECT
      id,
      ts_ms,
      pack_voltage_v,
      pack_current_a,
      board_temp_c,
      board_temp_f,
      wheel_speed_kph,
      wheel_speed_mph,
      brake_active,
      gnss_fix,
      lat,
      lng,
      alt_m,
      gnss_speed_kph,
      sats,
      hdop,
      date,
      time_utc,
      charging_state,
      fault_flags,
      created_at
    FROM session_samples
    WHERE session_id = ?
    ORDER BY ts_ms DESC
    LIMIT ?`,
    [sessionId, limit]
  );
}

export function getAllSessionSamples(sessionId: string): SessionSampleLog[] {
  return db.getAllSync<SessionSampleLog>(
    `SELECT
      id,
      ts_ms,
      pack_voltage_v,
      pack_current_a,
      board_temp_c,
      board_temp_f,
      wheel_speed_kph,
      wheel_speed_mph,
      brake_active,
      gnss_fix,
      lat,
      lng,
      alt_m,
      gnss_speed_kph,
      sats,
      hdop,
      date,
      time_utc,
      charging_state,
      fault_flags,
      created_at
    FROM session_samples
    WHERE session_id = ?
    ORDER BY ts_ms DESC`,
    [sessionId]
  );
}
