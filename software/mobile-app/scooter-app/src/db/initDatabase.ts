import { db } from "./database";

function ensureColumn(table: string, column: string, sqlType: string) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType};`);
  }
}

export function initDatabase() {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    -- Canonical debug session table
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_s REAL,
      total_distance_km REAL,
      max_speed_kph REAL,
      avg_speed_kph REAL,
      min_voltage_v REAL,
      max_temp_c REAL,
      status TEXT
    );

    CREATE TABLE IF NOT EXISTS session_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      ts_ms INTEGER NOT NULL,
      pack_voltage_v REAL,
      pack_current_a REAL,
      board_temp_c REAL,
      board_temp_f REAL,
      wheel_speed_kph REAL,
      wheel_speed_mph REAL,
      brake_active INTEGER,
      gnss_fix INTEGER,
      lat REAL,
      lng REAL,
      alt_m REAL,
      gnss_speed_kph REAL,
      sats INTEGER,
      hdop REAL,
      date TEXT,
      time_utc TEXT,
      charging_state TEXT,
      fault_flags TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_session_samples_session_id_ts
      ON session_samples(session_id, ts_ms);

    -- Legacy compatibility tables kept so prior app builds do not crash
    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_s REAL,
      total_distance_km REAL,
      max_speed_kph REAL,
      avg_speed_kph REAL,
      min_voltage_v REAL,
      max_temp_c REAL,
      status TEXT
    );

    CREATE TABLE IF NOT EXISTS ride_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ride_id TEXT NOT NULL,
      ts_ms INTEGER NOT NULL,
      pack_voltage_v REAL,
      pack_current_a REAL,
      board_temp_c REAL,
      wheel_speed_kph REAL,
      brake_active INTEGER,
      charging_state TEXT,
      fault_flags TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ride_id) REFERENCES rides(id)
    );
  `);

  // Additive migrations for existing installs.
  ensureColumn("session_samples", "board_temp_f", "REAL");
  ensureColumn("session_samples", "wheel_speed_mph", "REAL");
  ensureColumn("session_samples", "gnss_fix", "INTEGER");
  ensureColumn("session_samples", "lat", "REAL");
  ensureColumn("session_samples", "lng", "REAL");
  ensureColumn("session_samples", "alt_m", "REAL");
  ensureColumn("session_samples", "gnss_speed_kph", "REAL");
  ensureColumn("session_samples", "sats", "INTEGER");
  ensureColumn("session_samples", "hdop", "REAL");
  ensureColumn("session_samples", "date", "TEXT");
  ensureColumn("session_samples", "time_utc", "TEXT");
}
