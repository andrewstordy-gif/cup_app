// Explicitly seed the immutable 1.1 prototype pin for tests of its retained API.
// Never weaken successor validation to make an older API fixture pass.
const pin = Object.freeze({ form_key: 'sca_cva_affective_104_2024', form_version: '1.1.0',
  form_hash: '2a9e341fb17664559875a08235a01f88571a3833682ead2a1de09558ba6bf0bb' });
function pinPrototypeCvaFixture(sqlite, sessionId) {
  sqlite.prepare('UPDATE sessions SET form_key = ?, form_version = ?, form_hash = ? WHERE id = ? AND cupping_form = 1')
    .run(pin.form_key, pin.form_version, pin.form_hash, sessionId);
}
module.exports = { pin, pinPrototypeCvaFixture };
