import { getLocalDatabase } from "./localDatabase";
import { generateDomainId } from "../utils/secureIdentifiers";
import { formIdentity, isPinnedForm, requireFormTag, requireTagCuppingMode } from "../features/forms/sessionFormRoute";
import { PROFILE, validateResponse, scoreResponse } from "../features/forms/contract";
import {
  getSessionDateLabel,
  getSessionTypeLabel,
  normalizeCuppingModeKey,
  normalizePositiveInteger,
} from "../features/cupping/constants/sessionDetails";

function generateId() {
  return generateDomainId();
}

function normalizeCupUuid(value) {
  return String(value || "").trim().toUpperCase();
}

function coerceCupNumber(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return 5;
  }

  return Math.max(1, Math.min(8, parsed));
}

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeSessionUuid(value) {
  return cleanString(value);
}

function formatSessionDateFallback(date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function normalizeCupSlotList(value, maxCups = 8) {
  const limit = Math.max(1, Number.parseInt(maxCups, 10) || 1);
  const list = Array.isArray(value) ? value : [];
  const parsed = list
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= limit);
  return Array.from(new Set(parsed)).sort((a, b) => a - b);
}

function parseCupSlotMask(mask, fallbackCount, maxCups = 8) {
  const normalizedMask = cleanString(mask);
  if (normalizedMask) {
    try {
      const parsed = JSON.parse(normalizedMask);
      const slots = normalizeCupSlotList(parsed, maxCups);
      if (slots.length > 0 || Array.isArray(parsed)) {
        return slots;
      }
    } catch {
      // Ignore malformed masks and fallback to count.
    }
  }

  const count = Math.max(0, Math.min(maxCups, Number.parseInt(fallbackCount, 10) || 0));
  return Array.from({ length: count }, (_, index) => index + 1);
}

function normalizeDefectTypeMasks(value, maxCups = 8) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.entries(source).reduce((acc, [key, slots]) => {
    const normalizedKey = cleanString(key);
    if (!normalizedKey) {
      return acc;
    }
    const normalizedSlots = normalizeCupSlotList(slots, maxCups);
    if (normalizedSlots.length > 0) {
      acc[normalizedKey] = normalizedSlots;
    }
    return acc;
  }, {});
}

function parseDefectTypeMasks(mask, maxCups = 8) {
  const normalizedMask = cleanString(mask);
  if (!normalizedMask) {
    return {};
  }
  try {
    return normalizeDefectTypeMasks(JSON.parse(normalizedMask), maxCups);
  } catch {
    return {};
  }
}

// Session completion is now manual (user presses "Mark Complete").
// This function is retained as a no-op so existing call sites compile without changes.
// eslint-disable-next-line no-unused-vars
async function reconcileCompletedSessions(_db) {}

async function recomputeSessionProgressStatusWithDb(db, sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) {
    return null;
  }

  const session = await db.getFirstAsync(
    "SELECT status FROM sessions WHERE id = ? LIMIT 1",
    [normalizedSessionId]
  );
  if (!session) {
    return null;
  }

  const currentStatus = cleanString(session.status).toLowerCase();
  if (currentStatus === "complete") {
    return "complete";
  }

  const sampleCountRow = await db.getFirstAsync(
    "SELECT COUNT(*) AS count FROM samples WHERE session_id = ?",
    [normalizedSessionId]
  );
  const sampleCount = Number(sampleCountRow?.count) || 0;
  let nextStatus = sampleCount > 0 ? "pending" : "new";

  if (sampleCount > 0) {
    const feedbackCountRow = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM sample_feedback_entries WHERE session_id = ?",
      [normalizedSessionId]
    );
    const feedbackCount = Number(feedbackCountRow?.count) || 0;
    const legacyCountRow = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM legacy_responses WHERE session_id = ?",
      [normalizedSessionId]
    );
    if (feedbackCount > 0 || Number(legacyCountRow?.count) > 0) {
      nextStatus = "in_progress";
    }
  }

  if (nextStatus !== currentStatus) {
    await db.runAsync(
      "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
      [nextStatus, new Date().toISOString(), normalizedSessionId]
    );
  }

  return nextStatus;
}

export async function recomputeSessionProgressStatus(sessionId) {
  const db = await getLocalDatabase();
  return recomputeSessionProgressStatusWithDb(db, sessionId);
}

export const CUPPING_SCORE_FIELDS = [
  "Fragrance",
  "Aroma",
  "Flavour",
  "Aftertaste",
  "Acidity",
  "Sweetness",
  "Mouthfeel",
  "Overall",
];
const CUPPING_SCORE_STEP = 0.25;

function toNumericOrZero(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToStep(value, step = CUPPING_SCORE_STEP) {
  const numericValue = Number(value);
  const numericStep = Number(step);
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericStep) || numericStep <= 0) {
    return 0;
  }
  return Math.round((numericValue + Number.EPSILON) / numericStep) * numericStep;
}

function calculateFinalScore({
  finalScoresByField,
  nonUniformCups,
  defectiveCups,
  numberOfCups,
}) {
  const cups = Math.max(1, toNumericOrZero(numberOfCups));
  const sumHi = CUPPING_SCORE_FIELDS.reduce(
    (sum, field) => sum + toNumericOrZero(finalScoresByField?.[field]),
    0
  );
  const uRaw = toNumericOrZero(nonUniformCups);
  const dRaw = toNumericOrZero(defectiveCups);
  const uNormalized = (uRaw / cups) * 5;
  const dNormalized = (dRaw / cups) * 5;
  const scoreBeforeRounding = 0.65625 * sumHi + 52.75 - 2 * uNormalized - 4 * dNormalized;
  return roundToStep(scoreBeforeRounding, CUPPING_SCORE_STEP);
}

