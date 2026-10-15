// splash.ts — entry script of splash.html (the cold-start splash page). Stands in for the design
// file's ../styles.css link: the same design tokens the app uses (no Tailwind — the design file
// was never written under Tailwind's base reset, which is one way the old React port drifted) and
// the self-hosted fonts. After one full 3.23 s loop of the loader animation it asks the main
// process to grow the window and load the app page (app:splashDone → loadPage 'index').
import '@fontsource/newsreader/400.css'
import '@fontsource/newsreader/500.css'
import '@fontsource/newsreader/400-italic.css'
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/600.css'
import './assets/tokens/colors.css'
import './assets/tokens/typography.css'
import './assets/tokens/spacing.css'
import './assets/tokens/base.css'
import './assets/splash.css'

// One full loop of the roll animation (vroll-fast: 3.23s), so the snowball lands before the shell
// appears (D12).
const SPLASH_MS = 3230

window.setTimeout(() => {
  void window.api.app.splashDone()
}, SPLASH_MS)
