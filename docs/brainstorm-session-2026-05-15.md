# Momentum — Brainstorming Session
Date: 2026-05-15

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
- Task breakdown mode (sub-steps) deferred to V2.

### Global App/Site Settings
- Global allowed/disallowed apps and websites list.
- Strict Mode: unlisted apps/sites count as Unproductive (strict on) or Not-Sure (strict off).
- Per-task overrides deferred to V2.

### Data Tracking (polled every 15 seconds)
- **Productive**: User actively using an allowed app/site.
- **Unproductive**: User actively using a disallowed app/site.
- **Not-Sure**: App/site not on either list, OR on allowed list but no mouse/keyboard activity for 5 minutes.
- Windows desktop/home screen not polled.

### "Feeling Distracted?" Popup
- Triggers after 2 minutes of unproductive data OR 5 minutes of not-sure data (configurable in Settings).
- Forces a Windows notification.
- Two options: "View Risk Factors" or "Try a Procrastination Log."

### Risk Factors Page
- Predefined list: sleep, water, food, medication, alcohol, substances, exercise, social connection, going outside, fun activities, sense of accomplishment. Custom option available.
- Selecting a risk factor auto-creates a Procrastination Log formatted as "Procrastination - DD/MM/YY hh:mm - lack of [risk factor]."
- Auto-creates a recurring daily task for 2 weeks to address that risk factor.

### Procrastination Log
- CBT Thought Record flow. Exact UI TBD (screenshots pending).
- Includes a "Start a 10 minute timer" option.
- Most important screen in the app — must feel supportive, not like a form.

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
- Break Down Mode toggle (default on; behavior deferred to V2, toggle present in V1).

---

## V2 Feature Scope

- Per-task allowed/disallowed app/site overrides
- Task breakdown mode (sub-steps, min 3, prompt to subdivide steps >15 minutes)
- Countdown timer (user-specified minutes)
- Pomodoro timer (25/5, 50/10, or custom; only increments on productive data; break doubles every 2 consecutive Pomodoros)
- Journal (thought records, strong emotions entries, gratitude logs)
- Calendar view (daily/weekly, task history and upcoming)
- Break notifier Pomodoro integration

---

## V3 Feature Scope

- Goal tracking (short/long-term, milestones, reminders)
- Dashboard UI (optional view, not default startup)
- Daily usage data (daily use flag, total days, consecutive streak, monthly totals)
- Extended productivity trends beyond current week

---

## Key Decisions

- Default startup goes directly to Daily Task view, not the dashboard
- Dashboard available as optional view only
- Global allowed/disallowed in V1; per-task overrides in V2
- No task completion animation — strikethrough + checkmark only
- Procrastination Log UX design pending (screenshots from user)
- Risk Factors auto-recurring task creation: in spec but flagged for potential revision in V2

---

## Explicitly Deferred Items

- **Website/app hard blocking**: Different product category. Consider integrating with Freedom or Cold Turkey.
- **Claude API inbox reading** for task auto-population: Future roadmap — trust prerequisite not yet established.
- **AI agent monitoring**: Algorithmic in V1. AI reserved for the response layer (procrastination log suggestions) in future iterations.
- **Browser extension**: Avoided for onboarding friction. UIAutomation (pywinauto) used for Edge URL reading instead. Acknowledged as fragile — revisit as optional enhancement later.
- **Cross-browser support**: Edge only in V1.
- **Phone app**: Future iteration.