export async function saveSessionWithSamples({
  sessionUUID,
  existingSessionId = null,
  cuppingForm,
  cuppingMode,
  sessionDisplayId,
  sessionName,
  sessionType,
  samplesInSession = 0,
  status = "new",
  sessionDate,
  samples,
}) {
  if (cuppingForm !== 1 && cuppingForm !== 2) {
    throw new Error("The session form is missing or unsupported. No session was saved.");
  }
  const pinnedForm = formIdentity(cuppingForm);
  if (cuppingForm === 2 && cuppingMode !== 'open') throw new Error('SCA Legacy currently requires Open Cupping. No session was saved.');
  const trimmedSessionName = cleanString(sessionName);
  if (!trimmedSessionName) {
    throw new Error("Session name is required before saving.");
  }

  const normalizedSessionId = cleanString(sessionUUID);
  if (!normalizedSessionId) {
    throw new Error("Secure session reference is unavailable. Please reopen this session.");
  }

  const normalizedSamples = (samples || [])
    .map((sample, index) => ({
      id: cleanString(sample?.id) || generateId(),
      cupUUID: normalizeCupUuid(sample?.cupUUID),
      cupNumber: coerceCupNumber(sample?.cupNumber),
      cuppingForm: sample?.cuppingForm,
      cuppingMode: normalizeCuppingModeKey(sample?.cuppingMode),
      sampleNumber: normalizePositiveInteger(sample?.sampleNumber, index + 1),
      coffeeNameOrigin: cleanString(sample?.coffeeNameOrigin),
      process: cleanString(sample?.process),
      positionIndex: index,
    }))
    .filter((sample) => sample.cupUUID);

  if (normalizedSamples.some((sample) => sample.cuppingForm !== pinnedForm.f)) {
    throw new Error("A sample form does not match the session form.");
  }
  if (cuppingForm === 2 && normalizedSamples.some((sample) => sample.cuppingMode !== 'open')) {
    throw new Error('SCA Legacy Blind Cupping is not yet available. No session or cup assignment was saved.');
  }

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  const sessionId = normalizedSessionId;
  const sessionUuidValue = normalizedSessionId;
  const displayIdValue = cleanString(sessionDisplayId) || `SESSION-${sessionUuidValue.slice(0, 8).toUpperCase()}`;
  const sessionStatusValue = cleanString(status).toLowerCase() || "pending";

  await db.withTransactionAsync(async () => {
    await assertSessionReferenceAvailableWithDb(db, sessionId, existingSessionId);
    const existingSession = await db.getFirstAsync(
      "SELECT created_at, cupping_form AS cuppingForm, form_key AS formKey, form_version AS formVersion, form_hash AS formHash, cupping_mode AS cuppingMode, form_locked AS formLocked, status FROM sessions WHERE id = ?",
      [sessionId]
    );
    if (existingSession && (!isPinnedForm(existingSession, cuppingForm) ||
        (cuppingForm === 2 && existingSession.cuppingMode !== 'open'))) {
      if (!isPinnedForm(existingSession, existingSession.cuppingForm)) {
        throw new Error('This older or unsupported prototype session cannot be converted to a versioned form. Its data is unchanged.');
      }
      if (existingSession.cuppingForm === 2 && existingSession.cuppingMode !== 'open') {
        throw new Error('Legacy session Open mode is missing or conflicting. Its data is unchanged.');
      }
      const assigned = await db.getFirstAsync('SELECT COUNT(*) AS count FROM samples WHERE session_id = ?', [sessionId]);
      if (Number(assigned?.count) > 0 || Number(existingSession.formLocked) === 1) {
        throw new Error("An existing session's pinned form or mode cannot be changed after cup assignment. Its data is unchanged.");
      }
    }
    if (existingSession?.cuppingForm === 2) {
      if (existingSession.status === 'complete') {
        throw new Error('This completed Legacy Session is read-only. Reset it to Pending before editing; no local record was changed.');
      }
      const recorded = await db.getAllAsync(
        `SELECT samples.cup_uuid AS cupUUID, samples.cup_number AS cupNumber
         FROM samples JOIN legacy_responses ON legacy_responses.sample_id = samples.id
         WHERE samples.session_id = ?`, [sessionId]
      );
      for (const prior of recorded) {
        const next = normalizedSamples.find(sample => sample.cupUUID === prior.cupUUID);
        if (!next || next.cupNumber !== Number(prior.cupNumber)) {
          throw new Error('A Legacy sample with a saved response cannot be removed or have its cup count changed. No local record was changed.');
        }
      }
    }

    const createdAt = existingSession?.created_at || nowIso;

    await db.runAsync(
      `
        INSERT INTO sessions (
          id, session_uuid, session_display_id, session_name, session_type, samples_in_session, status, session_date,
          cupping_form, form_key, form_version, form_hash, cupping_mode, form_locked, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          session_uuid = excluded.session_uuid,
          session_display_id = excluded.session_display_id,
          session_name = excluded.session_name,
          session_type = excluded.session_type,
          samples_in_session = excluded.samples_in_session,
          status = excluded.status,
          session_date = excluded.session_date,
          cupping_form = excluded.cupping_form,
          form_key = excluded.form_key,
          form_version = excluded.form_version,
          form_hash = excluded.form_hash,
          cupping_mode = excluded.cupping_mode,
          form_locked = excluded.form_locked,
          updated_at = excluded.updated_at
      `,
      [
        sessionId,
        sessionUuidValue,
        displayIdValue,
        trimmedSessionName,
        cleanString(sessionType),
        normalizePositiveInteger(samplesInSession, normalizedSamples.length),
        sessionStatusValue,
        cleanString(sessionDate),
        pinnedForm.f,
        pinnedForm.form_key,
        pinnedForm.form_version,
        pinnedForm.form_hash,
        cuppingForm === 2 ? 'open' : null,
        Number(existingSession?.formLocked) === 1 || normalizedSamples.length > 0 ? 1 : 0,
        createdAt,
        nowIso,
      ]
    );

    for (const sample of normalizedSamples) {
      const existingSample = await db.getFirstAsync(
        "SELECT id, created_at, cupping_form AS cuppingForm FROM samples WHERE session_id = ? AND cup_uuid = ?",
        [sessionId, sample.cupUUID]
      );
      if (existingSample && existingSample.cuppingForm !== pinnedForm.f) {
        throw new Error("An existing sample has a different form. Its session and cup assignment were not changed.");
      }

      const sampleId = existingSample?.id || sample.id || generateId();
      const sampleCreatedAt = existingSample?.created_at || nowIso;

      await db.runAsync(
        `
          INSERT INTO samples (
            id, session_id, cup_uuid, cup_number, cupping_form, cupping_mode, sample_number, coffee_name_origin, process, position_index, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id, cup_uuid) DO UPDATE SET
            cup_number = excluded.cup_number,
            cupping_form = excluded.cupping_form,
            cupping_mode = excluded.cupping_mode,
            sample_number = excluded.sample_number,
            coffee_name_origin = excluded.coffee_name_origin,
            process = excluded.process,
            position_index = excluded.position_index,
            updated_at = excluded.updated_at
        `,
        [
          sampleId,
          sessionId,
          sample.cupUUID,
          sample.cupNumber,
          sample.cuppingForm,
          sample.cuppingMode,
          sample.sampleNumber,
          sample.coffeeNameOrigin,
          sample.process,
          sample.positionIndex,
          sampleCreatedAt,
          nowIso,
        ]
      );
    }

    const keepCupUuids = normalizedSamples.map((sample) => sample.cupUUID);
    if (keepCupUuids.length === 0) {
      await db.runAsync('DELETE FROM samples WHERE session_id = ?', [sessionId]);
      return;
    }

    const placeholders = keepCupUuids.map(() => "?").join(", ");
    await db.runAsync(
      `DELETE FROM samples WHERE session_id = ? AND cup_uuid NOT IN (${placeholders})`,
      [sessionId, ...keepCupUuids]
    );

    await recomputeSessionProgressStatusWithDb(db, sessionId);
  });

  return {
    sessionId,
    savedSampleCount: normalizedSamples.length,
  };
}

async function assertSessionReferenceAvailableWithDb(db, reference, existingSessionId) {
  const normalizedReference = cleanString(reference);
  const normalizedExistingId = cleanString(existingSessionId);
  if (!normalizedReference) {
    throw new Error("Secure session reference is unavailable. Please reopen this session.");
  }

  const existingById = await db.getFirstAsync(
    "SELECT id FROM sessions WHERE id = ? LIMIT 1",
    [normalizedReference]
  );
  const existingByReference = await db.getFirstAsync(
    "SELECT id FROM sessions WHERE session_uuid = ? LIMIT 1",
    [normalizedReference]
  );
  if (normalizedExistingId) {
    if (
      normalizedReference !== normalizedExistingId ||
      existingById?.id !== normalizedExistingId ||
      (existingByReference && existingByReference.id !== normalizedExistingId)
    ) {
      throw new Error("Session reference changed or is missing. Reopen the saved session before editing.");
    }
  } else if (existingById || existingByReference) {
    throw new Error("Session reference is already in use. Reopen the new-session screen and try again.");
  }
}

export async function assertSessionReferenceAvailable(reference, existingSessionId = null) {
  const db = await getLocalDatabase();
  return assertSessionReferenceAvailableWithDb(db, reference, existingSessionId);
}

export async function listSessions() {
  const db = await getLocalDatabase();
  await reconcileCompletedSessions(db);

  const rows = await db.getAllAsync(
    `
      SELECT
        id,
        session_uuid AS sessionUUID,
        session_display_id AS sessionDisplayId,
        session_name AS sessionName,
        session_type AS sessionType,
        samples_in_session AS samplesInSession,
        status,
        session_date AS sessionDate,
        cupping_form AS cuppingForm,
        form_key AS formKey,
        form_version AS formVersion,
        form_hash AS formHash,
        cupping_mode AS cuppingMode,
        form_locked AS formLocked,
        updated_at AS updatedAt
      FROM sessions
      ORDER BY updated_at DESC
    `
  );

  return rows || [];
}

export async function findPendingSessionByCupUUID({ cupUUID, excludeSessionId } = {}) {
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  if (!normalizedCupUUID) {
    return null;
  }

  const db = await getLocalDatabase();
  const excludedId = cleanString(excludeSessionId);

  const row = excludedId
    ? await db.getFirstAsync(
        `
          SELECT
            s.id,
            s.session_uuid AS sessionUUID,
            s.session_display_id AS sessionDisplayId,
            s.session_name AS sessionName,
            s.session_type AS sessionType,
            s.status,
            s.session_date AS sessionDate,
            s.updated_at AS updatedAt
          FROM samples sm
          INNER JOIN sessions s ON sm.session_id = s.id
          WHERE sm.cup_uuid = ? AND s.id != ? AND s.status IN ('new', 'pending', 'in_progress')
          ORDER BY s.updated_at DESC
          LIMIT 1
        `,
        [normalizedCupUUID, excludedId]
      )
    : await db.getFirstAsync(
        `
          SELECT
            s.id,
            s.session_uuid AS sessionUUID,
            s.session_display_id AS sessionDisplayId,
            s.session_name AS sessionName,
            s.session_type AS sessionType,
            s.status,
            s.session_date AS sessionDate,
            s.updated_at AS updatedAt
          FROM samples sm
          INNER JOIN sessions s ON sm.session_id = s.id
          WHERE sm.cup_uuid = ? AND s.status IN ('new', 'pending', 'in_progress')
          ORDER BY s.updated_at DESC
          LIMIT 1
        `,
        [normalizedCupUUID]
      );

  return row || null;
}

