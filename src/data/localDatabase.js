import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "cup_user_test.db";

let dbPromise = null;
let isMigrated = false;

async function runMigrations(db) {
  if (isMigrated) {
    return;
  }

  await db.execAsync("PRAGMA foreign_keys = ON;");

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      session_uuid TEXT NOT NULL UNIQUE,
      session_display_id TEXT NOT NULL,
      session_name TEXT NOT NULL,
      session_type TEXT NOT NULL,
      samples_in_session INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      session_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS samples (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      cup_uuid TEXT NOT NULL,
      cup_number INTEGER NOT NULL,
      sample_number INTEGER NOT NULL DEFAULT 0,
      sample_colour TEXT NOT NULL DEFAULT '',
      coffee_name_origin TEXT NOT NULL,
      process TEXT NOT NULL,
      position_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(session_id, cup_uuid),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sample_feedback_entries (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      sample_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0,
      score INTEGER,
      comments TEXT NOT NULL DEFAULT '',
      temp_snapshot TEXT,
      time_snapshot TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sample_defect_entries (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      sample_id TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0,
      moldy INTEGER NOT NULL DEFAULT 0,
      phenolic INTEGER NOT NULL DEFAULT 0,
      potato INTEGER NOT NULL DEFAULT 0,
      non_uniform_cups INTEGER NOT NULL DEFAULT 0,
      defective_cups INTEGER NOT NULL DEFAULT 0,
      non_uniform_mask TEXT NOT NULL DEFAULT '',
      defective_mask TEXT NOT NULL DEFAULT '',
      number_of_cups INTEGER NOT NULL DEFAULT 1,
      temp_snapshot TEXT,
      time_snapshot TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
    );
  `);

  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_samples_cup_uuid ON samples(cup_uuid);");
  await db.execAsync("CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);");
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_feedback_entries_sample_id ON sample_feedback_entries(sample_id);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_feedback_entries_session_id ON sample_feedback_entries(session_id);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_feedback_entries_field_name ON sample_feedback_entries(field_name);"
  );

  // Backfill from legacy one-row-per-field table if it exists.
  const legacyFeedbackTable = await db.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sample_feedback' LIMIT 1"
  );
  if (legacyFeedbackTable) {
    const existingEntriesCountRow = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM sample_feedback_entries"
    );
    const existingEntriesCount = Number(existingEntriesCountRow?.count) || 0;
    if (existingEntriesCount === 0) {
      await db.execAsync(`
        INSERT INTO sample_feedback_entries (
          id, session_id, sample_id, field_name, is_final, score, comments, temp_snapshot, time_snapshot, created_at, updated_at
        )
        SELECT
          id, session_id, sample_id, field_name, 0, score, comments, temp_snapshot, time_snapshot, created_at, updated_at
        FROM sample_feedback
      `);
    }
  }

  const feedbackColumns = await db.getAllAsync("PRAGMA table_info(sample_feedback_entries);");
  const hasIsFinalColumn = Array.isArray(feedbackColumns)
    ? feedbackColumns.some((column) => column?.name === "is_final")
    : false;
  if (!hasIsFinalColumn) {
    await db.execAsync(
      "ALTER TABLE sample_feedback_entries ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0;"
    );
  }

  // Create this index only after we have guaranteed `is_final` exists.
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_feedback_entries_is_final ON sample_feedback_entries(is_final);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_defect_entries_sample_id ON sample_defect_entries(sample_id);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_defect_entries_session_id ON sample_defect_entries(session_id);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_defect_entries_is_final ON sample_defect_entries(is_final);"
  );

  const defectColumns = await db.getAllAsync("PRAGMA table_info(sample_defect_entries);");
  const hasNonUniformMaskColumn = Array.isArray(defectColumns)
    ? defectColumns.some((column) => column?.name === "non_uniform_mask")
    : false;
  if (!hasNonUniformMaskColumn) {
    await db.execAsync(
      "ALTER TABLE sample_defect_entries ADD COLUMN non_uniform_mask TEXT NOT NULL DEFAULT '';"
    );
  }
  const hasDefectiveMaskColumn = Array.isArray(defectColumns)
    ? defectColumns.some((column) => column?.name === "defective_mask")
    : false;
  if (!hasDefectiveMaskColumn) {
    await db.execAsync(
      "ALTER TABLE sample_defect_entries ADD COLUMN defective_mask TEXT NOT NULL DEFAULT '';"
    );
  }

  const sessionColumns = await db.getAllAsync("PRAGMA table_info(sessions);");
  const hasStatusColumn = Array.isArray(sessionColumns)
    ? sessionColumns.some((column) => column?.name === "status")
    : false;

  if (!hasStatusColumn) {
    await db.execAsync("ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';");
  }
  const hasSamplesInSessionColumn = Array.isArray(sessionColumns)
    ? sessionColumns.some((column) => column?.name === "samples_in_session")
    : false;
  if (!hasSamplesInSessionColumn) {
    await db.execAsync("ALTER TABLE sessions ADD COLUMN samples_in_session INTEGER NOT NULL DEFAULT 0;");
  }

  await db.execAsync("UPDATE sessions SET status = 'pending' WHERE status IS NULL OR status = '';");

  const sampleColumns = await db.getAllAsync("PRAGMA table_info(samples);");
  const hasSampleNumberColumn = Array.isArray(sampleColumns)
    ? sampleColumns.some((column) => column?.name === "sample_number")
    : false;
  if (!hasSampleNumberColumn) {
    await db.execAsync("ALTER TABLE samples ADD COLUMN sample_number INTEGER NOT NULL DEFAULT 0;");
  }
  const hasSampleColourColumn = Array.isArray(sampleColumns)
    ? sampleColumns.some((column) => column?.name === "sample_colour")
    : false;
  if (!hasSampleColourColumn) {
    await db.execAsync("ALTER TABLE samples ADD COLUMN sample_colour TEXT NOT NULL DEFAULT '';");
  }

  isMigrated = true;
}

export async function getLocalDatabase() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  const db = await dbPromise;
  await runMigrations(db);
  return db;
}
