import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../src/shared/palettes.js';
import '../src/shared/color.js';
import { normalizeHost, getHostCandidates, resolve } from '../src/shared/match.js';
import { checkContrast } from '../src/shared/derive.js';
import * as store from '../src/shared/storage.js';

const C = globalThis.InkyColor || globalThis.LumoColor;
const P = globalThis.InkyPalettes || globalThis.LumoPalettes;

describe('palettes', () => {
  it('ships 3 primary cards + extras, graphite default', () => {
    assert.equal(P.list.filter((p) => p.primary).length, 3);
    assert.equal(P.DEFAULT_ID, 'graphite');
    assert.ok(P.list.length >= 6);
  });
  it('every built-in has AAA text contrast', () => {
    for (const p of P.list) assert.ok(checkContrast(p.fg, p.bg).passesAAA, p.id);
  });
});

describe('colour mapper', () => {
  const m = C.makeMapper(P.get('graphite'));
  it('maps white to the palette background exactly', () => {
    const o = m.bg({ r: 255, g: 255, b: 255, a: 1 });
    assert.ok(Math.abs(o.r - 28) <= 1 && Math.abs(o.g - 28) <= 1 && Math.abs(o.b - 30) <= 1, JSON.stringify(o));
  });
  it('keeps greys ordered (lighter source -> lighter surface is NOT required; order must be monotonic)', () => {
    const L = [255, 245, 224, 200, 160].map((v) => m.bg({ r: v, g: v, b: v, a: 1 }).L);
    for (let i = 1; i < L.length; i++) assert.ok(L[i] >= L[i - 1] - 1e-9);
  });
  it('leaves dark backgrounds alone', () => assert.equal(m.bg({ r: 20, g: 20, b: 20, a: 1 }), null));
  it('lightens dark text, leaves light text', () => {
    assert.ok(m.fg({ r: 0, g: 0, b: 0, a: 1 }).L > 0.9);
    assert.equal(m.fg({ r: 255, g: 255, b: 255, a: 1 }), null);
  });
  it('keeps hue of links', () => {
    const o = m.fg({ r: 6, g: 69, b: 173, a: 1 });
    assert.ok(o.b > o.r && o.b > 150);
  });
  it('preserves alpha', () => assert.equal(m.bg({ r: 255, g: 255, b: 255, a: 0.5 }).a, 0.5));
  it('tints neutrals with the palette hue (midnight is bluish)', () => {
    const o = C.makeMapper(P.get('midnight')).bg({ r: 255, g: 255, b: 255, a: 1 });
    assert.ok(o.b > o.r);
  });
});

describe('colour parsing', () => {
  it('parses rgb/rgba/space syntax/color(srgb)', () => {
    assert.deepEqual(C.parseCssColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
    assert.equal(C.parseCssColor('rgba(1, 2, 3, 0.5)').a, 0.5);
    assert.equal(C.parseCssColor('rgb(1 2 3 / 50%)').a, 0.5);
    assert.equal(Math.round(C.parseCssColor('color(srgb 1 0 0)').r), 255);
    assert.equal(C.parseCssColor('transparent'), null);
    assert.equal(C.parseCssColor('oklch(0.5 0.1 20)'), null);
  });
});

describe('icon classification', () => {
  const px = (fn) => { const d = new Uint8ClampedArray(24 * 24 * 4); for (let i = 0; i < 576; i++) d.set(fn(i), i * 4); return d; };
  it('dark glyph on transparency -> needs lightening', () => assert.equal(C.classifyPixels(px((i) => (i % 5 === 0 ? [20, 20, 20, 255] : [0, 0, 0, 0]))), true));
  it('white icon on transparency -> untouched', () => assert.equal(C.classifyPixels(px((i) => (i % 5 === 0 ? [255, 255, 255, 255] : [0, 0, 0, 0]))), false));
  it('photo-like noise -> untouched', () => assert.equal(C.classifyPixels(px((i) => [i % 256, (i * 7) % 256, (i * 13) % 256, 255])), false));
  it('dark ink on white -> lightened', () => assert.equal(C.classifyPixels(px((i) => (i % 12 === 0 ? [10, 10, 10, 255] : [255, 255, 255, 255]))), true));
  it('svg: default/black fill is dark, white is not', () => {
    assert.equal(C.classifySvg('<svg><path d="M0 0"/></svg>'), true);
    assert.equal(C.classifySvg('<svg><path fill="#fff"/></svg>'), false);
    assert.equal(C.classifySvg('<svg><path fill="#222"/></svg>'), true);
  });
});

describe('night light', () => {
  it('warmth 0 is neutral, 100 is warm', () => {
    const a = C.warmthToRgb(0), b = C.warmthToRgb(100);
    assert.ok(a.every((v) => v > 250));
    assert.ok(b[2] < 120 && b[0] === 255);
  });
});

describe('palette generation', () => {
  it('generates a dark, readable palette from an accent', () => {
    const p = C.paletteFromAccent('#ff375f');
    assert.ok(checkContrast(p.fg, p.bg).passesAAA);
    assert.ok(C.hexToOklab(p.bg).L < 0.3);
  });
});

describe('host matching', () => {
  it('normalises and walks parents', () => {
    assert.equal(normalizeHost('https://a.b.com:8080/x?y'), 'a.b.com');
    assert.deepEqual(getHostCandidates('a.b.example.com'), ['a.b.example.com', 'b.example.com', 'example.com']);
    assert.equal(resolve('m.site.com', { 'site.com': false }, true), false);
  });
});

describe('storage', () => {
  beforeEach(() => store.resetMemory());
  it('defaults and deep-merges night settings', async () => {
    assert.equal((await store.getSettings()).palette, 'graphite');
    await store.updateSettings({ night: { on: true } });
    const s = await store.getSettings();
    assert.equal(s.night.on, true); assert.equal(s.night.warmth, 45);
  });
  it('site rules merge and clear', async () => {
    await store.setSite('a.com', { mode: 'filter' });
    await store.setSite('a.com', { force: true });
    assert.deepEqual((await store.getSites())['a.com'], { mode: 'filter', force: true });
    await store.setSite('a.com', { mode: undefined, force: undefined });
    assert.equal((await store.getSites())['a.com'], undefined);
  });
  it('custom palette lifecycle + validation', async () => {
    await assert.rejects(store.saveCustomPalette({ name: 'x', bg: 'red', fg: '#fff', accent: '#fff', link: '#fff' }));
    const p = await store.saveCustomPalette({ name: 'Mine', bg: '#101010', fg: '#EEEEEE', accent: '#ff0000', link: '#ff8888' });
    await store.updateSettings({ palette: p.id });
    assert.equal((await store.getAllPalettes()).length, P.list.length + 1);
    await store.deleteCustomPalette(p.id);
    assert.equal((await store.getSettings()).palette, 'graphite');
    await assert.rejects(store.deleteCustomPalette('graphite'));
  });
  it('import/export roundtrip', async () => {
    await store.saveCustomPalette({ name: 'A', bg: '#111111', fg: '#ffffff', accent: '#00ff00', link: '#88ff88' });
    const json = await store.exportPalettesJson();
    store.resetMemory();
    const r = await store.importPalettesJson(json);
    assert.equal(r.imported, 1);
    assert.equal((await store.importPalettesJson('nope')).imported, 0);
  });
});
