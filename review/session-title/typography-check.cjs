const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const root = path.resolve(__dirname, '../..');
const file = 'src/features/cupping/components/SessionTitleSummary.js';
const ast = source => parse(source, { sourceType: 'module', plugins: ['jsx'] });
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
function declaration(tree, name) {
  for (const node of tree.program.body) {
    const declaration = node.declaration || node;
    const item = declaration.declarations?.find(item => item.id.name === name);
    if (item) return item.init;
  }
  throw new Error('Missing declaration ' + name);
}
const evaluate = (node, context) => new Function(...Object.keys(context), 'return (' + generate(node).code + ');')(...Object.values(context));
const colors = evaluate(declaration(ast(read('src/theme/colors.js')), 'colors'), {});
const spacing = evaluate(declaration(ast(read('src/theme/spacing.js')), 'spacing'), {});
const typographyTree = ast(read('src/theme/typography.js'));
const classifiedText = evaluate(declaration(typographyTree, 'classifiedText'), {});
const typography = evaluate(declaration(typographyTree, 'typography'), { colors, classifiedText });
const tree = ast(read(file));
const context = { typography, colors, spacing, StyleSheet: { hairlineWidth: 1, create: x => x } };
const styles = evaluate(declaration(tree, 'styles'), context);
assert.deepEqual(styles.name, { ...typography.text_screen_title, flexShrink: 1 });
assert.deepEqual(styles.detail, typography.text_secondary_body);
assert.deepEqual(styles.metadataText, { ...typography.text_caption, flexShrink: 1 });
assert.deepEqual(styles.uploadStatus, { ...typography.text_secondary_body, marginTop: spacing.xs });
const previous = ast(execFileSync('git', ['show', '7a53492:' + file], { cwd: root, encoding: 'utf8' }));
const previousStyles = evaluate(declaration(previous, 'styles'), context);
for (const key of ['summary','heading','description','metadata']) assert.deepEqual(styles[key], previousStyles[key], key + ' layout unchanged');
// Everything before the styles declaration, including component behaviour, is identical.
const withoutStyles = tree => tree.program.body.filter(node => !node.declarations?.some(d => d.id.name === 'styles')).map(node => generate(node).code).join('\n');
assert.equal(withoutStyles(tree), withoutStyles(previous));
console.log('PASS: exact standard typography tokens without text overrides; layout and render behaviour unchanged.');
