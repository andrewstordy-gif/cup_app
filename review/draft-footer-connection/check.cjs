const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const root = path.resolve(__dirname, '../..');
const file = 'src/features/cupping/screens/CuppingSessionDetailsScreen.js';
const source = fs.readFileSync(path.join(root, file), 'utf8');
const baseline = execFileSync('git', ['show', 'c1469a3:' + file], { cwd: root, encoding: 'utf8' });
const ast = s => parse(s, { sourceType: 'module', plugins: ['jsx'] });
const tree = ast(source);
let count = 0;
function restore(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'ConditionalExpression' && node.consequent?.type === 'JSXElement' && node.consequent.openingElement.name.name === 'ScreenFooterDual') {
    count++;
    assert.equal(generate(node.test).code, 'sessionStatusBadgeLabel === "Draft"');
    const attrs = Object.fromEntries(node.consequent.openingElement.attributes.map(a => [a.name.name, a.value === null ? true : a.value.type === 'StringLiteral' ? a.value.value : generate(a.value.expression).code]));
    assert.deepEqual(attrs, {
      primaryLabel: 'SAVE', onPrimaryPress: 'handleSave', primaryLoading: 'isSaving',
      primaryDisabled: 'footerDisabled || !isSessionFormSupported', primaryAccessibilityLabel: 'Save cupping session details',
      secondaryLabel: 'LOCK SESSION', secondaryDisabled: true,
      secondaryStyle: '{\n  backgroundColor: colors.muted\n}', secondaryTextStyle: '{}',
    });
    return restore(node.alternate);
  }
  if (node.type === 'ImportDeclaration' && node.source.value === '../../../components/ui/ScreenFooter') node.specifiers = node.specifiers.filter(s => s.local.name !== 'ScreenFooterDual');
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) node[key] = value.map(restore);
    else if (value && typeof value === 'object') node[key] = restore(value);
  }
  return node;
}
function canonical(node) {
  if (Array.isArray(node)) return node.filter(n => !(n?.type === 'JSXText' && !n.value.trim())).map(canonical);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).filter(([key]) => !['start','end','loc','extra','leadingComments','trailingComments','innerComments','comments','tokens'].includes(key)).map(([key, value]) => [key, canonical(value)]));
}
assert.deepEqual(canonical(restore(tree)), canonical(ast(baseline)), 'All source outside footer/import must be identical');
assert.equal(count, 1);
console.log('PASS: DRAFT-only two-button footer; original Save props; always-disabled handlerless Lock; all other screen AST unchanged.');
