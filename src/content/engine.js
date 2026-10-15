/* Inky engine (content script).
 *
 * Smart mode reads each element's *computed* colours (so CSS variables, inline
 * styles and any stylesheet are all handled), maps them to the palette in OKLab,
 * and tags the element with an attribute whose value is the ORIGINAL colour.
 * One rule per distinct colour does the recolouring:  O(distinct colours), not O(nodes).
 * Disabling = unmounting one stylesheet.  Palette switch = regenerate the rule text.
 */
(function () {
  'use strict';
  if (window.__inky__ || window.__lumo__) return;
  const C = globalThis.InkyColor || globalThis.LumoColor, P = globalThis.InkyPalettes || globalThis.LumoPalettes;
  const doc = document, root = doc.documentElement;
  if (!C || !P || !root || root.tagName !== 'HTML' || (doc.contentType && doc.contentType !== 'text/html')) return;
  window.__inky__ = window.__lumo__ = true;

  const IS_TOP = window.top === window;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NOW = () => performance.now();
  const ric = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 150 }) : (f) => setTimeout(() => f({ timeRemaining: () => 8 }), 16);
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));

  /* ───────────── settings ───────────── */
  const DEFAULTS = {
    enabled: true, palette: 'graphite', auto: 'always', schedule: { from: '19:00', to: '07:00' },
    animation: 'circle', smartImages: true, skipDark: true, imageDim: 8, brightness: 100, contrast: 100,
    night: { on: false, warmth: 45, dim: 0, auto: false, from: '21:00', to: '06:00' }
  };
  let S = DEFAULTS, SITES = {}, PALS = {};
  let ignoreSel = '', invertSel = '', fixKey = '';

  function merge(raw) {
    const s = raw || {};
    return Object.assign({}, DEFAULTS, s, {
      schedule: Object.assign({}, DEFAULTS.schedule, s.schedule),
      night: Object.assign({}, DEFAULTS.night, s.night)
    });
  }
  const getPalette = (id) => P.get(id) || PALS[id] || P.get(P.DEFAULT_ID);

  function siteRule() {
    const parts = location.hostname.toLowerCase().split('.');
    for (let i = 0; i <= parts.length - 2 && i < 5; i++) {
      const r = SITES[parts.slice(i).join('.')];
      if (r) return r;
    }
    return SITES[location.hostname.toLowerCase()] || null;
  }
  const mins = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : 0; };
  function inWindow(from, to) {
    const d = new Date(), n = d.getHours() * 60 + d.getMinutes(), a = mins(from), b = mins(to);
    return a === b ? false : a < b ? n >= a && n < b : n >= a || n < b;
  }
  const sysDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

  function computeView() {
    const site = siteRule() || {};
    let dark;
    if (site.mode === 'off') dark = false;
    else if (site.mode === 'smart' || site.mode === 'filter') dark = true;
    else if (!S.enabled) dark = false;
    else dark = S.auto === 'system' ? sysDark() : S.auto === 'schedule' ? inWindow(S.schedule.from, S.schedule.to) : true;
    const mode = site.mode === 'filter' ? 'filter' : 'smart';
    const pal = getPalette(site.palette || S.palette);
    const n = S.night;
    const fixes = Array.isArray(site.fixes) ? site.fixes : [];
    const night = (n.on || (n.auto && inWindow(n.from, n.to))) && site.night !== false;
    return {
      dark, mode, pal, night, forced: !!(site.force || site.mode === 'smart' || site.mode === 'filter'),
      fixes,
      key: [dark, mode, pal.id, pal.bg, pal.fg, pal.accent, pal.link].join('|')
    };
  }

  /* ───────────── stylesheet hosts ───────────── */
  class Sheet {
    constructor(id) {
      this.id = id; this.mounted = false; this.el = null; this.text = ''; this.shadows = new Set();
      try { this.sheet = new CSSStyleSheet(); } catch (e) { this.sheet = null; }
    }
    mount() {
      if (this.mounted) return;
      this.mounted = true;
      if (this.sheet) {
        try { doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, this.sheet]; return; } catch (e) { this.sheet = null; }
      }
      this.el = doc.createElement('style');
      this.el.id = this.id;
      this.el.textContent = this.text;
      (doc.head || root).appendChild(this.el);
    }
    set(text) {
      this.text = text;
      if (this.sheet) this.sheet.replaceSync(text);
      else if (this.el) this.el.textContent = text;
    }
    add(rule) {
      try {
        const sh = this.sheet || (this.el && this.el.sheet);
        if (sh) sh.insertRule(rule, sh.cssRules.length);
      } catch (e) { /* ignore a malformed rule */ }
    }
    ensure() {
      if (!this.mounted) return;
      if (this.sheet && !doc.adoptedStyleSheets.includes(this.sheet)) {
        try { doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, this.sheet]; } catch (e) { /* ignore */ }
      } else if (this.el && !this.el.isConnected) (doc.head || root).appendChild(this.el);
    }
    adoptShadow(sr) {
      if (!this.sheet || this.shadows.has(sr)) return;
      try { sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, this.sheet]; this.shadows.add(sr); } catch (e) { /* closed / frozen */ }
    }
    unmount() {
      if (!this.mounted) return;
      this.mounted = false;
      if (this.sheet) {
        try { doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== this.sheet); } catch (e) { /* ignore */ }
        this.shadows.forEach((sr) => { try { sr.adoptedStyleSheets = sr.adoptedStyleSheets.filter((s) => s !== this.sheet); } catch (e) { /* ignore */ } });
        this.shadows.clear();
      }
      if (this.el) { this.el.remove(); this.el = null; }
    }
  }
  const baseSheet = new Sheet('inky-base');
  const rulesSheet = new Sheet('inky-rules');
  const nightSheet = new Sheet('inky-night');

  /* ───────────── smart engine state ───────────── */
  let view = null;           // last applied view
  let mapper = null;
  let rules = new Map();     // key(kind|color) -> {kind, key, src}
  const info = new WeakMap();// element -> {eff, fg, ft}
  let smartOn = false, observer = null, scanStarted = false, skipped = null;
  let queue = [], qi = 0, pumping = false, initialPhase = true, rescanTimer = 0;
  const shadowObs = new Set();

  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD', 'BASE', 'NOSCRIPT', 'TEMPLATE', 'BR', 'WBR', 'VIDEO', 'AUDIO', 'CANVAS',
    'IFRAME', 'OBJECT', 'EMBED', 'SOURCE', 'TRACK', 'PICTURE', 'MAP', 'AREA', 'PARAM', 'DEFS', 'LINEARGRADIENT', 'RADIALGRADIENT', 'STOP', 'CLIPPATH', 'MASK', 'SYMBOL', 'FILTER', 'FEGAUSSIANBLUR', 'INKY-UI', 'LUMO-UI']);
  const SVG_SHAPES = new Set(['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);
  const ATTRS = ['data-lmb', 'data-lmf', 'data-lmd', 'data-lmg', 'data-lms', 'data-lmk', 'data-lmi', 'data-lm'];

  const PROP = { b: 'background-color', f: 'color', d: 'border-color', s: 'fill', k: 'stroke' };
  const ATTR = { b: 'data-lmb', f: 'data-lmf', d: 'data-lmd', g: 'data-lmg', s: 'data-lms', k: 'data-lmk' };

  function ruleText(kind, key, o) {
    const val = C.cssOf(o);
    const sel = '[' + ATTR[kind] + '="' + key + '"]';
    if (kind === 'g') return sel + '{background-image:none!important;background-color:' + val + '!important}';
    return sel + '{' + PROP[kind] + ':' + val + '!important}';
  }

  /** Registers (once) the rule for an original colour; returns the attribute value. */
  function register(kind, c, o) {
    if (rules.size > 1500) { c = { r: c.r & ~7, g: c.g & ~7, b: c.b & ~7, a: c.a }; }
    const key = C.colorKey(c);
    const id = kind + '|' + key;
    if (!rules.has(id)) {
      rules.set(id, { kind, key, src: c });
      if (rulesSheet.mounted) rulesSheet.add(ruleText(kind, key, o || mapFor(kind, c)));
    }
    return key;
  }
  function mapFor(kind, c) {
    return kind === 'f' || kind === 's' || kind === 'k' ? mapper.fg(c) : kind === 'd' ? mapper.bd(c) : mapper.bg(c);
  }
  function rebuildRules() {
    const out = [];
    rules.forEach((r) => { const o = mapFor(r.kind, r.src); if (o) out.push(ruleText(r.kind, r.key, o)); });
    rulesSheet.set(out.join('\n'));
  }

  const parentOf = (el) => el.parentElement || (el.parentNode && el.parentNode.host) || null;
  function parentEff(el) {
    let p = parentOf(el);
    while (p) { const i = info.get(p); if (i) return i; p = parentOf(p); }
    return null;
  }

  /* decide(): READ phase. Returns tag list [[attr,value],...] or null. */
  function decide(el) {
    const tag = el.tagName;
    if (ignoreSel && el.closest(ignoreSel)) return null;
    if (invertSel) { const m = el.closest(invertSel); if (m) return m === el ? [['data-lmi', '']] : null; }
    if (tag === 'IMG') { considerImg(el); return null; }
    const isSvg = el.namespaceURI === SVG_NS;
    if (!isSvg && SKIP.has(tag)) return null;
    if (isSvg && SKIP.has(tag.toUpperCase())) return null;
    const cs = getComputedStyle(el);
    const pinfo = parentEff(el);
    const lo = mapper.lo;
    let eff = pinfo ? pinfo.eff : lo;
    const tags = [];

    if (isSvg) {
      if (!SVG_SHAPES.has(tag.toLowerCase())) return null;
      if (eff < 0.6) {
        const f = C.parseCssColor(cs.fill);
        if (f && f.a > 0.05) { const m = mapper.fg(f); if (m) tags.push([ATTR.s, register('s', f, m)]); }
        const k = C.parseCssColor(cs.stroke);
        if (k && k.a > 0.05) { const m = mapper.fg(k); if (m) tags.push([ATTR.k, register('k', k, m)]); }
      }
      return tags.length ? tags : null;
    }

    /* background */
    const bi = cs.backgroundImage;
    const bgc = C.parseCssColor(cs.backgroundColor);
    let ownEff = eff, haveBg = false;
    if (bi && bi !== 'none') {
      if (bi.indexOf('url(') !== -1) {
        const w = parseFloat(cs.width), h = parseFloat(cs.height);
        if (w <= 128 && h <= 128 && !el.firstElementChild && !(el.textContent || '').trim()) considerBgIcon(el, bi);
        else ownEff = 0.9; // photo / artwork: leave text colours alone
        haveBg = true;
      } else if (bi.indexOf('gradient') !== -1) {
        const stops = (bi.match(/rgba?\([^)]+\)/g) || []).map(C.parseCssColor).filter((x) => x && x.a >= 0.3);
        if (stops.length && stops.every((s) => C.rgbToOklab(s.r, s.g, s.b).L > 0.62)) {
          const avg = { r: 0, g: 0, b: 0, a: 1 };
          stops.forEach((s) => { avg.r += s.r / stops.length; avg.g += s.g / stops.length; avg.b += s.b / stops.length; });
          const m = mapper.bg(avg);
          if (m) { tags.push([ATTR.g, register('g', avg, m)]); ownEff = m.L; }
        } else ownEff = 0.9;
        haveBg = true;
      }
    }
    if (!haveBg && bgc && bgc.a >= 0.05) {
      const m = mapper.bg(bgc);
      if (m) { tags.push([ATTR.b, register('b', bgc, m)]); if (bgc.a >= 0.5) ownEff = m.L; }
      else if (bgc.a >= 0.5) ownEff = C.rgbToOklab(bgc.r, bgc.g, bgc.b).L;
    }

    /* text */
    const fgs = cs.color;
    let ft = false;
    if (ownEff < 0.6) {
      // always tag: an element may redeclare the same colour as its parent (buttons, price tags),
      // so inheritance cannot be assumed. Rules are per-colour, so this costs attributes, not CSS.
      const fc = C.parseCssColor(fgs);
      if (fc) { const m = mapper.fg(fc); if (m) { tags.push([ATTR.f, register('f', fc, m)]); ft = true; } }
    }

    /* border (only when drawn, and all drawn sides share a colour) */
    if (cs.borderTopWidth !== '0px' || cs.borderRightWidth !== '0px' || cs.borderBottomWidth !== '0px' || cs.borderLeftWidth !== '0px') {
      const sides = [['borderTopWidth', 'borderTopColor'], ['borderRightWidth', 'borderRightColor'], ['borderBottomWidth', 'borderBottomColor'], ['borderLeftWidth', 'borderLeftColor']];
      let col = null, same = true;
      for (const s of sides) {
        if (cs[s[0]] === '0px') continue;
        if (col === null) col = cs[s[1]]; else if (col !== cs[s[1]]) same = false;
      }
      if (col && same) {
        const bc = C.parseCssColor(col);
        if (bc && bc.a >= 0.05) { const m = mapper.bd(bc); if (m) tags.push([ATTR.d, register('d', bc, m)]); }
      }
    }

    if (el.firstElementChild) info.set(el, { eff: ownEff, fg: fgs, ft });
    if (el.shadowRoot) watchShadow(el.shadowRoot);
    return tags.length ? tags : null;
  }

  function processBatch(els) {
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.hasAttribute && el.hasAttribute('data-lm')) for (const a of ATTRS) el.removeAttribute(a);
    }
    const res = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!el.isConnected) continue;
      let t = null;
      try { t = decide(el); } catch (e) { t = null; }
      if (t) res.push(el, t);
    }
    for (let i = 0; i < res.length; i += 2) {
      const el = res[i], t = res[i + 1];
      for (let j = 0; j < t.length; j++) el.setAttribute(t[j][0], t[j][1]);
      el.setAttribute('data-lm', '');
    }
  }

  /* ───────────── scheduling ───────────── */
  function enqueue(list) {
    for (let i = 0; i < list.length; i++) queue.push(list[i]);
    startPump();
  }
  function startPump() {
    if (pumping || !smartOn) return;
    pumping = true;
    if (initialPhase) tickInitial(); else ric(tickIdle);
  }
  function takeChunk(n) {
    const c = queue.slice(qi, qi + n);
    qi += c.length;
    if (qi >= queue.length) { queue = []; qi = 0; }
    return c;
  }
  async function tickInitial() {
    while (smartOn && queue.length) {
      const t0 = NOW();
      while (queue.length && NOW() - t0 < 14) processBatch(takeChunk(150));
      await yieldNow();
    }
    pumping = false;
    if (smartOn) firstPassDone();
  }
  function tickIdle(dl) {
    const t0 = NOW();
    const budget = Math.min(dl && dl.timeRemaining ? dl.timeRemaining() : 8, 10);
    while (smartOn && queue.length && NOW() - t0 < budget) processBatch(takeChunk(100));
    pumping = false;
    if (smartOn && queue.length) startPump();
  }
  /** Drain the queue right now (used inside view transitions, where the page is frozen anyway). */
  async function drain(maxMs) {
    const t0 = NOW();
    while (queue.length && NOW() - t0 < maxMs) { const t1 = NOW(); while (queue.length && NOW() - t1 < 14) processBatch(takeChunk(150)); await yieldNow(); }
  }
  function allElements() { return Array.prototype.slice.call(doc.getElementsByTagName('*')); }

  /* ───────────── mutations ───────────── */
  const COLORISH = /color|background|border|fill|stroke|filter|opacity|display|visibility/i;
  function onMutations(muts) {
    if (!smartOn) return;
    rulesSheet.ensure(); baseSheet.ensure();
    const sync = []; let rescan = false;
    for (const m of muts) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n === root.lastElementChild && n.tagName === 'BODY') { ensureScan(); continue; }
          sync.push(n);
          if (n.firstElementChild) { const d = n.getElementsByTagName('*'); for (let i = 0; i < d.length; i++) sync.push(d[i]); }
        }
      } else if (m.type === 'attributes') {
        const t = m.target;
        if (t === root || t === doc.body) { if (m.attributeName === 'class') rescan = true; continue; }
        if (m.attributeName === 'style' && !COLORISH.test((m.oldValue || '') + (t.getAttribute('style') || ''))) continue;
        sync.push(t);
      }
    }
    if (rescan) { clearTimeout(rescanTimer); rescanTimer = setTimeout(rescanAll, 300); }
    if (!sync.length) return;
    // process a few synchronously (before paint), queue the rest
    const head = sync.slice(0, 120);
    processBatch(head);
    if (sync.length > 120) enqueue(sync.slice(120));
    ensureBodyReveal();
  }
  function rescanAll() {
    if (!smartOn) return;
    queue = []; qi = 0;
    enqueue(allElements());
  }
  function watchShadow(sr) {
    if (shadowObs.has(sr)) return;
    shadowObs.add(sr);
    rulesSheet.adoptShadow(sr);
    baseSheet.adoptShadow(sr);
    try {
      const o = new MutationObserver(onMutations);
      o.observe(sr, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true });
      enqueue(Array.prototype.slice.call(sr.querySelectorAll('*')));
    } catch (e) { /* ignore */ }
  }

  /* ───────────── images / icons ───────────── */
  const verdicts = new Map();     // url -> boolean (needs light treatment)
  const waiting = new Map();      // url -> Set<Element>
  let imgTimer = 0;
  const reqd = new Set();

  function applyVerdict(el, v) { if (v && el.isConnected) { el.setAttribute('data-lmi', ''); el.setAttribute('data-lm', ''); } }
  function considerImg(el) {
    if (!S.smartImages) return;
    if (!el.complete || !el.naturalWidth) {
      if (!el.__lmL) { el.__lmL = true; el.addEventListener('load', () => { el.__lmL = false; if (smartOn) enqueue([el]); }, { once: true }); }
      return;
    }
    if (el.naturalWidth > 256 || el.naturalHeight > 256) return;
    const url = el.currentSrc || el.src;
    if (!url) return;
    if (verdicts.has(url)) { applyVerdict(el, verdicts.get(url)); return; }
    try { // same-origin / CORS-clean images can be sampled right here
      const cv = doc.createElement('canvas'); cv.width = cv.height = 24;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(el, 0, 0, 24, 24);
      const v = C.classifyPixels(cx.getImageData(0, 0, 24, 24).data);
      verdicts.set(url, v); applyVerdict(el, v);
    } catch (e) { queueRemote(url, el); }
  }
  function considerBgIcon(el, bi) {
    if (!S.smartImages) return;
    const m = /url\(["']?([^"')]+)["']?\)/.exec(bi);
    if (!m) return;
    const url = new URL(m[1], location.href).href;
    if (verdicts.has(url)) { applyVerdict(el, verdicts.get(url)); return; }
    queueRemote(url, el);
  }
  function queueRemote(url, el) {
    let s = waiting.get(url);
    if (!s) { s = new Set(); waiting.set(url, s); }
    s.add(el);
    if (!imgTimer) imgTimer = setTimeout(flushRemote, 60);
  }
  function flushRemote() {
    imgTimer = 0;
    const urls = [...waiting.keys()].filter((u) => !reqd.has(u)).slice(0, 24);
    if (!urls.length) return;
    urls.forEach((u) => reqd.add(u));
    try {
      chrome.runtime.sendMessage({ type: 'ANALYZE_IMAGES', urls }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        for (const u of urls) {
          const r = res[u];
          const v = !r ? false : r.svg !== undefined ? C.classifySvg(r.svg) : r.px ? C.classifyPixels(r.px) : false;
          verdicts.set(u, v);
          const set = waiting.get(u); waiting.delete(u);
          if (set) set.forEach((el) => applyVerdict(el, v));
        }
        if (waiting.size) imgTimer = setTimeout(flushRemote, 60);
      });
    } catch (e) { /* extension reloaded */ }
  }

  /* ───────────── first paint handling ───────────── */
  let releaseTimer = 0, preOn = false;
  function preHide() {
    if (preOn || doc.readyState === 'complete') return;
    preOn = true; root.setAttribute('data-lm-pre', '');
    releaseTimer = setTimeout(releaseBody, 800);
  }
  function releaseBody() {
    clearTimeout(releaseTimer);
    if (!preOn) return;
    preOn = false;
    root.setAttribute('data-lm-rel', '');
    root.removeAttribute('data-lm-pre');
    setTimeout(() => root.removeAttribute('data-lm-rel'), 400);
  }
  function ensureBodyReveal() { if (preOn && doc.readyState !== 'loading' && !queue.length) releaseBody(); }

  function pageLooksDark() {
    // read the page's ORIGINAL colours: switch our rules off for the duration of the probe
    const h = rulesSheet.sheet || rulesSheet.el;
    if (h) h.disabled = true;
    try { return probeDark(); } finally { if (h) h.disabled = false; }
  }
  function probeDark() {
    const pts = [[0.5, 0.5], [0.2, 0.4], [0.8, 0.4], [0.5, 0.8]];
    let dark = 0;
    for (const p of pts) {
      let L = 1;
      const els = doc.elementsFromPoint(innerWidth * p[0], innerHeight * p[1]);
      for (const el of els) {
        if (el === root) continue;
        const c = C.parseCssColor(getComputedStyle(el).backgroundColor);
        if (c && c.a > 0.6) { L = C.rgbToOklab(c.r, c.g, c.b).L; break; }
      }
      if (L < 0.35) dark++;
    }
    return dark >= 3;
  }
  function firstPassDone() {
    initialPhase = false;
    if (view && !view.forced && S.skipDark && view.mode === 'smart' && doc.readyState !== 'loading' && !skipped && pageLooksDark()) {
      skipped = 'dark';
      stopSmart(); baseSheet.unmount();
    }
    releaseBody();
  }
  function ensureScan() {
    if (scanStarted || !doc.body || !smartOn) return;
    scanStarted = true;
    queue = []; qi = 0;
    enqueue(allElements());
  }
  doc.addEventListener('DOMContentLoaded', () => {
    if (smartOn) { ensureScan(); if (!pumping && !queue.length) firstPassDone(); }
  });

  /* ───────────── mode application ───────────── */
  function baseCss(v) {
    const p = v.pal, fx = [];
    if (S.brightness !== 100) fx.push('brightness(' + S.brightness / 100 + ')');
    if (S.contrast !== 100) fx.push('contrast(' + S.contrast / 100 + ')');
    if (v.mode === 'filter') {
      const c = C.filterContrast(p);
      return 'html{background:#fff!important;filter:invert(1) hue-rotate(180deg) contrast(' + c + ')' + (fx.length ? ' ' + fx.join(' ') : '') + '!important}' +
        'img,video,picture,canvas,svg image,object,embed{filter:invert(1) hue-rotate(180deg)!important}' +
        '::selection{background-color:' + p.accent + '66}';
    }
    const dim = S.imageDim > 0 ? 'img,video,picture{filter:brightness(' + (1 - S.imageDim / 100) + ')}' : '';
    return ':root{color-scheme:dark!important}' +
      'html{background-color:' + p.bg + (fx.length ? ';filter:' + fx.join(' ') : '') + '}' +
      '::selection{background-color:' + p.accent + '66}' +
      dim +
      '[data-lmi]{filter:invert(.92) hue-rotate(180deg)!important}' +
      'html[data-lm-pre] body{opacity:0!important}' +
      'html[data-lm-rel] body{transition:opacity .22s ease!important}' +
      'a[data-lmb]:hover,button[data-lmb]:hover,[role=button][data-lmb]:hover,[role=menuitem][data-lmb]:hover,[role=option][data-lmb]:hover,summary[data-lmb]:hover{box-shadow:inset 0 0 0 999px rgba(255,255,255,.06)}';
  }

  function startSmart(v) {
    mapper = C.makeMapper(v.pal);
    smartOn = true; scanStarted = false; initialPhase = true;
    baseSheet.set(baseCss(v)); baseSheet.mount();
    rebuildRules(); rulesSheet.mount();
    if (!observer) {
      observer = new MutationObserver(onMutations);
    }
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true });
    if (doc.readyState === 'loading') preHide();
    if (doc.body) ensureScan();
    if (doc.readyState !== 'loading' && !doc.body) setTimeout(ensureScan, 50);
  }
  function stopSmart() {
    smartOn = false;
    if (observer) observer.disconnect();
    shadowObs.clear();
    queue = []; qi = 0; pumping = false;
    rulesSheet.unmount();
    releaseBody();
    // tidy leftover tags lazily
    const tagged = doc.querySelectorAll('[data-lm]');
    let i = 0;
    const clean = () => {
      const t0 = NOW();
      while (i < tagged.length && NOW() - t0 < 8) { for (const a of ATTRS) tagged[i].removeAttribute(a); i++; }
      if (i < tagged.length) ric(clean);
    };
    if (tagged.length) ric(clean);
  }

  /* ───────────── night light ───────────── */
  function applyNight(v) {
    if (!IS_TOP) { nightSheet.unmount(); return; }
    if (!v.night) { nightSheet.set('html::after{background-color:rgb(255 255 255)}'); setTimeout(() => { if (!view || !view.night) nightSheet.unmount(); }, 450); return; }
    const w = C.warmthToRgb(S.night.warmth), k = 1 - Math.min(Math.max(S.night.dim, 0), 70) / 100;
    const col = 'rgb(' + Math.round(w[0] * k) + ' ' + Math.round(w[1] * k) + ' ' + Math.round(w[2] * k) + ')';
    nightSheet.set('html::after{content:"";position:fixed;inset:0;z-index:2147483647;pointer-events:none;mix-blend-mode:multiply;background-color:' + col + ';transition:background-color .45s ease}');
    nightSheet.mount();
  }

  /* ───────────── view transitions ───────────── */
  let vtStyle = null;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function withTransition(kind, fn) {
    if (!kind || !IS_TOP || doc.hidden || reduced() || typeof doc.startViewTransition !== 'function') { await fn(); return; }
    vtStyle = doc.createElement('style');
    vtStyle.textContent = kind === 'circle'
      ? '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}::view-transition-old(root){z-index:1}::view-transition-new(root){z-index:2}'
      : '::view-transition-old(root),::view-transition-new(root){animation-duration:.4s;animation-timing-function:ease}';
    (doc.head || root).appendChild(vtStyle);
    try {
      const t = doc.startViewTransition(() => fn());
      if (kind === 'circle') {
        await t.ready;
        const x = innerWidth / 2, r = Math.hypot(Math.max(x, innerWidth - x), innerHeight);
        root.animate({ clipPath: ['circle(0px at ' + x + 'px 0px)', 'circle(' + r + 'px at ' + x + 'px 0px)'] },
          { duration: 700, easing: 'cubic-bezier(.22,.8,.2,1)', pseudoElement: '::view-transition-new(root)' });
      }
      await t.finished;
    } catch (e) { /* aborted transitions are fine */ } finally { if (vtStyle) { vtStyle.remove(); vtStyle = null; } }
  }

  /* ───────────── orchestration ───────────── */
  let applying = false, pendingAnim = undefined;
  function frameFilterMode(v) { return v.mode === 'filter' && !IS_TOP; }

  async function applyView(next, animate) {
    const prev = view;
    const darkChanged = !prev || prev.dark !== next.dark;
    const styleChanged = !prev || prev.key !== next.key;
    view = next;
    if (darkChanged && !next.dark) skipped = null;
    const fk = JSON.stringify(next.fixes);
    if (fk !== fixKey) {
      fixKey = fk;
      const ok = (f) => { try { doc.querySelector(f.sel); return true; } catch (e) { return false; } };
      ignoreSel = next.fixes.filter((f) => f.action === 'ignore' && ok(f)).map((f) => f.sel).join(',');
      invertSel = next.fixes.filter((f) => f.action === 'invert' && ok(f)).map((f) => f.sel).join(',');
      if (smartOn && prev) rescanAll();
    }
    if (styleChanged) {
      const kind = !animate || S.animation === 'none' ? null : darkChanged ? S.animation : 'fade';
      await withTransition(prev ? kind : null, async () => {
        stopSmartIfNeeded(prev, next);
        if (next.dark && !skipped && !frameFilterMode(next)) {
          if (next.mode === 'filter') { baseSheet.set(baseCss(next)); baseSheet.mount(); }
          else if (!smartOn) { startSmart(next); if (prev) { await drain(450); initialPhase = false; releaseBody(); } }
          else { mapper = C.makeMapper(next.pal); baseSheet.set(baseCss(next)); rebuildRules(); }
        } else baseSheet.unmount();
      });
    } else if (next.dark && !skipped) baseSheet.set(baseCss(next)); // brightness / contrast / dim tweaks
    applyNight(next);
  }
  function stopSmartIfNeeded(prev, next) {
    if (smartOn && (!next.dark || next.mode !== 'smart' || skipped)) stopSmart();
    if (!next.dark || next.mode !== 'filter') { if (!smartOn && !(next.dark && next.mode === 'smart')) baseSheet.unmount(); }
  }

  async function update(animate) {
    if (applying) { pendingAnim = animate; return; }
    applying = true;
    try { await applyView(computeView(), animate); } catch (e) { console.warn('[inky]', e); } finally { applying = false; }
    if (pendingAnim !== undefined) { const a = pendingAnim; pendingAnim = undefined; update(a); }
  }

  /* ───────────── boot & messaging ───────────── */
  function boot() {
    chrome.storage.local.get(['settings', 'sites', 'palettes'], (r) => {
      S = merge(r.settings); SITES = r.sites || {}; PALS = r.palettes || {};
      if (!doc.hidden) update(false);
      else { doc.addEventListener('visibilitychange', function once() { if (!doc.hidden) { doc.removeEventListener('visibilitychange', once); update(false); } }); }
      scheduleTimer();
    });
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.settings) S = merge(ch.settings.newValue);
    if (ch.sites) SITES = ch.sites.newValue || {};
    if (ch.palettes) PALS = ch.palettes.newValue || {};
    if (ch.settings || ch.sites || ch.palettes) { update(true); scheduleTimer(); }
  });
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.auto === 'system') update(true); }); } catch (e) { /* ignore */ }

  let timer = 0;
  function scheduleTimer() {
    clearTimeout(timer);
    if (!IS_TOP && S.auto !== 'schedule' && !S.night.auto) return;
    if (S.auto === 'schedule' || S.night.auto) timer = setTimeout(() => { update(true); scheduleTimer(); }, 60000 - (Date.now() % 60000) + 50);
  }

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg) return;
    if (msg.type === 'GET_STATUS') {
      if (!IS_TOP) return;
      send({ host: location.hostname, active: !!(view && view.dark && !skipped), skipped: skipped, mode: view ? view.mode : 'smart', night: !!(view && view.night), rules: rules.size, fixes: view ? view.fixes.length : 0 });
    }
  });

  /* ───────────── element picker ("Fix this element") ───────────── */
  let picker = null;
  function cssPath(el) {
    const esc = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v);
    const uniq = (sel) => { try { return doc.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
    if (el.id && !/\d{4,}/.test(el.id) && uniq('#' + esc(el.id))) return '#' + esc(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== doc.body && parts.length < 6) {
      let part = cur.tagName.toLowerCase();
      const cls = [...cur.classList].filter((c) => c.length < 30 && !/\d{3,}|^(css|sc|jsx|_)-?/i.test(c)).slice(0, 2);
      if (cls.length) part += cls.map((c) => '.' + esc(c)).join('');
      const sib = cur.parentElement && [...cur.parentElement.children].filter((x) => x.tagName === cur.tagName);
      if (sib && sib.length > 1 && !(cls.length && uniq(part))) part += ':nth-of-type(' + (sib.indexOf(cur) + 1) + ')';
      parts.unshift(part);
      if (cur.id && !/\d{4,}/.test(cur.id)) { parts[0] = '#' + esc(cur.id); break; }
      if (uniq(parts.join(' > '))) break;
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }
  function stopPicker() {
    if (!picker) return;
    picker.cleanup(); picker = null;
  }
  function startPicker() {
    if (!IS_TOP || picker) return;
    const host = doc.createElement('inky-ui');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const sr = host.attachShadow({ mode: 'closed' });
    sr.innerHTML = '<style>' +
      '*{box-sizing:border-box;font:13px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}' +
      '.box{position:fixed;border-radius:6px;background:rgba(10,132,255,.16);outline:2px solid #0a84ff;pointer-events:none;transition:all .08s ease;display:none}' +
      '.tip{position:fixed;left:50%;top:14px;transform:translateX(-50%);background:rgba(28,28,30,.92);color:#f5f5f7;padding:8px 14px;border-radius:99px;backdrop-filter:blur(20px);box-shadow:0 8px 30px rgba(0,0,0,.3)}' +
      '.menu{position:fixed;background:rgba(28,28,30,.94);color:#f5f5f7;border-radius:14px;padding:6px;display:none;pointer-events:auto;backdrop-filter:blur(20px);box-shadow:0 12px 40px rgba(0,0,0,.4);min-width:210px}' +
      '.menu b{display:block;padding:6px 10px 2px;font-weight:600}.menu small{display:block;padding:0 10px 6px;color:#98989d;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.menu button{display:block;width:100%;text-align:left;background:none;border:0;color:inherit;padding:8px 10px;border-radius:8px;cursor:pointer}' +
      '.menu button:hover{background:rgba(255,255,255,.12)}.menu .p{color:#64d2ff}' +
      '</style><div class="box"></div><div class="tip">Click the element that looks wrong · Esc to cancel</div>' +
      '<div class="menu"><b>Fix this element</b><small></small><button data-a="ignore">Keep original colours</button><button data-a="invert">Invert colours</button><button class="p" data-a="parent">Select parent ↑</button><button data-a="cancel">Cancel</button></div>';
    (doc.body || root).appendChild(host);
    const box = sr.querySelector('.box'), menu = sr.querySelector('.menu'), tip = sr.querySelector('.tip');
    let target = null, locked = false;
    const place = (el) => {
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const pick = (x, y) => { host.style.display = 'none'; const el = doc.elementFromPoint(x, y); host.style.display = ''; return el && el !== root && el !== doc.body ? el : null; };
    const onMove = (e) => { if (locked) return; const el = pick(e.clientX, e.clientY); if (el) { target = el; place(el); } };
    const showMenu = (e) => {
      locked = true; tip.style.display = 'none';
      sr.querySelector('small').textContent = cssPath(target);
      menu.style.display = 'block';
      menu.style.left = Math.min(e.clientX, innerWidth - 240) + 'px';
      menu.style.top = Math.min(e.clientY + 12, innerHeight - 190) + 'px';
    };
    const swallow = (e) => { if (!e.composedPath().includes(host)) { e.preventDefault(); e.stopPropagation(); } };
    const onClick = (e) => { if (e.composedPath().includes(host)) return; swallow(e); if (!locked) { target = pick(e.clientX, e.clientY) || target; if (target) { place(target); showMenu(e); } } };
    const onKey = (e) => { if (e.key === 'Escape') stopPicker(); };
    menu.addEventListener('click', (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (!a) return;
      if (a === 'cancel') return stopPicker();
      if (a === 'parent') { if (target.parentElement && target.parentElement !== doc.body) { target = target.parentElement; place(target); sr.querySelector('small').textContent = cssPath(target); } return; }
      const fix = { sel: cssPath(target), action: a };
      const key = (() => { const parts = location.hostname.split('.'); for (let i = 0; i <= parts.length - 2; i++) { const k = parts.slice(i).join('.'); if (SITES[k]) return k; } return location.hostname.replace(/^www\./, ''); })();
      const sites = Object.assign({}, SITES);
      const rule = Object.assign({}, sites[key] || {});
      rule.fixes = (rule.fixes || []).filter((f) => f.sel !== fix.sel).concat(fix).slice(-40);
      sites[key] = rule;
      chrome.storage.local.set({ sites });
      stopPicker();
    });
    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('mousedown', swallow, true);
    doc.addEventListener('mouseup', swallow, true);
    doc.addEventListener('keydown', onKey, true);
    picker = { cleanup() {
      doc.removeEventListener('mousemove', onMove, true); doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('mousedown', swallow, true); doc.removeEventListener('mouseup', swallow, true);
      doc.removeEventListener('keydown', onKey, true); host.remove();
    } };
  }
  chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'PICK') startPicker(); });

  boot();
})();
