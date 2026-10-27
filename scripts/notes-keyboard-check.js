#!/usr/bin/env node
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = path => readFileSync(join(__dirname, '..', path), 'utf8');
const helper = source('src/features/cupping/components/focusNotesAboveKeyboard.js');
const legacy = source('src/features/forms/legacy/LegacyCuppingScreen.js');
const cva = source('src/features/cupping/screens/CuppingScreen.js');
const defects = source('src/features/cupping/components/DefectsSection.js');
const sample = source('src/features/cupping/components/AddCoffeeSampleSheet.js');
const input = source('src/components/ui/NotesInput.js');

assert.match(helper, /Platform\.OS !== 'ios'/, 'native focus scrolling is scoped to iOS');
assert.match(helper, /scrollView\.measureInWindow/, 'focused input measures the actual scroll viewport');
assert.match(helper, /keyboardTop - visibleHeight \+ additionalOffset/, 'keyboard scroll accounts for fixed assessment chrome');
assert.match(helper, /scrollResponderScrollNativeHandleToKeyboard/, 'focused input uses ScrollView native keyboard-aware scroll');
assert.match(helper, /Keyboard\.addListener\('keyboardDidShow', scheduleScroll\)/, 'focused input scrolls after keyboard resize');
assert.match(helper, /Keyboard\.isVisible\(\)/, 'switching notes while keyboard is already open scrolls into view');
assert.doesNotMatch(helper, /setTimeout\(/, 'focus scroll does not schedule competing animated retries');
assert.match(helper, /keyboardSubscription\.remove\(\)/, 'keyboard listener is removed when the field blurs');
assert.match(helper, /cancelAnimationFrame\(frame\)/, 'pending focus scroll is cancelled when the field blurs');
assert.match(input, /<TextInput[\s\S]*?onFocus=\{onFocus\}/, 'shared NotesInput forwards focus events');
assert.match(legacy, /<ScrollView style=\{styles\.formScroll\} ref=\{formScroll\}/, 'Legacy scroll view exposes its ref');
const legacyKeyboardWrapStart = legacy.indexOf('<KeyboardAvoidingView style={styles.screen}');
const legacyKeyboardWrapEnd = legacy.indexOf('</KeyboardAvoidingView>', legacyKeyboardWrapStart);
const legacyFooter = legacy.indexOf('<View style={styles.footer}>', legacyKeyboardWrapStart);
assert.ok(legacyKeyboardWrapStart >= 0 && legacyKeyboardWrapEnd > legacyKeyboardWrapStart && legacyFooter > legacyKeyboardWrapEnd,
  'Legacy keyboard avoidance applies to scrolling notes, not the fixed score/action footer');
for (const label of ['Qualities', 'Flavour Notes', 'Describe the defect']) {
  assert.match(legacy, new RegExp(`<NotesField label="${label}"[^>]*onFocus=\\{focusNotes\\}[^>]*onBlur=\\{blurNotes\\}`), `${label} scrolls above the keyboard and cancels on blur`);
}
assert.match(defects, /onFocusDefectDescription,[\s\S]*?<NotesInput[^>]*onFocus=\{onFocusDefectDescription\} onBlur=\{onBlurDefectDescription\}/,
  'inline CVA defect notes forwards focus');
assert.match(cva, /onFocusDefectDescription=\{focusDefectNote\} onBlurDefectDescription=\{blurDefectNote\}/,
  'CVA defect notes uses the assessment scroll view');
assert.match(cva, /onFocus=\{\(\) => focusNoteGroup\(noteGroup\)\}/,
  'existing CVA note-group focus handling remains');
assert.match(sample, /onSelect=\{selectedProcess => \{\s*Keyboard\.dismiss\(\);\s*onChangeProcess\(selectedProcess\);/,
  'selecting a sample Process dismisses the name-entry keyboard');
assert.match(sample, /const openProcessMenu = \(\) => \{[\s\S]*?Keyboard\.dismiss\(\);[\s\S]*?setTimeout\(showMenu, 350\)/,
  'opening Process closes the keyboard before measuring its dropdown');

// Exercise the focus timing without a native device: a keyboard opening must
// produce one scroll, and blur must prevent any pending scroll.
let keyboardVisible = false;
let keyboardListener;
let nextFrame = 0;
const frames = new Map();
const scrollCalls = [];
const keyboard = {
  addListener: (name, callback) => {
    assert.equal(name, 'keyboardDidShow');
    keyboardListener = callback;
    return { remove: () => { keyboardListener = null; } };
  },
  isVisible: () => keyboardVisible,
  metrics: () => ({ screenY: 500 }),
};
const focusNotesAboveKeyboard = new Function('Dimensions', 'Keyboard', 'Platform', 'requestAnimationFrame', 'cancelAnimationFrame',
  `${helper.replace(/^import .*;\n/, '').replace('export function ', 'function ')}\nreturn focusNotesAboveKeyboard;`)(
    { get: () => ({ height: 800 }) }, keyboard, { OS: 'ios' },
    callback => { frames.set(++nextFrame, callback); return nextFrame; },
    id => frames.delete(id),
  );
const scrollRef = { current: {
  measureInWindow: callback => callback(0, 120, 320, 380),
  scrollResponderScrollNativeHandleToKeyboard: (...args) => scrollCalls.push(args),
} };
const flushFrames = () => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback());
};
const cancelOpeningFocus = focusNotesAboveKeyboard(scrollRef, { nativeEvent: { target: 7 } });
assert.equal(scrollCalls.length, 0, 'focus does not scroll during keyboard animation');
keyboardListener();
flushFrames();
assert.equal(scrollCalls.length, 1, 'keyboard fully opening triggers exactly one scroll');
assert.deepEqual(scrollCalls[0], [7, 136, true], 'scroll uses measured viewport and fixed chrome');
assert.equal(keyboardListener, null, 'successful scroll removes keyboard listener');
cancelOpeningFocus();
assert.equal(keyboardListener, null, 'blur removes keyboard listener');
keyboardVisible = true;
const cancelVisibleFocus = focusNotesAboveKeyboard(scrollRef, { nativeEvent: { target: 8 } });
cancelVisibleFocus();
flushFrames();
assert.equal(scrollCalls.length, 1, 'blur cancels queued scroll for an already visible keyboard');
focusNotesAboveKeyboard(scrollRef, { nativeEvent: { target: 9 } });
flushFrames();
assert.equal(scrollCalls.length, 2, 'switching fields with keyboard visible scrolls once');

console.log('Notes keyboard focus and Process dismissal wiring checks passed.');
