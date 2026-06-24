import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "cup_user_test.db";

let dbPromise = null;
let isMigrated = false;

function readUserVersion(row) {
  const rawValue = row?.user_version ?? Object.values(row || {})[0];
  const version = Number.parseInt(rawValue, 10);
  return Number.isInteger(version) ? version : 0;
}

async function recomputeSessionProgressStatusForMigration(db, sessionId, currentStatus) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId || String(currentStatus || "").toLowerCase() === "complete") {
    return;
  }

  const sampleCountRow = await db.getFirstAsync(
    "SELECT COUNT(*) AS count FROM samples WHERE session_id = ?",
    [normalizedSessionId]
  );
  const sampleCount = Number(sampleCountRow?.count) || 0;
  const nextStatus = sampleCount === 0 ? "new" : "pending";

  let computedStatus = nextStatus;
  if (sampleCount > 0) {
    const feedbackCountRow = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM sample_feedback_entries WHERE session_id = ?",
      [normalizedSessionId]
    );
    const feedbackCount = Number(feedbackCountRow?.count) || 0;
    computedStatus = feedbackCount > 0 ? "in_progress" : "pending";
  }

  if (computedStatus !== String(currentStatus || "").toLowerCase()) {
    await db.runAsync(
      "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
      [computedStatus, new Date().toISOString(), normalizedSessionId]
    );
  }
}

async function backfillSessionProgressStatuses(db) {
  const sessions = await db.getAllAsync("SELECT id, status FROM sessions");
  for (const session of sessions || []) {
    await recomputeSessionProgressStatusForMigration(db, session?.id, session?.status);
  }
}

