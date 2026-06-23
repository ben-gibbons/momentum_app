# Handoff: Momentum — Home Screen, Splash & App Icon

## How to use this handoff with Claude Code
1. **Make this folder readable by Claude Code.** Drop it into your app's repo (e.g.
   `/design_system/`) or open Claude Code with this folder accessible. It needs the unzipped
   files — it can't read a zip.
2. **Open with a prompt that names your environment and points here first.** For example:
   > "Read `design_system/README.md` first — it's a design reference, not code to copy. Our app
   > is **[React + Vite renderer, Tailwind CSS, TypeScript, Python sidecar, Node.js]** in **[/electron_app/]**. Recreate these
   > designs using our existing components and patterns. Start with the home screen."
3. **Wire the tokens before building screens.** Map `tokens/` (or `styles.css`) into your theme
   system first, so colors/type/spacing match exactly instead of being eyeballed per component.
4. **Build one screen at a time, in order.** Home screen first (the approved source of truth),
   then the reflective flows. Review each before moving on — avoid "build everything at once".
5. **Honor the precedence rule** in the next-but-one section: the home-screen file owns the
   Daily Tasks view + sidebar; the interactive-flows files own the reflective screens.

**Decisions this handoff does NOT make for you:** your framework, and the fonts (the bundled fonts
are Google-Fonts substitutes — confirm if a licensed face is intended). The `.html`/`.jsx` files are
visual intent to reimplement in your stack, not code to lift. `data.js` is the **data shape**, not
real data.

---

## Overview
Momentum is a calm, grounded desktop productivity app. A person sees their day as a short,
focused task list; each task can expand into AI-suggested ~20-minute steps; a forest-green hero
banner greets them and shows live focus time. The app also carries a set of reflective flows —
a CBT-style "procrastination log", a risk-factors check-in, a current-session view, productivity
trends, and a gentle "feeling distracted?" nudge.

This package hands off three finished pieces:
1. **Home screen** (the Daily Tasks view + sidebar) — the primary, approved design.
2. **Splash / loading screen** — forest gradient with a 2-second snowball loader.
3. **Windows app icon** — the desktop tile.

It also includes the **interactive reflective flows** as a working reference so they can be
rebuilt alongside the home screen.

---

## About the Design Files
**Everything in this bundle is a design reference created in HTML/CSS/JS — not production code to
ship verbatim.** They are prototypes that show the intended look and behavior. Your task is to
**recreate these designs in the target codebase's environment** (React, Vue, SwiftUI, Electron,
etc.), using its established components, state, and data patterns. If no front-end environment
exists yet, choose the framework that best fits the project and implement the designs there.

Two different file styles appear in this bundle, **on purpose** — read the next section before
you start.

---

## ⚠️ Read first: two references, one app — which wins where

This app was designed in two passes. Both draw from the **exact same design system** (same tokens,
fonts, Lucide icons, sidebar information architecture, and mock data), so they are fully
compatible. They differ only in *file format* and in *which screens they cover*:

| | `home-screen/` | `interactive-flows/` |
|---|---|---|
| Format | Plain HTML + CSS + vanilla JS, single self-contained file | React + Babel, multi-file, composes design-system components from `_ds_bundle.js` |
| Covers | **Daily Tasks home screen + sidebar** (the final, approved layout) | Daily tasks (older layout), **Current session, Trends, Risk factors, Procrastination (CBT) log, "Feeling distracted?" nudge dialog** |
| Role in handoff | **Source of truth** for the home screen & sidebar | **Source of truth** for the reflective flows the home screen doesn't include |

**Precedence rule — important:**
- For the **Daily Tasks home screen and the sidebar**, build from `home-screen/index.html`. It is
  the newest, approved design (forest-green hero banner, expand-task-into-steps interaction).
  **Ignore** the older home/daily-tasks layout inside `interactive-flows/DailyTasks.jsx` and its
  right-rail — it was an earlier take on the same screen.
- For the **Current session, Trends, Risk factors, Procrastination log, and distraction nudge**,
  build from the matching files in `interactive-flows/`. The home screen does not depict these, so
  there is no conflict.

**You do not need to "update" the React files first.** Because every file here is a reference that
gets reimplemented in the real codebase, the React/HTML format difference doesn't matter — pull the
*layout, behavior, copy, and data model* from whichever file owns each screen per the table above.

---

## Fidelity
**High-fidelity.** All files use final colors, typography, spacing, radii, shadows, and copy from
the Momentum design system. Recreate the UI pixel-accurately using the codebase's libraries, then
wire the tokens in `tokens/` (or `styles.css`) into the app's theme so values match exactly.

---

## Screens / Views

### 1. Daily Tasks — Home  *(source: `home-screen/index.html`)*
**Purpose:** The landing screen. See today's tasks, check them off, expand a task into AI-suggested
20-minute steps, and start a step.

