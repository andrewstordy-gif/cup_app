#include "states_fsm.h"
#include "states_low_battery.h"

namespace {
CupState s = CupState::LOW_BATTERY;

void callEnter(CupState st) {
  (void)st;
  states::low_battery::enter();
}

void callExit(CupState st) {
  (void)st;
  states::low_battery::exit();
}

CupState callRun(CupState st) {
  (void)st;
  return states::low_battery::run();
}

void transitionTo(CupState next) {
  if (next == s) return;
  callExit(s);
  s = CupState::LOW_BATTERY;
  callEnter(s);
}
}

namespace states::fsm {

void init(CupState start) {
  s = start;
  callEnter(s);
}

void run() {
  transitionTo(callRun(s));
}

CupState current() {
  return s;
}

void force(CupState next) {
  transitionTo(next);
}

}  // namespace states::fsm
