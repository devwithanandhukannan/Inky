# 03 — Complexity & performance
n = elements, d = distinct colours (typically 20–300), m = mutations.
| Operation | Cost |
|---|---|
| First pass | O(n) computed-style reads, time-sliced (14 ms slices while the body is hidden, ≤10 ms idle slices later); reads batched before writes (no layout thrash); inherited text colours skipped |
| CSS produced | O(d) rules (adaptive quantisation above 1500) — attribute selectors are bucketed by attribute name in Blink |
| Palette switch | O(d) text regeneration, **no DOM walk** |
| Toggle off | O(1) unmount; leftover attributes cleaned lazily in idle time |
| Mutations | O(k) added nodes; ≤120 sync before paint, rest idle; style-attr changes ignored unless colour-related |
| Image verdicts | one 24×24 sample per distinct URL, cached (page + service-worker LRU 600) |
| Night light | O(1): one pseudo-element, colour transition on the compositor |
Space: WeakMap per element (leaf nodes skipped), Map of d rules, constructed sheets shared with shadow roots.
Idle cost when disabled for a site: one storage read, no observers.