export async function findSessionBySessionUUID(sessionUUID) {
  const normalizedSessionUUID = normalizeSessionUuid(sessionUUID);
  if (!normalizedSessionUUID) {
    return null;
  }

  const db = await getLocalDatabase();
  const row = await db.getFirstAsync(
    `
      SELECT
        id,
        session_uuid AS sessionUUID,
        session_display_id AS sessionDisplayId,
        session_name AS sessionName,
        session_type AS sessionType,
        samples_in_session AS samplesInSession,
        status,
        session_date AS sessionDate,
        cupping_form AS cuppingForm,
        form_key AS formKey,
        form_version AS formVersion,
        form_hash AS formHash,
        cupping_mode AS cuppingMode,
        form_locked AS formLocked,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sessions
      WHERE session_uuid = ?
      LIMIT 1
    `,
    [normalizedSessionUUID]
  );

  return row || null;
}

export async function getSessionById(sessionId, { reconcile = true } = {}) {
  const db = await getLocalDatabase();
  if (reconcile) await reconcileCompletedSessions(db);

  const session = await db.getFirstAsync(
    `
      SELECT
        id,
        session_uuid AS sessionUUID,
        session_display_id AS sessionDisplayId,
        session_name AS sessionName,
        session_type AS sessionType,
        samples_in_session AS samplesInSession,
        status,
        session_date AS sessionDate,
        cupping_form AS cuppingForm,
        form_key AS formKey,
        form_version AS formVersion,
        form_hash AS formHash,
        cupping_mode AS cuppingMode,
        form_locked AS formLocked,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sessions
      WHERE id = ?
      LIMIT 1
    `,
    [sessionId]
  );

  if (!session) {
    return null;
  }

  const samples = await db.getAllAsync(
    `
      SELECT
        id,
        cup_uuid AS cupUUID,
        cup_number AS cupNumber,
        cupping_form AS cuppingForm,
        cupping_mode AS cuppingMode,
        sample_number AS sampleNumber,
        coffee_name_origin AS coffeeNameOrigin,
        process,
        position_index AS positionIndex
      FROM samples
      WHERE session_id = ?
      ORDER BY position_index ASC, created_at ASC
    `,
    [sessionId]
  );

  return {
    ...session,
    samples: samples || [],
  };
}

async function assertPinnedSessionWithDb(db, sessionId) {
  const row = await db.getFirstAsync(
    `SELECT cupping_form AS cuppingForm, form_key AS formKey,
            form_version AS formVersion, form_hash AS formHash, cupping_mode AS cuppingMode
     FROM sessions WHERE id = ? LIMIT 1`,
    [sessionId]
  );
  if (!isPinnedForm(row, row?.cuppingForm) || (row.cuppingForm === 2 && row.cuppingMode !== 'open')) {
    throw new Error("This older or unsupported prototype session is read-only. No record was changed.");
  }
}

export async function findSampleInSessionByCupUUID({ sessionId, cupUUID } = {}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  if (!normalizedSessionId || !normalizedCupUUID) {
    return null;
  }

  const db = await getLocalDatabase();
  const row = await db.getFirstAsync(
    `
      SELECT
        id,
        session_id AS sessionId,
        cup_uuid AS cupUUID,
        cup_number AS cupNumber,
        cupping_form AS cuppingForm,
        cupping_mode AS cuppingMode,
        sample_number AS sampleNumber,
        coffee_name_origin AS coffeeNameOrigin,
        process,
        position_index AS cupIndex,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM samples
      WHERE session_id = ? AND cup_uuid = ?
      LIMIT 1
    `,
    [normalizedSessionId, normalizedCupUUID]
  );

  return row || null;
}

