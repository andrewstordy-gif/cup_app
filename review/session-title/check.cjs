const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { render, styles } = require('./runtime.cjs');
const fixtures = require('./fixtures.cjs');
for (const fixture of fixtures) {
  const html = render(fixture);
  for (const value of [fixture.name, fixture.sessionType, fixture.formLabel, fixture.dateLabel, fixture.sessionCode, fixture.status, fixture.uploadStatusLabel]) assert(html.includes(value), value);
  assert(!/<(input|select|button|textarea)\b/.test(html));
  assert(!html.includes('Pinned for this session'));
}
assert.equal(render({ ...fixtures[0], status: 'DRAFT' }), '');
assert.equal(render({ ...fixtures[0], status: 'UNKNOWN' }), '');
assert(!render({ ...fixtures[0], uploadStatusLabel: undefined }).includes('Not uploaded'));
const long = render({ ...fixtures[1], name: 'A very long session name that needs to wrap on a smaller phone', sessionCode: 'SESSION-LONG-IDENTIFIER', formLabel: 'SCA Legacy (2004–2023)' });
assert(long.includes('SESSION-LONG-IDENTIFIER'));
assert(long.includes('SCA Legacy (2004–2023)'));
const hostile = render({ ...fixtures[0], name: '<script>bad</script>' });
assert(!hostile.includes('<script>'));
assert(styles().includes('flex-wrap:wrap'));
const source = fs.readFileSync(path.resolve(__dirname, '../../src/features/cupping/components/SessionTitleSummary.js'), 'utf8');
assert(!/onPress|useEffect|useState|fetch\(|repository|sqlite|nfc|navigation/i.test(source.replace(/\/\/.*$/gm, '')));
assert(!source.includes('numberOfLines'));
console.log('PASS: three fixture states, DRAFT/unknown exclusion, plain noninteractive output, optional status, long content retained, escaping, wrapping rules, no behaviour dependencies. Native layout remains unverified.');
