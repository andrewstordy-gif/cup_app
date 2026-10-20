const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const babel = require('@babel/core');
const { render } = require('./runtime.cjs');
const root = path.resolve(__dirname, '../..');
const screenPath = 'src/features/cupping/screens/CuppingSessionDetailsScreen.js';
const current = fs.readFileSync(path.join(root, screenPath), 'utf8');
const baseline = execFileSync('git', ['show', 'd37f8841cd65b5e0f9af5aafe96926de8f156fc1:' + screenPath], { cwd: root, encoding: 'utf8' });
const ast = text => parse(text, { sourceType: 'module', plugins: ['jsx'] });
const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
    const match = find(child, predicate); if (match) return match;
  }
  return null;
};
const tree = ast(current);
const compact = find(tree, n => n.type === 'VariableDeclarator' && n.id?.name === 'showCompactSessionTitle');
const summary = find(tree, n => n.type === 'JSXOpeningElement' && n.name?.name === 'SessionTitleSummary');
assert(compact && summary);
const evaluate = (node, values) => new Function(...Object.keys(values), 'return (' + generate(node).code + ');')(...Object.values(values));
for (const sessionStatusBadgeLabel of ['Pending', 'In Progress', 'Complete', 'Draft', 'Unexpected', '']) {
  assert.equal(evaluate(compact.init, { sessionStatusBadgeLabel }), ['Pending', 'In Progress', 'Complete'].includes(sessionStatusBadgeLabel));
}
for (const label of ['Pending', 'In Progress', 'Complete']) for (const hidden of [true, false]) for (const form of [1, 2]) {
  const values = {
    sessionId: 'saved', visibleIdentity: { sessionName: 'Projected name', sessionType: 'Projected type', sessionDate: 'Projected date' },
    sessionName: 'RAW DO NOT USE', sessionType: 'RAW TYPE', sessionDate: 'RAW DATE',
    getSessionTypeLabel: () => 'RAW TYPE', getCuppingFormLabel: n => n === 1 ? 'CVA form' : 'Legacy form',
    isSessionFormLoading: false, isSessionFormSupported: true, selectedForm: form,
    hideSavedIdentity: hidden, sessionDisplayId: 'SESSION-VISIBLE', sessionStatusBadgeLabel: label,
  };
  const props = Object.fromEntries(summary.attributes.map(a => [a.name.name, evaluate(a.value.expression, values)]));
  assert.equal(props.name, 'Projected name'); assert.equal(props.sessionType, 'Projected type'); assert.equal(props.dateLabel, 'Projected date');
  assert.equal(props.sessionCode, hidden ? 'Session code unavailable' : 'SESSION-VISIBLE');
  assert.equal(props.status, label.toUpperCase()); assert.equal(props.formLabel, form === 1 ? 'CVA form' : 'Legacy form');
  assert(!Object.hasOwn(props, 'uploadStatusLabel'), 'No fixture upload claims in live UI');
  const html = render(props); assert(html.includes(label.toUpperCase())); assert(!html.includes('RAW DO NOT USE'));
  values.isSessionFormLoading = true;
  assert.equal(evaluate(summary.attributes.find(a => a.name.name === 'formLabel').value.expression, values), 'Checking saved session form…');
  values.isSessionFormLoading = false; values.isSessionFormSupported = false;
  assert.equal(evaluate(summary.attributes.find(a => a.name.name === 'formLabel').value.expression, values), 'Older or unsupported prototype form');
}

// Undo ONLY the declared UI insertion; the remaining AST must equal baseline.
function restore(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'JSXExpressionContainer' && node.expression?.type === 'ConditionalExpression' && node.expression.test?.name === 'showCompactSessionTitle') return restore(node.expression.alternate);
  if (node.type === 'ConditionalExpression' && node.test?.name === 'showCompactSessionTitle') return restore(node.alternate);
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) node[key] = value.filter(n => !(n.type === 'ImportDeclaration' && n.specifiers?.some(s => s.local?.name === 'SessionTitleSummary')) && !(n.type === 'VariableDeclaration' && n.declarations?.some(d => d.id?.name === 'showCompactSessionTitle'))).map(restore);
    else if (value && typeof value === 'object') node[key] = restore(value);
  }
  return node;
}
function canonical(node) {
  if (Array.isArray(node)) return node.filter(n => !(n?.type === 'JSXText' && !n.value.trim())).map(canonical);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).filter(([key]) => !['start','end','loc','extra','leadingComments','trailingComments','innerComments','comments','tokens'].includes(key)).map(([key,value]) => [key, canonical(value)]));
}
assert.deepEqual(canonical(restore(ast(current))), canonical(ast(baseline)), 'DRAFT subtree and every non-title handler/hook/footer/style must remain unchanged');
babel.transformSync(current, { filename: screenPath, configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
console.log('PASS: exact state gating, existing projected strings and code masking, both forms, loading/unsupported labels, no fake upload status; full remaining screen AST equals baseline, including DRAFT and all handlers.');
