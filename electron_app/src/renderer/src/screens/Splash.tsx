// screens/Splash.tsx
// Cold-start splash / loading screen — an EXACT copy of design_system/brand/splash.html, rendered
// at its native fixed 1100x700 card (NOT stretched to the viewport — that was what distorted the
// layout). The card is centered on the deep-green backdrop; in Phase 3 the BrowserWindow itself is
// sized to 1100x700 (non-resizable) for the splash, then becomes the normal resizable app on Home.
// All splash CSS is ported verbatim into a scoped <style> block (root .vsplash → .mm-splash).
//
// Props: onDone() fires after ~2s for the cold-start transition (wired in Phase 3); omit onDone to
// let it loop (preview). Fine-tuning of the loader is tracked as a post-Phase-3 task.
import { useEffect } from 'react'
import snowball from '../assets/brand/snowball-new-w.png'

interface SplashProps {
  onDone?: () => void
}

const SPLASH_MS = 2000

const CSS = `
.mm-splash-frame { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  overflow: hidden; background: #234032; }
.mm-splash {
  position: relative; width: 1100px; height: 700px; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center; user-select: none;
  background: radial-gradient(70.7% 70.7% at 50% 36.75%, var(--green-750) 0%, var(--green-800) 52%, #234032 100%);
  --v-track: rgba(220, 233, 221, .32);
}
.mm-splash .v-head { position: absolute; top: 60px; left: 0; right: 0; display: flex; justify-content: center;
  font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; white-space: nowrap;
  color: rgb(169, 196, 175); }
.mm-splash .v-brand { display: flex; flex-direction: column; align-items: center; gap: 30px; position: relative; z-index: 2; }
.mm-splash .v-wm { display: inline-flex; align-items: center; gap: 12px; }
.mm-splash .v-mark { display: inline-flex; flex: 0 0 auto; width: 83px; height: 83px; color: var(--paper); }
.mm-splash .v-mark svg { width: 100%; height: 100%; display: block; }
.mm-splash .v-title { line-height: 1; font-family: var(--font-display); font-weight: 500; font-size: 64px;
  letter-spacing: -.01em; color: var(--paper); }
.mm-splash .v-loading { display: inline-flex; align-items: center; gap: 12px; transform: translateX(5px); }
.mm-splash .v-cap { display: inline-flex; align-items: baseline; gap: 8px; }
.mm-splash .v-caption { line-height: 1; font-family: var(--font-display); font-style: italic; font-weight: 400;
  font-size: 21px; color: rgb(169, 196, 175); }
.mm-splash .v-mini { position: relative; width: 150px; height: 56px; transform: translateY(25px); margin-left: -11px; }
.mm-splash .v-track-svg { position: absolute; top: 0; left: -234px; width: 384px; height: 56px; }
.mm-splash .v-roller {
  position: absolute; top: 0; left: 0; width: 38px; height: 38px;
  offset-path: path('M 10 11 C 41 11, 67 44, 140 50');
  offset-rotate: 0deg; offset-anchor: 50% 100%;
  transform-origin: 50% 100%; will-change: transform;
  animation: mmsplash-roll 3.23s var(--ease-in-out) infinite;
}
@keyframes mmsplash-roll {
  0%    { offset-distance: 100%; transform: scale(1);   opacity: 1; }
  21.6% { offset-distance: 100%; transform: scale(1);   opacity: 0; }
  22.3% { offset-distance: 0%;   transform: scale(.32); opacity: 0; }
  37.5% { offset-distance: 0%;   transform: scale(.32); opacity: 0; }
  38.08%{ offset-distance: 0%;   transform: scale(.32); opacity: .25; }
  59.7% { opacity: 1; }
  100%  { offset-distance: 100%; transform: scale(1);   opacity: 1; }
}
.mm-splash .v-snow-img {
  position: absolute; left: 50%; top: 50%;
  width: 152px; height: 152px; margin: -76px 0 0 -76px;
  object-fit: contain; will-change: transform; backface-visibility: hidden; transform-origin: 50% 50%;
  filter: drop-shadow(0 12px 24px rgba(56,44,24,.32));
  animation: mmsplash-spin 3.23s var(--ease-in-out) infinite;
}
@keyframes mmsplash-spin {
  0%    { transform: rotate(420deg) scale(.25); }
  21.6% { transform: rotate(420deg) scale(.25); }
  22.3% { transform: rotate(0deg)   scale(.25); }
  38.08%{ transform: rotate(0deg)   scale(.25); }
  100%  { transform: rotate(420deg) scale(.25); }
}
.mm-splash .dots { display: inline-flex; gap: 7px; align-items: center; }
.mm-splash .dots i { width: 7px; height: 7px; border-radius: 50%; display: block; background: #ffffff;
  box-shadow: 0 1px 2px rgba(56,44,24,.22); }
.mm-splash .vdots { transform: translateY(1px); }
.mm-splash .vdots i:nth-child(1) { animation: mmsplash-d1 3.23s var(--ease-in-out) infinite; }
.mm-splash .vdots i:nth-child(2) { animation: mmsplash-d2 3.23s var(--ease-in-out) infinite; }
.mm-splash .vdots i:nth-child(3) { animation: mmsplash-d3 3.23s var(--ease-in-out) infinite; }
@keyframes mmsplash-d1 { 0%{opacity:.25} 21.6%{opacity:1} 25.4%{opacity:1} 47%{opacity:.25} 100%{opacity:.25} }
@keyframes mmsplash-d2 { 0%{opacity:.25} 12.7%{opacity:.25} 34.3%{opacity:1} 38.1%{opacity:1} 59.7%{opacity:.25} 100%{opacity:.25} }
@keyframes mmsplash-d3 { 0%{opacity:.25} 25.4%{opacity:.25} 47%{opacity:1} 50.8%{opacity:1} 72.4%{opacity:.25} 100%{opacity:.25} }
.mm-splash .v-decor { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.mm-splash .v-vignette { position: absolute; inset: 0; box-shadow: inset 0 0 200px 40px rgba(0,0,0,.10); }
@media (prefers-reduced-motion: reduce) {
  .mm-splash .v-roller, .mm-splash .v-snow-img, .mm-splash .vdots i { animation: none !important; }
  .mm-splash .v-roller { offset-distance: 100%; transform: scale(1); opacity: 1; }
  .mm-splash .v-snow-img { transform: scale(.25); }
  .mm-splash .vdots i { opacity: 1; }
}
`

