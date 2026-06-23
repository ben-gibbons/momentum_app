# Momentum — Desktop Framework Tradeoff Analysis

**Author:** Ben (PM) via Claude Cowork  
**Date:** 2026-05-19  
**Status:** Draft — Pending Architecture Decision  
**Context:** POC phase complete. Full app build has not started. This document informs the framework selection decision before scaffolding begins.

---

## Background & Corrected Assumptions

The original POC framing overstated Python's uniqueness for monitoring. Two assumptions have since been revised:

1. **"Monitoring is only doable in Python"** — False. The actual limitation was that the `get-windows` npm package doesn't expose `IsIconic` (minimized window state). Node.js can call `IsIconic` directly via the `koffi` FFI library without any PowerShell roundtrip. Python does this more natively, but Node.js is fully capable.

2. **"Edge URL reading via pywinauto is essential"** — Confirmed. Window title alone returns the page title, not the URL, making classification ambiguous in practice. A Python sidecar (`pywinauto`) is included in V1: it runs as a persistent subprocess, polls the Edge address bar via UI Automation every 10 seconds (5s initial offset to sample at the midpoint of each Node.js poll), and emits JSON lines `{handle, url}` to Node.js via stdout.

The first correction means the monitoring layer is unblocked in Node.js. The second confirms the Python sidecar is required in V1. The decision should be made on actual trade-offs, not POC workarounds.

---

## Momentum Feature Set (Evaluation Basis)

All frameworks are evaluated against the full intended feature set:

- **System tray** — persistent background presence, icon, right-click menu
- **Background monitoring loop** — active window polling targeting 10s intervals; exact cadence (range: 1–10s) to be tuned in V1 based on feel and battery impact
- **Windows notifications** — native OS toasts for distraction alerts
- **"Feeling Distracted?" popup** — modal intervention window with CBT prompts; V4 target: LLM-generated, contextually aware responses
- **Daily/Weekly Task UI** — task entry, check-off, progress view; V4 target: LLM-powered automated task population and breakdown
- **Productivity Trends** — 7-day bar chart, session history
- **Local data storage** — SQLite, no cloud dependency in V1–V3
- **LLM API integration (V4)** — Claude API or equivalent to power adaptive interventions and intelligent task management; requires async API calls, streaming response handling, and secure key storage
- **Installer/distribution** — Windows direct download now; Mac direct download later

---

## Scorecard Summary

| Dimension | Electron | Tauri | Qt (C++) | PySide6 | Flutter |
|---|---|---|---|---|---|
| Windows OS performance | ⚠️ Poor | ✅ Excellent | ✅ Excellent | ✅ Good | ✅ Good |
| Claude Code reliability | ✅ Excellent | ⚠️ Mixed | ❌ Risky | ✅ Excellent | ✅ Good |
| V1–V3 build speed | ✅ Fast | ⚠️ Moderate | ❌ Slow | ✅ Fast | ⚠️ Moderate |
| Mac OS scaling | ✅ Native | ✅ Native | ✅ Good | ✅ Good | ✅ Native |
| Premium UI ceiling | ✅ Excellent | ✅ Excellent | ⚠️ Harder | ⚠️ Harder | ✅ Excellent |
| Windows API / monitoring | ✅ Via koffi | ✅ Via windows-rs | ✅ Native | ✅ Native | ❌ Needs C++ channel |
| High-freq polling (1–10s) | ✅ Async loop | ✅ Tokio runtime | ✅ Native | ⚠️ GIL threading | ⚠️ Channel latency |
| LLM API integration (V4) | ✅ Official JS SDK | ✅ Official JS SDK | ❌ No SDK | ✅ Official Python SDK | ⚠️ No official SDK |
| Bundle size | ❌ ~150MB | ✅ ~10MB | ✅ ~30MB | ⚠️ ~70MB | ✅ ~25MB |
| Design handoff (Figma→UI) | ✅ Direct | ✅ Direct | ❌ Manual | ⚠️ Indirect | ⚠️ Indirect |

---

## Framework-by-Framework Analysis

---

