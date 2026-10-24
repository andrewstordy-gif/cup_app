#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  ORDINARY_MARKS, LOWER_MARKS, visibleMarks, scoreText, isExtendedMark, revealLowerForSelected, defectDeductionText,
  unavailableBeanCups,
} = require('../src/features/forms/legacy/legacyQualityPresentation');
const { legacyScoreGridLayout } = require('../src/features/forms/legacy/legacyScoreGridLayout');

for (const [screenWidth, fontScale, expectedColumns] of [
  [320, 1, 3], [375, 1, 3], [414, 1, 4], [320, 1.5, 2], [320, 2, 1],
]) {
  const layout = legacyScoreGridLayout({ screenWidth, fontScale, fontSize: 15, panelPadding: 16, gap: 6 });
  assert.equal(layout.columns, expectedColumns, `${screenWidth}pt at ${fontScale}x text uses readable columns`);
  assert.ok(layout.choiceWidth >= 44, 'every score choice retains at least a 44pt width');
  assert.ok(layout.columns * layout.choiceWidth + (layout.columns - 1) * 6 <= screenWidth - 64 + 0.001,
    'the score grid fits inside both modal insets');
  assert.ok(layout.choiceWidth >= 4.5 * 15 * fontScale + 12,
    'the full 10.00 label has width allowance beyond its horizontal padding');
}

assert.equal(ORDINARY_MARKS.length, 17);
assert.deepEqual([ORDINARY_MARKS[0], ORDINARY_MARKS.at(-1)], [24, 40]);
assert.equal(LOWER_MARKS.length, 24);
assert.deepEqual([LOWER_MARKS[0], LOWER_MARKS.at(-1)], [0, 23]);
assert.equal(new Set([...ORDINARY_MARKS, ...LOWER_MARKS]).size, 41);
assert.deepEqual(visibleMarks(false), ORDINARY_MARKS, 'default selector shows only 6.00–10.00');
assert.deepEqual(visibleMarks(true), Array.from({ length: 41 }, (_, mark) => mark), 'revealed selector is one ascending 0.00–10.00 sequence');
assert.equal(visibleMarks(revealLowerForSelected(23))[23], 23, 'selected 5.75 remains in revealed grid on reopen');
assert.equal(visibleMarks(revealLowerForSelected(0))[0], 0, 'selected 0.00 remains in revealed grid on reopen');
for (const mark of [0, 23, 24, 39, 40]) assert.equal(scoreText(mark), (mark / 4).toFixed(2));
assert.equal(isExtendedMark(null), false);
assert.equal(isExtendedMark(0), true);
assert.equal(isExtendedMark(23), true);
assert.equal(isExtendedMark(24), false);
assert.equal(isExtendedMark(39), false);
assert.equal(isExtendedMark(40), true);
assert.equal(revealLowerForSelected(undefined), false, 'unset must not open as a selected low score');
assert.equal(revealLowerForSelected(0), true, 'selected low mark remains visible on reopen');
assert.equal(revealLowerForSelected(23), true);
assert.equal(revealLowerForSelected(24), false);
assert.equal(defectDeductionText({ numerator: 0, denominator: 1 }), '0.00');
assert.equal(defectDeductionText({ numerator: 10, denominator: 3 }), '−3.33');
assert.deepEqual(unavailableBeanCups([1, 3]), [1, 3], 'every clean cup is unavailable as a bean defect');
assert.deepEqual(unavailableBeanCups([]), [], 'clearing Clean Cup re-enables the bean-defect position');
assert.deepEqual(unavailableBeanCups(null), [], 'unassessed Clean Cup leaves bean defects available');
const screen = readFileSync(join(__dirname, '../src/features/forms/legacy/LegacyCuppingScreen.js'), 'utf8');
assert.doesNotMatch(screen, /Describe the scored defect\./,
  'Legacy optional defect notes no longer produce a completion warning');
