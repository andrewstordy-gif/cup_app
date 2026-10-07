const { resolveForm } = require('./contract');

const PROFILE = 'ndef4-r1';
const UNSUPPORTED_MESSAGE = 'This session uses an unsupported or older prototype form. Start a new supported SCA session to taste; the existing record has not been changed.';

function formIdentity(f) {
  const resolved = resolveForm(PROFILE, f);
  if (!resolved.ok) throw new Error('The bundled session form is unavailable.');
  return { f, ...resolved.identity };
}
const cvaIdentity = () => formIdentity(1);

function rawFormValue(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const hasF = Object.prototype.hasOwnProperty.call(metadata, 'f');
  const hasAlias = Object.prototype.hasOwnProperty.call(metadata, 'cuppingForm');
  if (!hasF && !hasAlias) return null;
  if (hasF && hasAlias && metadata.f !== metadata.cuppingForm) return null;
  const value = hasF ? metadata.f : metadata.cuppingForm;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function requireFormTag(metadata) {
  const f = rawFormValue(metadata);
  if (!resolveForm(PROFILE, f).ok) throw new Error('Cup form is missing, unsupported, or malformed. No tasting form was opened.');
  return f;
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

function isPinnedForm(session, f) {
  if (!resolveForm(PROFILE, f).ok) return false;
  const identity = formIdentity(f);
  return session?.cuppingForm === identity.f &&
    session?.formKey === identity.form_key &&
    session?.formVersion === identity.form_version &&
    session?.formHash === identity.form_hash;
}
const isPinnedCva = session => isPinnedForm(session, 1);

function isSessionFormReady(sessionId, loadedForm) {
  return sessionId
    ? loadedForm?.loadedSessionId === sessionId && isPinnedForm(loadedForm, loadedForm?.cuppingForm)
    : isPinnedForm({ cuppingForm: loadedForm?.f, formKey: loadedForm?.form_key, formVersion: loadedForm?.form_version, formHash: loadedForm?.form_hash }, loadedForm?.f);
}

function requireFormRoute(session, sample, metadata) {
  const f = session?.cuppingForm;
  if (!isPinnedForm(session, f) || !sample || sample.cuppingForm !== f ||
      (metadata !== undefined && rawFormValue(metadata) !== f)) {
    throw new Error(UNSUPPORTED_MESSAGE);
  }
  if (f === 2 && (session.cuppingMode !== 'open' || sample.cuppingMode !== 'open' ||
      (metadata !== undefined && requireTagCuppingMode(metadata) !== 'open'))) {
    throw new Error('SCA Legacy is available only for Open Cupping in this prototype. No tasting form was opened.');
  }
  return f;
}
function requireCvaRoute(session, sample, metadata) {
  if (requireFormRoute(session, sample, metadata) !== 1) throw new Error(UNSUPPORTED_MESSAGE);
}

module.exports = { PROFILE, UNSUPPORTED_MESSAGE, formIdentity, cvaIdentity, rawFormValue, requireFormTag, requireCvaTag, requireTagCuppingMode, isPinnedForm, isPinnedCva, isSessionFormReady, requireFormRoute, requireCvaRoute };