### 1. Electron
**Language stack:** Node.js (TypeScript) + HTML/CSS/JS frontend  
**Rendering:** Bundled Chromium (~150MB)

#### Windows OS Performance
The most significant liability. Electron ships a full Chromium browser instance with every app. For Momentum — a background monitoring app that runs continuously — this means 200–400MB RAM at idle and meaningful CPU overhead from Chromium's process model. On lower-spec machines, users will notice. This is the single biggest reason to look elsewhere for a *system tray + always-on* app category.

At the target polling cadence of 10 seconds (and down to 1 second if tuning demands it), Node.js handles the async monitoring loop cleanly — `setInterval` with async Windows API calls doesn't block the main thread. The polling frequency itself is not a concern for Electron. The issue is the fixed Chromium baseline overhead that exists regardless of polling rate, compounding with any additional CPU draw from frequent API calls in V4.

#### Claude Code Reliability
Electron's strongest suit from an implementation standpoint. TypeScript + React + HTML/CSS is the most well-represented stack in Claude's training data. Claude Code generates correct, debuggable Electron/Node.js code reliably. When something breaks, error messages are clear and stack traces are readable. The lowest-risk framework for a PM-led, AI-driven build.

#### V1–V3 Build Speed
Fast. The npm ecosystem has mature packages for every Momentum feature: `electron-tray`, `node-notifier`, `better-sqlite3`, `recharts` for trends charts, `electron-builder` for packaging. No reinventing wheels. The monitoring loop uses `get-windows` + `koffi` for `IsIconic` — a minor addition to the original plan, not a blocker.

#### Mac OS Scaling
First-class. The same Electron codebase runs on Mac without architectural changes. `get-windows` returns actual URLs on Mac, which means URL-based classification becomes available on Mac automatically — a meaningful improvement over the title-parsing approach needed on Windows.

#### Premium UI Ceiling
Excellent. The entire web design ecosystem applies: Tailwind CSS, Framer Motion, any React component library. Figma → CSS/React handoff is direct. Apps like Notion, Linear, Figma itself, and VS Code are Electron apps. The premium UI ceiling is effectively the same as building a web product.

#### Momentum-Specific Concerns
- Always-on background app + Chromium = real battery and memory cost that users will feel
- Bundle size (~150MB) is a perception issue for a productivity utility
- Strong choice *only* if web UI investment is a deliberate long-term strategy (e.g., plan to ship a companion web app, share component library, hire web developers)
- **V4 LLM integration:** Excellent. The official Anthropic JS SDK and OpenAI SDK are available, streaming responses work natively via the Fetch API, and Claude Code handles this pattern extremely well. No architectural changes needed for V4 — LLM calls slot directly into the existing Node.js process.

---

### 2. Tauri
**Language stack:** Rust (backend) + HTML/CSS/JS frontend  
**Rendering:** System WebView (Edge/WebView2 on Windows, WebKit on Mac)

#### Windows OS Performance
Excellent. By using the system's built-in WebView2 (Edge's rendering engine, already installed on Windows 10/11), Tauri adds ~5–15MB to the app and avoids bundling Chromium entirely. Memory overhead is dramatically lower than Electron — typically 30–80MB at runtime. For an always-on background monitoring app, this is a meaningful quality-of-life difference.

High-frequency polling is a genuine Tauri strength. Rust's Tokio async runtime handles timer intervals down to 1 second with negligible overhead — a Tokio interval firing every second alongside Windows API calls introduces no meaningful CPU cost. If polling is tuned toward the aggressive end (1–3s), Tauri absorbs that load better than any other option on this list except Qt C++.

#### Claude Code Reliability
Split verdict. The frontend (HTML/CSS/JS/React) is identical to Electron — Claude Code handles it excellently. The backend is Rust, which is where risk concentrates. Rust's borrow checker produces compilation errors with novel patterns that can be difficult to resolve iteratively. Claude Code can write correct Rust, but debugging cycles when something breaks are longer and less predictable than with Python or TypeScript. For a PM reviewing Claude's output without deep Rust knowledge, a subtle borrow or lifetime error is hard to catch.

