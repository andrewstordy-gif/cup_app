const { resolveForm } = require('./contract');

const PROFILE = 'ndef4-r1';
const UNSUPPORTED_MESSAGE = 'This session uses an unsupported or older prototype form. Start a new SCA CVA session to taste; the existing record has not been changed.';

function cvaIdentity() {
  const resolved = resolveForm(PROFILE, 1);
  if (!resolved.ok) throw new Error('The bundled SCA CVA form is unavailable.');
  return { f: 1, ...resolved.identity };
}

function rawFormValue(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const hasF = Object.prototype.hasOwnProperty.call(metadata, 'f');
  const hasAlias = Object.prototype.hasOwnProperty.call(metadata, 'cuppingForm');
  if (!hasF && !hasAlias) return null;
  if (hasF && hasAlias && metadata.f !== metadata.cuppingForm) return null;
  const value = hasF ? metadata.f : metadata.cuppingForm;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function requireCvaTag(metadata) {
  if (rawFormValue(metadata) !== 1) throw new Error('Cup form is missing, unsupported, or does not match SCA CVA. No tasting form was opened.');
}

function requireTagCuppingMode(metadata) {
  if (!metadata || typeof metadata !== 'object') throw new Error('Cup cupping mode is missing or unsupported. No tasting form was opened.');
  const compact = metadata.m;
  const alias = metadata.cuppingMode;
  const fromCompact = compact === 'b' ? 'blind' : compact === 'o' ? 'open' : null;
  const fromAlias = alias === 'blind' ? 'blind' : alias === 'open' ? 'open' : null;
  if ((!fromCompact && !fromAlias) || (compact !== undefined && !fromCompact) ||
      (alias !== undefined && !fromAlias) || (fromCompact && fromAlias && fromCompact !== fromAlias)) {
    throw new Error('Cup cupping mode is missing, unsupported, or conflicting. No tasting form was opened.');
  }
  return fromCompact || fromAlias;
}

function isPinnedCva(session) {
  const identity = cvaIdentity();
  return session?.cuppingForm === identity.f &&
    session?.formKey === identity.form_key &&
    session?.formVersion === identity.form_version &&
    session?.formHash === identity.form_hash;
}

function isSessionFormReady(sessionId, loadedForm) {
  return sessionId
    ? loadedForm?.loadedSessionId === sessionId && isPinnedCva(loadedForm)
    : loadedForm?.f === 1 && loadedForm?.form_hash === cvaIdentity().form_hash;
}

function requireCvaRoute(session, sample, metadata) {
  if (!isPinnedCva(session) || !sample || sample.cuppingForm !== 1 ||
      (metadata !== undefined && rawFormValue(metadata) !== 1)) {
    throw new Error(UNSUPPORTED_MESSAGE);
  }
}

module.exports = { PROFILE, UNSUPPORTED_MESSAGE, cvaIdentity, rawFormValue, requireCvaTag, requireTagCuppingMode, isPinnedCva, isSessionFormReady, requireCvaRoute };