**Layout:** Full-viewport CSS grid, two columns: fixed **264px** sidebar + fluid main column.
Main column scrolls; sidebar is static.

- **Sidebar** (`.nav`, bg `--surface-card`, right border `--border-default`, padding 20px 16px):
  - Brand lockup: 39px `momentum-mark.svg` + "Momentum" wordmark in `--font-display` (Newsreader),
    `--text-2xl`, weight 500, color `--text-brand`.
  - Nav items (`.nav__item`): icon + label + optional count badge. Height ~40px, radius
    `--radius-md`, `--text-base` weight 500. Active item: bg `--surface-brand-soft`, color
    `--text-brand`. Hover: bg `--surface-hover`. Icons are 20px Lucide.
  - Items in order: **Daily tasks** (badge "3", active), Calendar, Current session,
    Productivity Trends; section divider **"Reflect"**; Procrastination logs, Risk factors.
  - Pinned to bottom (after a flex spacer, separated by a top border): **Feeling distracted?**,
    **Settings**.
- **Hero banner** (`.hero`, bg `--green-800`, color `--green-100`, padding 28px 48px):
  - Eyebrow: date, uppercase, `--text-2xs`, weight 600, color `--green-300`.
  - Greeting (`.hero__greet`): `--font-display`, **40px**, weight 500, tracking -.02em,
    color `--sand-50`. e.g. "Good morning, Ben".
  - Sub-line: `--text-lg`, color `--green-200`.
  - Right cluster: a **live focus pill** ("2h 41m focused today" — `--surface-raised` bg,
    `--border-brand`, sage dot) and a **New log** button (same pill styling, notebook icon).
- **Today card** (`.card--lg`, bg `--surface-card`, border `--border-default`, radius
  `--radius-xl`, shadow `--shadow-sm`), max-width **920px**, centered, padding 30px 48px:
  - Card head: "Today" (`--font-display`, `--text-2xl`, weight 500) + "1 of 4 done" count in
    `--font-data`.
  - **Task rows** (`.task`, separated by `--border-subtle` hairlines):
    - Left: a **21px checkbox** (radius 7px, border `--sand-400`; done state = filled `--green-500`
      with a 13px check in `--sand-50`) + task title (`--text-md`, line-height 1.45). Done titles:
      color `--text-faint`, strikethrough.
    - Right meta (column, right-aligned): optional tag pill (e.g. "Deep work", "Goal" — bg
      `--surface-brand-soft`, color `--text-brand`, `--text-2xs` weight 600) + optional due time
      (clock icon + `--font-data` `--text-xs`), then a **Steps** disclosure button.
  - **Steps disclosure** (`.stepsbtn` → `.steps`): clicking toggles `aria-expanded` and a
    `max-height` transition (0 → 460px, .28s ease) revealing the sub-steps.
    - Lead line: "Broken into 20-minute steps, easiest first." with a sparkles icon.
    - **Sub-steps** (`.substep`): 18px checkbox + text (`--text-sm`) + duration (`~10 min`,
      `--font-data` `--text-2xs`). The **next** step is highlighted (`.substep--next`: bg
      `--surface-brand-soft`, radius `--radius-md`) and carries a **Start** button (filled `--brand`,
      `--sand-50` text, play icon).
  - **Add row** (`.addrow`): dashed-border "Add a task" affordance with a plus icon.
- **Two tiles below** (`.cards`, 2-col grid, 18px gap):
  - **This session** (`.tile--green`, bg `--green-800`): label, big number "2h 41m"
    (`--font-data`, 34px, weight 600, color `--white`), "productive" sub-label, and a 9px
    **stat bar** split productive/unproductive/not-sure (`#6e9b7c` / `--clay-500` / `--ochre-500`).
  - **Toward a break** (`.tile--paper`): an SVG progress **ring** (track `#e1d7c1`, fill `#3c704f`,
    6px stroke, rounded cap) + "38/50 min focused — keep going".

**Interactions:** Steps button toggles the sub-step panel (height transition). Checkboxes are
visual in the prototype — wire real toggle + persistence. "Start" on a step begins a focus session.

---

### 2. Current Session  *(source: `interactive-flows/` — `Session.jsx`)*
A focus-session summary: a big productive-minutes stat, a 3-up stat grid
(productive / unproductive / not-sure, from `data.js → session`), and a 7-day **Trends** bar chart
(`data.js → week`, stacked by the three classifications). The "Productivity Trends" nav item reuses
this view. Chart styles live in `interactive-flows/kit.css` (`.mm-chart*`, `.mm-statgrid*`).

### 3. Risk Factors  *(source: `interactive-flows/` — `RiskFactors.jsx`)*
A grid of selectable factor cards (`data.js → riskFactors`: Sleep, Water, Food, Medication,
Exercise, Social connection, Going outside, Fun activities, Sense of accomplishment). Selecting one
can open a procrastination log seeded with that factor. Card styles: `.mm-risk*` in `kit.css`.

