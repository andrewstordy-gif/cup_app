#include "states_fsm.h"

#include "states_off.h"

namespace {

// current state only
CupState s = CupState::OFF;

void callEnter(CupState st) {
  (void)st;
  states::off::enter();
}

void callExit(CupState st) {
  (void)st;
  states::off::exit();
}

CupState callRun(CupState st) {
  (void)st;
  return states::off::run();
}

void transitionTo(CupState next) {
  if (next == s) return;
  callExit(s);
  s = CupState::OFF;
  callEnter(s);
}

} // anonymous namespace

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

} // namespace states::fsm
