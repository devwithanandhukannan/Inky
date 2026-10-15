# Inky — Smart Dark Mode & Night Light

Apple-style minimalist dark mode for Chrome (MV3). White / grey / black UI, borderless, smooth.

## What's new vs. "Dark Theme Toggle"
| | Before | Inky |
|---|---|---|
| Recolouring | Hard-coded class-name selectors (`[class*="card"]`…) that broke layouts | **Smart engine**: reads each element's *computed* colours and maps them in OKLab — works with CSS variables, inline styles, any framework |
| Icons / PNGs in divs | Dark icons vanished on dark backgrounds | **Icon-aware**: dark PNG/SVG/CSS-background icons are detected (pixel + SVG analysis) and lightened; photos are never touched |
| Fallbacks | none | Per-site **Filter mode** (invert-based) for stubborn pages; **auto-skip** sites that are already dark |
| Palettes | 5 flat | **3 theme cards** (Graphite · Black · Midnight) + Dim / Paper Night / Slate + unlimited **custom palettes** (live preview, WCAG badges, *Generate from accent*, *Surprise me*, import/export) |
| Night reading | – | **Night light**: blue-light filter (warmth + dim), optional schedule, works with or without dark mode |
| Control | global + per-site on/off | Per site: Auto / Smart / Filter / Off, per-site palette; schedule or follow-system; brightness / contrast / image dimming |
| Animation | circular reveal | Circular reveal (top→down) **or** fade **or** none; iOS-style controls; respects reduced-motion |
| Shortcuts | – | `Alt+Shift+D` dark, `Alt+Shift+N` night light |

## v2.1 additions
- **Fix an element**: popup → *Fix an element* → point at anything that looks wrong → *Keep original colours* or *Invert colours*. Saved per site (see Settings → Sites to clear).
- **Fix**: dark text that redeclared its parent's colour (buttons, price tags) is now always remapped.
- **E2E audit** (`npm i && npm run test:e2e`): loads the extension in Chromium against GitHub-, Wikipedia-, shop- and SPA/shadow-DOM-style fixtures and fails if any text drops below 3:1 contrast.

## Install (unpacked)
`chrome://extensions` → Developer mode → **Load unpacked** → select this folder. Tests: `npm test`.

## How the engine works (short)
1. Each element: one `getComputedStyle` read (batched, idle-time-sliced, parents first).
2. Light backgrounds / dark text / light borders are mapped to the palette; the element gets an attribute whose value is its *original* colour (`data-lmb="250 250 250"`).
3. One CSS rule per **distinct colour** does the work → O(distinct colours) CSS, not O(nodes). Palette switch = regenerate that sheet. Disable = remove it.
4. Gradients that are light become flat surfaces; photo backgrounds are left alone and text on them keeps its colour.
5. Small `<img>`/CSS-background icons: sampled on a 24×24 canvas (or fetched by the service worker if cross-origin) → dark glyphs get `invert(.92) hue-rotate(180deg)`.
6. MutationObserver processes added nodes before paint (first 120 sync, rest idle).
See `docs/` for requirements, architecture, complexity and data model.

## Privacy
No servers, no analytics. Settings live in `chrome.storage.local`. The service worker fetches only icon URLs the page already loads, to analyse them locally.
