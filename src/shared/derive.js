/**
 * Color derivation and WCAG contrast calculations.
 * Pure functions: constant time O(1), zero dependencies.
 */

/**
 * Parses a hex string (#rgb or #rrggbb) to {r, g, b}.
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}}
 */
export function hexToRgb(hex) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num) || clean.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Converts {r, g, b} (0-255) to hex #rrggbb.
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {string}
 */
export function rgbToHex({ r, g, b }) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = v => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts RGB (0-255) to HSL ({h: 0-360, s: 0-100, l: 0-100}).
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {{h: number, s: number, l: number}}
 */
export function rgbToHsl({ r, g, b }) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Converts HSL to RGB.
 * @param {{h: number, s: number, l: number}} hsl
 * @returns {{r: number, g: number, b: number}}
 */
export function hslToRgb({ h, s, l }) {
  const hNorm = (h % 360 + 360) % 360 / 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  if (sNorm === 0) {
    const val = Math.round(lNorm * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p, q, t) => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255)
  };
}

/**
 * Lightens a hex color by a specified percentage points of lightness in HSL.
 * @param {string} hex
 * @param {number} amountPercentage (e.g. 4 for +4%)
 * @returns {string}
 */
export function lighten(hex, amountPercentage) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  const newL = Math.min(100, hsl.l + amountPercentage);
  return rgbToHex(hslToRgb({ ...hsl, l: newL }));
}

/**
 * Mixes color1 toward color2 by a given weight (0 to 1).
 * Weight = 0 means 100% color1, weight = 1 means 100% color2.
 * @param {string} hex1
 * @param {string} hex2
 * @param {number} weight
 * @returns {string}
 */
export function mix(hex1, hex2, weight) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex({
    r: Math.round(c1.r * (1 - w) + c2.r * w),
    g: Math.round(c1.g * (1 - w) + c2.g * w),
    b: Math.round(c1.b * (1 - w) + c2.b * w)
  });
}

/**
 * Returns an rgba() string from a hex color and alpha (0 to 1).
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
export function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Calculates WCAG relative luminance of a color.
 * @param {string} hex
 * @returns {number} Luminance between 0 and 1
 */
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [sR, sG, sB] = [r, g, b].map(val => {
    const c = val / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

/**
 * Calculates WCAG contrast ratio between two colors (e.g. fg and bg).
 * Returns a value between 1 and 21.
 * @param {string} hex1
 * @param {string} hex2
 * @returns {number}
 */
export function contrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(hex1);
  const lum2 = relativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Number(ratio.toFixed(2));
}

/**
 * Evaluates contrast against WCAG AA and AAA thresholds.
 * @param {string} fg
 * @param {string} bg
 * @returns {{ratio: number, passesAA: boolean, passesAAA: boolean, passesLarge: boolean}}
 */
export function checkContrast(fg, bg) {
  const ratio = contrastRatio(fg, bg);
  return {
    ratio,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7.0,
    passesLarge: ratio >= 3.0
  };
}

/**
 * Derives the complete token set from the 4 base colors of a palette.
 * Constant size output O(1).
 * @param {{bg: string, fg: string, accent: string, link: string}} palette
 * @returns {Record<string, string>}
 */
export function deriveTokens(palette) {
  const bg = palette.bg;
  const fg = palette.fg;
  const accent = palette.accent;
  const link = palette.link;

  const bgElev1 = lighten(bg, 4);
  const bgElev2 = lighten(bg, 8);
  const bgElev3 = lighten(bg, 12);
  const fgMuted = mix(fg, bg, 0.35);
  const border = rgba(fg, 0.14);
  const selection = rgba(accent, 0.35);

  return {
    '--dte-bg': bg,
    '--dte-fg': fg,
    '--dte-accent': accent,
    '--dte-link': link,
    '--dte-bg-elev-1': bgElev1,
    '--dte-bg-elev-2': bgElev2,
    '--dte-bg-elev-3': bgElev3,
    '--dte-fg-muted': fgMuted,
    '--dte-border': border,
    '--dte-selection': selection,
    '--dte-scrollbar-track': bgElev1,
    '--dte-scrollbar-thumb': bgElev3,
    '--dte-scrollbar-thumb-hover': accent
  };
}
