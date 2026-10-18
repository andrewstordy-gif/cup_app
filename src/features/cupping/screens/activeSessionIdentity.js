import { getSessionDateDisplayLabel, getSessionTypeDisplayLabel } from "../constants/sessionDetails";

function isOpen(value) {
  return value === "open" || value === "o";
}

function isBlind(value) {
  return value === "blind" || value === "b";
}

// CVA quick-start records have no session mode, but every locally persisted
// sample has its own validated mode. Any missing or conflicting evidence hides
// identity for the whole participant-facing Active Session view.
export function showsOpenCvaIdentity(session, cups = []) {
  const sessionMode = session?.cuppingMode;
  const samples = Array.isArray(cups) ? cups : [];
  if (isBlind(sessionMode) || (sessionMode != null && !isOpen(sessionMode))) return false;
  if (samples.length === 0) return isOpen(sessionMode);
  return samples.every((cup) => isOpen(cup?.cuppingMode));
}

export function activeSampleLabel(cup, index) {
  const position = Number(cup?.sampleNumber);
  return `Sample ${Number.isInteger(position) && position > 0 ? position : index + 1}`;
}

export function projectActiveSessionIdentity(session, cups = [], { allowOpen = false } = {}) {
  const samples = Array.isArray(cups) ? cups : [];
  const identityHidden = !allowOpen || !showsOpenCvaIdentity(session, samples);
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
      coffeeNameOrigin: identityHidden ? activeSampleLabel(cup, index) : cup.coffeeNameOrigin,
      process: identityHidden ? null : cup.process,
      identityHidden,
    })),
  };
}

export function buildActiveSessionCompletionWarning(incompleteSamples = [], visibleCups = [], identityHidden = true) {
  const names = (Array.isArray(incompleteSamples) ? incompleteSamples : []).map((sample) => {
    if (!identityHidden) return `• ${sample.name}`;
    const index = visibleCups.findIndex((cup) => cup.id === sample.sampleId);
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
