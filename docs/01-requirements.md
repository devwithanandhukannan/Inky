# 01 — Requirements
**Goals**: dark mode that doesn't break pages; understands icons/images; night (blue-light) filter; minimalist Apple-like UI; custom palettes; fast and private.
**Non-goals**: rewriting remote CSS files, syncing settings across devices, telemetry.
**Budgets**: first themed paint without white flash; ≤12 ms main-thread work per idle slice; <1 MB resident per tab for typical pages; zero cost when disabled for a site.
