#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const screen = readFileSync(path.join(root, 'src/features/cupping/screens/CuppingScreen.js'), 'utf8');
const defects = readFileSync(path.join(root, 'src/features/cupping/components/DefectsSection.js'), 'utf8');
const resultSection = readFileSync(path.join(root, 'src/features/cupping/components/AssessmentResultSection.js'), 'utf8');
const sampleCard = readFileSync(path.join(root, 'src/features/cupping/components/CoffeeSampleCard.js'), 'utf8');
const activeSession = readFileSync(path.join(root, 'src/features/cupping/screens/ActiveSessionScreen.js'), 'utf8');

const combinedForm = screen.slice(screen.indexOf('const renderCuppingForm ='), screen.indexOf('const handleSave ='));
const uniformity = combinedForm.indexOf('<Text style={styles.cuppingScoreTitle}>Uniformity</Text>');
const inlineDefects = combinedForm.indexOf('<DefectsSection variant="designC" inline');
const result = combinedForm.indexOf('{renderResultSection()}');
assert.ok(uniformity >= 0 && inlineDefects > uniformity && result > inlineDefects,
  'Uniformity, inline defects, and Result follow the approved order');
assert.doesNotMatch(screen, /designCDefectDrawerOverlay|mockBottomDrawer|isDefectsDrawerOpen/,
  'the CVA assessment no longer has a fixed defects drawer');
assert.match(defects, /title=\{inline \? "Bean defects" : "Defective cups"\}/);
assert.match(defects, /scoreImpact=\{inline \? \(beanAssessment\?\.value \?\? scoreImpact\) : null\}/);
assert.match(screen, /scoredDefectCount=\{defectiveCups\}/,
  'the inline impact uses the same scored count as the Result and footer');
assert.match(defects, /Other observation; no CVA score deduction/,
  'the CVA defect dialog identifies Other as observation-only');
assert.match(screen, /PREVIOUS_DEFECT_RULE_MESSAGE/,
  'reopened older CVA results disclose their previous scoring rule');
assert.match(screen, /Save with current rule/,
  'saving a changed old defect result requires explicit confirmation');
assert.match(screen, /const latest = rows\?\.latest \|\| null/,
  'reopen selects the actual latest defect row irrespective of final/non-final status');
assert.match(sampleCard, /if \(defects\?\.latest\) return defects\.latest/,
  'Session Details uses the same latest defect row');
assert.match(activeSession, /if \(defectRows\?\.latest\) return defectRows\.latest/,
  'Active Session uses the same latest defect row');
assert.match(screen, /hasUnsavedChanges: hasUnsavedChanges \|\| hasUnsavedDefectChanges/,
  'a rating-only edit previews the current corrected defect rule');
assert.match(screen, /finalScoreSummary &&\s*!hasPendingChanges &&\s*isSavedDefectsLoaded/,
  'an unsaved corrected-rule preview cannot appear under saved old-rule Result provenance');
assert.match(screen, /Bean-defect deduction: −\$\{oldDeduction\} →/,
  'the conversion confirmation includes the exact deduction change');
assert.match(screen, /total score: \$\{oldScore\} → \$\{newScore\}/,
  'the conversion confirmation includes the exact score change when ratings are complete');
assert.match(defects, /accessibilityLabelSuffix: " observation, no CVA score deduction"/,
  'screen readers hear that CVA Other is an observation without deduction');
assert.match(defects, /descriptionGap=\{inline \? spacing\.sm \* scale : undefined\}/,
  'CVA inline defect title-to-hint spacing matches Uniformity');
assert.match(defects, /titleLineHeight=\{inline \? 28 : undefined\}/,
  'CVA inline defect heading line height matches other section headings');
assert.match(defects, /titleRowGap=\{inline \? spacing\.sm \* scale : undefined\}/,
  'CVA Bean defect impact row spacing matches Uniformity');
assert.match(defects, /marginTop: descriptionGap \?\? spacing\.xs \* scale/,
  'Legacy defect description spacing keeps its existing default');
assert.match(defects, /showDefectDescription && <View style=\{inline/);
assert.doesNotMatch(defects, /<Text style=\{styles\.designDefectLabel\}>Describe the defect<\/Text>/,
  'CVA defect notes have no duplicate visible heading');
assert.match(defects, /placeholder="Describe the defect\.\.\." accessibilityLabel="Describe the defect"/,
  'CVA defect notes retain the prompt and accessible name');
assert.match(screen, /if \(!isLiveScoreFinal \|\| !finalScoreSummary\) return null/,
  'Result appears only for a saved final score');
assert.match(screen, /const \[showResultBreakdown, setShowResultBreakdown\] = useState\(false\)/,
  'score breakdown starts collapsed');
assert.match(screen, /return <AssessmentResultSection/);
assert.match(resultSection, /accessibilityState=\{\{ expanded: Boolean\(expanded\) \}\}/);
assert.match(screen, /label: 'Total score', value: finalScoreSummary\.scoreRounded\.toFixed\(SCORE_PRECISION\), total: true/);
assert.doesNotMatch(screen, /DefectBadgeRow|defectBadges/, 'Result does not repeat inline defect types as badges');
assert.match(screen, /isSavedDefectsLoaded &&/,
  'a saved total waits for saved defects to finish loading');
assert.match(screen, /Total score · adapted/);
assert.match(screen, /finalScoreSummary\.scoreRounded\.toFixed\(SCORE_PRECISION\) : '—'/,
  'the footer withholds a total until a saved final result exists');
assert.match(screen, /0\.65625 \* sumHi \+ 52\.75 - 2 \* uNormalized - 4 \* dNormalized/,
  'the CVA scoring formula remains unchanged');
console.log('CVA inline defects, collapsed Result, score impact and fixed footer checks passed.');
