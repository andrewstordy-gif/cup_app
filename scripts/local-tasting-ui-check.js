const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/features/cupping/components/LocalTastingActions.js');
let hooks = [], cursor = 0, effects = [], writes = [], adoption = [], completeReply, adoptReply, callbacks = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useRef(value) { const index = cursor++; return hooks[index] || (hooks[index] = { current: value }); },
  useState(value) { const index = cursor++; if (!(index in hooks)) hooks[index] = value;
    return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
  useEffect(effect, deps) { const index = cursor++; const previous = hooks[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      previous?.cleanup?.(); const record = { deps }; hooks[index] = record;
      effects.push(() => { record.cleanup = effect(); });
    }
  },
};
const mocks = {
  react,
  'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value } },
  '../../../components/ui/TypographyAuditText': { TypographyAuditText: 'Text' },
  '../../../components/ui/WarningDialog': { WarningDialog: 'Dialog' },
  '../../../theme/colors': { colors: {} }, '../../../theme/spacing': { spacing: {} }, '../../../theme/typography': { typography: {} },
  '../../../data/sessionRepository': {
    completeLocalTasting: async (...args) => { writes.push(args); return completeReply ? completeReply : { status: 'complete' }; },
    adoptSavedTasting: async input => { adoption.push(input); return adoptReply || { response: { exact: 7 }, access: { state: 'mine' } }; },
    getLocalTastingPresentation: async () => ({ tasting: { contextToken: props.tasting.contextToken, completed: true } }),
  },
};
const { code } = transformSync(fs.readFileSync(file, 'utf8'), { filename: file, babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
mod.require = request => Object.hasOwn(mocks, request) ? mocks[request] : require(request); mod._compile(code, file);
let props;
function reset() {
  hooks = []; cursor = 0; effects = []; writes = []; adoption = []; callbacks = []; completeReply = null; adoptReply = null;
  props = { sessionId: 'session-a', sampleId: 'sample-a', tasting: { started: true, canComplete: true, contextToken: 'actor-a:session-a' },
    access: { state: 'unattributed', canWrite: false, canAdopt: true, sourceToken: 'exact-source-a' },
    onAdopted: value => callbacks.push(value), onCompleted: value => callbacks.push(value) };
}
function render(runEffects = true) { cursor = 0; effects = []; const tree = mod.exports.LocalTastingActions(props);
  if (runEffects) effects.forEach(effect => effect()); return tree; }
function nodes(node) { if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
const find = (tree, label) => nodes(tree).find(node => node.props?.accessibilityLabel === label);
const dialog = tree => nodes(tree).find(node => node.type === 'Dialog');
async function main() {
  reset(); render(); let tree = render();
  assert.equal(writes.length + adoption.length, 0, 'opening never adopts/completes');
  find(tree, 'Use these saved scores as my tasting').props.onPress(); tree = render();
  assert.equal(dialog(tree).props.visible, true); dialog(tree).props.onDismiss(); tree = render();
  assert.match(mod.exports.ADOPTION_MESSAGE, /does not complete your tasting, reveal coffee details or share results/);
  assert.equal(writes.length + adoption.length, 0, 'Close/background makes no mutation');
  find(tree, 'Use these saved scores as my tasting').props.onPress(); tree = render();
  dialog(tree).props.onSecondary(); tree = render(); assert.equal(adoption.length, 0);
  find(tree, 'Use these saved scores as my tasting').props.onPress(); tree = render();
  await dialog(tree).props.onOk(); tree = render();
  assert.deepEqual(adoption, [{ sessionId: 'session-a', sampleId: 'sample-a', expectedSourceToken: 'exact-source-a' }]);
  assert.equal(writes.length, 0, 'adoption does not complete/reveal'); assert.equal(callbacks[0].response.exact, 7);

  reset(); render(); tree = render(); find(tree, 'Complete session').props.onPress(); tree = render();
  assert.equal(dialog(tree).props.title, 'Complete session?');
  assert.match(dialog(tree).props.message, /does not close anyone else's session or upload results/);
  await dialog(tree).props.onOk(); tree = render();
  assert.deepEqual(writes, [['session-a', { expectedContextToken: 'actor-a:session-a' }]]);
  assert.equal(callbacks.length, 1); assert.equal(adoption.length, 0);

  // A prop change before effect cleanup must not make the old prompt act on a
  // different sample, profile or reviewed saved source.
  for (const change of [
    () => { props = { ...props, sessionId: 'session-b' }; },
    () => { props = { ...props, tasting: { ...props.tasting, contextToken: 'actor-b:session-a' } }; },
    () => { props = { ...props, access: { ...props.access, sourceToken: 'newer-source' } }; },
  ]) {
    reset(); render(); tree = render(); find(tree, 'Use these saved scores as my tasting').props.onPress(); tree = render();
    const oldConfirm = dialog(tree).props.onOk;
    change(); render(false); await oldConfirm(); assert.equal(adoption.length, 0);
  }
  reset(); render(); tree = render(); find(tree, 'Complete session').props.onPress(); tree = render();
  let release; completeReply = new Promise(resolve => { release = resolve; });
  const confirm = dialog(tree).props.onOk; const waiting = confirm(); await confirm();
  assert.equal(writes.length, 1, 'duplicate confirm while pending does not write');
  props = { ...props, tasting: { ...props.tasting, contextToken: 'actor-b:session-a' } }; render();
  release({ status: 'complete' }); await waiting; assert.equal(callbacks.length, 0, 'stale acknowledgement cannot reveal new actor');
  reset(); render(); tree = render(); find(tree, 'Complete session').props.onPress(); tree = render();
  completeReply = { status: 'incomplete', incompleteSamples: [{ sampleId: 'sample-a', label: 'Sample 1' }] };
  await dialog(tree).props.onOk(); tree = render(); assert.equal(callbacks.length, 0);
  assert.match(JSON.stringify(tree), /Still needed: Sample 1/);
  assert.equal(dialog(tree).props.visible, true, 'missing results produce an immediate modal');
  assert.equal(dialog(tree).props.title, 'Session not complete');
  assert.equal(dialog(tree).props.okLabel, 'OK');
  assert.equal(dialog(tree).props.secondaryLabel, undefined, 'no complete-anyway choice');
  const writesBeforeAck = writes.length;
  dialog(tree).props.onOk(); tree = render();
  assert.equal(writes.length, writesBeforeAck, 'warning acknowledgement never retries completion');
  assert.equal(adoption.length, 0); assert.equal(dialog(tree).props.visible, false);

  // A dismissed prompt's handlers cannot cancel or confirm a newer prompt.
  reset(); render(); tree = render(); find(tree, 'Complete session').props.onPress(); tree = render();
  const oldDialog = dialog(tree).props;
  oldDialog.onSecondary(); tree = render();
  find(tree, 'Complete session').props.onPress(); tree = render();
  oldDialog.onDismiss(); await oldDialog.onOk(); tree = render();
  assert.equal(dialog(tree).props.visible, true); assert.equal(writes.length, 0);
  dialog(tree).props.onDismiss(); tree = render();
  assert.equal(writes.length, 0, 'Cancel/Close makes no mutation');

  for (const completed of [false, true]) {
    reset(); props.showCompletion = false; props.tasting.completed = completed; render(); tree = render();
    assert.equal(find(tree, 'Complete session'), undefined, 'assessment forms suppress completion');
    assert.ok(find(tree, 'Use these saved scores as my tasting'), 'adoption remains distinct and available');
    assert.doesNotMatch(JSON.stringify(tree), /My tasting complete/);
  }
  reset(); props.tasting.completed = true; render(); tree = render();
  assert.equal(find(tree, 'Complete session'), undefined);
  assert.doesNotMatch(JSON.stringify(tree), /My tasting complete/);
  reset(); props.showCompletion = false; props.access = { state: 'mine', canWrite: true }; render();
  assert.equal(render(), null, 'ordinary editable form keeps no empty padded completion spacer');
  for (const state of ['foreign', 'unavailable']) {
    reset(); props.access = { state, canWrite: false, canAdopt: false }; render(); tree = render();
    assert.equal(find(tree, 'Use these saved scores as my tasting'), undefined);
  }
  for (const relative of [
    'src/navigation/AppNavigator.js', 'src/features/cupping/screens/ActiveSessionScreen.js',
    'src/features/cupping/screens/CuppingSessionDetailsScreen.js', 'src/features/cupping/screens/CanonicalCvaScreen.js',
    'src/features/forms/legacy/LegacyCuppingScreen.js', 'src/features/cupping/screens/CuppingSessionScreen.js',
  ]) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8'); parse(source, { sourceType: 'module', plugins: ['jsx'] });
    assert.ok(!source.includes('markSessionCompleteIfAllSamplesComplete') && !source.includes('manuallyMarkSessionComplete'), `${relative}: no global close command`);
    assert.ok(!source.includes('UPLOAD RESULTS'), 'no fake upload action');
  }
  const nav = fs.readFileSync(path.join(root, 'src/navigation/AppNavigator.js'), 'utf8');
  assert.match(nav, /getLocalTastingPresentation\(context.sessionId, \{ purpose: 'tasting' \}\)/);
  assert.match(nav, /cuppingMode: sample.cuppingMode/);
  const navAst = parse(nav, { sourceType: 'module', plugins: ['jsx'] });
  function declaration(node, name) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'VariableDeclarator' && node.id?.name === name) return node;
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      const found = declaration(child, name); if (found) return found;
    }
    return null;
  }
  const project = new Function('getLocalTastingPresentation', 'UNSUPPORTED_MESSAGE', `return (${generate(declaration(navAst, 'projectAssessmentContextForSavedSession').init).code});`)(
    async () => ({ session: { status: 'in_progress', samples: [{ id: 'sample', cuppingMode: 'blind', coffeeNameOrigin: 'Sample 1', process: null }] } }), 'unavailable');
  const safe = await project({ sessionId: 'session', sampleId: 'sample', cuppingMode: 'open', coffeeNameOrigin: 'ROUTE SECRET', process: 'ROUTE PROCESS', isSessionComplete: true });
  assert.equal(safe.cuppingMode, 'blind'); assert.equal(safe.coffeeNameOrigin, 'Sample 1'); assert.equal(safe.process, '');
  assert.equal(safe.isSessionComplete, false, 'local completion is not an assessment closure route flag');
  let resolveNavigation, selected = [];
  const readEpoch = { current: 0 }, route = { current: 'Home' };
  const select = new Function('assessmentReadEpoch', 'currentRoute', 'projectAssessmentContextForSavedSession', 'setSelectedCupContext',
    `return (${generate(declaration(navAst, 'selectSavedAssessment').init).code});`)(readEpoch, route,
    () => new Promise(resolve => { resolveNavigation = resolve; }), context => selected.push(context));
  const navigation = select({ sessionId: 'session', sampleId: 'sample' }); route.current = 'Profile';
  resolveNavigation(safe); assert.equal(await navigation, false); assert.deepEqual(selected, [], 'late read cannot navigate after the screen changes');
  const cva = fs.readFileSync(path.join(root, 'src/features/cupping/screens/CanonicalCvaScreen.js'), 'utf8');
  assert.match(cva, /saved.identity\?\.visible/); assert.match(cva, /saved.access\?\.canWrite !== true/);
  assert.match(cva, /flexWrap: 'nowrap'/);
  for (const relative of ['src/features/cupping/screens/CanonicalCvaScreen.js', 'src/features/forms/legacy/LegacyCuppingScreen.js']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /<LocalTastingActions showCompletion=\{false\}/);
    assert.doesNotMatch(source, /onCompleted=/, 'assessment no longer owns session completion');
  }
  for (const relative of ['src/features/cupping/screens/ActiveSessionScreen.js', 'src/features/cupping/screens/CuppingSessionDetailsScreen.js']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /Tasting has already begun, so session setup is read-only/);
    assert.match(source, /Session setup is read-only on this profile/);
  }
  console.log('Local tasting UI checks passed: actual confirmation callbacks, cancel, exact tokens, stale actor/source, duplicates, incomplete, foreign, navigation and unchanged one-row score layout.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
