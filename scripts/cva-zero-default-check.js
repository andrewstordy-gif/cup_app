const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { transformSync } = require('@babel/core');
const projectLoader = require('./helpers/load-project-module');
const tools = require('../src/features/cupping/data/cvaResponse');
const { PROFILE, resolveForm } = require('../src/features/forms/contract');
const root = path.resolve(__dirname, '..');
global.requestAnimationFrame = callback => { callback(); return 1; };
global.cancelAnimationFrame = () => {};
const db = new DatabaseSync(':memory:');
let serial = 0;
const bridge = {
  async execAsync(sql) { db.exec(sql); },
  async getFirstAsync(sql, args = []) { return db.prepare(sql).get(...args) || null; },
  async getAllAsync(sql, args = []) { return db.prepare(sql).all(...args); },
  async runAsync(sql, args = []) { return db.prepare(sql).run(...args); },
  async withTransactionAsync(callback) {
    db.exec('BEGIN'); try { const result = await callback(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
  async withExclusiveTransactionAsync(callback) {
    db.exec('BEGIN IMMEDIATE'); try { const result = await callback(bridge); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const identifiers = { generateDomainId: () => `zero-${++serial}`, generateSessionReference: () => `zero-ref-${++serial}` };
const repo = projectLoader(root, {
  './userProfileRepository': require('./helpers/local-profile-fixture'),
  'expo-sqlite': { openDatabaseAsync: async () => bridge },
  '../utils/secureIdentifiers': identifiers, '../../../utils/secureIdentifiers': identifiers,
})('src/data/sessionRepository.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const rows = () => JSON.stringify(db.prepare('SELECT * FROM cva_response_revisions ORDER BY id').all());
const pins = () => JSON.stringify(db.prepare('SELECT id, form_key, form_version, form_hash FROM sessions ORDER BY id').all());
const trusted = { profile: PROFILE, f: 1, identity: resolveForm(PROFILE, 1).identity };
const ratings = () => Object.fromEntries(Object.values(tools.RATINGS).map(key => [key, 7]));
const final = n => ({ ...tools.createCvaDraft(n), ratings: ratings(), non_uniform_cups: [] });
async function fixture(n) {
  const sessionId = `session-${++serial}`, sampleId = `sample-${serial}`;
  await repo.saveSessionWithSamples({ sessionUUID: sessionId, sessionName: 'Zero default test', sessionDate: '16 Oct 2026',
    sessionType: 'Training Session', cuppingForm: 1, cuppingMode: 'open',
    samples: [{ id: sampleId, cupUUID: `CUP-${serial}`, cupNumber: n, sampleNumber: 1,
      cuppingForm: 1, cuppingMode: 'open', coffeeNameOrigin: 'Test coffee', process: '1' }] });
  return { sessionId, sampleId, cuppingMode: 'open', tagType: 'ntag_cup', startInFinalMode: true, onScanPress() {} };
}
async function save(props, response) {
  const current = await repo.getCvaResponse(props.sessionId, props.sampleId);
  return repo.saveCvaResponse({ ...props, response, expectedRevision: current.revision,
    expectedIdentity: current.trusted.identity, expectedCupCount: current.n });
}
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(item => nodes(item, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
function first(node, predicate) { const result = nodes(node, predicate)[0]; assert.ok(result); return result; }
function screen(props) {
  const hooks = []; let cursor = 0, effects = [], celebrations = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef(value) { const i = cursor++; return hooks[i] || (hooks[i] = { current: value }); },
    useState(value) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof value === 'function' ? value() : value;
      return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }]; },
    useEffect(effect, deps) { const i = cursor++, old = hooks[i];
      if (!old || deps.some((value, j) => value !== old.deps[j])) {
        old?.cleanup?.(); const record = { deps }; hooks[i] = record; effects.push(() => { record.cleanup = effect(); });
      }
    },
  };
  const mocks = {
    react,
    'react-native': { AccessibilityInfo: { announceForAccessibility() {} }, Alert: { alert() {} }, Platform: { OS: 'ios' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', KeyboardAvoidingView: 'KeyboardAvoidingView',
      PanResponder: { create: () => ({ panHandlers: {} }) }, StyleSheet: { create: value => value },
      useWindowDimensions: () => ({ width: 375 }) },
    '../../../data/sessionRepository': repo,
    '../data/cvaResponse': tools,
    '../components/ScoreBalloons': { ScoreBalloons: 'Balloons', useScoreBalloons: () => ({ animations: [], triggerBalloons: () => celebrations++ }) },
    '../components/focusNotesAboveKeyboard': { focusNotesAboveKeyboard: () => () => {} },
    '../components/LocalTastingActions': { LocalTastingActions: 'LocalTastingActions' },
    '../data/flavourKeywords': { tokenizeFlavourKeywords: () => [] },
    '../constants/sessionDetails': { getProcessLabel: value => value },
    '../../../theme/colors': { colors: {} }, '../../../theme/spacing': { spacing: { xs: 6, sm: 10, md: 16, lg: 24 } },
    '../../../theme/typography': { typography: {} },
  };
  for (const [source, exported, value] of [
    ['../../../components/ui/TypographyAuditText', 'TypographyAuditText', 'Text'],
    ['../../../components/ui/full_page_button', 'full_page_button', 'FooterButton'],
    ...['NotesInput', 'Header', 'CupStatusStrip', 'ScoreSelector'].map(name => [`../../../components/ui/${name}`, name, name]),
    ...['AssessmentHeader', 'AssessmentSampleIdentity', 'AssessmentFormIntro', 'AssessmentResultSection', 'AssessmentCupSelector',
      'DefectsSection', 'KeywordPillRow'].map(name => [`../components/${name}`, name, name]),
  ]) mocks[source] = { [exported]: value };
  const filename = path.join(root, 'src/features/cupping/screens/CanonicalCvaScreen.js');
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = request => Object.hasOwn(mocks, request) ? mocks[request] : require(request);
  mod._compile(code, filename);
  return {
    render() { cursor = 0; effects = []; const tree = mod.exports.CanonicalCvaScreen(props); effects.forEach(effect => effect()); return tree; },
    close() { hooks.forEach(hook => hook?.cleanup?.()); },
    celebrations: () => celebrations,
  };
}
async function open(props) { const ui = screen(props); ui.render(); await tick(); return { ui, tree: ui.render() }; }
const bean = tree => first(tree, node => node.type === 'DefectsSection').props.beanAssessment;
const recordNone = tree => nodes(tree, node => node.props?.accessibilityLabel === 'Record no scored bean defects');
async function main() {
  for (const n of [0,9,-1,1.5,null,undefined,'5',NaN]) assert.throws(()=>tools.createCvaDraft(n),/integer/);
  const oneDraft=tools.createCvaDraft(5), anotherDraft=tools.createCvaDraft(5);
  oneDraft.non_uniform_cups.push(1);assert.deepEqual(anotherDraft.non_uniform_cups,[],'new drafts do not share cup sets');
  for (let n=1;n<=8;n++) {
    const fresh = tools.createCvaDraft(n);
    assert.deepEqual([fresh.defective_cups, fresh.defect_type_masks, fresh.evenly_defective_all_cups], [[], {}, false]);
    assert.deepEqual(fresh.non_uniform_cups, []);
    assert.notEqual(fresh.non_uniform_cups,tools.createCvaDraft(n).non_uniform_cups);
    assert.equal(tools.inspectCvaResponse(fresh, trusted, n).final.ok, false);
    assert.equal(tools.inspectCvaResponse({ ...fresh, ratings: ratings() }, trusted, n).final.ok, true,
      'new Uniformity is assessed none but all eight ratings remain required');
    const props = await fixture(n), before = rows(), beforePins = pins();
    let { ui, tree } = await open(props);
    assert.equal(rows(), before); assert.equal(pins(), beforePins);
    const unopenedProgress=await repo.getLocalTastingPresentation(props.sessionId);
    assert.equal(unopenedProgress.tasting.started,false);assert.equal(unopenedProgress.tasting.revealed,false);
    assert.equal((await repo.getSessionSampleFinalStatus(props.sessionId))[props.sampleId].hasAnyFeedback,false);
    assert.equal(bean(tree).value, '0.00'); assert.equal(bean(tree).control, undefined);
    assert.equal(recordNone(tree).length, 0); assert.ok(!bean(tree).hint.includes('Assessed'));
    if(n>1){
      const uniformity=()=>first(tree,node=>node.type?.name==='ZeroAssessment'&&node.props.label==='Uniformity');
      assert.deepEqual(uniformity().props.cups,[]);assert.equal(uniformity().props.amount,0);
      first(tree,node=>node.type==='AssessmentCupSelector'&&node.props.label==='Non-uniform').props.onChange([n]);tree=ui.render();
      assert.deepEqual(uniformity().props.cups,[n]);assert.equal(uniformity().props.amount,10/n);
      first(tree,node=>node.type==='AssessmentCupSelector'&&node.props.label==='Non-uniform').props.onChange([]);tree=ui.render();
      assert.deepEqual(uniformity().props.cups,[]);assert.equal(uniformity().props.amount,0);
      uniformity().props.onPress();tree=ui.render();assert.equal(uniformity().props.cups,null,'explicit unassessed remains possible');
      uniformity().props.onPress();tree=ui.render();assert.deepEqual(uniformity().props.cups,[]);
    }
    for (const label of Object.keys(tools.RATINGS)) {
      first(tree, node => node.props?.accessibilityLabel === `${label} 7 of 9`).props.onPress(); tree = ui.render();
    }
    await first(tree, node => node.type === 'FooterButton').props.onPress(); tree = ui.render();
    assert.equal(ui.celebrations(), 1);
    assert.equal(first(tree, node => node.type === 'FooterButton').props.label, 'SCAN CUP');
    const persisted = await repo.getCvaResponse(props.sessionId, props.sampleId);
    assert.equal(persisted.complete, true); assert.equal(persisted.result.display_score, '89.50');
    assert.deepEqual(persisted.response, final(n));
    const finalRows = rows();
    ui.close(); ({ ui, tree } = await open(props));
    assert.equal(bean(tree).value, '0.00'); assert.equal(recordNone(tree).length, 0); assert.equal(ui.celebrations(), 0); ui.close();
    assert.equal(rows(), finalRows); assert.equal(pins(), beforePins, 'reopening saved final does not rewrite its pin');
    // Existing source/observation semantics and exact once-per-cup deduction are untouched.
    let edited = tools.changeCvaMask(final(n), 'otherBean', [1], n);
    edited = tools.changeCvaMask(edited, 'baked', [1], n);
    edited.defect_description = 'Observation retained';
    const observations = JSON.stringify([edited.other_bean_cups, edited.roast_defect_type_masks, edited.defect_description]);
    edited = tools.changeCvaMask(edited, 'potato', [1], n);
    edited = tools.changeCvaMask(edited, 'moldy', [1], n);
    assert.deepEqual(edited.defective_cups, [1]);
    assert.equal(edited.evenly_defective_all_cups, n === 1 ? true : false);
    if (n > 1) edited.non_uniform_cups = [1];
    assert.equal(tools.inspectCvaResponse(edited, trusted, n).final.ok, true);
    assert.equal(tools.inspectCvaResponse(edited, trusted, n).result.display_score,
      ({1:'69.50',2:'74.50',3:'79.50',4:'82.00',5:'83.50',6:'84.50',7:'85.25',8:'85.75'})[n]);
    assert.deepEqual(tools.inspectCvaResponse(edited, trusted, n).result,
      tools.inspectCvaResponse({ ...edited, defect_type_masks: { potato: [1] } }, trusted, n).result,
      'several source types on the same cup deduct only once');
    edited = tools.changeCvaMask(edited, 'potato', [], n);
    assert.deepEqual(edited.defective_cups, [1]);
    edited = tools.changeCvaMask(edited, 'moldy', [], n);
    assert.deepEqual(edited.defective_cups, []); assert.equal(edited.evenly_defective_all_cups, false);
    assert.equal(JSON.stringify([edited.other_bean_cups, edited.roast_defect_type_masks, edited.defect_description]), observations);
    if (n > 1) {
      edited = tools.changeCvaMask(final(n), 'phenolic', Array.from({ length: n }, (_, i) => i + 1), n);
      assert.equal(edited.evenly_defective_all_cups, null);
      assert.equal(tools.inspectCvaResponse(edited, trusted, n).final.ok, true);
      assert.equal(tools.inspectCvaResponse({ ...edited, evenly_defective_all_cups: true }, trusted, n).final.ok, true);
    }
  }
  const blankProps=await fixture(5),blank=await save(blankProps,tools.createCvaDraft(5));
  assert.equal(blank.complete,false);assert.equal(blank.result,null);
  const blankPresentation=await repo.getLocalTastingPresentation(blankProps.sessionId);
  assert.equal(blankPresentation.tasting.started,false);assert.equal(blankPresentation.tasting.completed,false);
  assert.equal(blankPresentation.tasting.revealed,false);
  assert.equal(blankPresentation.session.status,'pending');
  assert.equal((await repo.completeLocalTasting(blankProps.sessionId,{expectedContextToken:blankPresentation.tasting.contextToken})).status,'incomplete');
  assert.equal((await repo.getSessionSampleFinalStatus(blankProps.sessionId))[blankProps.sampleId].isComplete,false);
  const blankRows=rows();const blankUi=await open(blankProps);blankUi.ui.close();assert.equal(rows(),blankRows);
  for(const cupSet of [null,undefined,[],[2]]){
    const props=await fixture(5);const historical={...final(5),non_uniform_cups:cupSet};
    if(cupSet===undefined)delete historical.non_uniform_cups;
    await save(props,historical);const before=rows(),beforePins=pins();
    const {ui,tree}=await open(props);
    const field=first(tree,node=>node.type?.name==='ZeroAssessment'&&node.props.label==='Uniformity');
    assert.deepEqual(field.props.cups,cupSet,'saved fields are not merged with new defaults');
    assert.equal(rows(),before);assert.equal(pins(),beforePins);ui.close();
  }
  const variants = [];
  for (const key of ['defective_cups', 'defect_type_masks']) {
    variants.push({ [key]: null }, { [key]: undefined });
  }
  variants.push({ defective_cups: null, defect_type_masks: null, evenly_defective_all_cups: null },
    { defective_cups: [1] });
  for (const variant of variants) {
    const props = await fixture(5);
    const historical = { ...final(5), ...variant, other_bean_cups: [2], roast_defect_type_masks: { unevenRoast: [3] },
      defect_description: 'Historical note', general_affective_notes: 'Banana', affective_notes: { mouthfeel: 'Silky' } };
    for (const key of Object.keys(historical)) if (historical[key] === undefined) delete historical[key];
    const draft = await save(props, historical); assert.equal(draft.complete, false);
    const before = rows(), beforePins = pins();
    const { ui, tree } = await open(props);
    assert.equal(rows(), before); assert.equal(pins(), beforePins);
    assert.equal(bean(tree).value, '—'); assert.equal(bean(tree).control, undefined);
    assert.equal(recordNone(tree).length, 1);
    assert.ok(recordNone(tree)[0].props.style.minHeight >= 44);
    assert.equal(recordNone(tree)[0].props.accessibilityRole, 'button');
    // Observation-only edits must not silently fix the old missing assessment.
    first(tree, node => node.type === 'DefectsSection').props.onChangeDefectCupSlots('otherBean', [2, 4]);
    let editedTree = ui.render(); assert.equal(bean(editedTree).value, '—');
    recordNone(editedTree)[0].props.onPress(); editedTree = ui.render();
    assert.equal(bean(editedTree).value, '0.00'); assert.equal(recordNone(editedTree).length, 0);
    assert.equal(rows(), before, 'explicit local correction still requires Save');
    await first(editedTree, node => node.type === 'FooterButton').props.onPress();
    const corrected = await repo.getCvaResponse(props.sessionId, props.sampleId);
    assert.equal(corrected.revision, 2); assert.equal(corrected.complete, true);
    assert.deepEqual(corrected.response, { ...historical, other_bean_cups: [2, 4], defective_cups: [], defect_type_masks: {}, evenly_defective_all_cups: false });
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM cva_response_revisions WHERE session_id = ? AND revision = 1').all(props.sessionId)),
      JSON.stringify(JSON.parse(before).filter(row => row.session_id === props.sessionId && row.revision === 1)), 'earlier bytes/provenance are retained');
    assert.equal(pins(), beforePins); ui.close();
  }
  console.log('CVA zero-default checks passed: actual screen/repository Save/reopen n=1–8, Uniformity select/clear/unassessed, default-only no-start and preserved historical null/absent/selected tuples.');
  db.close();
}
module.exports = { fixture, save, open, first, nodes, repo, db, tools, ratings, final, rows, pins };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
