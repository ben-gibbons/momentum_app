# Momentum — Brainstorming Session
Date: 2026-05-15

> **Historical snapshot.** This document records the original brainstorming session and has been lightly updated to reflect confirmed decisions. For current architecture and implementation guidance, see [`CLAUDE.md`](../CLAUDE.md). For the framework decision, see [`docs/adr-001-electron-framework.md`](adr-001-electron-framework.md).

---

## Problem Statement

Many apps and websites are designed to capture and retain attention, driving phone/internet addiction and procrastination behavioral feedback loops. This is especially harmful for remote workers and neurodiverse individuals (ADHD). Existing solutions (site blockers, task managers) are passive and don't address the root cause. The founder has found success with Cognitive Behavioral Therapy (CBT) techniques but struggles to sustain them beyond 2–4 weeks without active support.

## Core Concept

An empathy-oriented Windows desktop productivity app called **Momentum** that:
- Monitors active app/website usage in the background
- Prompts users with CBT-based interventions (Procrastination Logs, Risk Factors) when distraction is detected
- Tracks productive vs. unproductive vs. not-sure data over time
- Helps organize weekly and daily tasks

The core differentiator is treating procrastination as an **emotional regulation problem**, not a time management problem. The monitoring + CBT intervention loop is the product's heartbeat — everything else is additive.

---

## V1 Feature Scope

### Task Management
- **Weekly Tasks**: Required input on first login of each week.
- **Daily Tasks**: User selects from weekly list and presses "Add to Daily List." Low-friction.
- **New day behavior**: Incomplete tasks from previous day auto-added. User can pull additional items from the weekly list or write in new ones.
- **Task completion**: Strikethrough text + green checkmark replaces open circle. No animation.
- **Optional per task**: Due dates and reminders.
- **Task categories**: Each task can be assigned a category — Work, Personal, Hobby, or Goal (attached to a goal entry). Required field in V1.
- **Break Down Mode toggle**: Present in V1 (default on) as a Settings toggle. Full sub-step behavior (min 3 steps, >15-min prompt, time estimates) deferred to V2.

### Global App/Site Settings
- Global allowed/disallowed apps and websites list.
- Strict Mode: unlisted apps/sites count as Unproductive (strict on) or Not-Sure (strict off).
- Per-task overrides deferred to V2.

### Data Tracking
- **Productive**: User actively using an allowed app/site.
- **Unproductive**: User actively using a disallowed app/site.
- **Not-Sure**: App/site not on either list (and Strict Mode is off). Windows desktop/home screen is not polled.
- **Priority rule**: Unproductive always overrides Productive or Not-Sure. If multiple Edge windows are open simultaneously and any window is on a disallowed site, the session is recorded as Unproductive.
- **Polling scope**: App polls continuously while the app is open — including when the Momentum window is behind another window or minimized. Polling stops only when the user exits the app entirely. There is no persistent system tray process.
- Polling interval: **10 seconds** (confirmed V1; range 1–10s under evaluation).
- Note: Tracking inactivity (no mouse/keyboard input on an allowed site → Not-Sure) is deferred to V4.

### "Feeling Distracted?" Popup
- Triggers after 2 minutes of unproductive data OR 5 minutes of not-sure data (configurable in Settings).
- Forces a Windows notification.
- Two options: "View Risk Factors" or "Try a Procrastination Log."

### Risk Factors Page
- Predefined list: sleep, water, food, medication, alcohol, substances, exercise, social connection, going outside, fun activities, sense of accomplishment. Custom option available.
- Selecting a risk factor auto-creates a Procrastination Log formatted as "Procrastination - DD/MM/YY hh:mm - lack of [risk factor]."
- Auto-creates a recurring daily task for 2 weeks to address that risk factor.

### Procrastination Logs Landing Page
- Menu item accessible from the main nav.
- Lists all saved Procrastination Logs sorted by date, labelled `Procrastination - DD/MM/YY hh:mm` (or `Procrastination - DD/MM/YY hh:mm - lack of [risk factor]` for Risk Factor logs).
- User can manually create a new log from this page.
- Tapping a log opens the full completed log for review.

### Procrastination Log
- Most important screen in the app — must feel supportive, not like a form.
- **UI rule**: Steps are displayed one at a time to avoid overwhelming the user. The user progresses forward through each step sequentially.
- Opening quote: *"Procrastination isn't a time management problem, it's an emotional regulation problem."*
- Closing quote: *"The dread is always worse than the actual doing of the task."*
- Completed logs are saved to the Procrastination Logs landing page with their timestamp.

**Flow (5 steps):**

1. **Date / Time / Task** — User types the task they are avoiding. (V2: auto-populate from the current active daily task.)
2. **Name the emotion** — Free-text field. Prompt examples: overwhelmed, anxious, fear of quality, etc.
3. **Thought Record:**
   - *Tempting Thought* — what the user wants to do instead, and *% Belief Before* (0–100%) how much they believe it's a good idea.
   - *Distortion* — user selects from the Burns cognitive distortions list:
     1. All-or-nothing thinking
     2. Overgeneralization
     3. Mental filter
     4. Disqualifying the positive
     5. Jumping to conclusions (mind reading / fortune telling)
     6. Magnification or minimization
     7. Emotional reasoning
     8. Should statements
     9. Labeling and mislabeling
     10. Personalization
   - *Self-Control Thought* — a reframe of the tempting thought, and *% Belief* (0–100%) in that reframe.
   - *% Belief After* — how much the user still believes the original tempting thought after completing the reframe. Filled in immediately after the Self-Control Thought, within the same session.