export default function Splash({ onDone }: SplashProps): React.JSX.Element {
  useEffect(() => {
    if (!onDone) return
    const t = setTimeout(onDone, SPLASH_MS)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="mm-splash-frame">
      <style>{CSS}</style>
      <div className="mm-splash">
        <div className="v-decor">
          <div className="v-vignette" />
        </div>
        <div className="v-head">Finding your footing</div>
        <div className="v-brand">
          <div className="v-wm">
            <span className="v-mark">
              <svg viewBox="0 0 48 48" fill="none">
                <path
                  d="M9.1 19.34 L14.1 24 L9.1 28.66"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity=".5"
                />
                <path
                  d="M18.1 17.47 L25.1 24 L18.1 30.53"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity=".75"
                />
                <path
                  d="M29.1 14.86 L38.9 24 L29.1 33.14"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="v-title">Momentum</span>
          </div>
          <div className="v-loading">
            <span className="v-cap">
              <span className="v-caption">Gathering momentum</span>
              <span className="dots vdots">
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className="v-mini">
              <svg className="v-track-svg" viewBox="-234 0 384 56" preserveAspectRatio="none">
                <path
                  d="M -220 12 C -123 12, -55 12, 10 12 C 41 12, 67 45, 140 51"
                  fill="none"
                  stroke="var(--v-track)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity="0.85"
                />
              </svg>
              <span className="v-roller">
                <img className="v-snow-img" src={snowball} alt="" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
