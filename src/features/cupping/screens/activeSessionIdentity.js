import { getSessionDateDisplayLabel, getSessionTypeDisplayLabel } from "../constants/sessionDetails";
import { canShowSavedSampleIdentity, canShowSavedSessionIdentity } from './savedSessionIdentity';

// Fallback projection has no completion authority. Validate stored per-sample
// modes; a legacy session-level mode never overrides the selected sample.
export function showsOpenCvaIdentity(session, cups = []) {
  return canShowSavedSessionIdentity({...session,samples:Array.isArray(cups)?cups:[]});
}

export function activeSampleLabel(cup, index) {
  if(typeof cup?.sampleCode==='string'&&/^[A-Z0-9]{2}$/.test(cup.sampleCode))return `Sample ${cup.sampleCode}`;
  const position = Number(cup?.sampleNumber);
  return `Sample ${Number.isInteger(position) && position > 0 ? position : index + 1}`;
}

export function projectActiveSessionIdentity(session, cups = [], { allowOpen = false } = {}) {
  const samples = Array.isArray(cups) ? cups : [];
  const stored={...session,samples};
  const hidden=cup=>!allowOpen||!canShowSavedSampleIdentity(stored,cup);
  const identityHidden = samples.length?samples.some(hidden):!allowOpen||!showsOpenCvaIdentity(session,samples);
  return {
    identityHidden,
    session: session ? {
      id: session.id,
      sessionDate: getSessionDateDisplayLabel(session.sessionDate),
      sessionName: typeof session.sessionName === "string" && session.sessionName.trim()
        ? session.sessionName : "Untitled Session",
      sessionType: getSessionTypeDisplayLabel(session.sessionType),
      status: session.status,
      samplesInSession: session.samplesInSession,
    } : null,
    cups: samples.map((cup, index) => ({
      id: cup.id,
      sampleNumber: cup.sampleNumber,
      sampleCode: cup.sampleCode,
      sampleColour: cup.sampleColour,
      cupNumber: cup.cupNumber,
      scores: cup.scores,
      defects: cup.defects,
      latestDefects: cup.latestDefects,
      fragranceAromaNotes: cup.fragranceAromaNotes,
      flavourNotes: cup.flavourNotes,
      fragranceAromaObs: cup.fragranceAromaObs,
      flavourObs: cup.flavourObs,
      noteGroups: cup.noteGroups,
      finalScore: cup.finalScore,
      currentScore: cup.currentScore,
      resultLabel: cup.resultLabel,
      coffeeNameOrigin: hidden(cup) ? activeSampleLabel(cup, index) : cup.coffeeNameOrigin,
      process: hidden(cup) ? null : cup.process,
      identityHidden: hidden(cup),
    })),
  };
}

export function buildActiveSessionCompletionWarning(incompleteSamples = [], visibleCups = [], identityHidden = true) {
  const names = (Array.isArray(incompleteSamples) ? incompleteSamples : []).map((sample) => {
    const index = visibleCups.findIndex((cup) => cup.id === sample.sampleId);
    if(index>=0 && visibleCups[index].identityHidden===false)return `• ${visibleCups[index].coffeeNameOrigin}`;
    return `• ${index < 0 ? "Sample" : activeSampleLabel(visibleCups[index], index)}`;
  }).join("\n");
  return `The following samples have incomplete cupping scores:\n\n${names}\n\nComplete the scores for each sample, or remove it from the session before marking complete.`;
}

export function buildActiveSessionShareMessage(session, cups = []) {
  const lines = [`CUP Session: ${session?.sessionName || "Untitled"}`];
  lines.push(`Date: ${getSessionDateDisplayLabel(session?.sessionDate)}`);
  lines.push(`Type: ${getSessionTypeDisplayLabel(session?.sessionType)}`);
  lines.push("");
  (Array.isArray(cups) ? cups : []).forEach((cup, index) => {
    const name = cup.coffeeNameOrigin || activeSampleLabel(cup, index);
    const score = cup.finalScore != null
      ? Number(cup.finalScore).toFixed(2)
      : cup.currentScore != null
        ? Number(cup.currentScore).toFixed(2)
        : "—";
    lines.push(`${cup.sampleNumber || index + 1}. ${name}  ${score}`);
    if (cup.resultLabel) lines.push(`   ${cup.resultLabel}`);
  });
  return lines.join("\n");
}