### 4. Procrastination Log (CBT flow)  *(source: `interactive-flows/` — `ProcrastinationLog.jsx`)*
A full-screen, multi-step reflective flow (a record, "not a report card"). Steps walk through what
happened, the emotion, the cognitive distortion (`data.js → distortions` — the 10 classic CBT
distortions), and a reframe, with a stepper and a focus timer. Full-screen overlay styles:
`.mm-log*`, `.mm-timer*`, `.mm-fields*` in `kit.css`. The **logs list** (`data.js → logs`) is
rendered inline in `interactive-flows/index.html` (`LogsList`).

### 5. "Feeling distracted?" nudge  *(source: `interactive-flows/index.html` — `App`)*
A `Dialog` triggered from the sidebar's "Feeling distracted?" item (and conceptually from a
distraction detection). Copy: "You've been on YouTube for a couple of minutes. Let's take a look —
no pressure." Two stacked actions: **Try a procrastination log** (primary) and **View risk
factors** (secondary).

---

### 6. Splash / Loading screen  *(source: `brand/splash.html`)*
1100×700 reference. Forest gradient field (green-750 → green-900) with a soft radial vignette,
the heading "Finding your footing", and a **2-second snowball loader** (uses
`assets/snowball-new-w.png`). Use for app cold-start. Honor `prefers-reduced-motion`.

### 7. Windows App Icon  *(source: `brand/app-icon.html`, `assets/`)*
The chosen desktop tile: **green-600 → green-800 gradient with the Momentum mark in soft paper**.
- `assets/momentum-windows-app-icon.png` — the primary deliverable tile.
- `assets/momentum-app-icon-forest.png` — forest/splash colorway.
- `assets/momentum-app-icon-mixed.png` — alternate colorway.
- `assets/momentum-mark.svg` — the vector mark (for in-app use / favicons).
Generate the required Windows `.ico` sizes (16/32/48/256) from these.

---

## Interactions & Behavior
- **Task → steps:** disclosure toggle, `max-height` transition 0→460px, **280ms** ease
  (`cubic-bezier(0.22,0.61,0.36,1)`), with `aria-expanded` on the trigger.
- **Checkboxes:** toggle complete; completed tasks get strikethrough + faint color. Persist state.
- **Start step:** initiates a focus session / timer.
- **Distraction nudge:** modal dialog; primary opens a procrastination log, secondary routes to
  risk factors.
- **Procrastination log:** linear stepper, full-screen overlay, fade-in (`--duration-base`),
  includes a running timer.
- **Live pill / session stats:** the sage status dot has a 2s pulse (`@keyframes mm-livepulse` in
  `kit.css`); disable under `prefers-reduced-motion`.
- **Splash loader:** ~2s snowball animation, then transition into the app.
- **Motion:** all easing/duration from the motion tokens below. Gentle, no bounce.

## State Management
- `tasks[]`: id, title, optional tag/category, optional due time, `completed`, and `steps[]`
  (each step: text, ~duration, `done`, and which is "next").
- `session`: productive / unproductive / not-sure minutes (live for current session).
- `week[]`: 7 days × the three classification minute totals (Trends).
- `riskFactors[]`: selectable; selection can seed a new log.
- `logs[]`: saved procrastination logs (timestamp, source, emotion).
- UI: active sidebar view, nudge-dialog open, procrastination-log open + its seed factor + step
  index + timer.
- `distortions[]`: static list of the 10 CBT distortions for the log flow.
The mock shapes are in `interactive-flows/data.js` — use them as the data contract.

---

## Design Tokens
All tokens live in `tokens/` (and are aggregated by `styles.css`). Wire these into the app theme.

### Color — brand greens
`--green-900 #234032` · `--green-800 #2e573e` · `--green-750 #356046` · `--green-700 #3c704f`
(**PRIMARY**) · `--green-600 #4a8260` · `--green-500 #6e9b7c` · `--green-400 #8bb098` ·
`--green-300 #a9c4af` · `--green-200 #cfe0d2` · `--green-100 #e6efe5` · `--green-50 #f0f5ee`

### Color — warm paper / neutrals
`--sand-900 #2a2620` (ink) · `--sand-800 #3c372f` · `--sand-700 #544d41` · `--sand-600 #6b6357`
(muted text) · `--sand-500 #8a8174` · `--sand-400 #b3a994` · `--sand-300 #d8cdb6` ·
`--sand-250 #e1d7c1` (default border) · `--sand-200 #ebe2cf` · `--sand-150 #f0e8d6` ·
`--sand-100 #f7f1e3` (card) · `--sand-50 #faf6ec` · `--paper #f2ebda` (**app bg**) ·
`--white #fdfbf6`

