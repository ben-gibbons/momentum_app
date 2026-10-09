// threshold.test.ts
// Unit tests for the pure distraction-threshold detector (vitest, run with `npm test`). Each test
// replays a sequence of 10s samples through step() and checks exactly when it fires.
import { describe, expect, it } from 'vitest'
import { Classification } from '../shared/types'
import { initialState, step, type ThresholdConfig, type ThresholdState } from './threshold'

// Both cooldowns 600 so the existing timelines hold for either class.
const cfg: ThresholdConfig = {
  unproductiveSecs: 120,
  notSureSecs: 300,
  cooldownUnproductiveSecs: 600,
  cooldownNotSureSecs: 600
}
const POLL = 10

// Feed `count` samples of one class, POLL seconds apart, starting at `t`. Returns the final state,
// the times at which it fired, and the clock after the last sample.
function run(
  state: ThresholdState,
  classification: Classification,
  count: number,
  t: number,
  app = 'Microsoft Edge',
  config = cfg
): { state: ThresholdState; fires: number[]; t: number } {
  const fires: number[] = []
  for (let i = 0; i < count; i++) {
    t += POLL
    const host = app === 'Microsoft Edge' ? 'example.com' : null
    const r = step(state, { classification, app, host }, t, config)
    state = r.state
    if (r.fire) fires.push(t)
  }
  return { state, fires, t }
}