export async function upsertSessionFromCupMetadata({
  sessionUUID,
  cuppingForm,
  sessionName,
  sessionType,
  sessionDate,
  samplesInSession,
  status = "new",
} = {}) {
  const f = requireFormTag({ f: cuppingForm });
  const pinnedForm = formIdentity(f);
  const normalizedSessionUUID = normalizeSessionUuid(sessionUUID);
  if (!normalizedSessionUUID) {
    throw new Error("sessionUUID is required to upsert a session.");
  }

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  const existing = await findSessionBySessionUUID(normalizedSessionUUID);
  if (existing && !isPinnedForm(existing, f)) {
    throw new Error("This cup refers to an older or unsupported prototype session. Its local data was not changed.");
  }
  if (f === 2 && (!existing || existing.cuppingMode !== 'open')) {
    throw new Error('SCA Legacy cup is not linked to a trusted local Open Cupping session. No local data was changed.');
  }
  if (f === 2) return existing;
  const sessionId = cleanString(existing?.id) || normalizedSessionUUID;
  const createdAt = cleanString(existing?.createdAt) || nowIso;
  const nextStatus = cleanString(existing?.status || status).toLowerCase() || "new";
  const nextSessionName = f === 2 ? existing.sessionName : cleanString(sessionName) || cleanString(existing?.sessionName) || "Imported Session";
  const nextSessionType = f === 2 ? existing.sessionType : getSessionTypeLabel(sessionType) || cleanString(existing?.sessionType) || "Other";
  const nextSessionDate = f === 2 ? existing.sessionDate : getSessionDateLabel(sessionDate) || cleanString(existing?.sessionDate) || formatSessionDateFallback(new Date());
  const nextSamplesInSession = f === 2 ? Number(existing.samplesInSession) || 0 : normalizePositiveInteger(samplesInSession, Number(existing?.samplesInSession) || 0);
  const nextDisplayId = cleanString(existing?.sessionDisplayId) || `SESSION-${normalizedSessionUUID.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  await db.runAsync(
    `
      INSERT INTO sessions (
        id, session_uuid, session_display_id, session_name, session_type, samples_in_session, status, session_date,
        cupping_form, form_key, form_version, form_hash, cupping_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_uuid = excluded.session_uuid,
        session_display_id = excluded.session_display_id,
        session_name = excluded.session_name,
        session_type = excluded.session_type,
        samples_in_session = excluded.samples_in_session,
        status = excluded.status,
        session_date = excluded.session_date,
        cupping_form = excluded.cupping_form,
        form_key = excluded.form_key,
        form_version = excluded.form_version,
        form_hash = excluded.form_hash,
        cupping_mode = excluded.cupping_mode,
        updated_at = excluded.updated_at
    `,
    [
      sessionId,
      normalizedSessionUUID,
      nextDisplayId,
      nextSessionName,
      nextSessionType,
      nextSamplesInSession,
      nextStatus,
      nextSessionDate,
      pinnedForm.f,
      pinnedForm.form_key,
      pinnedForm.form_version,
      pinnedForm.form_hash,
      f === 2 ? 'open' : null,
      createdAt,
      nowIso,
    ]
  );

  return {
    id: sessionId,
    sessionUUID: normalizedSessionUUID,
    sessionDisplayId: nextDisplayId,
    sessionName: nextSessionName,
    sessionType: nextSessionType,
    samplesInSession: nextSamplesInSession,
    status: nextStatus,
    sessionDate: nextSessionDate,
    cuppingForm: pinnedForm.f,
    formKey: pinnedForm.form_key,
    formVersion: pinnedForm.form_version,
    formHash: pinnedForm.form_hash,
    cuppingMode: f === 2 ? 'open' : null,
    createdAt,
    updatedAt: nowIso,
  };
}

export async function upsertSessionSampleFromCupMetadata({
  sessionId,
  cupUUID,
  coffeeNameOrigin,
  process,
  cupNumber,
  cuppingForm,
  cuppingMode,
  sampleNumber,
} = {}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  if (!normalizedSessionId || !normalizedCupUUID) {
    throw new Error("sessionId and cupUUID are required to upsert a sample.");
  }

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  const existing = await findSampleInSessionByCupUUID({
    sessionId: normalizedSessionId,
    cupUUID: normalizedCupUUID,
  });

  const sampleCountRow = await db.getFirstAsync(
    `
      SELECT COUNT(*) AS count
      FROM samples
      WHERE session_id = ?
    `,
    [normalizedSessionId]
  );
  const sampleCount = Number(sampleCountRow?.count) || 0;
  const nextCupIndex =
    existing && Number.isInteger(Number(existing.cupIndex))
      ? Number(existing.cupIndex)
      : sampleCount;

  const sampleId = cleanString(existing?.id) || generateId();
  const createdAt = cleanString(existing?.createdAt) || nowIso;
  const nextCupNumber = coerceCupNumber(cupNumber ?? existing?.cupNumber);
  const pinnedSession = await getSessionById(normalizedSessionId, { reconcile: cuppingForm !== 2 });
  if (!isPinnedForm(pinnedSession, cuppingForm) || (existing && existing.cuppingForm !== cuppingForm)) {
    throw new Error("Cup form does not match the session form. No sample was changed.");
  }
  const nextCuppingForm = cuppingForm;
  if (nextCuppingForm === 2 && existing && Number(existing.cupNumber) !== nextCupNumber) {
    const responseRow = await db.getFirstAsync('SELECT sample_id FROM legacy_responses WHERE sample_id = ? LIMIT 1', [existing.id]);
    if (responseRow) throw new Error('Cannot change the cup count after a Legacy response was saved. No local record was changed.');
  }
  const nextCuppingMode = requireTagCuppingMode(
    cuppingMode === "b" || cuppingMode === "o" ? { m: cuppingMode } : { cuppingMode }
  );
  if (nextCuppingForm === 2 && (pinnedSession.cuppingMode !== 'open' || nextCuppingMode !== 'open')) {
    throw new Error('SCA Legacy Blind Cupping is not yet available. No local record was changed.');
  }
  if (nextCuppingForm === 2) {
    if (!existing) {
      throw new Error('This Legacy cup has no trusted local assignment. Reopen the Session and assign the cup before scanning; no local data was changed.');
    }
    if (Number(existing.cupNumber) !== nextCupNumber ||
        cleanString(coffeeNameOrigin) !== existing.coffeeNameOrigin ||
        String(process) !== String(existing.process) ||
        normalizePositiveInteger(sampleNumber, existing.sampleNumber) !== Number(existing.sampleNumber)) {
      throw new Error('Legacy cup metadata conflicts with its trusted local assignment. No local record was changed.');
    }
    return existing;
  }
  if ((pinnedSession.samples || []).some((sample) => sample.cuppingMode !== nextCuppingMode)) {
    throw new Error("Cup cupping mode conflicts with its stored session samples. No local record was changed.");
  }
  const nextSampleNumber = normalizePositiveInteger(
    sampleNumber,
    Number(existing?.sampleNumber) || nextCupIndex + 1
  );
  const nextCoffeeNameOrigin =
    cleanString(coffeeNameOrigin) || cleanString(existing?.coffeeNameOrigin);
  const nextProcess = cleanString(process) || cleanString(existing?.process);

  await db.runAsync(
    `
      INSERT INTO samples (
        id, session_id, cup_uuid, cup_number, cupping_form, cupping_mode, sample_number, coffee_name_origin, process, position_index, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, cup_uuid) DO UPDATE SET
        cup_number = excluded.cup_number,
        cupping_form = excluded.cupping_form,
        cupping_mode = excluded.cupping_mode,
        sample_number = excluded.sample_number,
        coffee_name_origin = excluded.coffee_name_origin,
        process = excluded.process,
        position_index = excluded.position_index,
        updated_at = excluded.updated_at
    `,
    [
      sampleId,
      normalizedSessionId,
      normalizedCupUUID,
      nextCupNumber,
      nextCuppingForm,
      nextCuppingMode,
      nextSampleNumber,
      nextCoffeeNameOrigin,
      nextProcess,
      nextCupIndex,
      createdAt,
      nowIso,
    ]
  );

  await db.runAsync('UPDATE sessions SET form_locked = 1 WHERE id = ?', [normalizedSessionId]);

  await recomputeSessionProgressStatusWithDb(db, normalizedSessionId);

  return {
    id: sampleId,
    sessionId: normalizedSessionId,
    cupUUID: normalizedCupUUID,
    cupNumber: nextCupNumber,
    cuppingForm: nextCuppingForm,
    cuppingMode: nextCuppingMode,
    sampleNumber: nextSampleNumber,
    coffeeNameOrigin: nextCoffeeNameOrigin,
    process: nextProcess,
    cupIndex: nextCupIndex,
    createdAt,
    updatedAt: nowIso,
  };
}

export async function resolveActiveSampleFromCupMetadata({ cupUUID, metadata } = {}) {
  // Validate the raw tag before local fallback or any database write.
  const f = requireFormTag(metadata);
  const tagMode = requireTagCuppingMode(metadata);
  const rawCupCount = metadata?.cupNumber ?? metadata?.y;
  if (f === 2 && (!Number.isInteger(rawCupCount) || rawCupCount < 1 || rawCupCount > 8 || tagMode !== 'open')) {
    throw new Error('SCA Legacy cup count or Open mode is missing or unsupported. No local data was changed.');
  }
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  const sessionUUID = normalizeSessionUuid(
    metadata?.sessionUUID ?? metadata?.u
  );

  if (!normalizedCupUUID || !sessionUUID || sessionUUID.toUpperCase() === "NO-SESSION") {
    return null;
  }

  const existingSession = await findSessionBySessionUUID(sessionUUID);
  if (f === 2 && !existingSession) {
    throw new Error('SCA Legacy cup is not linked to a trusted local Open Cupping session. No local data was changed.');
  }
  if (existingSession) {
    if (!isPinnedForm(existingSession, f)) {
      throw new Error("This cup refers to an older or unsupported prototype session. Its local data was not changed.");
    }
    const trustedSession = await getSessionById(existingSession.id, { reconcile: f !== 2 });
    if ((f === 2 && (trustedSession.cuppingMode !== 'open' || tagMode !== 'open')) ||
        (trustedSession?.samples || []).some((sample) => sample.cuppingForm !== f || sample.cuppingMode !== tagMode)) {
      throw new Error("The cup form or cupping mode conflicts with stored session samples. No local record was changed.");
    }
    if (f === 2) {
      const storedSample = trustedSession.samples.find(sample => normalizeCupUuid(sample.cupUUID) === normalizedCupUUID);
      if (!storedSample) {
        throw new Error('This Legacy cup has no trusted local assignment. Reopen the Session and assign the cup before scanning; no local data was changed.');
      }
      if (Number(storedSample.cupNumber) !== rawCupCount ||
          storedSample.coffeeNameOrigin !== cleanString(metadata?.coffeeName ?? metadata?.n) ||
          String(storedSample.process) !== String(metadata?.coffeeProcess ?? metadata?.p) ||
          Number(storedSample.sampleNumber) !== Number(metadata?.sampleNumber ?? metadata?.z)) {
        throw new Error('Legacy cup metadata conflicts with its trusted local assignment. No local record was changed.');
      }
      return {
        sessionId: trustedSession.id, sessionUUID: trustedSession.sessionUUID,
        sessionDisplayId: trustedSession.sessionDisplayId, sessionName: trustedSession.sessionName,
        sessionType: trustedSession.sessionType, sessionStatus: trustedSession.status,
        sessionDate: trustedSession.sessionDate, sampleId: storedSample.id,
        cupUUID: storedSample.cupUUID, cupNumber: storedSample.cupNumber,
        cuppingForm: storedSample.cuppingForm, cuppingMode: storedSample.cuppingMode,
        sampleNumber: storedSample.sampleNumber, coffeeNameOrigin: storedSample.coffeeNameOrigin,
        coffeeProcess: storedSample.process, cupIndex: Number(storedSample.positionIndex) || 0,
        cupTotal: Number(trustedSession.samplesInSession) || trustedSession.samples.length || 1,
      };
    }
  }

  const session = f === 2 ? existingSession : await upsertSessionFromCupMetadata({
    sessionUUID,
    cuppingForm: metadata?.f ?? metadata?.cuppingForm,
    sessionName: metadata?.sessionName ?? metadata?.e,
    sessionType: metadata?.sessionType ?? metadata?.t,
    sessionDate: metadata?.sessionDate ?? metadata?.d,
    samplesInSession: metadata?.samplesInSession ?? metadata?.i,
    status: "new",
  });

  const sample = await upsertSessionSampleFromCupMetadata({
    sessionId: session.id,
    cupUUID: normalizedCupUUID,
    coffeeNameOrigin: metadata?.coffeeName ?? metadata?.n,
    process: metadata?.coffeeProcess ?? metadata?.p,
    cupNumber: metadata?.cupNumber ?? metadata?.y,
    cuppingForm: metadata?.cuppingForm ?? metadata?.f,
    cuppingMode: tagMode,
    sampleNumber: metadata?.sampleNumber ?? metadata?.z,
  });

  const db = await getLocalDatabase();
  // Transition session from new → pending on first cup scan.
  await db.runAsync(
    `UPDATE sessions SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'new'`,
    [new Date().toISOString(), session.id]
  );
  await db.runAsync(
    `UPDATE sessions SET updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), session.id]
  );

  const cupTotalRow = await db.getFirstAsync(
    `
      SELECT COUNT(*) AS count
      FROM samples
      WHERE session_id = ?
    `,
    [session.id]
  );

  return {
    sessionId: session.id,
    sessionUUID: session.sessionUUID,
    sessionDisplayId: session.sessionDisplayId,
    sessionName: session.sessionName,
    sessionType: session.sessionType,
    sessionStatus: session.status,
    sessionDate: session.sessionDate,
    sampleId: sample.id,
    cupUUID: sample.cupUUID,
    cupNumber: sample.cupNumber,
    cuppingForm: sample.cuppingForm,
    cuppingMode: sample.cuppingMode,
    sampleNumber: sample.sampleNumber,
    coffeeNameOrigin: sample.coffeeNameOrigin,
    coffeeProcess: sample.process,
    cupIndex: Number(sample.cupIndex) || 0,
    cupTotal: Number(session.samplesInSession) || Number(cupTotalRow?.count) || 1,
  };
}