### Color — semantic status
Productive (forest): `#3c704f / #5a9070 / #e3eee2`. Unproductive (clay):
`#a8472f / #c2603f / #f3e1d6`. Not-sure (ochre): `#9a7430 / #c0954c / #f1e6cf`.
Info (teal-blue): `#4a7a8c / #dde9ec`. Focus ring color: `#4a8260`.

**Key semantic aliases:** `--surface-app`=paper, `--surface-card`=sand-100,
`--surface-raised`=sand-50, `--surface-brand-soft`=green-100, `--text-strong`=sand-900,
`--text-body`=sand-800, `--text-muted`=sand-600, `--text-brand`=green-700, `--brand`=green-700,
`--border-default`=sand-250, `--border-brand`=green-500.

### Typography
- **Display / brand:** Newsreader (serif) — titles, the wordmark, editorial quotes.
- **UI / body:** Hanken Grotesk (sans) — buttons, labels, body. Default body 15px.
- **Data:** JetBrains Mono — timers, %, timestamps, counts.
- Loaded from Google Fonts (see `tokens/fonts.css`). **Note:** these are Google-Fonts substitutes;
  no licensed brand fonts shipped — confirm with the design team before launch.
- Scale (px): 2xs 11 · xs 12 · sm 13 · base 15 · md 17 · lg 20 · 2xl 30 · 3xl 38 · 4xl 48 · 5xl 60.
- Weights: 400 / 500 / 600 / 700. Tracking: tight -.02em, snug -.01em, label .08em (uppercase eyebrows).

### Spacing (4px base)
0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 128. Sidebar width token `--sidebar-width` 248px
(the approved home screen uses **264px** — match the home-screen file). Content max 920px.

### Radius
xs 6 · sm 9 · md 12 (inputs) · lg 16 (cards/buttons) · xl 22 (panels) · 2xl 28 (modals) · pill 999.

### Shadow (warm, brown-tinted, low/diffuse)
`--shadow-xs/sm/md/lg/xl` + `--shadow-inset` + focus ring `0 0 0 3px rgba(74,130,96,.28)`.
Cards use `--shadow-sm`.

### Motion
Ease-out `cubic-bezier(0.22,0.61,0.36,1)` · ease-in-out `cubic-bezier(0.45,0.05,0.55,0.95)`.
Durations: fast 120ms · base 200ms · slow 320ms. No bounce.

---

## Assets
- `assets/momentum-mark.svg` — the Momentum mark (sidebar brand, favicon, in-app).
- `assets/momentum-windows-app-icon.png` — **primary Windows app tile** (green gradient + paper mark).
- `assets/momentum-app-icon-forest.png` / `assets/momentum-app-icon-mixed.png` — alternate colorways.
- `assets/snowball-new-w.png` — the splash loader graphic.
- Icons throughout are [Lucide](https://lucide.dev). Names used: `list-checks, calendar-days,
  activity, bar-chart-3, notebook-pen, heart-pulse, wind, settings, clock, list-tree, chevron-down,
  sparkles, play, plus, check, chevron-right`. Use the codebase's icon library (Lucide if available).

---

## Files in this bundle
```
design_system/
├─ README.md                      ← you are here
├─ styles.css                     ← aggregates all tokens (single import)
├─ _ds_bundle.js                  ← compiled design-system components (used by interactive-flows)
├─ tokens/                        ← colors, typography, spacing, fonts, base (source of token values)
├─ assets/                        ← mark, app-icon PNGs, splash loader graphic
├─ home-screen/
│   └─ index.html                 ← ★ SOURCE OF TRUTH: Daily Tasks home + sidebar (plain HTML/CSS/JS)
├─ interactive-flows/             ← ★ SOURCE OF TRUTH: session, trends, risk factors, CBT log, nudge
│   ├─ index.html                 ←   app shell wiring the flows (React + Babel)
│   ├─ DailyTasks.jsx             ←   (older home layout — superseded by home-screen/; reference only)
│   ├─ Session.jsx                ←   current session + trends chart
│   ├─ RiskFactors.jsx            ←   risk-factor grid
│   ├─ ProcrastinationLog.jsx     ←   full-screen CBT log flow
│   ├─ data.js                    ←   mock data = the data contract
│   ├─ kit.css                    ←   screen-layout styles for the flows
│   └─ ds-base.js                 ←   loads styles.css + _ds_bundle.js (preview helper)
└─ brand/
    ├─ splash.html                ← splash / loading screen
    └─ app-icon.html              ← app-icon spec card (colorways + sizes)
```

Open any `.html` directly in a browser to preview it. The home screen is self-contained; the
interactive flows load the design-system bundle via `ds-base.js`. **Treat all of it as design
intent to recreate in the real codebase, not as code to ship.**
