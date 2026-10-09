// screens/Settings.tsx
// Settings screen (roadmap V1 item 4). Content-only <main> in the Session.tsx idiom: a view header
// then a stack of cards — You (name), Distraction popup (thresholds + cooldown in minutes), Strict
// mode, Productive / Unproductive rule lists, Not sure yet (reclassify), and a static note on how
// multiple visible windows are counted.
//
// Data flow: the outer component loads settings + rules + not-sure items via useAsync and mounts
// the form only once settings exist, so SettingsForm can lazy-init its drafts from the loaded
// values (the ProcrastinationLog "load then init" pattern — no hydration effect). Every control
// autosaves: text/number fields commit on blur (Enter blurs, so it commits too), the switch on
// change, and each write is followed by reload() so the loaded snapshot stays the source of truth
// (drafts revert to it when a number field is left empty). There is no Save button.
//
// Durations are stored in seconds but edited in minutes; the conversion lives in this file only.
import { useEffect, useState } from 'react'
import { useAsync } from '../lib/useAsync'
import { api } from '../lib/api'
import type { AppSettings, NotSureItem, RuleInput } from '../../../shared/types'
import { TextField, NumberField } from '../components/log/fields'
import { Section } from '../components/settings/Section'
import { Switch } from '../components/settings/Switch'
import { RuleListEditor } from '../components/settings/RuleListEditor'
import { NotSureList } from '../components/settings/NotSureList'

// The four duration settings, keyed by their settings-table key. `read` picks the seconds value
// out of the typed AppSettings snapshot. A cooldown can't be shorter than its own threshold
// (`minOf`), and raising a threshold pushes its cooldown up with it (`cooldownKey`).
type DurationKey =
  | 'threshold_unproductive'
  | 'threshold_notsure'
  | 'cooldown_unproductive'
  | 'cooldown_notsure'
interface DurationField {
  key: DurationKey
  label: string
  read: (s: AppSettings) => number
  minOf?: DurationKey // this field may not go below that field's value
  cooldownKey?: DurationKey // the cooldown that must stay ≥ this threshold
}
const DURATION_FIELDS: DurationField[] = [
  {
    key: 'threshold_unproductive',
    label: 'Unproductive time before a nudge',
    read: (s) => s.thresholdUnproductive,
    cooldownKey: 'cooldown_unproductive'
  },
  {
    key: 'cooldown_unproductive',
    label: 'Cooldown between unproductive nudges',
    read: (s) => s.cooldownUnproductive,
    minOf: 'threshold_unproductive'
  },
  {
    key: 'threshold_notsure',
    label: 'Not-sure time before a nudge',
    read: (s) => s.thresholdNotSure,
    cooldownKey: 'cooldown_notsure'
  },
  {
    key: 'cooldown_notsure',
    label: 'Cooldown between not-sure nudges',
    read: (s) => s.cooldownNotSure,
    minOf: 'threshold_notsure'
  }
]
const fieldByKey = (key: DurationKey): DurationField => DURATION_FIELDS.find((f) => f.key === key)!

// Durations are edited as whole minutes + seconds (00 by default) and stored as total seconds.
// The monitoring loop samples every 10 s, so seconds step by 10 and are rounded to a multiple of
// it on commit; smallest value is one poll.
const POLL_SECONDS = 10
const MIN_SECONDS = POLL_SECONDS
interface MinSec {
  min: number | null
  sec: number | null
}
const toMinSec = (secs: number): MinSec => ({ min: Math.floor(secs / 60), sec: secs % 60 })
const toSeconds = (d: MinSec): number => Math.round((d.min ?? 0) * 60 + (d.sec ?? 0))

const APP_PLACEHOLDER = 'e.g. Visual Studio Code'