export async function deleteSessionById(sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) {
    throw new Error("sessionId is required to delete a session.");
  }

  const db = await getLocalDatabase();
  const existing = await db.getFirstAsync(
    `
      SELECT id
      FROM sessions
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedSessionId]
  );

  if (!existing) {
    return { deleted: false };
  }

  await db.runAsync("DELETE FROM sessions WHERE id = ?", [normalizedSessionId]);
  return { deleted: true };
}

function trustedLegacySession(session) {
  if (!isPinnedForm(session, 2) || session.cuppingMode !== 'open') {
    throw new Error('SCA Legacy Open Cupping session identity is unavailable. No response was changed.');
  }
  return {
    profile: PROFILE,
    f: 2,
    identity: { form_key: session.formKey, form_version: session.formVersion, form_hash: session.formHash },
  };
}

export async function getLegacyResponse(sessionId, sampleId) {
  const session = await getSessionById(sessionId);
  const trusted = trustedLegacySession(session);
  const sample = session.samples.find((row) => row.id === sampleId);
  if (!sample || sample.cuppingForm !== 2 || sample.cuppingMode !== 'open') {
    throw new Error('Legacy sample identity does not match its session.');
  }
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync(
    'SELECT form_key AS formKey, form_version AS formVersion, form_hash AS formHash, cup_count AS cupCount, response_json AS responseJson, is_complete AS isComplete FROM legacy_responses WHERE session_id = ? AND sample_id = ? LIMIT 1',
    [sessionId, sampleId]
  );
  if (!row) return { response: null, complete: false, result: null, errors: [], sessionComplete: session.status === 'complete' };
  if (row.formKey !== trusted.identity.form_key || row.formVersion !== trusted.identity.form_version ||
      row.formHash !== trusted.identity.form_hash || Number(row.cupCount) !== Number(sample.cupNumber)) {
    throw new Error('Saved Legacy response identity or cup count conflicts with this session.');
  }
  let response;
  try { response = JSON.parse(row.responseJson); } catch { throw new Error('Saved Legacy response is damaged.'); }
  const input = { ...trusted, cup_count: Number(sample.cupNumber), response, complete: Boolean(row.isComplete) };
  const validation = validateResponse(input, trusted);
  if (row.isComplete && !validation.ok) throw new Error(`Saved Legacy response is invalid: ${validation.errors.join(', ')}`);
  const result = row.isComplete ? scoreResponse(input, trusted) : null;
  if (row.isComplete && !result?.ok) throw new Error('Saved Legacy score could not be reproduced.');
  return { response, complete: Boolean(row.isComplete), result, errors: validation.errors,
    sessionComplete: session.status === 'complete' };
}

export async function saveLegacyResponse({ sessionId, sampleId, response, complete = false }) {
  const session = await getSessionById(sessionId);
  const trusted = trustedLegacySession(session);
  if (session.status === 'complete') {
    return { ok: false, errors: ['session:complete_read_only'] };
  }
  const sample = session.samples.find((row) => row.id === sampleId);
  if (!sample || sample.cuppingForm !== 2 || sample.cuppingMode !== 'open') {
    throw new Error('Legacy sample identity does not match its session. No response was saved.');
  }
  const input = { ...trusted, cup_count: Number(sample.cupNumber), response, complete: Boolean(complete) };
  const validation = validateResponse(input, trusted);
  if (complete && !validation.ok) return { ok: false, errors: validation.errors };
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { ok: false, errors: ['response:invalid_object'] };
  }
  const result = complete ? scoreResponse(input, trusted) : null;
  if (complete && !result?.ok) return { ok: false, errors: result?.errors || ['score:invalid'] };
  const db = await getLocalDatabase();
  let outcome = null;
  // The earlier UI/validation read is not authority for a later write. Hold an
  // exclusive transaction while rechecking the current pin, Session state,
  // Sample mode/count, and any response row that an UPSERT would replace.
  await db.withExclusiveTransactionAsync(async (txn) => {
    const current = await txn.getFirstAsync(
      `SELECT s.status, s.cupping_form AS cuppingForm, s.form_key AS formKey,
              s.form_version AS formVersion, s.form_hash AS formHash, s.cupping_mode AS cuppingMode,
              sm.cupping_form AS sampleForm, sm.cupping_mode AS sampleMode, sm.cup_number AS cupCount
       FROM sessions s JOIN samples sm ON sm.session_id = s.id
       WHERE s.id = ? AND sm.id = ? LIMIT 1`, [sessionId, sampleId]
    );
    if (current?.status === 'complete') {
      outcome = { ok: false, errors: ['session:complete_read_only'] };
      return;
    }
    if (!current || current.cuppingForm !== 2 || current.sampleForm !== 2 ||
        current.cuppingMode !== 'open' || current.sampleMode !== 'open' ||
        current.formKey !== trusted.identity.form_key || current.formVersion !== trusted.identity.form_version ||
        current.formHash !== trusted.identity.form_hash || Number(current.cupCount) !== Number(sample.cupNumber)) {
      outcome = { ok: false, errors: ['session:form_or_sample_changed'] };
      return;
    }
    const prior = await txn.getFirstAsync(
      `SELECT session_id AS sessionId, form_key AS formKey, form_version AS formVersion,
              form_hash AS formHash, cup_count AS cupCount
       FROM legacy_responses WHERE sample_id = ? LIMIT 1`, [sampleId]
    );
    if (prior && (prior.sessionId !== sessionId || prior.formKey !== trusted.identity.form_key ||
        prior.formVersion !== trusted.identity.form_version || prior.formHash !== trusted.identity.form_hash ||
        Number(prior.cupCount) !== Number(sample.cupNumber))) {
      outcome = { ok: false, errors: ['response:stored_identity_mismatch'] };
      return;
    }
    await txn.runAsync(
      `INSERT INTO legacy_responses (sample_id, session_id, form_key, form_version, form_hash, cup_count, response_json, is_complete, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sample_id) DO UPDATE SET response_json = excluded.response_json, is_complete = excluded.is_complete,
         updated_at = excluded.updated_at`,
      [sampleId, sessionId, trusted.identity.form_key, trusted.identity.form_version, trusted.identity.form_hash,
        Number(sample.cupNumber), JSON.stringify(response), complete ? 1 : 0, new Date().toISOString()]
    );
    await recomputeSessionProgressStatusWithDb(txn, sessionId);
    outcome = { ok: true, result, errors: validation.errors };
  });
  return outcome;
}

export async function getSessionSampleFinalStatus(sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) {
    return {};
  }

  const db = await getLocalDatabase();
  const session = await getSessionById(normalizedSessionId);
  if (isPinnedForm(session, 2)) {
    trustedLegacySession(session);
    const rows = await db.getAllAsync(
      'SELECT sample_id AS sampleId, is_complete AS isComplete FROM legacy_responses WHERE session_id = ?',
      [normalizedSessionId]
    );
    const saved = new Map((rows || []).map((row) => [row.sampleId, row]));
    const statuses = {};
    for (const sample of session.samples) {
      const row = saved.get(sample.id);
      const complete = row ? await getLegacyResponse(normalizedSessionId, sample.id) : null;
      statuses[sample.id] = { isComplete: Boolean(complete?.result?.ok), finalScore: complete?.result?.display_score || null,
        resultLabel: complete?.result?.label || null, hasAnyFeedback: Boolean(row), scoresByField: {} };
    }
    return statuses;
  }
  const samples = await db.getAllAsync(
    `
      SELECT id
      FROM samples
      WHERE session_id = ?
    `,
    [normalizedSessionId]
  );

  const sampleIds = (samples || []).map((row) => cleanString(row?.id)).filter(Boolean);
  if (sampleIds.length === 0) {
    return {};
  }

  const placeholders = sampleIds.map(() => "?").join(", ");
  let feedbackRows = [];
  try {
    feedbackRows = await db.getAllAsync(
      `
        SELECT
          sample_id AS sampleId,
          field_name AS fieldName,
          score,
          created_at AS createdAt
        FROM sample_feedback_entries
        WHERE session_id = ?
          AND sample_id IN (${placeholders})
        ORDER BY created_at ASC
      `,
      [normalizedSessionId, ...sampleIds]
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("no such column: is_final")) {
      throw error;
    }
    feedbackRows = [];
  }

  let defectRows = [];
  try {
    defectRows = await db.getAllAsync(
      `
        SELECT
          sample_id AS sampleId,
          non_uniform_cups AS nonUniformCups,
          defective_cups AS defectiveCups,
          number_of_cups AS numberOfCups,
          created_at AS createdAt
        FROM sample_defect_entries
        WHERE session_id = ?
          AND sample_id IN (${placeholders})
        ORDER BY created_at ASC
      `,
      [normalizedSessionId, ...sampleIds]
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("no such column: is_final")) {
      throw error;
    }
    defectRows = [];
  }

  const latestScoresBySample = {};
  (feedbackRows || []).forEach((row) => {
    const sampleId = cleanString(row?.sampleId);
    const fieldName = cleanString(row?.fieldName);
    if (!sampleId || !fieldName) {
      return;
    }
    if (!latestScoresBySample[sampleId]) {
      latestScoresBySample[sampleId] = {};
    }
    latestScoresBySample[sampleId][fieldName] = row?.score == null ? 0 : Number(row.score);
  });

  const latestDefectsBySample = {};
  (defectRows || []).forEach((row) => {
    const sampleId = cleanString(row?.sampleId);
    if (!sampleId) {
      return;
    }
    latestDefectsBySample[sampleId] = {
      nonUniformCups: Math.max(0, Number.parseInt(row?.nonUniformCups, 10) || 0),
      defectiveCups: Math.max(0, Number.parseInt(row?.defectiveCups, 10) || 0),
      numberOfCups: Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1),
    };
  });

  return sampleIds.reduce((acc, sampleId) => {
    const finalScoresByField = latestScoresBySample[sampleId] || {};
    const hasAnyFeedback = Object.keys(finalScoresByField).length > 0;
    const isComplete =
      hasAnyFeedback &&
      CUPPING_SCORE_FIELDS.every((field) => finalScoresByField[field] !== undefined);
    if (!isComplete) {
      acc[sampleId] = {
        isComplete: false,
        finalScore: null,
        scoresByField: finalScoresByField,
        hasAnyFeedback,
      };
      return acc;
    }

    const defects = latestDefectsBySample[sampleId] || {
      nonUniformCups: 0,
      defectiveCups: 0,
      numberOfCups: 1,
    };

    acc[sampleId] = {
      isComplete: true,
      finalScore: calculateFinalScore({
        finalScoresByField,
        nonUniformCups: defects.nonUniformCups,
        defectiveCups: defects.defectiveCups,
        numberOfCups: defects.numberOfCups,
      }),
      scoresByField: finalScoresByField,
      hasAnyFeedback,
    };
    return acc;
  }, {});
}

export async function activateSession(sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) return;
  const db = await getLocalDatabase();
  await assertPinnedSessionWithDb(db, normalizedSessionId);
  await db.runAsync(
    `UPDATE sessions SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'new'`,
    [new Date().toISOString(), normalizedSessionId]
  );
}

export async function resetSessionToPending(sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) return { updated: false };
  const db = await getLocalDatabase();
  await assertPinnedSessionWithDb(db, normalizedSessionId);
  await db.runAsync(
    `UPDATE sessions SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'complete'`,
    [new Date().toISOString(), normalizedSessionId]
  );
  return { updated: true };
}

export async function manuallyMarkSessionComplete(sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) return { updated: false };
  const db = await getLocalDatabase();
  await assertPinnedSessionWithDb(db, normalizedSessionId);
  await db.runAsync(
    `UPDATE sessions SET status = 'complete', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), normalizedSessionId]
  );
  return { updated: true };
}

