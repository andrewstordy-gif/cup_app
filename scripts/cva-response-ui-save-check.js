const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('@babel/core');
const { PROFILE, resolveForm } = require('../src/features/forms/contract');
const responseTools = require('../src/features/cupping/data/cvaResponse');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/features/cupping/screens/CanonicalCvaScreen.js');
const hooks = []; let cursor = 0, effects = [], pendingWrite, calls = [], celebrations = 0, readFailure = false, alerts = [], exits = 0, scrolls = [], swipes = [];
const react = {
  createElement: (type, props, ...children) => {
    if (type === 'ScrollView' && props?.ref) props.ref.current = { scrollTo: value => scrolls.push(value) };
    return { type, props: { ...props, children } };
  },
  useRef(value) { const index = cursor++; return hooks[index] || (hooks[index] = { current: value }); },
  useState(value) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof value === 'function' ? value() : value;
    return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; },
  useEffect(effect, deps) { const index = cursor++; const old = hooks[index];
    if (!old || deps.some((value, i) => value !== old.deps[i])) {
      old?.cleanup?.(); const record = { deps }; hooks[index] = record; effects.push(() => { record.cleanup = effect(); });
    }
  },
};
const trusted = { profile: PROFILE, f: 1, identity: resolveForm(PROFILE, 1).identity };
const initial = { trusted, n: 5, revision: 0, response: null, complete: false, result: null, sessionComplete: false,
  access: { state: 'fresh', canWrite: true, canAdopt: false }, identity: { visible: false }, tasting: { contextToken: 'trusted-test-context' } };
const mocks = {
  react,
  'react-native': { AccessibilityInfo: { announceForAccessibility() {} }, Alert: { alert: (...args) => alerts.push(args) }, KeyboardAvoidingView: 'KeyboardAvoidingView',
    Platform: { OS: 'ios' }, Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
    PanResponder: { create: options => ({ panHandlers: options }) },
    StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 375 }) },
  '../../../components/ui/TypographyAuditText': { TypographyAuditText: 'Text' },
  '../../../components/ui/full_page_button': { full_page_button: 'FooterButton' },
  '../../../components/ui/NotesInput': { NotesInput: 'NotesInput' },
  '../../../components/ui/Header': { Header: 'Header' },
  '../../../components/ui/CupStatusStrip': { CupStatusStrip: 'CupStatusStrip' },
  '../../../components/ui/ScoreSelector': { ScoreSelector: 'ScoreSelector' },
  '../components/ScoreBalloons': { ScoreBalloons: 'Balloons', useScoreBalloons: () => ({ animations: [], triggerBalloons: () => celebrations++ }) },
  '../components/focusNotesAboveKeyboard': { focusNotesAboveKeyboard: () => () => {} },
  '../components/LocalTastingActions': { LocalTastingActions: 'LocalTastingActions' },
  '../data/flavourKeywords': { tokenizeFlavourKeywords: () => [] },
  '../data/cvaResponse': responseTools,
  '../../../data/sessionRepository': { getCvaResponse: async () => { if (readFailure) throw new Error('SECRET refresh failure'); return initial; },
    saveCvaResponse: input => { calls.push(input); return new Promise((resolve, reject) => { pendingWrite = { resolve, reject }; }); } },
  '../constants/sessionDetails': { getProcessLabel: value => value },
  '../../../theme/colors': { colors: {} }, '../../../theme/spacing': { spacing: { xs: 6, sm: 10, md: 16, lg: 24 } },
  '../../../theme/typography': { typography: {} },
};
for (const name of ['AssessmentHeader', 'AssessmentSampleIdentity', 'AssessmentFormIntro', 'AssessmentResultSection', 'AssessmentCupSelector', 'DefectsSection', 'KeywordPillRow']) {
  mocks[`../components/${name}`] = { [name]: name };
}
const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod.require = request => Object.hasOwn(mocks, request) ? mocks[request] : require(request);
mod._compile(code, filename);
global.requestAnimationFrame = callback => { callback(); return 1; };
global.cancelAnimationFrame = () => {};
let props = { sessionId: 'session', sampleId: 'sample', cuppingMode: 'blind', tagType: 'ntag_cup', isSessionComplete: true,
  onScanPress() {}, onBackPress() { exits++; } };