export default function Settings(): React.JSX.Element {
  const settings = useAsync(() => api.settings.getAll(), [])
  const rules = useAsync(() => api.rules.list(), [])
  // "Not sure yet" grows while the screen is open (the user often tests an app, then looks here),
  // so refresh it every 30 s rather than only on mount. Rules are user-edited; they stay on-demand.
  const [notSureTick, setNotSureTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setNotSureTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const notSure = useAsync(() => api.rules.listNotSure(), [notSureTick])

  // Adding a rule (from the list editors or the not-sure list) can rewrite past not-sure rows, so
  // both the rule lists and the not-sure list are refreshed.
  async function addRule(input: RuleInput): Promise<void> {
    await api.rules.add(input)
    rules.reload()
    notSure.reload()
  }
  async function removeRule(id: number): Promise<void> {
    await api.rules.remove(id)
    rules.reload()
  }
  function classify(item: NotSureItem, classification: 1 | 2): Promise<void> {
    return addRule({ kind: item.kind, pattern: item.pattern, classification })
  }

  const allRules = rules.data ?? []
  // The master switch (Distraction popup card). Off = no polling at all, so every polling-dependent
  // section greys out: strict mode, both rule lists, and "Not sure yet".
  const monitoring = settings.data?.monitoringEnabled ?? true

  // Remembered per machine (localStorage) so the toggle survives leaving and re-entering Settings.
  const [notSureSort, setNotSureSortState] = useState<'time' | 'recent'>(() => {
    try {
      return localStorage.getItem('settings.notSureSort') === 'recent' ? 'recent' : 'time'
    } catch {
      return 'time'
    }
  })
  function setNotSureSort(k: 'time' | 'recent'): void {
    setNotSureSortState(k)
    try {
      localStorage.setItem('settings.notSureSort', k)
    } catch {
      // storage unavailable — the in-memory choice still applies for this visit
    }
  }
  const sortedNotSure = [...(notSure.data ?? [])].sort((a, b) =>
    notSureSort === 'time' ? b.minutes - a.minutes : b.lastSeen - a.lastSeen
  )

  return (
    <main className="h-screen overflow-y-auto bg-paper">
      {/* Narrower than the other screens (920px) — the cards read better at this width. */}
      <div className="mx-auto max-w-[800px] px-12 pb-14 pt-9">
        {/* .mm-view__head — eyebrow + display title + calm sub-line */}
        <header className="mb-[26px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Preferences
          </div>
          <h1 className="mt-[6px] font-display text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            Settings
          </h1>
          <p className="mt-2 max-w-[540px] text-[17px] text-muted">
            Tune what counts as focus and when Momentum checks in. Changes save as you go.
          </p>
        </header>

        {settings.data && (
          <div className="flex flex-col gap-[18px]">
            <SettingsForm saved={settings.data} onSaved={settings.reload} />

            {/* Named Productive / Unproductive, not allowed / disallowed: Momentum classifies
                time, it doesn't block anything. */}
            <RuleListEditor
              title="Productive"
              caption="Time here counts as productive."
              disabled={!monitoring}
              classification={1}
              rules={allRules.filter((r) => r.classification === 1)}
              placeholders={{ app: APP_PLACEHOLDER, site: 'e.g. github.com, docs.google.com' }}
              onAdd={addRule}
              onRemove={removeRule}
            />

            <RuleListEditor
              title="Unproductive"
              caption="Time here counts as unproductive."
              disabled={!monitoring}
              classification={2}
              rules={allRules.filter((r) => r.classification === 2)}
              placeholders={{
                app: APP_PLACEHOLDER,
                site: 'youtube.com, reddit.com, instagram.com, facebook.com, etc.'
              }}
              onAdd={addRule}
              onRemove={removeRule}
            />

            <Section
              title="Not sure yet"
              caption="Things you've used that aren't on either list. Sorting them fixes past totals too."
              disabled={!monitoring}
            >
              {/* Order toggle: the repository returns most-time-first; "Recent" re-sorts by last seen. */}
              <div className="mb-3 flex gap-2">
                {(['time', 'recent'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setNotSureSort(k)}
                    className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                      notSureSort === k
                        ? 'bg-brand-soft text-brand'
                        : 'text-muted hover:bg-hover hover:text-body'
                    }`}
                  >
                    {k === 'time' ? 'Most time' : 'Most recent'}
                  </button>
                ))}
              </div>
              <NotSureList items={sortedNotSure} onClassify={classify} />
            </Section>

            <Section title="How multiple windows are counted">
              <p className="max-w-[640px] text-[15px] leading-[1.55] text-body">
                When more than one window is visible — a split screen or a second monitor — Momentum
                looks at all of them. If any visible window is on the Unproductive list, the whole
                interval counts as unproductive, even if you&apos;re also working in a productive
                app. Otherwise the front window decides: on the Productive list → productive, on
                neither list → not-sure. Minimized and fully covered windows don&apos;t count, and
                Momentum itself starts on the Productive list.
              </p>
            </Section>
          </div>
        )}
      </div>
    </main>
  )
}

interface SettingsFormProps {
  saved: AppSettings // latest loaded snapshot; drafts lazy-init from it and revert to it if cleared
  onSaved: () => void
}

// The You / Distraction popup / Strict mode cards. Holds the editable drafts so typing never
// fights the loaded value; commits write through api.settings.set and then ask the screen to reload.
function SettingsForm({ saved, onSaved }: SettingsFormProps): React.JSX.Element {
  const [name, setName] = useState(saved.userName)
  const [durations, setDurations] = useState<Record<DurationKey, MinSec>>(() => ({
    threshold_unproductive: toMinSec(saved.thresholdUnproductive),
    cooldown_unproductive: toMinSec(saved.cooldownUnproductive),
    threshold_notsure: toMinSec(saved.thresholdNotSure),
    cooldown_notsure: toMinSec(saved.cooldownNotSure)
  }))
  const [strict, setStrict] = useState(saved.strictMode)
  const [monitoring, setMonitoring] = useState(saved.monitoringEnabled)

  function save(key: string, value: string): void {
    api.settings.set(key, value).then(onSaved)
  }

  function commitName(): void {
    const trimmed = name.trim()
    setName(trimmed)
    if (trimmed !== saved.userName) save('user_name', trimmed)
  }

  function commitDuration(field: DurationField): void {
    const draft = durations[field.key]
    const raw = toSeconds(draft)
    // Both boxes empty / non-numeric → put the saved value back rather than writing garbage.
    if ((draft.min == null && draft.sec == null) || !Number.isFinite(raw)) {
      setDurations((d) => ({ ...d, [field.key]: toMinSec(field.read(saved)) }))
      return
    }
    // Round to the poll interval, normalise (e.g. 90 seconds → 1 min 30 s) and clamp — a cooldown
    // never below its threshold.
    const floor = field.minOf ? fieldByKey(field.minOf).read(saved) : MIN_SECONDS
    const secs = Math.max(floor, MIN_SECONDS, Math.round(raw / POLL_SECONDS) * POLL_SECONDS)
    setDurations((d) => ({ ...d, [field.key]: toMinSec(secs) }))
    if (secs !== field.read(saved)) save(field.key, String(secs))
    // A threshold raised above its cooldown drags the cooldown up to match.
    if (field.cooldownKey) {
      const cd = fieldByKey(field.cooldownKey)
      if (cd.read(saved) < secs) {
        setDurations((d) => ({ ...d, [cd.key]: toMinSec(secs) }))
        save(cd.key, String(secs))
      }
    }
  }

  // Enter in any field blurs it, and blur is what commits — one path for both.
  function blurOnEnter(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') (e.target as HTMLElement).blur()
  }

  return (
    <>
      <Section title="You">
        <div className="max-w-[360px]" onBlur={commitName} onKeyDown={blurOnEnter}>
          <TextField label="Your name" value={name} onChange={setName} placeholder="Your name" />
        </div>
      </Section>

      <Section
        title="Distraction popup"
        action={
          // Master switch, right-aligned on the title row, with its consequence noted beneath it.
          // 17px = the title block (20px × 1.15 line-height + 18px margin = 41px) minus the 24px
          // switch row, so the note's first line sits level with the threshold labels in the body
          // (same 13px size and default line-height as those labels, so the text boxes match too).
          <div className="flex translate-x-[10px] flex-col items-center gap-[17px]">
            <Switch
              checked={monitoring}
              onChange={(on) => {
                setMonitoring(on)
                save('monitoring_enabled', on ? '1' : '0')
              }}
              label={monitoring ? 'On' : 'Off'}
            />
            {/* Broken by hand into three even lines, switch centred above. */}
            <span className="whitespace-nowrap text-center text-[13px] text-muted">
              Turning this off disables
              <br />
              all app and website polling
              <br />
              and distraction popups.
            </span>
          </div>
        }
        footer="Defaults: nudge after 2 min unproductive or 5 min not-sure, repeating every 4 and 10 min if you stay put. A cooldown can't be shorter than its nudge threshold."
        disabled={!monitoring}
      >
        {/* Two rows — unproductive, then not-sure — each a threshold followed by its cooldown.
            DURATION_FIELDS is ordered threshold, cooldown, threshold, cooldown, so pair them. */}
        <div className="flex flex-col gap-5">
          {[DURATION_FIELDS.slice(0, 2), DURATION_FIELDS.slice(2, 4)].map((row) => (
            <div key={row[0].key} className="flex flex-wrap items-end gap-x-8 gap-y-4">
              {row.map((f) => (
                // Blur is captured per field group, so tabbing between its min and sec boxes
                // commits once focus leaves the group (React's onBlur bubbles); Enter blurs.
                <div
                  key={f.key}
                  className="flex flex-col gap-[7px]"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitDuration(f)
                  }}
                  onKeyDown={blurOnEnter}
                >
                  {/* The label sits above the whole min/sec group (not on the minutes box) so the
                      boxes and their units stay snug regardless of how long the label is. */}
                  <span className="text-[13px] font-semibold text-body">{f.label}</span>
                  <div className="flex items-center gap-3">
                    <NumberField
                      label=""
                      compact
                      value={durations[f.key].min}
                      onChange={(v) =>
                        setDurations((d) => ({ ...d, [f.key]: { ...d[f.key], min: v } }))
                      }
                    />
                    <span className="text-[13px] text-muted">min</span>
                    <NumberField
                      label=""
                      compact
                      value={durations[f.key].sec}
                      step={POLL_SECONDS}
                      max={50}
                      onChange={(v) =>
                        setDurations((d) => ({ ...d, [f.key]: { ...d[f.key], sec: v } }))
                      }
                    />
                    <span className="text-[13px] text-muted">sec</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Strict mode"
        caption="Apps and sites on neither list count as unproductive instead of not-sure."
        disabled={!monitoring}
      >
        <Switch
          checked={strict}
          onChange={(on) => {
            setStrict(on)
            save('strict_mode', on ? '1' : '0')
          }}
          label={strict ? 'On' : 'Off'}
        />
      </Section>
    </>
  )
}