export async function getSessionCompletionSummary(sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) return { allComplete: false, incompleteSamples: [] };

  const db = await getLocalDatabase();
  const sampleRows = await db.getAllAsync(
    `SELECT id, sample_number AS sampleNumber, coffee_name_origin AS coffeeNameOrigin
     FROM samples WHERE session_id = ? ORDER BY position_index ASC`,
    [normalizedSessionId]
  );

  const statusMap = await getSessionSampleFinalStatus(normalizedSessionId);

  const incomplete = (sampleRows || [])
    .filter((row) => !statusMap[row.id]?.isComplete)
    .map((row, idx) => ({
      sampleId: row.id,
      name: cleanString(row.coffeeNameOrigin) || `Sample ${Number(row.sampleNumber) || idx + 1}`,
    }));

  return { allComplete: incomplete.length === 0, incompleteSamples: incomplete };
}

export async function deleteSampleFromSession(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) throw new Error("sampleId is required.");
  const db = await getLocalDatabase();
  const sample = await db.getFirstAsync(
    "SELECT session_id AS sessionId FROM samples WHERE id = ? LIMIT 1",
    [normalizedSampleId]
  );
  if (!sample?.sessionId) return { deleted: false };
  await assertPinnedSessionWithDb(db, sample.sessionId);
  const owner = await db.getFirstAsync('SELECT cupping_form AS cuppingForm, status FROM sessions WHERE id = ? LIMIT 1', [sample.sessionId]);
  if (owner?.cuppingForm === 2 && owner.status === 'complete') {
    throw new Error('This completed Legacy Session is read-only. Reset it to Pending before editing; no local record was changed.');
  }
  if (owner?.cuppingForm === 2) {
    const response = await db.getFirstAsync('SELECT sample_id FROM legacy_responses WHERE sample_id = ? LIMIT 1', [normalizedSampleId]);
    if (response) throw new Error('A Legacy sample with a saved response cannot be removed. No local record was changed.');
  }
  await db.runAsync("DELETE FROM samples WHERE id = ?", [normalizedSampleId]);
  if (sample?.sessionId) {
    await recomputeSessionProgressStatusWithDb(db, sample.sessionId);
  }
  return { deleted: true };
}

export async function markSessionCompleteIfAllSamplesComplete(sessionId) {
  const normalizedSessionId = cleanString(sessionId);
  if (!normalizedSessionId) {
    return { updated: false, status: null };
  }

  const db = await getLocalDatabase();
  await assertPinnedSessionWithDb(db, normalizedSessionId);

  const sampleStatusMap = await getSessionSampleFinalStatus(normalizedSessionId);
  const statusEntries = Object.values(sampleStatusMap || {});
  if (statusEntries.length === 0) {
    return { updated: false, status: null };
  }

  const nowIso = new Date().toISOString();
  const allComplete = statusEntries.every((entry) => Boolean(entry?.isComplete));
  if (!allComplete) {
    await db.runAsync(
      `
        UPDATE sessions
        SET status = 'pending',
            updated_at = ?
        WHERE id = ?
          AND status = 'complete'
      `,
      [nowIso, normalizedSessionId]
    );
    return { updated: true, status: "incomplete" };
  }

  await db.runAsync(
    `
      UPDATE sessions
      SET status = 'complete',
          updated_at = ?
      WHERE id = ?
    `,
    [nowIso, normalizedSessionId]
  );

  return { updated: true, status: "complete" };
}

export async function findActiveSampleByCupUUID(cupUUID) {
  const normalizedCupUUID = normalizeCupUuid(cupUUID);
  if (!normalizedCupUUID) {
    return null;
  }

  const db = await getLocalDatabase();
  await reconcileCompletedSessions(db);

  const row = await db.getFirstAsync(
    `
      SELECT
        s.id AS sessionId,
        s.session_uuid AS sessionUUID,
        s.session_display_id AS sessionDisplayId,
        s.session_name AS sessionName,
        s.session_type AS sessionType,
        s.status AS sessionStatus,
        s.session_date AS sessionDate,
        s.cupping_form AS sessionCuppingForm,
        s.form_key AS formKey,
        s.form_version AS formVersion,
        s.form_hash AS formHash,
        sm.id AS sampleId,
        sm.cup_uuid AS cupUUID,
        sm.cup_number AS cupNumber,
        sm.cupping_form AS cuppingForm,
        sm.cupping_mode AS cuppingMode,
        sm.sample_number AS sampleNumber,
        sm.coffee_name_origin AS coffeeNameOrigin,
        sm.process AS coffeeProcess,
        sm.position_index AS cupIndex,
        (
          SELECT COUNT(*)
          FROM samples s2
          WHERE s2.session_id = s.id
        ) AS cupTotal
      FROM samples sm
      INNER JOIN sessions s ON sm.session_id = s.id
      WHERE sm.cup_uuid = ?
        AND s.status IN ('new', 'pending', 'in_progress', 'complete')
      ORDER BY
        CASE s.status
          WHEN 'in_progress' THEN 0
          WHEN 'pending' THEN 1
          WHEN 'new' THEN 2
          WHEN 'complete' THEN 3
          ELSE 3
        END,
        s.updated_at DESC
      LIMIT 1
    `,
    [normalizedCupUUID]
  );

  if (!row) {
    return null;
  }

  return {
    ...row,
    cupIndex: Number(row.cupIndex) || 0,
    cupTotal: Number(row.cupTotal) || 1,
    cupNumber: Number(row.cupNumber) || 3,
    cuppingForm: row.cuppingForm,
    cuppingMode: normalizeCuppingModeKey(row.cuppingMode),
    sampleNumber: Number(row.sampleNumber) || null,
  };
}