#### V1–V3 Build Speed
Moderate. Frontend development is fast (same speed as Electron). The Rust backend slows things down — the `windows-rs` crate gives full access to Windows APIs including `IsIconic`, `GetAncestor`, and `WindowFromPoint`, but the syntax is verbose and the compile-check-fix loop is slower than Python or Node. Tauri's command system (Rust functions exposed to the JS frontend) adds a layer of wiring that Electron doesn't have.

#### Mac OS Scaling
Excellent. Tauri v2 is explicitly cross-platform. The Rust backend compiles to Mac, and the JS frontend is identical. A well-structured Tauri app requires minimal platform-specific branching.

#### Premium UI Ceiling
Identical to Electron — the full web design stack applies. Figma → React/CSS handoff is direct. The UI story is exactly as strong as Electron's.

#### Momentum-Specific Concerns
- Best performance story of the web-tech options by a wide margin
- Rust risk is real for a PM-led AI build — the most likely source of debugging pain
- WebView2 dependency: Windows 10/11 ships WebView2 by default since 2021, but very old machines may need a runtime install. Not a concern for a modern productivity audience.
- Ideal choice if: the performance gap vs. Electron matters, and the team is willing to absorb Rust debugging complexity
- **V4 LLM integration:** Strong. The official Anthropic and OpenAI JS SDKs are available in the web frontend — the same as Electron. Tauri commands can optionally proxy API calls through the Rust backend if secure key handling is a priority (keeping the API key out of the renderer process entirely). Streaming responses work natively via the frontend Fetch API.

---

### 3. Qt (C++)
**Language stack:** C++ + QML (Qt Quick) for UI  
**Rendering:** Qt's own rendering pipeline (not a browser)

#### Windows OS Performance
Excellent — the best of all five options. Native compiled code, no runtime overhead, Qt's rendering engine is highly optimized. Memory footprint at idle is the lowest of any option (~30–60MB). For power users or IT-managed environments, this is the most defensible technical choice.

#### Claude Code Reliability
The highest-risk framework for a Claude Code-driven build. C++ is prone to memory errors (segfaults, use-after-free), and Qt adds its own complexity layer: the Meta-Object Compiler (MOC), signals and slots, parent-child memory management, and QML/C++ boundary wiring. Claude Code can generate Qt C++ code, but the debugging surface when something goes wrong is the largest of any option. Compilation errors in Qt C++ are verbose and often cryptic. For a PM reviewing Claude's output, C++ errors are the hardest to interpret.

#### V1–V3 Build Speed
Slow. Qt is a powerful, mature framework, but it is not a fast-to-build framework for a solo product iteration cycle. Every feature requires more boilerplate than Python or JS equivalents. The toolchain setup (CMake + Qt Creator + MOC) adds friction before a single line of product code is written. The trade-off is raw performance — but Momentum's monitoring loop doesn't need microsecond latency.

#### Mac OS Scaling
Good. Qt is cross-platform by design and runs on Windows, Mac, and Linux. Platform-specific behaviors (macOS menu bar, Dock integration) require extra handling but are well-documented.

#### Premium UI Ceiling
Achievable but harder to get there. Qt Quick (QML) enables genuinely beautiful, fluid UIs — commercial examples include Maya, VirtualBox, and many embedded/automotive interfaces. However, the design pipeline is indirect: Figma designs must be manually translated to QML rather than directly to CSS. The web design ecosystem (Tailwind, component libraries, animations) doesn't apply. Getting to "Linear-quality" UI requires more effort per pixel than web-tech options.

#### Momentum-Specific Concerns
- Performance justification doesn't hold up: Momentum's monitoring loop targets 10-second intervals (range under evaluation: 1–10s), and even at 1-second polling the UI remains a task list and a bar chart. PySide6 and Tauri both handle that load without C++ complexity. QTimer handles 1-second polling trivially, but that capability is also available in every other framework.
- Recommended only if Momentum ever needs to be distributed as a system utility with extreme resource constraints (e.g., enterprise IT environments with strict RAM policies)
- **V4 LLM integration:** The most significant weakness. No official C++ SDK exists for Claude, OpenAI, or any major LLM provider. Integration requires manual HTTP implementation via Qt Network (or libcurl), manual JSON parsing, and custom Server-Sent Events handling for streaming. Claude Code can produce this, but the effort is substantially higher than in Python or JS, and the result is harder to maintain. V4 complexity alone is a meaningful reason to rule out Qt C++.

