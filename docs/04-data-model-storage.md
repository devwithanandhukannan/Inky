# 04 — Data model (`chrome.storage.local`)
- `settings`: `{enabled, palette, auto: always|system|schedule, schedule{from,to}, animation: circle|fade|none, smartImages, skipDark, imageDim, brightness, contrast, night{on, warmth, dim, auto, from, to}}`
- `sites`: `{ "host": {mode?: smart|filter|off, force?: true, night?: false, palette?: id} }` — nearest parent domain wins.
- `palettes`: custom only `{id, name, bg, fg, accent, link}`; built-ins ship in code (`palettes.js`).
Local storage (not sync) is used so sliders can write continuously without sync quotas.