export async function getSampleFeedback(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) {
    return {};
  }

  const db = await getLocalDatabase();
  let rows = [];
  try {
    rows = await db.getAllAsync(
      `
        SELECT
          field_name AS fieldName,
          is_final AS isFinal,
          score,
          comments,
          temp_snapshot AS tempSnapshot,
          time_snapshot AS timeSnapshot,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sample_feedback_entries
        WHERE sample_id = ?
        ORDER BY created_at ASC
      `,
      [normalizedSampleId]
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("no such column: is_final")) {
      throw error;
    }

    // Backward compatibility: older local DB before final-score migration.
    rows = await db.getAllAsync(
      `
        SELECT
          field_name AS fieldName,
          0 AS isFinal,
          score,
          comments,
          temp_snapshot AS tempSnapshot,
          time_snapshot AS timeSnapshot,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sample_feedback_entries
        WHERE sample_id = ?
        ORDER BY created_at ASC
      `,
      [normalizedSampleId]
    );
  }

  return (rows || []).reduce((acc, row) => {
    const key = cleanString(row?.fieldName);
    if (!key) {
      return acc;
    }

    if (!Array.isArray(acc[key])) {
      acc[key] = [];
    }

    acc[key].push({
      isFinal: Number(row?.isFinal) === 1,
      score: row?.score == null ? null : Number(row.score),
      comments: cleanString(row?.comments),
      tempSnapshot: cleanString(row?.tempSnapshot),
      timeSnapshot: cleanString(row?.timeSnapshot),
      createdAt: cleanString(row?.createdAt),
      updatedAt: cleanString(row?.updatedAt),
    });

    return acc;
  }, {});
}

export async function getSampleFlavourObservations(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) {
    return [];
  }

  const db = await getLocalDatabase();
  const rows = await db.getAllAsync(
    `
      SELECT
        keyword,
        label,
        colour,
        temp_c AS tempC,
        elapsed_seconds AS elapsedSeconds,
        source_field AS sourceField,
        created_at AS createdAt
      FROM sample_flavour_observations
      WHERE sample_id = ?
      ORDER BY created_at ASC
    `,
    [normalizedSampleId]
  );

  return (rows || []).map((row) => ({
    keyword: cleanString(row?.keyword),
    label: cleanString(row?.label),
    colour: cleanString(row?.colour),
    tempC: row?.tempC == null ? null : Number(row.tempC),
    elapsedSeconds: row?.elapsedSeconds == null ? null : Number(row.elapsedSeconds),
    sourceField: cleanString(row?.sourceField),
    createdAt: cleanString(row?.createdAt),
  }));
}