function render() { cursor = 0; effects = []; const tree = mod.exports.CanonicalCvaScreen(props); for (const effect of effects) effect(); return tree; }
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(item => nodes(item, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
function find(tree, predicate) { const node = nodes(tree, predicate)[0]; assert.ok(node); return node; }
const tick = () => new Promise(resolve => setImmediate(resolve));
async function main() {
  render(); await tick(); let tree = render();
  for (const label of Object.keys(responseTools.RATINGS)) {
    assert.equal(find(tree, node => node.props?.accessibilityLabel === `${label} 5 of 9`).props.disabled, false,
      'Details response-readiness flag must not lock a still-open Session');
    find(tree, node => node.props?.accessibilityLabel === `${label} 5 of 9`).props.onPress(); tree = render();
  }
  find(tree, node => node.type?.name === 'ZeroAssessment' && node.props.label === 'Uniformity').props.onPress(); tree = render();
  const bean = find(tree, node => node.type === 'DefectsSection').props.beanAssessment;
  assert.equal(bean.value, '0.00');
  assert.equal(bean.control, undefined, 'new zero uses the shared static/live score value, not a hidden confirmation');
  const button = () => find(tree, node => node.type === 'FooterButton');
  assert.equal(button().props.label, 'SAVE');
  const saving = button().props.onPress(); tree = render();
  assert.equal(calls.length, 1); assert.equal(calls[0].expectedRevision, 0);
  assert.equal(celebrations, 0);
  // Edit while the actual callback is awaiting its repository acknowledgement.
  find(tree, node => node.props?.accessibilityLabel === 'Fragrance 6 of 9').props.onPress(); tree = render();
  const result = responseTools.inspectCvaResponse(calls[0].response, trusted, 5).result;
  pendingWrite.resolve({ saved: true, revision: 1, response: calls[0].response, complete: true, result, errors: [], firstComplete: true });
  await saving; tree = render();
  assert.equal(button().props.label, 'SAVE'); assert.equal(celebrations, 0);
  assert.equal(find(tree, node => node.props?.accessibilityLabel === 'Fragrance 6 of 9').props.accessibilityState.selected, true);
  const second = button().props.onPress(); tree = render();
  assert.equal(calls[1].expectedRevision, 1);
  pendingWrite.reject(new Error('SECRET raw storage details'));
  await second; tree = render(); assert.equal(button().props.label, 'SAVE');
  assert.equal(JSON.stringify(tree).includes('SECRET'), false);
  find(tree, node => node.type === 'AssessmentHeader').props.onBackPress();
  assert.equal(exits, 0); assert.equal(alerts.length, 1);
  assert.equal(alerts[0][2][0].text, 'Keep editing');
  alerts[0][2][1].onPress(); assert.equal(exits, 1, 'explicit discard offers a way out of stale/conflicting edits');
  // A different context must not receive an old in-flight acknowledgement.
  const third = button().props.onPress();
  props = { ...props, sampleId: 'different-sample' }; render(); await tick(); tree = render();
  pendingWrite.resolve({ saved: true, revision: 99, response: calls[2].response, complete: true, result, errors: [], firstComplete: true });
  await third; tree = render();
  assert.equal(celebrations, 0);
  assert.equal(nodes(tree, node => node.type === 'AssessmentResultSection').length, 0);
  initial.sessionComplete = true;
  props = { ...props, scanRevision: 1 }; render(); await tick(); tree = render();
  assert.equal(find(tree, node => node.props?.accessibilityLabel === 'Fragrance 5 of 9').props.disabled, true,
    'independently loaded host closure locks the form');
  readFailure = true;
  props = { ...props, scanRevision: 2 }; render(); await tick(); tree = render();
  assert.equal(nodes(tree, node => node.type === 'FooterButton').length, 0, 'failed trusted refresh blocks old current total and editing');
  assert.equal(JSON.stringify(tree).includes('SECRET'), false);
  readFailure = false; initial.sessionComplete = false;
  initial.response = { ...responseTools.createCvaDraft(5), non_uniform_cups: [],
    ratings: Object.fromEntries(Object.values(responseTools.RATINGS).map(key => [key, 5])) };
  initial.complete = true; initial.result = responseTools.inspectCvaResponse(initial.response, trusted, 5).result;
  props = { ...props, scanRevision: null, cupStateNumber: 3, initialScrollTarget: 'Flavour',
    canSwipeSamples: true, sampleNumber: 1, cupTotal: 2, onSampleSwipe: value => swipes.push(value) };
  scrolls = []; render(); await tick(); tree = render();
  find(tree, node => node.type === 'ScrollView').props.onLayout();
  assert.equal(scrolls.length, 0, 'Flavour target waits for its measured layout');
  const flavourLayout = find(tree, node => typeof node.props?.onLayout === 'function' &&
    (node.props.children || []).some(child => child?.type === 'Text' && child.props.children.includes('Flavour')));
  flavourLayout.props.onLayout({ nativeEvent: { layout: { y: 321 } } });
  assert.equal(scrolls.at(-1).y, 321, 'null scan revision still scrolls to measured explicit Flavour');
  props = { ...props, initialScrollTarget: 'top', scanRevision: 'top' };
  render(); await tick(); tree = render();
  assert.equal(scrolls.at(-1).y, 0, 'explicit top wins over stage three and saved Aroma');
  tree.props.onPanResponderRelease(null, { dx: -60 }); assert.deepEqual(swipes, ['next']);
  find(tree, node => node.props?.accessibilityLabel === 'Fragrance 6 of 9').props.onPress(); tree = render();
  tree.props.onPanResponderRelease(null, { dx: -60 }); assert.deepEqual(swipes, ['next'], 'dirty sample blocks paging');
  props = { ...props, cupStateNumber: 2, scanRevision: 'brewing', elapsedSeconds: 120, brewTimeSeconds: 240,
    cupStatus: { state: 'BREWING', temp: '90 C' }, cupUUID: 'CUP-1' };
  render(); await tick(); tree = render();
  const strip = find(tree, node => node.type === 'CupStatusStrip');
  assert.equal(strip.props.state, 'BREWING'); assert.equal(strip.props.temp, '90 C'); assert.equal(strip.props.time, '02:00 / 04:00');
  assert.equal(find(tree, node => node.type === 'ScoreSelector').props.value, 5);
  assert.equal(find(tree, node => node.type === 'ScoreSelector').props.disabled, true);
  const done = find(tree, node => node.type === 'FooterButton'); assert.equal(done.props.label, 'Done');
  assert.equal(nodes(tree, node => node.props?.accessibilityLabel?.includes('Aroma 5 of 9')).length, 0);
  const writesBeforeDone = calls.length; done.props.onPress(); assert.equal(calls.length, writesBeforeDone);
  assert.equal(exits, 2, 'brewing Done retains the Home/back callback');
  for (const hook of hooks) hook?.cleanup?.();
  console.log('CVA actual component Save callback checks passed: no pre-commit acknowledgement, retained newer edits, static failures, context isolation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
