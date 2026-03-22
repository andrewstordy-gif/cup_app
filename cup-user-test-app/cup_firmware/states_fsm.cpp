#include "states_fsm.h"
#include "states_off.h"
#include "states_ready.h"
#include "states_brewing.h"
#include "states_cupping.h"
#include "states_low_battery.h"

namespace {

CupState s = CupState::OFF;

void callEnter(CupState st) {
  switch (st) {
    case CupState::OFF:         states::off::enter(); break;
    case CupState::READY:       states::ready::enter(); break;
    case CupState::BREWING:     states::brewing::enter(); break;
    case CupState::CUPPING:     states::cupping::enter(); break;
    case CupState::LOW_BATTERY: states::low_battery::enter(); break;
  }
}

void callExit(CupState st) {
  switch (st) {
    case CupState::OFF:         states::off::exit(); break;
    case CupState::READY:       states::ready::exit(); break;
    case CupState::BREWING:     states::brewing::exit(); break;
    case CupState::CUPPING:     states::cupping::exit(); break;
    case CupState::LOW_BATTERY: states::low_battery::exit(); break;
  }
}

CupState callRun(CupState st) {
  switch (st) {
    case CupState::OFF:         return states::off::run();
    case CupState::READY:       return states::ready::run();
    case CupState::BREWING:     return states::brewing::run();
    case CupState::CUPPING:     return states::cupping::run();
    case CupState::LOW_BATTERY: return states::low_battery::run();
  }
  return CupState::OFF;
}

void transitionTo(CupState next) {
  if (next == s) return;
  callExit(s);
  s = next;
  callEnter(s);
}

}  // namespace

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
