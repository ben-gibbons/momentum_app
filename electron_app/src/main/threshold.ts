// threshold.ts
// Pure distraction-threshold detector for the V1 popup (roadmap item 2). The session manager
// feeds it one classified sample per 10s poll; it tracks the current contiguous run of one
// classification and says when to fire the "Feeling distracted?" nudge. Rules (plan D4/A1/A5,
// repeat added 2026-10-05): fire when an unproductive / not-sure run reaches its threshold, then
// again every cooldown for as long as the run continues; the cooldown carries across runs so a
// quick switch-away-and-back stays quiet; productive never fires; Desktop and Momentum's own window
// are recorded as not-sure elsewhere but never accrue toward the not-sure run (otherwise filling
// in a 10-minute CBT log inside Momentum would trigger the not-sure popup). No Electron or DB
// imports so it can be unit-tested with vitest.
import { Classification } from '../shared/types'
import { BROWSER_APP, DESKTOP_APP, SELF_APP } from './classifier'

export interface ThresholdConfig {
  unproductiveSecs: number
  notSureSecs: number
  cooldownUnproductiveSecs: number
  cooldownNotSureSecs: number
}

export interface ThresholdState {
  classification: Classification
  runStart: number // Unix seconds when the current run began
  lastSampleAt: number // Unix seconds of the previous sample; used to detect sleep/hibernate gaps
  cooldownUntil: number // Unix seconds; 0 = no cooldown
}

// Polls are 10s apart. A gap much longer than that means the machine slept (setInterval doesn't
// run while suspended), so the run is restarted rather than billing the nap as distraction time.
export const MAX_GAP_SECS = 60

export interface ThresholdSample {
  classification: Classification
  app: string
  host: string | null // null for non-browser apps and for a browser window with no readable URL
}

export interface ThresholdFire {
  classification: 2 | 3
  runSeconds: number
}

export function initialState(now: number): ThresholdState {
  return {
    classification: Classification.NOT_SURE,
    runStart: now,
    lastSampleAt: now,
    cooldownUntil: 0
  }
}

// Desktop / self samples never count toward a run (A1), and neither does a browser window whose
// URL hasn't been read (New Tab, sidecar lag): it would nudge about "Microsoft Edge", which the
// user can't reclassify.
function isSkipped(s: ThresholdSample): boolean {
  return s.app === DESKTOP_APP || s.app === SELF_APP || (s.app === BROWSER_APP && s.host === null)
}

export function step(
  state: ThresholdState,
  sample: ThresholdSample,
  now: number,
  cfg: ThresholdConfig
): { state: ThresholdState; fire: ThresholdFire | null } {
  // A skipped sample resets the run: whatever follows starts its clock from scratch, and the
  // skipped sample itself never fires. Cooldown is carried.
  if (isSkipped(sample)) {
    return {
      state: {
        classification: Classification.NOT_SURE,
        runStart: now,
        lastSampleAt: now,
        cooldownUntil: state.cooldownUntil
      },
      fire: null
    }
  }

  // Class change (or a sleep gap) → new run; cooldown carries so a quick switch-away-and-back
  // can't re-fire.
  const gap = now - state.lastSampleAt > MAX_GAP_SECS
  const next: ThresholdState =
    sample.classification === state.classification && !gap
      ? { ...state, lastSampleAt: now }
      : {
          classification: sample.classification,
          runStart: now,
          lastSampleAt: now,
          cooldownUntil: state.cooldownUntil
        }

  if (next.classification === Classification.PRODUCTIVE) return { state: next, fire: null }

  const unproductive = next.classification === Classification.UNPRODUCTIVE
  const threshold = unproductive ? cfg.unproductiveSecs : cfg.notSureSecs
  const cooldown = unproductive ? cfg.cooldownUnproductiveSecs : cfg.cooldownNotSureSecs
  const runSeconds = now - next.runStart
  // Fire whenever the run is past its threshold and the cooldown has lapsed. Staying put after a
  // nudge therefore re-nudges every cooldown (the cooldown doubles as the repeat interval);
  // switching away and back inside the cooldown stays quiet.
  if (now < next.cooldownUntil || runSeconds < threshold) {
    return { state: next, fire: null }
  }

  next.cooldownUntil = now + cooldown
  return { state: next, fire: { classification: next.classification, runSeconds } }
}
