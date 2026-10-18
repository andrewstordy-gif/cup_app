import { isPinnedForm } from "../../forms/sessionFormRoute";
import { getSessionDateDisplayLabel, getSessionTypeDisplayLabel } from "../constants/sessionDetails";

export function savedSessionName(session) {
  return typeof session?.sessionName === "string" && session.sessionName.trim()
    ? session.sessionName : "Untitled Session";
}

// Setup-only presentation. Call only with the result of getOwnedSessionSetup;
// never use this projection in lists, search or assessment navigation.
export function projectOwnedSetupIdentity(session) {
  return {
    identityHidden: false,
    sessionName: savedSessionName(session),
    sessionType: getSessionTypeDisplayLabel(session.sessionType),
    sessionDate: getSessionDateDisplayLabel(session.sessionDate),
    samples: session.samples || [],
  };
}

function isOpen(value) {
  return value === "open";
}

// These screens have no host/participant access boundary or durable local
// participant reveal. A saved record must therefore prove Open identity before
// any stored coffee identity is passed to a presentation component. Session
// names are ordinary metadata and do not depend on this coffee-identity flag.
export function canShowSavedSessionIdentity(session) {
  const samples = Array.isArray(session?.samples) ? session.samples : [];
  const form = session?.cuppingForm;
  if (form === 2) {
    return isPinnedForm(session, 2) && isOpen(session.cuppingMode) &&
      samples.every((sample) => sample?.cuppingForm === 2 && isOpen(sample.cuppingMode));
  }
  if (form !== 1 || !isPinnedForm(session, 1)) return false;
  if (session.cuppingMode !== null && session.cuppingMode !== undefined && !isOpen(session.cuppingMode)) {
    return false;
  }
  if (samples.length === 0) return isOpen(session.cuppingMode);
  return samples.every((sample) => sample?.cuppingForm === 1 && isOpen(sample.cuppingMode));
}

export function savedSampleLabel(sample, index) {
  const position = Number(sample?.sampleNumber);
  return `Sample ${Number.isInteger(position) && position > 0 ? position : index + 1}`;
}

export function projectSavedSessionIdentity(session, { allowOpen = false } = {}) {
  const identityHidden = !allowOpen || !canShowSavedSessionIdentity(session);
  const samples = Array.isArray(session?.samples) ? session.samples : [];
  return {
    identityHidden,
    sessionName: savedSessionName(session),
    sessionType: getSessionTypeDisplayLabel(session?.sessionType),
    sessionDate: getSessionDateDisplayLabel(session?.sessionDate),
    // Allowlist only what the saved-session card and assessment route need.
    // Never spread a raw sample into a participant-facing component.
    samples: samples.map((sample, index) => ({
      id: sample.id,
      cupUUID: sample.cupUUID,
      cupNumber: sample.cupNumber,
      sampleNumber: sample.sampleNumber,
      cuppingForm: sample.cuppingForm,
      cuppingMode: sample.cuppingMode,
      coffeeNameOrigin: identityHidden ? savedSampleLabel(sample, index) : sample.coffeeNameOrigin,
      process: identityHidden ? null : sample.process,
      identityHidden,
    })),
  };
}

// Navigation must apply the same projection before a raw saved Sample reaches
// either scoring form. In particular, a corrupted open Sample cannot overrule
// its blind Session and turn the assessment identity strip back on.
export function projectSavedAssessmentContext(session, context) {
  if (!context || canShowSavedSessionIdentity(session)) return context;
  const position = Number(context.sampleNumber);
  const index = Number(context.cupIndex);
  return {
    ...context,
    cuppingMode: "blind",
    coffeeNameOrigin: savedSampleLabel({ sampleNumber: position }, Number.isInteger(index) ? index : 0),
    process: "",
  };
}