const sharedDefects = readFileSync(join(__dirname, '../src/features/cupping/components/DefectsSection.js'), 'utf8');
assert.match(screen, /<View style=\{styles\.grid\}>\{visibleMarks\(showLowerScores\)\.map\(/, 'one grid renders the visible mark sequence');
assert.match(screen, /legacyScoreGridLayout\(\{[\s\S]*?screenWidth: width, fontScale, fontSize: typography\.text_secondary_body\.fontSize,[\s\S]*?panelPadding: spacing\.md, gap: spacing\.xs,/, 'selector choices derive responsive columns from real width and text scale');
assert.match(screen, /<Choice key=\{mark\} style=\{\{ width: scoreChoiceWidth, minWidth: 44, paddingHorizontal: spacing\.xs \}\} singleLine label=\{scoreText\(mark\)\}/, 'exact-mark choices keep the label on one line with a 44pt target');
assert.match(screen, /rulerSelectedTick: \{[^}]*width: 5[^}]*borderRadius: 3[^}]*backgroundColor: colors\.action/, 'selected ruler tick is thicker, rounded and blue');
assert.match(screen, /\[5, 4, 3, 2, 1\]\.map\(mark => <View/, 'vertical ruler renders exactly five compact visual positions');
assert.match(screen, /verticalTickSelected: \{[^}]*height: 5[^}]*backgroundColor: colors\.action[^}]*borderRadius: 3/, 'selected vertical marker is thick, rounded and blue');
assert.match(screen, /verticalSpine: \{[^}]*width: 1[^}]*backgroundColor: colors\.ink/, 'vertical spine matches the horizontal one-point baseline');
assert.match(screen, /verticalTick: \{[^}]*height: 1[^}]*backgroundColor: colors\.ink/, 'ordinary vertical marks match horizontal one-point ticks');
assert.match(screen, /<Text style=\{\[styles\.hint, styles\.intensityHeading\]\}>\{heading\}<\/Text>/, 'shared vertical section centres its heading');
assert.match(screen, /intensityHeading: \{ alignSelf: 'center' \}/, 'Intensity heading is centred above the ruler pair');
assert.equal((screen.match(/<VerticalObservationSection heading=/g) || []).length, 3, 'Dry/Break, Acidity and Body share the same section layout');
assert.match(screen, /verticalObservationSection: \{ gap: spacing\.sm, paddingVertical: spacing\.md, borderBottomWidth: 1, borderBottomColor: colors\.border \}/, 'vertical observation sections share spacing and divider');
assert.match(screen, /showDivider=\{!\['fragrance_aroma', 'acidity', 'body'\]\.includes\(key\)\}/, 'horizontal rulers with vertical observations omit their internal divider');
assert.match(screen, /style=\{\[styles\.qualityRow, !showDivider && styles\.qualityRowWithoutDivider\]\}/, 'quality ruler applies divider override only when grouped with a vertical control');
assert.match(screen, /qualityRowWithoutDivider: \{ borderBottomWidth: 0 \}/, 'internal divider is removed without changing ruler geometry');
assert.match(screen, /verticalRulerGroup: \{ alignSelf: 'center', flexDirection: 'row', gap: spacing\.lg \}/, 'single and paired rulers use the same centred group');
assert.match(screen, /\{label \? <Text style=\{styles\.hint\}>\{label\}<\/Text> : null\}/, 'only labelled rulers show a subtype label');
assert.doesNotMatch(screen, /verticalLabelSlot/, 'single Acidity and Body rulers do not reserve a blank label row');
assert.equal((screen.match(/<Text style=\{\[styles\.sectionTitle, styles\.modalTitle\]\}>/g) || []).length, 2, 'both Legacy selector titles use constrained modal-header layout');
assert.match(screen, /modalTitle: \{ flex: 1, flexShrink: 1 \}/, 'long selector titles wrap inside the dialog');
assert.match(screen, /modalClose: \{ minHeight: 44, minWidth: 44, flexShrink: 0,/, 'Close keeps its accessible target inside the dialog');
assert.match(screen, /\[1, 2, 3, 4, 5\]\.map\(mark => <Choice/, 'vertical selector offers five exact choices');
assert.match(screen, /Clear mark · Not assessed/, 'unset is a separate action, not a zero intensity');
assert.doesNotMatch(screen, /onPress=\{\(\) => onChange\(value === mark \? null : mark\)\}/, 'vertical tick rows are no longer individual hit targets');
for (const field of ['dry_aroma_intensity', 'break_aroma_intensity', 'acidity_intensity', 'body_level']) {
  assert.match(screen, new RegExp(`setVerticalField\\('${field}'\\)`), `${field} uses the shared exact selector`);
}
assert.match(screen, /const renderQualitySection = \(\[key, label\]\) => <View key=\{key\}>/, 'all seven quality rows use the same rendered quality section');
assert.match(screen, /\['fragrance_aroma', 'Fragrance \/ Aroma'\], \['flavor', 'Flavour'\], \['aftertaste', 'Aftertaste'\],[\s\S]*?\['acidity', 'Acidity'\], \['body', 'Body'\], \['balance', 'Balance'\], \['overall', 'Overall'\]/,
  'Legacy quality definitions retain the requested rating order');
assert.doesNotMatch(screen, /<Text style=\{styles\.sectionTitle\}>Quality ratings<\/Text>/, 'no redundant quality heading');
assert.match(screen, /<DesignCDefectTypeItem title="Bean defects"/, 'Legacy Bean defects begins with the shared numbered defective-cup controls');
assert.match(screen, /<DefectTypeDialog visible=\{Boolean\(pendingDefectChoice\)\}/, 'selected cups open the shared defect type dialog');
assert.match(screen, /<DesignCDefectTypeItem title="Roast defects"/, 'roast defects use the shared cup and icon controls');
assert.match(screen, /<View style=\{styles\.formContent\}>[\s\S]*?<ScrollView style=\{styles\.formScroll\}/, 'Legacy scoring content remains scrollable');
const formBody = screen.slice(screen.indexOf('<ScrollView style={styles.formScroll}'), screen.indexOf('</ScrollView>'));
const requestedOrder = [
  '{QUALITY.slice(0, 5).map(renderQualitySection)}', '<CupSet label="Uniformity"',
  '{QUALITY.slice(5, 6).map(renderQualitySection)}', '<CupSet label="Clean Cup"',
  '<CupSet label="Sweetness"', '{QUALITY.slice(6).map(renderQualitySection)}',
  '<NotesField label="Flavour Notes"', '<View style={styles.defectsSection}>',
  '<DesignCDefectTypeItem title="Bean defects"', '<DesignCDefectTypeItem title="Roast defects"',
  '<NotesField label="Describe the defect"', '{resultSummary}',
];
let previousPosition = -1;
for (const item of requestedOrder) {
  const position = formBody.indexOf(item);
  assert.ok(position > previousPosition, `${item} follows the requested Legacy section order`);
  previousPosition = position;
}
assert.doesNotMatch(screen, /Other observations|Roast shade \(paper-form position\)|Wet aroma|Roast level note|showOtherObservations/,
  'optional Other observations controls are absent from the Legacy tasting UI');
assert.doesNotMatch(formBody, /<Text style=\{styles\.sectionTitle\}>Defects<\/Text>/, 'Legacy defect sections have no redundant parent title');
assert.equal((formBody.match(/<View style=\{styles\.defectGroup\}>/g) || []).length, 3,
  'Bean, Roast and defect notes use matching section wrappers');
assert.match(screen, /defectGroup: \{ gap: spacing\.sm, borderTopWidth: 1, borderTopColor: colors\.border, paddingVertical: spacing\.md \}/,
  'defect sections use the standard divider and section padding');
assert.equal((formBody.match(/isLastInGroup paddingVertical=\{0\}/g) || []).length, 2,
  'shared defect rows avoid redundant dividers and nested padding');
assert.match(screen, /const beanDefectImpact = beanTypeCups\.length > 0 && !defect\?\.kind \? '—' : defectDeduction;/,
  'a selected bean defect without severity does not misleadingly show a zero deduction');
assert.match(formBody, /<DesignCDefectTypeItem title="Bean defects"[\s\S]*?scoreImpact=\{beanDefectImpact\}/,
  'Bean defects shows its calculated negative impact in the section title row');
const roastDefectItem = formBody.slice(formBody.indexOf('<DesignCDefectTypeItem title="Roast defects"'),
  formBody.indexOf('/>', formBody.indexOf('<DesignCDefectTypeItem title="Roast defects"')));
assert.doesNotMatch(roastDefectItem, /scoreImpact=/,
  'Roast defects has no score impact display because it does not affect the Legacy score');
assert.doesNotMatch(formBody, /<Text style=\{styles\.rowLabel\}>Score deduction<\/Text>/,
  'the separate bottom deduction line is removed');
assert.match(sharedDefects, /export function DesignCDefectTypeItem\(\{[\s\S]*?scoreImpact = null,[\s\S]*?scoreImpact == null \? <Text style=\{\[styles\.designDefectLabel, titleLineHeight && \{ lineHeight: titleLineHeight \}\]\}>\{title\}<\/Text> : <View/,
  'shared defect rows keep their default heading layout when no CVA-only line height is passed');
assert.doesNotMatch(screen, /defectsOpen|defectsOverlay|defectsPanel|drawerHeader|Open defects drawer|Close defects drawer/, 'Legacy no longer has a defects drawer');
assert.ok(screen.indexOf('<DefectTypeDialog visible={Boolean(pendingDefectChoice)}') > screen.indexOf('</ScrollView>'),
  'defect-type dialog remains outside the scroll content');
assert.match(screen, /<CupSet label="Uniformity"[^>]*scoreAction=\{n > 1\}/, 'multi-cup Uniformity uses its score to record zero or clear');
assert.match(screen, /fixed=\{n === 1\}/, 'one-cup Uniformity keeps its fixed score and disabled cup');
assert.match(screen, /const zeroAction = label === 'Uniformity' \? 'mark no cups consistent'/, 'Uniformity score action clearly names consistent cups');
assert.match(screen, /const zeroHint = label === 'Uniformity' \? 'Assessed: no cups consistent'/, 'assessed-zero Uniformity hint uses consistent-cup language');
assert.match(screen, /<CupSet label="Sweetness"[^>]*scoreAction/, 'Sweetness uses its score to record zero or clear');
assert.match(screen, /<CupSet label="Clean Cup"[^>]*scoreAction/, 'Clean Cup uses its score to record zero or clear');
for (const label of ['Uniformity', 'Sweetness', 'Clean Cup']) {
  assert.match(screen, new RegExp(`<CupSet label="${label}"`), `${label} uses the Legacy cup row`);
}
assert.match(screen, /<View style=\{styles\.cupSelectorRow\}>\s*<AssessmentCupSelector/, 'Legacy cup rows centre the shared selector without changing the component');
assert.match(screen, /cupSelectorRow: \{ width: '100%', flexDirection: 'row', justifyContent: 'center' \}/, 'Legacy cup row matches the centred Defects layout');
assert.match(screen, /onPress=\{\(\) => onChange\(value == null \? \[\] : null\)\}/, 'inline score preserves assessed-zero versus unassessed');
assert.match(screen, /!fixed && !affected && !scoreAction && <View style=\{styles\.wrap\}>/, 'no extra buttons render for fixed or inline-score sections');
assert.match(screen, /inlineScoreAction: \{ minWidth: 44, minHeight: 44,/, 'inline score remains an accessible touch target');
assert.match(screen, /<NotesField label="Flavour Notes"[^>]*response\.notes/, 'flavour notes use the immutable notes field');
assert.match(formBody, /<NotesField label="Flavour Notes"[\s\S]*?<View style=\{styles\.defectsSection\}>[\s\S]*?<NotesField label="Describe the defect"[\s\S]*?<\/View>\s*\{errors\.length[\s\S]*?\{resultSummary\}/,
  'Result follows all defect controls at the end of the scrolling form');
assert.match(screen, /const resultSummary = result\?\.ok \? <AssessmentResultSection/,
  'saved Legacy result uses the shared Result presentation');
assert.match(screen, /provenance=\{result\.label\}/,
  'both standard and adapted score provenance stay inside the shared Result section');
assert.match(screen, /formLabel=\{`SCA Legacy · version \$\{result\.identity\.form_version\}`\}/,
  'Legacy retains its saved form version');
assert.match(screen, /label: 'Total score', value: result\.display_score, total: true/,
  'Legacy expanded breakdown ends with the saved total');
assert.doesNotMatch(screen, /Saved Legacy result/, 'old Result title is removed');
assert.equal((formBody.match(/\{resultSummary\}/g) || []).length, 1, 'Result appears once in the form');
assert.equal((screen.match(/<View style=\{styles\.overallRow\}/g) || []).length, 1, 'calculated Total score appears once');
assert.doesNotMatch(formBody, /<View style=\{styles\.overallRow\}/, 'no duplicate Total score appears in the scrolling form');
assert.match(screen.slice(screen.indexOf('</ScrollView>')), /<View style=\{styles\.footer\}>\s*<View style=\{styles\.overallRow\}[^>]*>[\s\S]*?<Text style=\{styles\.rowLabel\}>\{displayedResult\?\.ok && n !== 5 \? 'Total score · adapted' : 'Total score'\}<\/Text>[\s\S]*?<Pressable onPress=\{hasPendingChanges \? saveAssessment : scanNextCup\}/,
  'calculated Total score is fixed above Save/Scan Cup');
assert.match(screen, /<NotesField label="Qualities" showLabel=\{false\} placeholder="Add qualities\.\.\."/, 'Qualities uses its prompt without a redundant visible heading');
assert.match(screen, /<NotesField label="Flavour Notes" showLabel=\{false\} placeholder="Add flavour notes\.\.\."/, 'Flavour Notes uses its prompt without a redundant visible heading');
assert.match(screen, /<NotesField label="Describe the defect" showLabel=\{false\}[^>]*placeholder="Describe the defect\.\.\."/,
  'defect notes retain an in-box prompt without a redundant visible heading');
assert.match(screen, /showLabel = true[\s\S]*?showLabel && <Text style=\{styles\.rowLabel\}>\{label\}<\/Text>[\s\S]*?accessibilityLabel=\{label\}/, 'hiding a heading does not remove the input accessibility label');
assert.match(screen, /import \{ NotesInput \} from '\.\.\/\.\.\/\.\.\/components\/ui\/NotesInput'/, 'Legacy uses the same shared notes input as CVA');
assert.match(screen, /function NotesField\([\s\S]*?<NotesInput[\s\S]*?disabled=\{readOnly\}/, 'Legacy notes preserve their read-only state through the shared input');
assert.match(screen, /minHeight: 114 \* scale, borderRadius: 13 \* scale, paddingHorizontal: 15 \* scale/, 'Legacy notes match CVA field dimensions');
for (const label of ['Qualities', 'Flavour Notes', 'Describe the defect']) {
  assert.match(screen, new RegExp(`<NotesField label="${label}"[^>]*scale=\\{scale\\}`), `${label} uses the shared CVA note styling`);
}
assert.match(screen, /displayedResult\?\.ok && n !== 5 \? 'Total score · adapted' : 'Total score'/,
  'only a saved non-five-cup total is labelled adapted');
assert.doesNotMatch(screen, /<Text style=\{styles\.total\}>\{result\.display_score\}<\/Text>/, 'saved result does not duplicate the in-section total');
assert.match(screen, /operation\.revision !== saveQueue\.current\.revision/, 'stale completion cannot overwrite a newer draft UI');
assert.match(screen, /if \(saved\.ok\) \{[\s\S]*?setMessage\(''\)/, 'successful background draft save refreshes context and clears any prior failure message');
assert.doesNotMatch(screen, /Draft saved locally\./, 'routine draft-saved copy does not occupy the top of the form');
const editBody = screen.slice(screen.indexOf('  const edit = change => {'), screen.indexOf('  const saveAssessment = async () => {'));
assert.doesNotMatch(editBody, /setMessage\('Saving/, 'typing never inserts an autosave-progress row above the notes fields');
assert.doesNotMatch(screen, /setMessage\('Saving assessment locally…'\)/,
  'explicit Save does not insert a transient progress row above the notes fields');
assert.match(screen, /else setMessage\(`Could not save draft:/, 'draft-save failure remains visible');
assert.match(screen, /const saved = await saveQueue\.current\.drain\(\)/, 'scan waits for the latest queued save');
assert.match(screen, /setHasPendingChanges\(true\);[\s\S]*?saveQueue\.current\.enqueue\(next, false, \{ intent: 'recovery', sessionId, sampleId, expectedRemovalGeneration:savedContext\?\.removalGeneration,[\s\S]*?loadEpoch:savedContext\?\.loadEpoch,expectedTastingContextToken:savedContext\?\.tasting\?\.contextToken \}\)/, 'every Legacy edit switches the footer to Save while retaining epoch/context/generation-bound separate recovery autosave');
assert.match(screen, /const shouldComplete = Boolean\(score\?\.ok\)/, 'Save finalises only a scoreable response');
assert.match(screen, /saveQueue\.current\.enqueue\(currentResponse, shouldComplete, \{ intent: 'save', sessionId, sampleId, expectedRemovalGeneration:savedContext\?\.removalGeneration,[\s\S]*?loadEpoch:savedContext\?\.loadEpoch,expectedTastingContextToken:savedContext\?\.tasting\?\.contextToken \}\)/, 'explicit Save commits the latest epoch/context/generation-bound response as a final result or partial saved assessment');
assert.match(screen, /setResult\(shouldComplete \? saved\.result : null\)/, 'Overall score shows only a successfully saved final result');
assert.match(screen, /operation\.revision !== saveQueue\.current\.revision\) return;[\s\S]*?if \(saved\.ok\) \{[\s\S]*?setHasPendingChanges\(false\)/, 'only a successful latest-revision save restores Scan Cup');
assert.match(screen, /if \(shouldComplete && !wasComplete\) triggerBalloons\(\)/, 'first successful final Save celebrates once');
assert.match(screen, /savedCompleteRef\.current = Boolean\(saved\?\.complete && saved\?\.result\?\.ok\)/, 'reopening a completed result does not replay balloons');
assert.match(screen, /<ScoreBalloons animations=\{balloonAnimations\} width=\{width\} scale=\{scale\} \/>/, 'Legacy renders the CVA-style celebration layer');
const cvaScreen = readFileSync(join(__dirname, '../src/features/cupping/screens/CuppingScreen.js'), 'utf8');
assert.match(cvaScreen, /useScoreBalloons\(\)/, 'CVA uses the extracted shared balloon animation');
assert.match(cvaScreen, /<ScoreBalloons animations=\{balloonAnimations\} width=\{width\} scale=\{scale\} \/>/, 'CVA and Legacy share the same balloon visual');
assert.doesNotMatch(screen, /COMPLETE & SCORE|Complete Legacy assessment and calculate result|Score preview — complete the assessment/, 'redundant completion button and copy are removed');
assert.match(screen, /if \(hasPendingChanges \|\| isSavingDraft\) \{[\s\S]*?Save changes before scanning another cup/, 'scan does not bypass unsaved Legacy edits');
assert.match(screen, /onPress=\{hasPendingChanges \? saveAssessment : scanNextCup\}/, 'footer switches between Save and Scan Cup');
assert.match(screen, /style=\{\[styles\.scanButton, hasPendingChanges && styles\.saveButton,/, 'Save keeps the existing footer geometry with charcoal treatment');
assert.match(screen, /\{hasPendingChanges \? 'SAVE' : 'SCAN CUP'\}/, 'footer label matches the pending-change state');
assert.match(readFileSync(join(__dirname, '../src/navigation/AppNavigator.js'), 'utf8'), /onScanPress=\{handleScanNextCupFromCupping\}/, 'Legacy scan footer uses existing navigator callback');
console.log('Legacy selector, always-visible rows, notes, inline defects, overall score and scan wiring checks passed.');
