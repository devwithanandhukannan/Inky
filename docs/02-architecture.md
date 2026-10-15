# 02 — Architecture
```
popup / options ──write──▶ chrome.storage.local ◀──read+onChanged── content script (every frame)
                                                        │ ANALYZE_IMAGES(urls)
                                                        ▼
                                                  service worker (fetch + 24×24 raster, shortcuts, install-time injection)
```
- **Content script** (`engine.js`, + shared `color.js`, `palettes.js`): resolves site rule → view `{dark, mode, palette, night}`; mounts up to three constructed stylesheets: *base* (palette, filters, selection), *rules* (per-colour), *night* (overlay `html::after`, multiply blend, top frame only).
- **Modes**: `smart` (computed-colour mapping) · `filter` (invert + hue-rotate, media re-inverted) · off.
- **Skip-dark**: before the first pass, rules are disabled and 4 viewport points are sampled; if the page is already dark it is left untouched unless forced.
- **Transitions**: View Transitions API (circle clip-path from top-centre, or fade); the first themed snapshot waits for the scan to finish so the reveal shows a fully themed page.
- **Shadow DOM**: open shadow roots adopt the same sheets and get their own observer.
- **Service worker** is stateless apart from an LRU of image verdicts.
