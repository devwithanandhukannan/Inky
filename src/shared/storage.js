/**
 * Storage layer. Everything lives in chrome.storage.local (no sync quotas, so
 * sliders can write freely). Falls back to memory in Node tests.
 *
 *   settings : { ...DEFAULT_SETTINGS }
 *   sites    : { "example.com": { mode?: 'smart'|'filter'|'off', force?: true, night?: false, palette?: id } }
 *   palettes : { [id]: { id, name, bg, fg, accent, link } }   (custom only)
 */
import './palettes.js';

const BUILTIN = globalThis.InkyPalettes || globalThis.LumoPalettes;

export const DEFAULT_SETTINGS = {
  enabled: true,
  palette: 'graphite',
  auto: 'always', // 'always' | 'system' | 'schedule'
  schedule: { from: '19:00', to: '07:00' },
  animation: 'circle', // 'circle' | 'fade' | 'none'
  smartImages: true,
  skipDark: true,
  imageDim: 8,
  brightness: 100,
  contrast: 100,
  night: { on: false, warmth: 45, dim: 0, auto: false, from: '21:00', to: '06:00' }
};

const mem = {};
const hasChrome = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function read(key) {
  if (hasChrome()) return (await chrome.storage.local.get(key))[key];
  return mem[key];
}
export async function write(key, value) {
  if (hasChrome()) return chrome.storage.local.set({ [key]: value });
  mem[key] = value;
}
export function resetMemory() { for (const k of Object.keys(mem)) delete mem[k]; }

function mergeSettings(s = {}) {
  return {
    ...DEFAULT_SETTINGS, ...s,
    schedule: { ...DEFAULT_SETTINGS.schedule, ...s.schedule },
    night: { ...DEFAULT_SETTINGS.night, ...s.night }
  };
}

export async function getSettings() { return mergeSettings(await read('settings')); }
export async function updateSettings(patch) {
  const cur = await getSettings();
  const next = mergeSettings({
    ...cur, ...patch,
    schedule: { ...cur.schedule, ...patch.schedule },
    night: { ...cur.night, ...patch.night }
  });
  await write('settings', next);
  return next;
}

export async function getSites() { return (await read('sites')) || {}; }
/** patch = object to merge, or null to delete the rule. Empty rules are dropped. */
export async function setSite(host, patch) {
  const sites = await getSites();
  if (patch === null) delete sites[host];
  else {
    const next = { ...(sites[host] || {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null) delete next[k];
    if (Object.keys(next).length) sites[host] = next; else delete sites[host];
  }
  await write('sites', sites);
  return sites;
}

export async function getCustomPalettes() { return (await read('palettes')) || {}; }
export async function getAllPalettes() { return [...BUILTIN.list, ...Object.values(await getCustomPalettes())]; }
export async function getPalette(id) { return BUILTIN.get(id) || (await getCustomPalettes())[id] || BUILTIN.get(BUILTIN.DEFAULT_ID); }

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export function validatePalette(p) {
  if (!p || typeof p !== 'object') return { valid: false, error: 'Palette must be an object' };
  if (!p.name || typeof p.name !== 'string' || !p.name.trim()) return { valid: false, error: 'Palette name is required' };
  if (p.name.length > 40) return { valid: false, error: 'Palette name must be 40 characters or fewer' };
  for (const f of ['bg', 'fg', 'accent', 'link']) {
    if (!HEX.test(p[f] || '')) return { valid: false, error: `Invalid hex colour for "${f}": ${p[f]}` };
  }
  return { valid: true };
}

export async function saveCustomPalette(p) {
  const v = validatePalette(p);
  if (!v.valid) throw new Error(v.error);
  const all = await getCustomPalettes();
  const id = p.id && all[p.id] ? p.id : `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const clean = {
    id, name: p.name.trim(), builtin: false, v: 2,
    bg: p.bg.toLowerCase(), fg: p.fg.toLowerCase(), accent: p.accent.toLowerCase(), link: p.link.toLowerCase()
  };
  all[id] = clean;
  await write('palettes', all);
  return clean;
}

export async function deleteCustomPalette(id) {
  if (BUILTIN.get(id)) throw new Error('Built-in palettes cannot be deleted');
  const all = await getCustomPalettes();
  if (!all[id]) return false;
  delete all[id];
  await write('palettes', all);
  const s = await getSettings();
  if (s.palette === id) await updateSettings({ palette: BUILTIN.DEFAULT_ID });
  const sites = await getSites();
  let touched = false;
  for (const h of Object.keys(sites)) if (sites[h].palette === id) { delete sites[h].palette; touched = true; }
  if (touched) await write('sites', sites);
  return true;
}

export async function exportPalettesJson() { return JSON.stringify(Object.values(await getCustomPalettes()), null, 2); }

export async function importPalettesJson(text) {
  let items;
  try { items = JSON.parse(text); } catch (e) { return { imported: 0, errors: ['Invalid JSON: ' + e.message] }; }
  if (!Array.isArray(items)) return { imported: 0, errors: ['Expected an array of palettes'] };
  const errors = []; let imported = 0;
  for (const [i, it] of items.entries()) {
    const v = validatePalette(it);
    if (!v.valid) { errors.push(`Item ${i + 1}: ${v.error}`); continue; }
    await saveCustomPalette({ ...it, id: undefined });
    imported++;
  }
  return { imported, errors };
}
