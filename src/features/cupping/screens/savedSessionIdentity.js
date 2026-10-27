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
  return validSampleModes(session) && (samples.length ? samples.every(sample => isOpen(sample.cuppingMode)) : isOpen(session.cuppingMode));
}

function validSampleModes(session) {
  const form=session?.cuppingForm,samples=Array.isArray(session?.samples)?session.samples:[];
  if(![1,2].includes(form)||!isPinnedForm(session,form)||session.cuppingMode!=null&&!['open','blind'].includes(session.cuppingMode))return false;
  return (form!==2||session.cuppingMode==='open') && samples.every(sample=>sample?.cuppingForm===form&&['open','blind'].includes(sample.cuppingMode)&&(form!==2||sample.cuppingMode==='open'));
}

// Stored target mode is authoritative. A neighbouring Open sample, legacy
// session mode or caller-supplied route flag cannot reveal a Blind target.
export function canShowSavedSampleIdentity(session,sample) {
  return Boolean(sample && validSampleModes(session) && sample.cuppingForm===session.cuppingForm && isOpen(sample.cuppingMode));
}

export function savedSampleLabel(sample, index) {
  if(typeof sample?.sampleCode==='string'&&/^[A-Z0-9]{2}$/.test(sample.sampleCode))return `Sample ${sample.sampleCode}`;
  const position = Number(sample?.sampleNumber);
  return `Sample ${Number.isInteger(position) && position > 0 ? position : index + 1}`;
}

// Card props only: preparation metadata stays intact for setup/save/NFC. Do
// not feed this redaction back into session state or permission projections.
export function projectSessionDetailsCard(sample, statusLabel, index) {
  if (!sample || statusLabel !== "Pending" || sample.cuppingMode !== "blind") return sample;
  const label = typeof sample.sampleCode === "string" && /^[A-Z0-9]{2}$/.test(sample.sampleCode)
    ? sample.sampleCode : savedSampleLabel(sample, index);
  return { ...sample, coffeeNameOrigin: label, process: null, identityHidden: true };
}

export function projectSavedSessionIdentity(session, { allowOpen = false } = {}) {
  const samples = Array.isArray(session?.samples) ? session.samples : [];
  const hidden=sample=>!allowOpen||!canShowSavedSampleIdentity(session,sample);
  const identityHidden = samples.length ? samples.some(hidden) : !allowOpen||!canShowSavedSessionIdentity(session);
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
      sampleCode: sample.sampleCode,
      cuppingForm: sample.cuppingForm,
      cuppingMode: sample.cuppingMode,
      coffeeNameOrigin: hidden(sample) ? savedSampleLabel(sample, index) : sample.coffeeNameOrigin,
      process: hidden(sample) ? null : sample.process,
      identityHidden: hidden(sample),
    })),
  };
}

// Resolve the stored target before either scoring form. Neither a caller's Open
// flag nor an Open neighbour can reveal a Blind/missing target. Completion-aware
// reveal remains exclusively the repository projection's responsibility.
export function projectSavedAssessmentContext(session, context) {
  if (!context) return context;
  const samples=Array.isArray(session?.samples)?session.samples:[];
  const sample=context.sessionId===session?.id?samples.find(sample=>sample.id===context.sampleId):null;
  if(canShowSavedSampleIdentity(session,sample))return {...context,cuppingMode:sample.cuppingMode,coffeeNameOrigin:sample.coffeeNameOrigin,process:sample.process};
  const index=sample?samples.indexOf(sample):Number(context.cupIndex);
  return {
    ...context,
    cuppingMode: "blind",
    coffeeNameOrigin: savedSampleLabel(sample||{sampleCode:context.sampleCode,sampleNumber:context.sampleNumber}, Number.isInteger(index) ? index : 0),
    process: "",
  };
}