---

### 4. PySide6
**Language stack:** Python + Qt (PySide6) + optional QML for premium UI  
**Rendering:** Qt's rendering pipeline

#### Windows OS Performance
Good. Qt handles the rendering efficiently. Python's overhead is real — startup and memory usage (~80–150MB) sit between Electron and Tauri — but it is not a practical concern for Momentum's use case. The monitoring loop is I/O-bound (window polling, title reading, SQLite writes), not CPU-bound.

The updated polling target (10s, range 1–10s) introduces a threading consideration worth designing for upfront. Python's GIL (Global Interpreter Lock) means only one thread executes Python bytecode at a time. At 1-second intervals, the monitoring thread and Qt's UI thread compete for the GIL. In practice, this is manageable: window polling is I/O-bound and Windows API calls release the GIL during execution, so true parallelism exists where it's needed. The correct architecture is a `QThread` running the monitoring loop entirely off the main thread, with signals carrying results back to the UI. At 10-second intervals this is a non-issue; at 1-second, it needs to be designed in from the start rather than added later. This is a solvable pattern, but it adds an architectural wrinkle that Node.js and Rust do not have.

#### Claude Code Reliability
Excellent — tied with Electron for the strongest rating. Python is the language where Claude Code is most reliable and most fluent. PySide6 is well-represented in Claude's training data. Errors produce clear stack traces. Debugging is fast: no compilation step, no type system to fight, no memory management to reason about. For a PM who will review Claude's output, Python errors are the most interpretable.

#### V1–V3 Build Speed
Fast. The POC code is directly reusable — no port, no sidecar, no IPC layer. System tray (`QSystemTrayIcon`), native notifications (`QSystemTrayIcon.showMessage` or `plyer`), popup windows (`QDialog`), SQLite (built-in `sqlite3` module), and charts (`PyQtGraph`, `matplotlib`, or Qt Charts) are all available with minimal wiring. Development iteration is fast.

