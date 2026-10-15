/* Inky colour science. Classic script -> globalThis.InkyColor.
 * OKLab based so that lightness remapping looks perceptually even.
 * Every function is O(1); the engine memoises results per distinct colour. */
(function (g) {
  'use strict';
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function rgbToOklab(r, gg, b) {
    const lr = toLin(r), lg = toLin(gg), lb = toLin(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return {
      L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    };
  }

  function oklabToLin(L, a, b) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ];
  }

  /** OKLab -> sRGB (0..255). Out-of-gamut chroma is scaled down, never hue-shifted. */
  function oklabToRgb(L, a, b) {
    let k = 1;
    for (let i = 0; i < 12; i++) {
      const lin = oklabToLin(L, a * k, b * k);
      if (lin[0] >= -0.0005 && lin[0] <= 1.0005 && lin[1] >= -0.0005 && lin[1] <= 1.0005 && lin[2] >= -0.0005 && lin[2] <= 1.0005) {
        return lin.map((v) => clamp(toSrgb(clamp(v, 0, 1)), 0, 255));
      }
      k *= 0.8;
    }
    const lin = oklabToLin(L, 0, 0);
    return lin.map((v) => clamp(toSrgb(clamp(v, 0, 1)), 0, 255));
  }

  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (h.length !== 6 || Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, gg, b) {
    const t = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
    return '#' + t(r) + t(gg) + t(b);
  }
  function hexToOklab(hex) { const c = hexToRgb(hex); return rgbToOklab(c.r, c.g, c.b); }

  const RGB_RE = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;
  const SRGB_RE = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/;
  function alphaOf(s) { if (s === undefined) return 1; return s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s); }

  /** Parses a *computed* CSS colour (rgb/rgba/color(srgb)). Returns null for anything else. */
  function parseCssColor(s) {
    if (!s || s === 'transparent') return null;
    let m = RGB_RE.exec(s);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: alphaOf(m[4]) };
    m = SRGB_RE.exec(s);
    if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: alphaOf(m[4]) };
    return null;
  }

  /** Stable short key for a colour, usable inside an attribute selector. */
  function colorKey(c) {
    const r = Math.round(c.r), gg = Math.round(c.g), b = Math.round(c.b);
    return r + ' ' + gg + ' ' + b + (c.a < 0.995 ? '/' + Math.round(c.a * 100) / 100 : '');
  }
  function cssOf(o) {
    return 'rgb(' + Math.round(o.r) + ' ' + Math.round(o.g) + ' ' + Math.round(o.b) + (o.a < 0.995 ? ' / ' + Math.round(o.a * 100) / 100 : '') + ')';
  }

  /**
   * Builds the colour mapper for one palette.
   *  bg(c) : light background  -> dark surface (null = leave as is)
   *  fg(c) : dark text / glyph -> light          (null = leave as is)
   *  bd(c) : light border      -> subtle dark line
   * Lightness is remapped continuously so greys keep their relative order;
   * chromatic colours keep their hue, near-neutrals pick up the palette tint.
   */
  function makeMapper(pal) {
    const bgT = hexToOklab(pal.bg), fgT = hexToOklab(pal.fg);
    const lo = Math.min(bgT.L, 0.42);
    const hi = Math.max(fgT.L, 0.72);
    const out = (L, a, b, alpha) => {
      const rgb = oklabToRgb(L, a, b);
      return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha, L: L };
    };
    return {
      lo: lo, hi: hi,
      bg: function (c) {
        const o = rgbToOklab(c.r, c.g, c.b);
        if (o.L <= 0.5) return null;
        const t = clamp((1 - o.L) / 0.5, 0, 1);
        const L = lo + Math.pow(t, 0.6) * (0.5 - lo);
        const w = clamp(Math.hypot(o.a, o.b) / 0.05, 0, 1);
        let a = o.a * 0.9 * w + bgT.a * (1 - w), b = o.b * 0.9 * w + bgT.b * (1 - w);
        const m = Math.hypot(a, b);
        if (m > 0.14) { a *= 0.14 / m; b *= 0.14 / m; }
        return out(L, a, b, c.a);
      },
      fg: function (c) {
        const o = rgbToOklab(c.r, c.g, c.b);
        if (o.L >= 0.62) return null;
        const u = o.L / 0.62;
        const L = hi - Math.pow(u, 1.4) * (hi - 0.62);
        const w = clamp(Math.hypot(o.a, o.b) / 0.04, 0, 1);
        return out(L, o.a * w + fgT.a * (1 - w), o.b * w + fgT.b * (1 - w), c.a);
      },
      bd: function (c) {
        const o = rgbToOklab(c.r, c.g, c.b);
        if (o.L <= 0.6) return null;
        const L = Math.min(lo + 0.05 + (1 - o.L) * 0.25, 0.5);
        const w = clamp(Math.hypot(o.a, o.b) / 0.03, 0, 1);
        return out(L, o.a * 0.8 * w + bgT.a * (1 - w), o.b * 0.8 * w + bgT.b * (1 - w), c.a);
      }
    };
  }

  /** CSS contrast() amount that lifts inverted black to the palette background (filter mode). */
  function filterContrast(pal) {
    const c = hexToRgb(pal.bg);
    const v = (c.r + c.g + c.b) / 3 / 255;
    return clamp(1 - 2 * v, 0.6, 1);
  }

  /** Tanner Helland colour-temperature approximation -> multiplier rgb (0..255). */
  function kelvinToRgb(k) {
    const t = clamp(k, 1000, 40000) / 100;
    const r = t <= 66 ? 255 : clamp(329.698727446 * Math.pow(t - 60, -0.1332047592), 0, 255);
    const gg = t <= 66 ? clamp(99.4708025861 * Math.log(t) - 161.1195681661, 0, 255) : clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492), 0, 255);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307, 0, 255);
    return [r, gg, b];
  }
  /** warmth 0..100 -> multiplier colour; 0 = neutral white. */
  function warmthToRgb(w) { return kelvinToRgb(6500 - clamp(w, 0, 100) * 38); }

  /** One accent colour -> complete palette (used by "Generate" in the editor). */
  function paletteFromAccent(accentHex) {
    const o = hexToOklab(accentHex);
    const h = Math.atan2(o.b, o.a);
    const mk = (L, C) => { const rgb = oklabToRgb(L, Math.cos(h) * C, Math.sin(h) * C); return rgbToHex(rgb[0], rgb[1], rgb[2]); };
    return { bg: mk(0.2, 0.018), fg: mk(0.95, 0.01), accent: accentHex, link: mk(0.78, Math.min(Math.hypot(o.a, o.b), 0.14)) };
  }

  /** Is a rasterised 24x24 RGBA icon a dark glyph (or dark ink on white) that vanishes on dark pages? */
  function classifyPixels(d) {
    const n = d.length / 4;
    let tr = 0, op = 0, sumL = 0, light = 0, dark = 0, chroma = 0;
    const buckets = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 40) { tr++; continue; }
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const L = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
      op++; sumL += L; chroma += Math.max(r, gg, b) - Math.min(r, gg, b);
      if (L > 0.85) light++;
      if (L < 0.3) dark++;
      buckets.add(((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4));
    }
    if (op < n * 0.04) return false;
    if (buckets.size > 90) return false; // photograph
    const trF = tr / n, avgL = sumL / op;
    if (trF > 0.12 && avgL < 0.4) return true; // dark glyph on transparency
    if (trF <= 0.12 && light / op > 0.55 && dark / op > 0.03 && chroma / op / 255 < 0.25) return true; // dark ink on white
    return false;
  }

  /** Same question for SVG source text. */
  function classifySvg(text) {
    const t = String(text || '').slice(0, 20000);
    const cols = [];
    const re = /(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-zA-Z]+)/g;
    let m;
    while ((m = re.exec(t))) {
      const v = m[1].toLowerCase();
      if (v === 'none' || v === 'transparent' || v === 'url') continue;
      if (v === 'currentcolor') { cols.push(0); continue; }
      if (v === 'black') { cols.push(0); continue; }
      if (v === 'white') { cols.push(1); continue; }
      if (v[0] === '#') { const c = hexToRgb(v.length === 4 || v.length === 7 ? v : v.slice(0, 7)); cols.push((0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255); continue; }
      const p = parseCssColor(v);
      if (p) cols.push((0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255);
    }
    if (!cols.length) return !/<image|<linearGradient|<radialGradient/i.test(t); // default fill is black
    return cols.reduce((a, b) => a + b, 0) / cols.length < 0.4;
  }

  g.InkyColor = g.LumoColor = {
    rgbToOklab, oklabToRgb, hexToRgb, rgbToHex, hexToOklab, parseCssColor, colorKey, cssOf,
    makeMapper, filterContrast, kelvinToRgb, warmthToRgb, paletteFromAccent, classifyPixels, classifySvg
  };
})(globalThis);