describe('threshold detector', () => {
  it('fires exactly once when an unproductive run reaches its threshold', () => {
    // Samples at 10, 20, ..., 300. Run starts at the first sample (10); 120s later is 130.
    const r = run(initialState(0), Classification.UNPRODUCTIVE, 30, 0)
    expect(r.fires).toEqual([130])
    // Fire payload: exactly at the threshold, with the run length (sampled continuously so the
    // sleep-gap detector doesn't restart the run).
    let s = step(initialState(0), { classification: 2, app: 'x', host: null }, 0, cfg).state
    for (let t = POLL; t < 120; t += POLL) s = step(s, { classification: 2, app: 'x', host: null }, t, cfg).state
    expect(step(s, { classification: 2, app: 'x', host: null }, 120, cfg).fire).toEqual({
      classification: 2,
      runSeconds: 120
    })
  })

  it('uses the not-sure threshold for not-sure runs', () => {
    // initialState is already a not-sure run from t=0, so the first sample continues it.
    const r = run(initialState(0), Classification.NOT_SURE, 40, 0)
    expect(r.fires).toEqual([300])
    let s = initialState(0)
    for (let t = POLL; t < 300; t += POLL) s = step(s, { classification: 3, app: 'x', host: null }, t, cfg).state
    expect(step(s, { classification: 3, app: 'x', host: null }, 300, cfg).fire).toEqual({
      classification: 3,
      runSeconds: 300
    })
  })

  it('never fires on productive', () => {
    const r = run(initialState(0), Classification.PRODUCTIVE, 200, 0)
    expect(r.fires).toEqual([])
  })

  it('restarts the clock when the class changes (2 → 1 → 2)', () => {
    let r = run(initialState(0), Classification.UNPRODUCTIVE, 6, 0) // 60s unproductive, t=60
    expect(r.fires).toEqual([])
    r = run(r.state, Classification.PRODUCTIVE, 1, r.t) // t=70
    r = run(r.state, Classification.UNPRODUCTIVE, 13, r.t) // run starts at 80; fires at 200
    expect(r.fires).toEqual([200])
  })

  it('re-nudges every cooldown while the user stays put', () => {
    // Fires at 130 (threshold), then again each time the 600s cooldown lapses: 730, 1330, ...
    const r = run(initialState(0), Classification.UNPRODUCTIVE, 200, 0) // samples to t=2000
    expect(r.fires).toEqual([130, 730, 1330, 1930])
  })

  it('cooldown suppresses a new run until it expires, then fires again', () => {
    let r = run(initialState(0), Classification.UNPRODUCTIVE, 13, 0) // fires at 130, cooldown to 730
    expect(r.fires).toEqual([130])
    r = run(r.state, Classification.PRODUCTIVE, 1, r.t) // t=140
    // New unproductive run starts at 150; threshold met at 270 but cooldown lasts until 730.
    r = run(r.state, Classification.UNPRODUCTIVE, 70, r.t)
    expect(r.fires).toEqual([730])
  })

  it('carries cooldown across several runs', () => {
    let r = run(initialState(0), Classification.NOT_SURE, 31, 0) // fires at 300, cooldown to 900
    expect(r.fires).toEqual([300])
    r = run(r.state, Classification.PRODUCTIVE, 1, r.t) // t=320
    r = run(r.state, Classification.UNPRODUCTIVE, 20, r.t) // 330..520: threshold met, in cooldown
    expect(r.fires).toEqual([])
    expect(r.state.cooldownUntil).toBe(900)
    r = run(r.state, Classification.PRODUCTIVE, 1, r.t) // t=530
    // 540..930: threshold met at 840 but cooldown holds until 900, then it fires.
    r = run(r.state, Classification.NOT_SURE, 40, r.t)
    expect(r.fires).toEqual([900])
  })

  it('honours a changed threshold on the next step', () => {
    const r = run(initialState(0), Classification.UNPRODUCTIVE, 6, 0) // 60s in (run started at 10)
    expect(r.fires).toEqual([])
    const lower = { ...cfg, unproductiveSecs: 30 }
    const next = step(r.state, { classification: 2, app: 'x', host: null }, r.t + POLL, lower)
    expect(next.fire).toEqual({ classification: 2, runSeconds: 60 })
  })

  it('Desktop and self-app samples never fire and reset the run', () => {
    // A long Desktop stretch alone never fires.
    let r = run(initialState(0), Classification.NOT_SURE, 100, 0, 'Desktop')
    expect(r.fires).toEqual([])
    r = run(r.state, Classification.NOT_SURE, 100, r.t, 'Momentum App')
    expect(r.fires).toEqual([])

    // Not-sure run interrupted by a self sample restarts its clock.
    r = run(initialState(0), Classification.NOT_SURE, 20, 0) // 200s of not-sure
    r = run(r.state, Classification.NOT_SURE, 1, r.t, 'Momentum App')
    r = run(r.state, Classification.NOT_SURE, 20, r.t) // only 200s again → no fire
    expect(r.fires).toEqual([])
    r = run(r.state, Classification.NOT_SURE, 10, r.t) // 300s from the restart
    expect(r.fires).toHaveLength(1)
  })

  it('restarts the run after a sleep gap instead of billing the nap', () => {
    let r = run(initialState(0), Classification.UNPRODUCTIVE, 6, 0) // 60s in, t=60
    // Laptop sleeps for 8h; the next sample is the same class but far past MAX_GAP_SECS.
    const wake = r.t + 8 * 3600
    const s = step(r.state, { classification: 2, app: 'Microsoft Edge', host: 'example.com' }, wake, cfg)
    expect(s.fire).toBeNull()
    expect(s.state.runStart).toBe(wake)
    // From the wake sample it still needs the full threshold.
    r = run(s.state, Classification.UNPRODUCTIVE, 13, wake)
    expect(r.fires).toEqual([wake + 120])
  })

  it('a browser window with no readable URL never fires and resets the run', () => {
    let r = run(initialState(0), Classification.NOT_SURE, 20, 0) // 200s of not-sure on a site
    const lag = { classification: 3 as const, app: 'Microsoft Edge', host: null }
    const s = step(r.state, lag, r.t + POLL, cfg)
    expect(s.fire).toBeNull()
    r = run(s.state, Classification.NOT_SURE, 20, r.t + POLL) // only 200s since the reset
    expect(r.fires).toEqual([])
  })

  it('cooldown survives a Desktop reset', () => {
    let r = run(initialState(0), Classification.UNPRODUCTIVE, 13, 0) // fires at 130
    r = run(r.state, Classification.NOT_SURE, 1, r.t, 'Desktop')
    expect(r.state.cooldownUntil).toBe(730)
  })
})