#### Mac OS Scaling
Good. PySide6 is cross-platform via Qt. The same Python codebase runs on Mac with minor adaptations (macOS menu bar behavior, `NSApplicationActivateIgnoringOtherApps`). The monitoring layer needs a Mac equivalent for window detection, but `get-windows` (via Python's `subprocess`) or the `AppKit` framework covers this natively.

#### Premium UI Ceiling
This is PySide6's most significant long-term limitation relative to the web-tech options. Qt Widgets (the default) look dated without heavy custom styling via Qt Style Sheets (QSS). Qt Quick (QML) can produce beautiful, fluid UIs, but QML is a distinct language from Python and the Figma → QML handoff is indirect. Getting to Notion/Linear-quality UI is achievable in QML, but requires more design engineering effort per screen than HTML/CSS equivalents. The gap closes significantly with skilled QML work, but it is a real gap for V4+.

#### Momentum-Specific Concerns
- The cleanest architecture for V1–V3: one language, one process, zero IPC
- The POC Python monitoring code is reused directly — zero throwaway work
- Packaging (PyInstaller/Nuitka) produces Windows installers; Nuitka's compiled output improves both performance and packaging quality
- The premium UI limitation is a V4+ concern, not a V1–V3 blocker
- The GIL threading pattern for 1-second polling must be designed in from V1 — it is not a retrofit
- Best choice if the goal is to ship a working, polished-enough V1–V3 with the lowest risk
- **V4 LLM integration:** Strong. The official Anthropic Python SDK is among the best in any language — well-documented, actively maintained, and deeply familiar to Claude Code. Streaming responses are supported natively. The key architectural requirement: LLM API calls must run off the main Qt thread (via `QThread` or `asyncio` with `qasync`) to prevent streaming responses from blocking the UI. This is the same threading pattern needed for high-frequency polling, so both concerns are solved by the same architecture decision.

---

### 5. Flutter Desktop
**Language stack:** Dart + Flutter widget framework  
**Rendering:** Flutter's own Impeller/Skia rendering engine

#### Windows OS Performance
Good. Flutter uses its own rendering pipeline (not a browser, not system widgets), achieving consistent 60/120fps animations. Memory usage (~100–200MB) is comparable to PySide6. Startup time is fast.

However, the polling frequency target exposes a structural weakness. Every monitoring poll must cross the Dart/C++ platform channel boundary — Dart calls into C++, C++ calls the Windows API, and the result is serialized back to Dart. At 10-second intervals this overhead is invisible. At 1–3 second intervals, under concurrent UI activity, the channel serialization latency can cause poll timing drift and occasional UI jank. This is not a theoretical concern; it is a documented Flutter platform channel characteristic at high invocation frequency. The monitoring loop is the one place Momentum cannot afford to be sloppy, and Flutter's architecture puts that layer in the most constrained position of all five frameworks.

#### Claude Code Reliability
Good, with a caveat. Claude Code handles Dart and Flutter competently — the widget model is well-represented in training data and Claude generates correct Flutter UI code reliably. The caveat is platform channel integration: when Flutter needs to call Windows APIs, it requires a C++ platform channel plugin written alongside the Dart code. Claude can write this, but debugging issues that span the Dart/C++ boundary is materially harder than debugging single-language issues.

#### V1–V3 Build Speed
Moderate. Flutter's widget model is productive once understood — everything-is-a-widget is a consistent mental model and UI code composes cleanly. Community packages exist for most needs (`tray_manager` for system tray, `local_notifications`, `sqflite` for SQLite). The slow-down comes from platform channel work needed for Windows monitoring (window enumeration, `IsIconic`, etc.), which reintroduces multi-language complexity.

#### Mac OS Scaling
Excellent — Flutter's explicit design goal is a single codebase across Windows, Mac, Linux, iOS, and Android. The UI code is 100% portable. This is Flutter's strongest differentiator if multi-platform reach is the long-term goal.

#### Premium UI Ceiling
Flutter's strongest suit. The Impeller rendering engine produces pixel-perfect, smooth animations by default. Material 3 provides a solid design system out of the box, and Flutter supports fully custom design systems. Prominent Flutter desktop apps (including some internal Google tools) demonstrate genuine premium quality. The design pipeline (Figma → Dart) is more manual than Figma → CSS, but the output quality ceiling is high.

#### Momentum-Specific Concerns
- The monitoring layer is the critical weakness: Dart cannot call Windows APIs directly. Window enumeration and `IsIconic` require a C++ method channel — reintroducing the multi-language complexity the team was trying to avoid
- Platform channel latency at 1–3s polling frequency can cause timing drift and UI jank
- Strongest long-term choice if Momentum ever expands to iOS/Android (e.g., a companion mobile app for goal setting or trend review)
- Weaker choice for a Windows-first, system-monitoring app where the monitoring layer is architecturally central
- **V4 LLM integration:** A meaningful gap. No official Anthropic or OpenAI Dart SDK exists. Integration requires either manual HTTP + Server-Sent Events implementation or reliance on community-maintained packages with variable quality and maintenance. Claude Code can produce this, but it is materially more effort than Python or JS, and the streaming implementation in particular is non-trivial in Dart. Flutter is the weakest of the five options for V4 LLM work.

---

## Migration Path Notes

These notes address the question: *"Start simple, migrate later — how hard is that?"*

### Path A: PySide6 → Qt C++ (if performance becomes a requirement)
**Difficulty: Medium**  
Qt is Qt — the UI layer (QML) is shared between PySide6 and Qt C++. Widgets written in Python + PySide6 map closely to their C++ equivalents. A migration would involve rewriting Python logic in C++ (business logic, monitoring, SQLite) while keeping QML UI files largely intact. This is a significant effort but a structured one. The migration is made easier by keeping business logic cleanly separated from UI from the start.

### Path B: Electron → Tauri (if bundle size / performance becomes unacceptable)
**Difficulty: Medium-Low (for the UI), High (for the backend)**  
This is a well-trodden migration path in the industry. The frontend code (HTML, CSS, React components) is 100% portable — zero rewrite. The backend logic migrates from Node.js/TypeScript to Rust, which is a meaningful effort but scoped only to the backend. Teams report this migration as painful but tractable over 2–4 weeks for a small app. The key risk: any complex Node.js business logic becomes a Rust rewrite, not a port.

### Path C: PySide6 → Flutter (if premium UI becomes a hard requirement and you want cross-platform)
**Difficulty: High**  
Not recommended as a migration path. Python and Dart are unrelated languages with different paradigms. Qt's widget model and Flutter's widget model are architecturally different. The monitoring layer would need to be rewritten as a C++ Flutter platform channel plugin. This is effectively a full rewrite rather than a migration. If Flutter is the long-term destination, starting in Flutter is materially less expensive than migrating.

### Path D: PySide6 → Tauri (if web UI becomes a priority)
**Difficulty: High**  
Switching from Python + Qt to Rust + web tech involves rewriting both the backend (Python → Rust) and the UI (QML/Widgets → HTML/CSS). The only preserved asset is the SQLite schema and business logic (portable as documentation, not code). Again, this is closer to a rebuild than a migration.

### Path E: Electron → Flutter (if mobile companion becomes a goal)
**Difficulty: Very High**  
These frameworks share no code. Not a recommended migration path; architect for Flutter from day one if mobile is a genuine goal.

---

## Strategic Recommendation

Given the full picture — Claude Code as the primary implementer, polling at 10s (potentially 1–10s), V4 LLM API integration planned, V1–V3 scoped as a functional Windows app, Mac as a later-stage goal, premium UI as a V4+ ambition, and desktop-only permanently — the updated analysis sharpens the picture:

**Qt C++ is eliminated.** Its performance advantage is irrelevant at 10-second (or even 1-second) polling for a task list and bar chart app, and V4 LLM integration without an official SDK is a meaningful cost that only grows as the product evolves.

**Flutter is eliminated.** Platform channel latency at 1–3s polling is a documented risk at the most critical layer of the app, and it has the weakest V4 LLM story of all five options.

**Electron is the weakest of the remaining three.** The 200–400MB Chromium overhead runs 24/7 as background monitoring. V4 LLM streaming calls will add intermittent CPU spikes on top of that baseline. The V4 story is excellent, but the always-on resource cost makes it a poor fit for a background monitoring utility.

That leaves **PySide6 and Tauri** as the two credible choices, and the new polling and LLM requirements further differentiate them:

**PySide6** requires careful threading architecture from V1 to handle both 1-second polling (if tuned there) and V4 LLM streaming without blocking the UI. This is a solvable pattern — the same `QThread` approach covers both — but it must be designed in from day one, not retrofitted. In exchange: fastest V1–V3 build speed, POC code is reused directly, and the Anthropic Python SDK is first-class.

**Tauri** absorbs both concerns naturally. Rust's Tokio runtime handles 1-second polling trivially with no threading architecture required, and LLM API calls from the JS frontend use the same official SDKs as Electron — also without threading complexity. The cost remains Rust debugging when backend issues arise.

**Updated recommendation:**

If the polling cadence stays at 10 seconds in practice → **PySide6**. The threading concern doesn't bite at 10s, build speed is fastest, and the Python LLM SDK is excellent.

If polling is tuned to 1–5 seconds, or V4 LLM integration is a firm commitment that will arrive on schedule → **Tauri**. The Rust complexity is the price of admission, but you pay it once up front rather than discovering threading edge cases under production load.

The decision should be made before scaffolding begins. Both are valid; neither is wrong. The polling tuning experiment planned for V1 should inform the final call if it hasn't been made before then.

---

*Document owner: Ben*  
*Next step: ADR (Architecture Decision Record) once framework is selected*  
*Related docs: `CLAUDE.md`, `poc/` scripts*
