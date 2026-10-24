const assert = require('node:assert/strict');
const fs = require('node:fs');
// R1-054 replaces both organiser-global handlers with one actual shared local
// confirmation component. Its callback suite covers Cancel, exact frozen tokens,
// context changes, late acknowledgements and duplicate presses for both actions.
for (const file of ['src/features/cupping/screens/CuppingSessionDetailsScreen.js',
  'src/features/cupping/screens/ActiveSessionScreen.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /<LocalTastingActions/);
  assert.doesNotMatch(source, /handleCompleteSession|handleMarkComplete|markSessionCompleteIfAllSamplesComplete|manuallyMarkSessionComplete/,
    'local completion must not retain an organiser-global close callback');
}
require('./local-tasting-ui-check');
