#!/usr/bin/env node
const assert = require('node:assert/strict');
const {
  cvaIdentity, rawFormValue, requireCvaTag, isPinnedCva,
  requireCvaRoute, UNSUPPORTED_MESSAGE,
} = require('../src/features/forms/sessionFormRoute');

const identity = cvaIdentity();
const session = {
  cuppingForm: identity.f,
  formKey: identity.form_key,
  formVersion: identity.form_version,
  formHash: identity.form_hash,
};
const sample = { id: 'sample-1', cuppingForm: 1 };

assert.equal(rawFormValue({ f: 1 }), 1);
assert.equal(rawFormValue({ f: 1, cuppingForm: 1 }), 1);
for (const metadata of [null, {}, { f: '1' }, { f: 2 }, { f: 99 }, { f: 1.5 }, { f: 1, cuppingForm: 2 }]) {
  assert.throws(() => requireCvaTag(metadata), /missing, unsupported/);
  assert.throws(() => requireCvaRoute(session, sample, metadata), /unsupported or older prototype/);
}
assert.equal(rawFormValue({ f: '1' }), null);
assert.equal(rawFormValue({ f: 2 }), 2);
assert.equal(isPinnedCva(session), true);
assert.doesNotThrow(() => requireCvaTag({ f: 1 }));
assert.doesNotThrow(() => requireCvaRoute(session, sample, { f: 1 }));
assert.doesNotThrow(() => requireCvaRoute(session, sample)); // Normal local sample-open.
assert.throws(() => requireCvaRoute({ ...session, formHash: null }, sample), /unsupported or older prototype/);
assert.throws(() => requireCvaRoute({ ...session, cuppingForm: null }, sample), /unsupported or older prototype/);
assert.throws(() => requireCvaRoute(session, { ...sample, cuppingForm: 2 }), /unsupported or older prototype/);
assert.throws(() => requireCvaRoute(session, { ...sample, cuppingForm: null }), /unsupported or older prototype/);
assert.match(UNSUPPORTED_MESSAGE, /Start a new SCA CVA session/);
console.log('Session-form route guards passed (CVA, Legacy, unknown, malformed, old, mismatch).');