async function runMigrations(db) {
  if (isMigrated) {
    return;
  }

  await db.execAsync("PRAGMA foreign_keys = ON;");
  const initialUserVersion = readUserVersion(await db.getFirstAsync("PRAGMA user_version;"));

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      session_uuid TEXT NOT NULL UNIQUE,
      session_display_id TEXT NOT NULL,
      session_name TEXT NOT NULL,
      session_type TEXT NOT NULL,
      samples_in_session INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
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
      cupping_form INTEGER NOT NULL DEFAULT 1,
      cupping_mode TEXT NOT NULL DEFAULT 'blind',
      sample_number INTEGER NOT NULL DEFAULT 0,
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
      other_bean INTEGER NOT NULL DEFAULT 0,
      underdeveloped INTEGER NOT NULL DEFAULT 0,
      baked INTEGER NOT NULL DEFAULT 0,
      uneven_roast INTEGER NOT NULL DEFAULT 0,
      overdeveloped INTEGER NOT NULL DEFAULT 0,
      non_uniform_cups INTEGER NOT NULL DEFAULT 0,
      defective_cups INTEGER NOT NULL DEFAULT 0,
      non_uniform_mask TEXT NOT NULL DEFAULT '',
      defective_mask TEXT NOT NULL DEFAULT '',
      defect_type_masks TEXT NOT NULL DEFAULT '',
      number_of_cups INTEGER NOT NULL DEFAULT 1,
      temp_snapshot TEXT,
      time_snapshot TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sample_flavour_observations (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      sample_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      label TEXT NOT NULL,
      colour TEXT NOT NULL DEFAULT '',
      temp_c INTEGER,
      elapsed_seconds INTEGER,
      source_field TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
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
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_flavour_observations_sample_id ON sample_flavour_observations(sample_id);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_flavour_observations_session_id ON sample_flavour_observations(session_id);"
  );
  await db.execAsync(
    "CREATE INDEX IF NOT EXISTS idx_flavour_observations_keyword ON sample_flavour_observations(keyword);"
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
  const defectColumnsAfterMasks = await db.getAllAsync("PRAGMA table_info(sample_defect_entries);");
  const ensureDefectColumn = async (name) => {
    const hasColumn = Array.isArray(defectColumnsAfterMasks)
      ? defectColumnsAfterMasks.some((column) => column?.name === name)
      : false;
    if (!hasColumn) {
      await db.execAsync(
        `ALTER TABLE sample_defect_entries ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0;`
      );
    }
  };
  await ensureDefectColumn("underdeveloped");
  await ensureDefectColumn("baked");
  await ensureDefectColumn("uneven_roast");
  await ensureDefectColumn("overdeveloped");
  await ensureDefectColumn("other_bean");
  const defectColumnsAfterTypeMasks = await db.getAllAsync("PRAGMA table_info(sample_defect_entries);");
  const hasDefectTypeMasksColumn = Array.isArray(defectColumnsAfterTypeMasks)
    ? defectColumnsAfterTypeMasks.some((column) => column?.name === "defect_type_masks")
    : false;
  if (!hasDefectTypeMasksColumn) {
    await db.execAsync(
      "ALTER TABLE sample_defect_entries ADD COLUMN defect_type_masks TEXT NOT NULL DEFAULT '';"
    );
  }

  const sessionColumns = await db.getAllAsync("PRAGMA table_info(sessions);");
  const hasStatusColumn = Array.isArray(sessionColumns)
    ? sessionColumns.some((column) => column?.name === "status")
    : false;

  if (!hasStatusColumn) {
    await db.execAsync("ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'new';");
  }
  const hasSamplesInSessionColumn = Array.isArray(sessionColumns)
    ? sessionColumns.some((column) => column?.name === "samples_in_session")
    : false;
  if (!hasSamplesInSessionColumn) {
    await db.execAsync("ALTER TABLE sessions ADD COLUMN samples_in_session INTEGER NOT NULL DEFAULT 0;");
  }
  // Migrate to new/pending/complete status model once. The in-memory migration
  // guard resets on cold starts, so persist this legacy rename with user_version.
  let userVersion = initialUserVersion;
  if (userVersion < 1) {
    // Run in this order: rename old 'pending' (setup) → 'new', then old 'active' (in-progress) → 'pending'.
    await db.execAsync("UPDATE sessions SET status = 'new' WHERE status IS NULL OR status = '';");
    await db.execAsync("UPDATE sessions SET status = 'new' WHERE status = 'pending';");
    await db.execAsync("UPDATE sessions SET status = 'pending' WHERE status = 'active';");
    await db.execAsync("PRAGMA user_version = 1;");
    userVersion = 1;
  }

  if (userVersion < 2) {
    await backfillSessionProgressStatuses(db);
    await db.execAsync("PRAGMA user_version = 2;");
    userVersion = 2;
  }

  if (userVersion < 3) {
    const sessionColumnsForCuppingMode = await db.getAllAsync("PRAGMA table_info(sessions);");
    const hasSessionCuppingModeColumn = Array.isArray(sessionColumnsForCuppingMode)
      ? sessionColumnsForCuppingMode.some((column) => column?.name === "cupping_mode")
      : false;
    if (hasSessionCuppingModeColumn) {
      const sampleColumnsForCuppingMode = await db.getAllAsync("PRAGMA table_info(samples);");
      const hasSampleCuppingModeColumn = Array.isArray(sampleColumnsForCuppingMode)
        ? sampleColumnsForCuppingMode.some((column) => column?.name === "cupping_mode")
        : false;
      if (!hasSampleCuppingModeColumn) {
        await db.execAsync("ALTER TABLE samples ADD COLUMN cupping_mode TEXT NOT NULL DEFAULT 'blind';");
      }
      await db.execAsync(`
        UPDATE samples
        SET cupping_mode = (
          SELECT sessions.cupping_mode
          FROM sessions
          WHERE sessions.id = samples.session_id
        )
        WHERE EXISTS (
          SELECT 1
          FROM sessions
          WHERE sessions.id = samples.session_id
            AND sessions.cupping_mode IS NOT NULL
            AND sessions.cupping_mode != ''
        );
      `);
      await db.execAsync("ALTER TABLE sessions DROP COLUMN cupping_mode;");
    }
    await db.execAsync("PRAGMA user_version = 3;");
    userVersion = 3;
  }

  if (userVersion < 4) {
    const sampleColumnsForSampleColour = await db.getAllAsync("PRAGMA table_info(samples);");
    const hasSampleColourColumn = Array.isArray(sampleColumnsForSampleColour)
      ? sampleColumnsForSampleColour.some((column) => column?.name === "sample_colour")
      : false;
    if (hasSampleColourColumn) {
      await db.execAsync("ALTER TABLE samples DROP COLUMN sample_colour;");
    }
    await db.execAsync("PRAGMA user_version = 4;");
    userVersion = 4;
  }

  const sampleColumns = await db.getAllAsync("PRAGMA table_info(samples);");
  const hasSampleNumberColumn = Array.isArray(sampleColumns)
    ? sampleColumns.some((column) => column?.name === "sample_number")
    : false;
  if (!hasSampleNumberColumn) {
    await db.execAsync("ALTER TABLE samples ADD COLUMN sample_number INTEGER NOT NULL DEFAULT 0;");
  }
  const hasCuppingFormColumn = Array.isArray(sampleColumns)
    ? sampleColumns.some((column) => column?.name === "cupping_form")
    : false;
  if (!hasCuppingFormColumn) {
    await db.execAsync("ALTER TABLE samples ADD COLUMN cupping_form INTEGER NOT NULL DEFAULT 1;");
  }
  const hasSampleCuppingModeColumn = Array.isArray(sampleColumns)
    ? sampleColumns.some((column) => column?.name === "cupping_mode")
    : false;
  if (!hasSampleCuppingModeColumn) {
    await db.execAsync("ALTER TABLE samples ADD COLUMN cupping_mode TEXT NOT NULL DEFAULT 'blind';");
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