export async function saveSampleFlavourObservations({
  sessionId,
  sampleId,
  observations = [],
} = {}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedSampleId = cleanString(sampleId);
  const normalizedObservations = (Array.isArray(observations) ? observations : [])
    .map((observation) => ({
      keyword: cleanString(observation?.keyword).toLowerCase(),
      label: cleanString(observation?.label) || cleanString(observation?.keyword),
      colour: cleanString(observation?.colour),
      tempC:
        observation?.tempC == null || Number.isNaN(Number(observation.tempC))
          ? null
          : Math.round(Number(observation.tempC)),
      elapsedSeconds:
        observation?.elapsedSeconds == null || Number.isNaN(Number(observation.elapsedSeconds))
          ? null
          : Math.max(0, Number.parseInt(observation.elapsedSeconds, 10)),
      sourceField: cleanString(observation?.sourceField),
      createdAt: cleanString(observation?.createdAt),
    }))
    .filter((observation) => observation.keyword && observation.label);

  if (!normalizedSessionId || !normalizedSampleId || normalizedObservations.length === 0) {
    return { savedCount: 0 };
  }

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  let savedCount = 0;

  await db.withTransactionAsync(async () => {
    for (const observation of normalizedObservations) {
      await db.runAsync(
        `
          INSERT INTO sample_flavour_observations (
            id, session_id, sample_id, keyword, label, colour, temp_c, elapsed_seconds, source_field, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          generateId(),
          normalizedSessionId,
          normalizedSampleId,
          observation.keyword,
          observation.label,
          observation.colour,
          observation.tempC,
          observation.elapsedSeconds,
          observation.sourceField,
          observation.createdAt || nowIso,
        ]
      );
      savedCount += 1;
    }
  });

  return { savedCount };
}

// Removes stored observations for a sample where the keyword is no longer present in the notes text.
// pruneGroups: [{ includeSourceFields: string[], keepKeywords: string[] }]
export async function pruneSampleFlavourObservations({ sampleId, pruneGroups = [] } = {}) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId || !pruneGroups.length) return;

  const db = await getLocalDatabase();
  const rows = await db.getAllAsync(
    "SELECT id, keyword, source_field FROM sample_flavour_observations WHERE sample_id = ?",
    [normalizedSampleId]
  );
  if (!rows.length) return;

  const idsToDelete = [];
  for (const row of rows) {
    const rowSourceParts = String(row.source_field || "").split(",").map((s) => s.trim());
    for (const { includeSourceFields, keepKeywords } of pruneGroups) {
      const overlaps = includeSourceFields.some((f) => rowSourceParts.includes(f));
      if (!overlaps) continue;
      const keepSet = new Set((keepKeywords || []).map((k) => String(k).toLowerCase()));
      if (!keepSet.has(String(row.keyword || "").toLowerCase())) {
        idsToDelete.push(row.id);
      }
      break;
    }
  }

  if (idsToDelete.length === 0) return;
  await db.withTransactionAsync(async () => {
    for (const id of idsToDelete) {
      await db.runAsync("DELETE FROM sample_flavour_observations WHERE id = ?", [id]);
    }
  });
}

export async function hasFinalFeedbackForSample(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) {
    return false;
  }

  const db = await getLocalDatabase();
  try {
    const row = await db.getFirstAsync(
      `
        SELECT COUNT(DISTINCT field_name) AS count
        FROM sample_feedback_entries
        WHERE sample_id = ? AND is_final = 1
          AND field_name IN (${CUPPING_SCORE_FIELDS.map(() => "?").join(", ")})
      `,
      [normalizedSampleId, ...CUPPING_SCORE_FIELDS]
    );
    return Number(row?.count) >= CUPPING_SCORE_FIELDS.length;
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("no such column: is_final")) {
      return false;
    }
    throw error;
  }
}

export async function getSampleDefects(sampleId) {
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSampleId) {
    return {
      nonFinal: [],
      final: [],
    };
  }

  const db = await getLocalDatabase();
  let rows = [];
  try {
    rows = await db.getAllAsync(
      `
        SELECT
          is_final AS isFinal,
          moldy,
          phenolic,
          potato,
          other_bean AS otherBean,
          underdeveloped,
          baked,
          uneven_roast AS unevenRoast,
          overdeveloped,
          non_uniform_cups AS nonUniformCups,
          defective_cups AS defectiveCups,
          non_uniform_mask AS nonUniformMask,
          defective_mask AS defectiveMask,
          defect_type_masks AS defectTypeMasks,
          number_of_cups AS numberOfCups,
          temp_snapshot AS tempSnapshot,
          time_snapshot AS timeSnapshot,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sample_defect_entries
        WHERE sample_id = ?
        ORDER BY created_at ASC
      `,
      [normalizedSampleId]
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("no such column")) {
      throw error;
    }
    rows = await db.getAllAsync(
      `
        SELECT
          0 AS isFinal,
          moldy,
          phenolic,
          potato,
          0 AS otherBean,
          0 AS underdeveloped,
          0 AS baked,
          0 AS unevenRoast,
          0 AS overdeveloped,
          non_uniform_cups AS nonUniformCups,
          defective_cups AS defectiveCups,
          '' AS nonUniformMask,
          '' AS defectiveMask,
          '' AS defectTypeMasks,
          number_of_cups AS numberOfCups,
          temp_snapshot AS tempSnapshot,
          time_snapshot AS timeSnapshot,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM sample_defect_entries
        WHERE sample_id = ?
        ORDER BY created_at ASC
      `,
      [normalizedSampleId]
    );
  }

  return (rows || []).reduce(
    (acc, row) => {
      const entry = {
        isFinal: Number(row?.isFinal) === 1,
        moldy: Number(row?.moldy) === 1,
        phenolic: Number(row?.phenolic) === 1,
        potato: Number(row?.potato) === 1,
        otherBean: Number(row?.otherBean) === 1,
        underdeveloped: Number(row?.underdeveloped) === 1,
        baked: Number(row?.baked) === 1,
        unevenRoast: Number(row?.unevenRoast) === 1,
        overdeveloped: Number(row?.overdeveloped) === 1,
        nonUniformCups: Math.max(0, Number.parseInt(row?.nonUniformCups, 10) || 0),
        defectiveCups: Math.max(0, Number.parseInt(row?.defectiveCups, 10) || 0),
        numberOfCups: Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1),
        nonUniformCupSlots: parseCupSlotMask(
          row?.nonUniformMask,
          row?.nonUniformCups,
          Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1)
        ),
        defectiveCupSlots: parseCupSlotMask(
          row?.defectiveMask,
          row?.defectiveCups,
          Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1)
        ),
        defectCupSlots: parseDefectTypeMasks(
          row?.defectTypeMasks,
          Math.max(1, Number.parseInt(row?.numberOfCups, 10) || 1)
        ),
        tempSnapshot: cleanString(row?.tempSnapshot),
        timeSnapshot: cleanString(row?.timeSnapshot),
        createdAt: cleanString(row?.createdAt),
        updatedAt: cleanString(row?.updatedAt),
      };

      if (entry.isFinal) {
        acc.final.push(entry);
      } else {
        acc.nonFinal.push(entry);
      }
      return acc;
    },
    { nonFinal: [], final: [] }
  );
}

export async function saveSampleDefectsEntry({
  sessionId,
  sampleId,
  defects = {},
  nonUniformCups = 0,
  defectiveCups = 0,
  nonUniformCupSlots = [],
  defectiveCupSlots = [],
  defectCupSlots = {},
  numberOfCups = 1,
  tempSnapshot = "",
  timeSnapshot = "",
  isFinal = false,
}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSessionId || !normalizedSampleId) {
    throw new Error("sessionId and sampleId are required to save defects.");
  }

  const cups = Math.max(1, Number.parseInt(numberOfCups, 10) || 1);
  const nonUniform = Math.max(0, Math.min(cups, Number.parseInt(nonUniformCups, 10) || 0));
  const defective = Math.max(0, Math.min(cups, Number.parseInt(defectiveCups, 10) || 0));

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  const defectsId = generateId();
  const normalizedNonUniformCupSlots = normalizeCupSlotList(nonUniformCupSlots, cups);
  const normalizedDefectiveCupSlots = normalizeCupSlotList(defectiveCupSlots, cups);
  const normalizedDefectCupSlots = normalizeDefectTypeMasks(defectCupSlots, cups);
  const nonUniformCount = normalizedNonUniformCupSlots.length > 0 ? normalizedNonUniformCupSlots.length : nonUniform;
  const defectiveCount = normalizedDefectiveCupSlots.length > 0 ? normalizedDefectiveCupSlots.length : defective;

  await db.runAsync(
    `
      INSERT INTO sample_defect_entries (
        id, session_id, sample_id, is_final, moldy, phenolic, potato, other_bean,
        underdeveloped, baked, uneven_roast, overdeveloped,
        non_uniform_cups, defective_cups, non_uniform_mask, defective_mask, defect_type_masks,
        number_of_cups, temp_snapshot, time_snapshot, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      defectsId,
      normalizedSessionId,
      normalizedSampleId,
      isFinal ? 1 : 0,
      defects?.moldy ? 1 : 0,
      defects?.phenolic ? 1 : 0,
      defects?.potato ? 1 : 0,
      defects?.otherBean ? 1 : 0,
      defects?.underdeveloped ? 1 : 0,
      defects?.baked ? 1 : 0,
      defects?.unevenRoast ? 1 : 0,
      defects?.overdeveloped ? 1 : 0,
      nonUniformCount,
      defectiveCount,
      JSON.stringify(normalizedNonUniformCupSlots),
      JSON.stringify(normalizedDefectiveCupSlots),
      JSON.stringify(normalizedDefectCupSlots),
      cups,
      cleanString(tempSnapshot),
      cleanString(timeSnapshot),
      nowIso,
      nowIso,
    ]
  );

  return {
    saved: true,
    id: defectsId,
  };
}

export async function saveSampleFeedbackBatch({
  sessionId,
  sampleId,
  feedback = {},
  tempSnapshot = "",
  timeSnapshot = "",
  isFinal = false,
}) {
  const normalizedSessionId = cleanString(sessionId);
  const normalizedSampleId = cleanString(sampleId);
  if (!normalizedSessionId || !normalizedSampleId) {
    throw new Error("sessionId and sampleId are required to save feedback.");
  }

  const entries = Object.entries(feedback || {}).filter(([fieldName]) => cleanString(fieldName));
  if (entries.length === 0) {
    return { savedCount: 0 };
  }

  const db = await getLocalDatabase();
  const nowIso = new Date().toISOString();
  let savedCount = 0;

  const isFinalValue = isFinal ? 1 : 0;
  await db.withTransactionAsync(async () => {
    for (const [fieldName, value] of entries) {
      const normalizedFieldName = cleanString(fieldName);
      const score =
        value?.score == null || Number.isNaN(Number(value.score)) ? null : Number.parseInt(value.score, 10);
      const comments = cleanString(value?.comments);

      if (score == null && !comments && !isFinal) {
        continue;
      }

      const feedbackId = generateId();
      const createdAt = nowIso;

      await db.runAsync(
        `
          INSERT INTO sample_feedback_entries (
            id, session_id, sample_id, field_name, is_final, score, comments, temp_snapshot, time_snapshot, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          feedbackId,
          normalizedSessionId,
          normalizedSampleId,
          normalizedFieldName,
          isFinalValue,
          score,
          comments,
          cleanString(tempSnapshot),
          cleanString(timeSnapshot),
          createdAt,
          nowIso,
        ]
      );
      savedCount += 1;
    }
  });

  if (savedCount > 0) {
    await recomputeSessionProgressStatusWithDb(db, normalizedSessionId);
  }

  return { savedCount };
}

export async function clearSampleFeedbackFields({ sampleId, fields = [], isFinal = null } = {}) {
  const normalizedSampleId = cleanString(sampleId);
  const normalizedFields = Array.from(
    new Set((Array.isArray(fields) ? fields : []).map((field) => cleanString(field)).filter(Boolean))
  );

  if (!normalizedSampleId || normalizedFields.length === 0) {
    return { clearedCount: 0 };
  }

  const db = await getLocalDatabase();
  const sample = await db.getFirstAsync(
    "SELECT session_id AS sessionId FROM samples WHERE id = ? LIMIT 1",
    [normalizedSampleId]
  );
  const placeholders = normalizedFields.map(() => "?").join(", ");
  const finalClause = isFinal === null ? "" : " AND is_final = ?";
  const params = [normalizedSampleId, ...normalizedFields];
  if (isFinal !== null) {
    params.push(isFinal ? 1 : 0);
  }

  const result = await db.runAsync(
    `
      DELETE FROM sample_feedback_entries
      WHERE sample_id = ?
        AND field_name IN (${placeholders})
        ${finalClause}
    `,
    params
  );

  const clearedCount = Number(result?.changes) || 0;
  if (clearedCount > 0 && sample?.sessionId) {
    await recomputeSessionProgressStatusWithDb(db, sample.sessionId);
  }

  return { clearedCount };
}

export async function clearSampleFinalFeedbackFields({ sampleId, fields = [] } = {}) {
  const normalizedSampleId = cleanString(sampleId);
  const normalizedFields = Array.from(
    new Set((Array.isArray(fields) ? fields : []).map((field) => cleanString(field)).filter(Boolean))
  );

  if (!normalizedSampleId || normalizedFields.length === 0) {
    return { clearedCount: 0 };
  }

  const db = await getLocalDatabase();
  const sample = await db.getFirstAsync(
    "SELECT session_id AS sessionId FROM samples WHERE id = ? LIMIT 1",
    [normalizedSampleId]
  );
  const placeholders = normalizedFields.map(() => "?").join(", ");
  const result = await db.runAsync(
    `
      DELETE FROM sample_feedback_entries
      WHERE sample_id = ?
        AND is_final = 1
        AND field_name IN (${placeholders})
    `,
    [normalizedSampleId, ...normalizedFields]
  );

  const clearedCount = Number(result?.changes) || 0;
  if (clearedCount > 0 && sample?.sessionId) {
    await recomputeSessionProgressStatusWithDb(db, sample.sessionId);
  }

  return { clearedCount };
}
