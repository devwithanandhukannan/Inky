/* Inky Custom Site Designs & CSS.
 * Tailored dark CSS enhancements for famous daily-use websites (Amazon, Flipkart, Udemy, YouTube, etc.)
 * Classic script for content script inclusion AND side-effect module imports.
 */
(function (g) {
  'use strict';

  const FAMOUS_SITES = [
    {
      id: 'amazon',
      name: 'Amazon',
      domains: ['amazon.in', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.ca', 'amazon.co.jp', 'amazon.fr', 'amazon.it', 'amazon.es'],
      description: 'Mutes harsh neon deal banners, sleek dark product cards, refined search bar and cart buttons.',
      css: `
        /* ── Amazon Custom Design ── */
        .quad-card, .a-cardui, [data-card-metrics-id], .feed-carousel-card,
        [class*="deals-shoveler"], .octopus-pc-card, .as-title-block,
        .a-section.feed-carousel-viewport, [data-testid*="deal"] {
          background: #181a20 !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28) !important;
        }
        /* Mute bright saturated promo / deals card backgrounds */
        [style*="background-color: rgb(25"], [style*="background-color: #ff"],
        [style*="background-color: #f8"], [style*="background-color: #f9"],
        [style*="background-color: #fa"], [style*="background-color: #fb"],
        [style*="background-color: #fc"], [style*="background-color: #fd"],
        [style*="background-color: #fe"] {
          background-color: #1a1c23 !important;
        }
        /* Deal & discount badges */
        [class*="deal-badge"], [class*="badge-label"], .dealBadge, [class*="deal-ribbon"] {
          background: #8b1e2a !important;
          color: #ffffff !important;
          border-radius: 4px !important;
          font-weight: 600 !important;
        }
        /* Search result product cards */
        div[data-component-type="s-search-result"], .s-card-container {
          background: #16181f !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          border-radius: 8px !important;
          transition: border-color 0.2s ease, transform 0.2s ease !important;
        }
        div[data-component-type="s-search-result"]:hover {
          border-color: rgba(255, 255, 255, 0.16) !important;
        }
        /* Amazon's choice & Best seller badges */
        .a-badge-label[data-a-badge-color="sx-blue"] {
          background: #1e3a8a !important;
          color: #dbeafe !important;
        }
        .a-badge-label[data-a-badge-color="sx-orange"], .a-badge-label {
          background: #78350f !important;
          color: #fef3c7 !important;
        }
        /* Prices */
        .a-price-whole, .a-price-symbol {
          color: #f8fafc !important;
          font-weight: 600 !important;
        }
        /* Action buttons */
        .a-button-primary .a-button-inner, input.a-button-input {
          background: #d97706 !important;
          color: #111827 !important;
          border: none !important;
          border-radius: 99px !important;
          font-weight: 600 !important;
        }
        /* Top Navigation & search */
        #navbar, #nav-belt, #nav-main {
          background: #111216 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        #nav-search-bar-form {
          background: #1c1e24 !important;
          border-radius: 8px !important;
        }
        #twotabsearchtextbox {
          color: #f8fafc !important;
        }
      `
    },
    {
      id: 'flipkart',
      name: 'Flipkart',
      domains: ['flipkart.com'],
      description: 'Deep obsidian header, eliminates white boxes on sponsored tags, dark product grid cards.',
      css: `
        /* ── Flipkart Custom Design ── */
        header._1G57D0, ._1kidPb, ._2msBFL, header, ._16rZTH, ._23x-s_ {
          background: #0f1319 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        input._3704LK, ._2ix_2M, form[action*="/search"] input {
          background: #1a1e27 !important;
          color: #f1f5f9 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        /* Remove white background boxes on sponsored product tags */
        [class*="sponsored"], [class*="Sponsored"],
        ._2WkVRV, ._2I90AL, ._25b18c {
          background: transparent !important;
          background-color: transparent !important;
          color: #94a3b8 !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 3px !important;
          box-shadow: none !important;
        }
        /* Product Cards & Grid */
        ._1AtVbE, ._4ddWXP, ._2kHMtA, ._13oc-S, ._1xHGtK, [class*="product-card"] {
          background: #14171e !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          border-radius: 8px !important;
        }
        /* Price */
        ._30jeq3, [class*="price"] {
          color: #f8fafc !important;
          font-weight: 600 !important;
        }
        /* Discount tag */
        ._3Ay6Sb {
          color: #34d399 !important;
        }
        /* Left filters sidebar */
        ._1Y9NYc, ._1YokD2, section._167rNj {
          background: #11141a !important;
          border-right: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
      `
    },
    {
      id: 'udemy',
      name: 'Udemy',
      domains: ['udemy.com'],
      description: 'Darkens top promo banners, clean dark search bar input, and cohesive course card surfaces.',
      css: `
        /* ── Udemy Custom Design ── */
        .ud-announcement-bar, [class*="announcement-bar"], [data-purpose*="announcement-bar"],
        [class*="smart-bar"], [class*="billboard-banner"] {
          background: rgba(30, 32, 38, 0.95) !important;
          color: #e4e7eb !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        .ud-announcement-bar a, [class*="announcement-bar"] a {
          color: #93c5fd !important;
          text-decoration: underline !important;
        }
        /* Search bar input */
        .ud-search-form-autocomplete-input, input[name="q"], [class*="search-form-autocomplete"] input {
          background: #1e2026 !important;
          color: #f1f5f9 !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          box-shadow: none !important;
        }
        .ud-search-form-autocomplete-input::placeholder, input[name="q"]::placeholder {
          color: #94a3b8 !important;
        }
        /* Header navbar */
        [class*="header--header"], .ud-header {
          background: #131418 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        /* Course cards & learning containers */
        [class*="course-card"], [class*="unit-wrapper"], .ud-course-card, .course-card--container {
          background: #18191f !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          border-radius: 8px !important;
        }
      `
    },
    {
      id: 'youtube',
      name: 'YouTube',
      domains: ['youtube.com'],
      description: 'OLED-grade player background, dark chip tags, and polished video item cards.',
      css: `
        /* ── YouTube Custom Design ── */
        ytd-masthead, #masthead-container {
          background: #0f0f12 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
        ytd-searchbox, #container.ytd-searchbox {
          background: #1a1b20 !important;
          border-color: rgba(255, 255, 255, 0.12) !important;
        }
        yt-chip-cloud-chip-renderer[chip-style="STYLE_DEFAULT"] {
          background: #202228 !important;
          color: #e2e8f0 !important;
        }
        yt-chip-cloud-chip-renderer[chip-style="STYLE_DEFAULT"]:hover {
          background: #2d3038 !important;
        }
      `
    },
    {
      id: 'wikipedia',
      name: 'Wikipedia',
      domains: ['wikipedia.org'],
      description: 'Dark-mode styled infoboxes, cohesive wikitables without white grid borders.',
      css: `
        /* ── Wikipedia Custom Design ── */
        .infobox, .infobox_v2, .infobox_v3, table.infobox {
          background: #171920 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 8px !important;
          color: #e2e8f0 !important;
        }
        .wikitable, table.wikitable {
          background: #14161c !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          color: #e2e8f0 !important;
        }
        .wikitable > tr > th, .wikitable > * > tr > th {
          background: #1e2129 !important;
          color: #f8fafc !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }
        .wikitable > tr > td, .wikitable > * > tr > td {
          border-color: rgba(255, 255, 255, 0.06) !important;
        }
      `
    },
    {
      id: 'github',
      name: 'GitHub',
      domains: ['github.com'],
      description: 'Smooth markdown surfaces, dark borders on code blocks and issue timeline boxes.',
      css: `
        /* ── GitHub Custom Design ── */
        .markdown-body {
          background-color: transparent !important;
          color: #e2e8f0 !important;
        }
        .markdown-body pre, .markdown-body code {
          background-color: #171920 !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }
        .Box {
          background-color: #14161c !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
        }
      `
    },
    {
      id: 'google',
      name: 'Google Search',
      domains: ['google.com'],
      description: 'Seamless dark search input, darkened knowledge panels, and clean result links.',
      css: `
        /* ── Google Search Custom Design ── */
        .RNNXgb, .SDkEP {
          background: #1e2026 !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          box-shadow: none !important;
        }
        .kp-blk, .I6TXqe {
          background: #16181e !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          border-radius: 8px !important;
        }
      `
    }
  ];

  function normalizeHost(h) {
    if (!h || typeof h !== 'string') return '';
    return h.trim().toLowerCase().replace(/^www\./, '');
  }

  function matchesSite(host, site) {
    const clean = normalizeHost(host);
    if (!clean) return false;
    for (let i = 0; i < site.domains.length; i++) {
      const d = site.domains[i].toLowerCase();
      if (clean === d || clean.endsWith('.' + d)) return true;
    }
    return false;
  }

  function findSite(host) {
    const clean = normalizeHost(host);
    if (!clean) return null;
    return FAMOUS_SITES.find((s) => matchesSite(clean, s)) || null;
  }

  function getCustomCss(host, customSitesMap, masterEnabled) {
    if (masterEnabled === false) return '';
    const site = findSite(host);
    if (!site) return '';
    const isEnabled = !customSitesMap || customSitesMap[site.id] !== false;
    return isEnabled ? site.css : '';
  }

  g.InkyCustomDesigns = {
    list: FAMOUS_SITES,
    find: findSite,
    matchesSite,
    normalizeHost,
    getCustomCss
  };
})(globalThis);
