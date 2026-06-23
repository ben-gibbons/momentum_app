# ADR-001: Desktop Framework — Electron

**Status:** Accepted  
**Date:** 2026-05-19  
**Author:** Ben (PM)  
**Informed by:** Architecture tradeoff analysis (`docs/architecture-framework-tradeoff.md`)

---

## Context

Momentum is a Windows-first desktop productivity app requiring:
- A persistent system tray process running a 10-second monitoring loop
- A UI layer capable of reaching premium, consumer-grade quality in V4+
- Local SQLite storage with no cloud dependency in V1–V3
- A V4 LLM integration (Claude API or equivalent) for adaptive interventions and intelligent task management
- A future Mac port (not in V1–V3, but must not be architecturally blocked)

The primary implementer is Claude Code (AI-driven). A framework decision was required before scaffolding begins.

Five frameworks were evaluated: Electron, Tauri, Qt (C++), PySide6, and Flutter. Full analysis is in `docs/architecture-framework-tradeoff.md`.

---

## Decision

**Electron** (Node.js + TypeScript + React) is the chosen framework for Momentum.

---

## Rationale

### UI quality is a retention mechanism, not a cosmetic concern

Momentum's target user is prone to distraction. If the app itself is visually dull, dated, or effortful to use, it loses the trust of the exact user it's trying to help. Premium UI — achieved through the web design stack (React, Tailwind CSS, Framer Motion, direct Figma handoff) — is a product requirement, not a V4 nice-to-have. Electron provides the only path to that UI ceiling without switching frameworks.

### Consistent rendering across Windows and Mac

Electron bundles Chromium, which means both Windows and Mac users get the same rendering engine and the same UI behavior. This eliminates the cross-platform rendering inconsistency that affects Tauri (WebView2/Chromium on Windows, WebKit/Safari on Mac) — a known, actively complained-about problem in the Tauri community that creates CSS and JS behavioral differences between platforms.

### V4 LLM integration is first-class

The official Anthropic and OpenAI JavaScript SDKs are available and well-maintained. Streaming responses work natively via the Fetch API. No architectural changes or threading complexity is needed when V4 LLM features are added. Claude Code handles this pattern with high reliability.

### Claude Code reliability

TypeScript + React + Node.js is the stack most deeply represented in Claude's training data. Error messages are readable, stack traces are clear, the npm ecosystem has mature packages for every Momentum feature. This is the lowest-risk build environment for a PM-led, AI-driven development process.

### Monitoring layer is unblocked

The original concern about Node.js not exposing `IsIconic` (minimized window state) was a limitation of the `get-windows` package, not Node.js itself. The `koffi` FFI library resolves this with direct Windows API calls.

Edge URL reading uses a Python sidecar (`pywinauto`) running as a persistent subprocess. Window title alone was insufficient — it returns the page title, not the URL, making productive/unproductive classification ambiguous. The sidecar polls the Edge address bar via UI Automation every 10 seconds (with a 5s initial offset to sample at the midpoint of each Node.js poll interval) and emits JSON lines `{handle, url}` to Node.js via stdout.

---

## Trade-offs Accepted

**Performance overhead:** Electron ships a bundled Chromium instance (~150MB bundle, 200–400MB RAM at runtime). For an always-on background monitoring app, this is a real cost. It is accepted because:
- The target user base is knowledge workers on modern hardware where this overhead is tolerable
- The Chromium baseline is a fixed cost that does not scale with polling frequency or LLM call volume
- Mitigation: keep the monitoring loop lean (no writes on every poll; app-switch + 60–120s flush only)

**Migration path if performance proves problematic:** Electron → Tauri is a well-documented path. The React/CSS frontend is 100% portable. Only the Node.js backend migrates to Rust. This migration is accepted as a future option with the explicit caveat that Tauri's Mac rendering uses WebKit, not Chromium — cross-platform UI inconsistencies will appear and must be budgeted for.

---

## Alternatives Rejected

**Tauri:** Best-in-class performance and bundle size, identical web frontend to Electron. Rejected because: (1) Rust backend is the highest-risk debugging environment for a Claude Code-driven build; (2) Tauri's Mac rendering engine is WebKit, not Chromium — a known source of cross-platform UI inconsistencies that conflict with a premium UI goal.

**PySide6:** Fastest V1–V3 build speed, most reliable Claude Code execution, POC code reused directly, no IPC. Rejected because: UI quality is a core product requirement, and Qt's design pipeline (Figma → QML) is materially more indirect than the web stack. For a distraction-prone user base, the app must look good enough to earn repeated attention — PySide6's UI ceiling is achievable but requires significantly more design engineering effort per screen.

**Qt (C++):** Best raw performance. Rejected because: V4 LLM integration has no official SDK; performance advantage is irrelevant at 10-second polling intervals for a task list and bar chart UI; highest Claude Code debugging risk of all five options.

**Flutter:** Consistent, beautiful UI; strongest mobile expansion story. Rejected because: Windows API monitoring requires C++ platform channels (reintroducing multi-language complexity); platform channel latency at 1–10s polling frequency causes timing drift; no official Dart LLM SDK for V4.

---

## Consequences

- Full app scaffold begins in Electron/Node.js/TypeScript/React
- `koffi` handles `IsIconic` natively in Node.js; Python sidecar (`pywinauto`) handles Edge URL reading via UI Automation
- Design system and component library decisions (Tailwind, shadcn/ui, etc.) are made before V3 UI work begins
- Monitoring performance is reviewed at end of V1 to assess whether Chromium overhead is user-facing; this is the trigger condition for a Tauri migration evaluation
- V4 LLM architecture is planned in Node.js using the official Anthropic JS SDK

---

*Next decision: Scaffold structure and component library (pre-V1 build)*  
*Related docs: `CLAUDE.md`, `docs/architecture-framework-tradeoff.md`*