4. **Task Breakdown** — First 1–3 easiest steps (~10 mins each). For each step: Predicted Difficulty % and Time, Predicted Satisfaction %. A **"Start 10-minute timer"** button is available here. The timer fires a Windows notification when it ends. The log stays open in the app until the user explicitly closes it. After completing their work, the user returns to the log to fill in Actual Difficulty % and Actual Satisfaction % for each step, then closes the log.
5. **Takeaways** — Optional free-text field.

### Productivity Trends
- 7-day bar chart (current week).
- Each bar: productive / unproductive / not-sure totals for that day.

### Current Session View
- Live productive vs. unproductive vs. not-sure totals for the active session.

### Break Notifier
- Triggers after 50 continuous minutes of productive data.
- Windows notification with congratulatory message and healthy break suggestions.

### Settings (Minimal)
- Configurable distraction popup thresholds (default: 2 min unproductive, 5 min not-sure).
- Break Down Mode toggle (default on). Toggle is functional in V1 UI; full sub-step behavior activates in V2.

---

## V2 Feature Scope

- Per-task allowed/disallowed app/site overrides
- Task breakdown mode (sub-steps, min 3, prompt to subdivide steps >15 minutes, time estimate per step)
- Countdown timer (user-specified minutes)
- Pomodoro timer (25/5, 50/10, or custom; only increments on productive data; break doubles every 2 consecutive Pomodoros)
- Journal (thought records, strong emotions entries, gratitude logs)
- Calendar view (daily/weekly, task history and upcoming)
- Break notifier Pomodoro integration (Pomodoro break replaces standard 50-min break notifier when Pomodoro is active)
- Procrastination Log: auto-populate Task field from current active daily task

---

## V3 Feature Scope

- Goal tracking (short/long-term, milestones, reminders)
- Dashboard UI (optional view, not default startup)
- Daily usage data (daily use flag, total days, consecutive streak, monthly totals)
- Extended productivity trends beyond current week

---

## V4 Feature Scope

### LLM Integration
- Anthropic Claude API (official Anthropic JS SDK) integrated into the response layer — not the monitoring layer. Open-source LLM alternative (e.g. Ollama) to be evaluated as a local/offline option.
- AI-assisted Procrastination Log: suggest reframes, thought challenges, and next actions based on what the user has written
- AI-powered Risk Factor analysis: surface patterns across historical logs (e.g. "you procrastinate most on Mondays after low-sleep nights")
- AI-powered task breakdown: when Break Down Mode is active, the Claude JS SDK generates and surfaces steps using the same UX pattern as the `/good-morning` Claude Code command — easiest-first ordering, one step revealed at a time, ~20 min per step, no full list shown upfront to avoid overwhelm.
- AI-powered daily/weekly task review: end-of-day task tracking should loosely follow the `/lets-go-home` Claude Code command — surfacing what's completed, suggesting next steps, and advancing the task lists with minimal friction.
- Optional: AI-assisted task auto-population by reading inbox/calendar (trust prerequisite — opt-in only, clear data handling disclosure required)
- Monitoring layer remains algorithmic — AI earns its place in the response/insight layer first

### Premium UI Polish
- Full Tailwind + Framer Motion + React component library treatment across all screens
- Designed for direct Figma handoff; polished to a commercial standard
- Consistent motion design, micro-interactions, and accessible color system

### Windows Release & Quality
- Full Windows release candidate preparation
- Bug testing pass: regression testing across core monitoring loop, popup triggers, SQLite write/flush cycle, and Python sidecar edge cases
- Security review: audit data storage (SQLite, local session files), IPC between Electron main/renderer, and Python sidecar stdout communication for injection risks
- Address bar AutomationId resilience: auto-diagnostic that detects Edge UI changes and surfaces a recoverable error in-app without requiring an update
- Performance audit: Chromium overhead baseline, Python sidecar CPU/memory, polling impact over an 8-hour session
- Installer + auto-updater (Squirrel or similar)
- Windows Store submission or direct distribution packaging

---

## Key Decisions

- Default startup goes directly to Daily Task view, not the dashboard
- Dashboard available as optional view only
- Global allowed/disallowed in V1; per-task overrides in V2
- No task completion animation — strikethrough + checkmark only
- Risk Factors auto-recurring task creation: in spec but flagged for potential revision in V2
- **Unproductive data always wins**: if any monitored window is on a disallowed site/app at poll time, the interval is recorded as Unproductive regardless of other open windows
- **Monitoring lifecycle**: polling runs whenever the Momentum app is open (including minimized or behind other windows). Polling stops on app exit. No persistent background tray process.
- **Task categories in V1**: Work, Personal, Hobby, Goal (required field per task)
- **Break Down Mode V1**: toggle-only; sub-step behavior activates in V2
- **Not-Sure in V1**: applies only to unlisted apps/sites. Inactivity detection on allowed sites (→ Not-Sure) deferred to V4.
- **Procrastination Log cognitive distortions list**: Burns list (10 distortions). See Procrastination Log section for full list.

---

## Explicitly Deferred Items

- **Website/app hard blocking**: Different product category. Consider integrating with Freedom or Cold Turkey.
- **Claude API inbox reading** for task auto-population: Future roadmap — trust prerequisite not yet established.
- **AI agent monitoring**: Algorithmic in V1. AI reserved for the response layer (procrastination log suggestions) in future iterations.
- **Browser extension**: Avoided for onboarding friction. UIAutomation (pywinauto) used for Edge URL reading instead. Acknowledged as fragile — revisit as optional enhancement later.
- **Cross-browser support**: Edge only in V1.
- **Phone app**: Future iteration.
- **Not-Sure inactivity tracking**: Detecting mouse/keyboard inactivity on an allowed site (→ flip to Not-Sure) deferred to V4. V1 Not-Sure applies only to unlisted apps/sites.
- **Procrastination Log task auto-population**: Auto-filling the Task field from the current active daily task deferred to V2. V1 is manual entry.
