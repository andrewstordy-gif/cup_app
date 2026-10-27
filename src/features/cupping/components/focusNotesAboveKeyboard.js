import { Dimensions, Keyboard, Platform } from 'react-native';

// Wait for the keyboard and its avoided ScrollView to finish resizing before
// scrolling. Repeated animated scrolls during that resize can overshoot and
// then reverse, briefly moving the focused notes field off screen.
export function focusNotesAboveKeyboard(scrollRef, event, additionalOffset = 16) {
  if (Platform.OS !== 'ios') return () => {};
  const target = event?.nativeEvent?.target;
  if (target == null) return () => {};

  let active = true;
  let didScroll = false;
  let frame = null;

  const scrollToFocusedInput = () => {
    const scrollView = scrollRef.current;
    if (!active || didScroll || !scrollView?.measureInWindow) return;
    didScroll = true;
    keyboardSubscription.remove();
    scrollView.measureInWindow((x, y, width, height) => {
      if (!active) return;
      const keyboardTop = Keyboard.metrics()?.screenY ?? Dimensions.get('window').height;
      const visibleHeight = Math.max(0, Math.min(y + height, keyboardTop) - y);
      // RN's native helper assumes a full-screen ScrollView. The assessment
      // ScrollView sits between a fixed sample header and score/action footer.
      const viewportOffset = keyboardTop - visibleHeight + additionalOffset;
      scrollView.scrollResponderScrollNativeHandleToKeyboard?.(target, viewportOffset, true);
    });
  };
  const scheduleScroll = () => {
    if (!active || didScroll) return;
    if (frame != null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      scrollToFocusedInput();
    });
  };
  const keyboardSubscription = Keyboard.addListener('keyboardDidShow', scheduleScroll);
  if (Keyboard.isVisible()) scheduleScroll();
  return () => {
    active = false;
    keyboardSubscription.remove();
    if (frame != null) cancelAnimationFrame(frame);
  };
}
