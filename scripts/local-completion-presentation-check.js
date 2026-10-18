const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ast = file => parse(read(file), { sourceType: 'module', plugins: ['jsx'] });
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const found = find(child, predicate); if (found) return found;
  }
  return null;
}
const declaration = (tree, name) => find(tree, node => node.type === 'VariableDeclarator' && node.id?.name === name);
const helperAst = ast('src/features/cupping/constants/sessionDetails.js');
const helper = name => generate(find(helperAst, node => node.type === 'FunctionDeclaration' && node.id?.name === name)).code;
const { hasLocalSessionCompletion, getSessionStatusBadgeLabel } = new Function(`${helper('hasLocalSessionCompletion')}; ${helper('getSessionStatusBadgeLabel')}; return { hasLocalSessionCompletion, getSessionStatusBadgeLabel };`)();
const freshPresentation = (id = 'a', completed = true, actor = 'actor-a') => JSON.parse(JSON.stringify({
  session: { id, status: 'in_progress', samples: [{ id: 'sample-a' }] },
  tasting: { completed, contextToken: `${actor}:${id}` },
}));
const input = { sessionId: 'a', samples: [{ id: 'sample-a' }], sampleStatusById: { 'sample-a': { hasAnyFeedback: true } } };
for (let restart = 0; restart < 2; restart++) {
  const presentation = freshPresentation();
  assert.equal(getSessionStatusBadgeLabel({ ...input, tastingPresentation: presentation }), 'Complete');
  assert.equal(presentation.session.status, 'in_progress', 'badge never rewrites aggregate status');
}
for (const presentation of [null, {}, freshPresentation('b'), freshPresentation('a', false, 'actor-b'),
  { ...freshPresentation(), tasting: { completed: true } },
  { ...freshPresentation(), tasting: { completed: 'true', contextToken: 'actor-a:a' } }]) {
  assert.equal(hasLocalSessionCompletion('a', presentation), false);
  assert.equal(getSessionStatusBadgeLabel({ ...input, tastingPresentation: presentation }), 'In Progress');
}
assert.equal(getSessionStatusBadgeLabel({ ...input, isSessionComplete: true }), 'Complete', 'historical completion badge retained without reveal');
assert.equal(getSessionStatusBadgeLabel({ samples: [], sampleStatusById: {} }), 'Draft');
assert.equal(getSessionStatusBadgeLabel({ samples: input.samples, sampleStatusById: {} }), 'Pending');

const listTree = ast('src/features/cupping/screens/CuppingSessionScreen.js');
const mapCall = find(listTree, node => node.type === 'CallExpression' && node.callee?.object?.name === 'rows' && node.callee?.property?.name === 'map');
let reply;
const mapRow = new Function('getLocalTastingPresentation', 'getSessionSampleFinalStatus', 'projectSavedSessionIdentity', 'getSessionSetupAccess', 'getSessionStatusBadgeLabel',
  `return (${generate(mapCall.arguments[0]).code});`)(async () => reply, async () => input.sampleStatusById,
  session => ({ sessionName: 'Visible session name', sessionType: 'Training', sessionDate: '18 Oct 2026', identityHidden: true }),
  async () => ({ canManageSetup: false }), getSessionStatusBadgeLabel);
const detailsTree = ast('src/features/cupping/screens/CuppingSessionDetailsScreen.js');
const detailsCall = declaration(detailsTree, 'sessionStatusBadgeLabel').init;
const detailsBadge = new Function('sessionId', 'tastingPresentation', 'samples', 'sampleStatusById', 'isSessionComplete', 'getSessionStatusBadgeLabel',
  `return (${generate(detailsCall).code});`);
const activeTree = ast('src/features/cupping/screens/ActiveSessionScreen.js');
const activeStatus = new Function('loadedSession', 'tastingPresentation', 'hasLocalSessionCompletion', 'formatStatus',
  `return (${generate(declaration(activeTree, 'status').init.arguments[0]).code})();`);
const formatStatus = new Function(`return (${generate(find(activeTree, node => node.type === 'FunctionDeclaration' && node.id?.name === 'formatStatus')).code});`)();
async function main() {
  for (const completed of [false, true]) {
    // Independently reloaded repository DTO, not a previous component flag.
    reply = freshPresentation('a', completed);
    const row = await mapRow({ id: 'a', status: 'in_progress' }, 0);
    assert.equal(row.statusLabel, completed ? 'Complete' : 'In Progress');
    assert.equal(row.status, 'in_progress');
    assert.equal(detailsBadge('a', reply, input.samples, input.sampleStatusById, false, getSessionStatusBadgeLabel), row.statusLabel);
    assert.equal(activeStatus(reply.session, reply, hasLocalSessionCompletion, formatStatus), row.statusLabel);
  }
  reply = freshPresentation('b');
  await assert.rejects(mapRow({ id: 'a', status: 'in_progress' }, 0), /presentation is unavailable/);
  assert.equal(detailsBadge('a', reply, input.samples, input.sampleStatusById, true, getSessionStatusBadgeLabel), 'In Progress', 'old globally complete state cannot flash for next session');
  assert.equal(activeStatus(null, reply, hasLocalSessionCompletion, formatStatus), 'Pending');
  assert.equal(activeStatus({ id: 'a', status: 'in_progress' }, reply, hasLocalSessionCompletion, formatStatus), 'In Progress');
  for (const screen of ['CuppingSessionScreen', 'CuppingSessionDetailsScreen', 'ActiveSessionScreen']) {
    assert.doesNotMatch(read(`src/features/cupping/screens/${screen}.js`), /My tasting complete|myTastingComplete/);
  }
  const details = read('src/features/cupping/screens/CuppingSessionDetailsScreen.js');
  assert.match(details, /const isSessionComplete = sessionStatus === "complete"/, 'historical edit lock not derived from presentation badge');
  assert.match(details, /<ScreenFooter label="SCAN CUP"/);
  for (const file of ['src/features/cupping/screens/CanonicalCvaScreen.js', 'src/features/forms/legacy/LegacyCuppingScreen.js']) {
    const source = read(file);
    assert.match(source, /showCompletion=\{false\}/);
    assert.match(source, /onAdopted=/);
    assert.match(source, /\{(?:dirty|hasPendingChanges) \? 'SAVE' : 'SCAN CUP'\}/);
  }
  console.log('Local completion presentation checks passed: actual list row mapping, Details/Active badge expressions, fresh restart DTOs, mismatch/loading/foreign guards, historical lock separation and preserved assessment wiring.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
