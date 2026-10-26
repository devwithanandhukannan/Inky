import {
  getSettings, updateSettings, getSites, setSite, getAllPalettes, saveCustomPalette, deleteCustomPalette,
  exportPalettesJson, importPalettesJson, validatePalette
} from '../shared/storage.js';
import { checkContrast } from './../shared/derive.js';
import '../shared/color.js';
import '../shared/custom-designs.js';

const D = globalThis.InkyCustomDesigns;
const LC = globalThis.InkyColor || globalThis.LumoColor;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let S, palettes = [], editing = null;

async function refresh() {
  S = await getSettings(); palettes = await getAllPalettes();
  renderPalettes(); renderCustomDesigns(); renderSettings(); await renderSites();
}

/* ── palettes ── */
function renderPalettes() {
  const g = $('palGrid'); g.textContent = '';
  const isOff = S.enabled === false;
  for (const p of palettes) {
    const d = document.createElement('div');
    d.className = 'pal' + (!isOff && p.id === S.palette ? ' sel' : '');
    d.innerHTML = `<div class="pv" style="background:${p.bg}"><div><div class="ln" style="background:${p.fg}"></div><div class="ln s" style="background:${p.fg}"></div></div><div class="pl" style="background:${p.accent}"></div></div>
      <div class="meta"><span>${esc(p.name)}</span><span class="tools">${p.builtin ? '' : '<button data-a="edit">Edit</button><button data-a="del" class="del">Delete</button>'}</span></div>`;
    d.onclick = async (e) => {
      const a = e.target.dataset.a;
      if (a === 'edit') return openEditor(p);
      if (a === 'del') { await deleteCustomPalette(p.id); return refresh(); }
      S = await updateSettings({ palette: p.id }); renderPalettes();
    };
    g.append(d);
  }
}

const FIELDS = [['bg', 'Background', 'Page surface'], ['fg', 'Text', 'Main text'], ['accent', 'Accent', 'Buttons, selection'], ['link', 'Link', 'Hyperlinks']];
let draft = null;

function openEditor(p) {
  editing = p && !p.builtin ? p.id : null;
  draft = p ? { name: p.builtin ? p.name + ' copy' : p.name, bg: p.bg, fg: p.fg, accent: p.accent, link: p.link }
    : { name: '', bg: '#161618', fg: '#f2f2f7', accent: '#bf5af2', link: '#d28cf5' };
  $('editor').hidden = false;
  $('edName').value = draft.name;
  const c = $('edColors'); c.textContent = '';
  for (const [k, label, hint] of FIELDS) {
    const w = document.createElement('label'); w.className = 'cp';
    w.innerHTML = `<input type="color" data-k="${k}"><div><b>${label}</b><small data-h="${k}"></small></div>`;
    c.append(w);
  }
  c.querySelectorAll('input').forEach((i) => { i.oninput = () => { draft[i.dataset.k] = i.value; paint(); }; });
  paint();
  $('editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function paint() {
  for (const [k] of FIELDS) {
    document.querySelector(`#edColors input[data-k=${k}]`).value = draft[k];
    document.querySelector(`[data-h=${k}]`).textContent = draft[k].toUpperCase();
  }
  const pv = $('edPreview');
  pv.style.background = draft.bg; pv.style.color = draft.fg;
  pv.querySelector('a').style.color = draft.link;
  pv.querySelector('.pv-card').style.background = LC.rgbToHex(...(() => { const o = LC.hexToOklab(draft.bg); const r = LC.oklabToRgb(Math.min(o.L + 0.06, 1), o.a, o.b); return r; })());
  pv.querySelector('.pv-btn').style.background = draft.accent;
  const t = checkContrast(draft.fg, draft.bg), l = checkContrast(draft.link, draft.bg);
  const badge = (name, r) => `<span class="badge ${r.passesAAA ? 'ok' : r.passesAA ? 'ok' : 'bad'}">${name} ${r.ratio}:1 · ${r.passesAAA ? 'AAA' : r.passesAA ? 'AA' : 'Low'}</span>`;
  $('edContrast').innerHTML = badge('Text', t) + badge('Link', l);
  const lum = LC.hexToOklab(draft.bg).L;
  $('edErr').textContent = lum > 0.5 ? 'Inky themes are dark — very light backgrounds are capped automatically.' : '';
}

$('newPal').onclick = () => openEditor(null);
$('edName').oninput = (e) => { draft.name = e.target.value; };
$('edGen').onclick = () => { Object.assign(draft, LC.paletteFromAccent(draft.accent)); paint(); };
$('edRand').onclick = () => {
  const h = Math.random() * Math.PI * 2, o = LC.oklabToRgb(0.72, Math.cos(h) * 0.14, Math.sin(h) * 0.14);
  draft.accent = LC.rgbToHex(...o); Object.assign(draft, LC.paletteFromAccent(draft.accent)); paint();
};
$('edCancel').onclick = () => { $('editor').hidden = true; };
$('edSave').onclick = async () => {
  const v = validatePalette(draft);
  if (!v.valid) { $('edErr').textContent = v.error; return; }
  const saved = await saveCustomPalette({ ...draft, id: editing || undefined });
  await updateSettings({ palette: saved.id });
  $('editor').hidden = true; refresh();
};
$('exportBtn').onclick = async () => {
  const blob = new Blob([await exportPalettesJson()], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'inky-palettes.json'; a.click();
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = await importPalettesJson(await f.text());
  $('palMsg').textContent = `Imported ${r.imported} palette${r.imported === 1 ? '' : 's'}.` + (r.errors.length ? ' ' + r.errors[0] : '');
  e.target.value = ''; refresh();
};

/* ── settings ── */
function bindSwitch(id, get, set) { const el = $(id); el.checked = get(); el.onchange = async () => { S = await updateSettings(set(el.checked)); renderSettings(); }; }
function bindRange(id, outId, get, set) {
  const el = $(id); const out = $(outId);
  if (document.activeElement !== el) el.value = get();
  out.textContent = get() + '%';
  el.oninput = () => { out.textContent = el.value + '%'; clearTimeout(el._t); el._t = setTimeout(async () => { S = await updateSettings(set(+el.value)); }, 40); };
}
function bindSelect(id, get, set) { const el = $(id); el.value = get(); el.onchange = async () => { S = await updateSettings(set(el.value)); renderSettings(); }; }
function bindTime(id, get, set) { const el = $(id); el.value = get(); el.onchange = async () => { S = await updateSettings(set(el.value)); }; }

function renderSettings() {
  bindSwitch('nOn', () => S.night.on, (v) => ({ night: { on: v } }));
  bindRange('nWarmth', 'nWarmthO', () => S.night.warmth, (v) => ({ night: { warmth: v } }));
  bindRange('nDim', 'nDimO', () => S.night.dim, (v) => ({ night: { dim: v } }));
  bindSwitch('nAuto', () => S.night.auto, (v) => ({ night: { auto: v } }));
  $('nTimes').hidden = !S.night.auto;
  bindTime('nFrom', () => S.night.from, (v) => ({ night: { from: v } }));
  bindTime('nTo', () => S.night.to, (v) => ({ night: { to: v } }));

  bindSwitch('bEnabled', () => S.enabled, (v) => ({ enabled: v }));
  bindSelect('bAuto', () => S.auto, (v) => ({ auto: v }));
  $('bTimes').hidden = S.auto !== 'schedule';
  bindTime('bFrom', () => S.schedule.from, (v) => ({ schedule: { from: v } }));
  bindTime('bTo', () => S.schedule.to, (v) => ({ schedule: { to: v } }));
  bindSwitch('bImages', () => S.smartImages, (v) => ({ smartImages: v }));
  bindSwitch('bSkip', () => S.skipDark, (v) => ({ skipDark: v }));
  bindSelect('bAnim', () => S.animation, (v) => ({ animation: v }));
  bindRange('bDim', 'bDimO', () => S.imageDim, (v) => ({ imageDim: v }));
  bindRange('bBri', 'bBriO', () => S.brightness, (v) => ({ brightness: v }));
  bindRange('bCon', 'bConO', () => S.contrast, (v) => ({ contrast: v }));
}

/* ── custom designs ── */
function renderCustomDesigns() {
  bindSwitch('cdMaster', () => S.customDesigns !== false, (v) => ({ customDesigns: v }));
  const grid = $('designsGrid');
  if (!grid || !D) return;
  grid.textContent = '';
  const masterOn = S.customDesigns !== false;

  for (const site of D.list) {
    const isSiteOn = masterOn && (S.customSites?.[site.id] !== false);
    const card = document.createElement('div');
    card.className = 'design-card' + (isSiteOn ? ' active' : '');
    card.innerHTML = `
      <div class="design-card-top">
        <div class="design-card-header">
          <span class="domain-tick ${isSiteOn ? '' : 'hidden'}">✓</span>
          <div>
            <h4>${esc(site.name)}</h4>
            <span class="domains-tag">${esc(site.domains.slice(0, 3).join(', '))}${site.domains.length > 3 ? ' +' + (site.domains.length - 3) : ''}</span>
          </div>
        </div>
        <label class="switch" title="Toggle custom design for ${esc(site.name)}">
          <input type="checkbox" data-id="${site.id}" ${isSiteOn ? 'checked' : ''} ${!masterOn ? 'disabled' : ''}>
          <i></i>
        </label>
      </div>
      <p class="design-desc">${esc(site.description)}</p>
      <div class="design-card-footer">
        <span class="status-badge ${isSiteOn ? 'on' : 'off'}">
          ${isSiteOn ? '✓ Active on domain' : 'Deselected / Off'}
        </span>
      </div>
    `;

    const toggle = card.querySelector('input[type=checkbox]');
    toggle.onchange = async (e) => {
      const checked = e.target.checked;
      const customSites = { ...(S.customSites || {}), [site.id]: checked };
      S = await updateSettings({ customSites });
      renderCustomDesigns();
    };

    grid.append(card);
  }
}

/* ── sites ── */
async function renderSites() {
  const sites = await getSites(); const l = $('siteList'); l.textContent = '';
  const hosts = Object.keys(sites).sort();
  if (!hosts.length) { l.innerHTML = '<div class="empty">No site rules yet. Open the Inky popup on any page to set one.</div>'; return; }
  for (const h of hosts) {
    const r = sites[h]; const tags = [];
    if (r.mode === 'off') {
      tags.push('<em class="tag off">Always light · Theme deselected</em>');
    } else {
      if (r.mode) tags.push(`<em class="tag">${esc(r.mode === 'filter' ? 'Filter mode' : 'Smart mode')}</em>`);
      if (r.palette) tags.push(`<em class="tag">Palette: ${esc(r.palette)}</em>`);
    }
    if (r.force) tags.push('<em class="tag">Forced dark</em>');
    if (r.night === false) tags.push('<em class="tag">No night light</em>');
    if (r.fixes && r.fixes.length) tags.push(`<em class="tag">${r.fixes.length} element fix${r.fixes.length > 1 ? 'es' : ''}</em>`);
    const d = document.createElement('div'); d.className = 'item site-row';
    d.innerHTML = `<div><b>${esc(h)}</b><span>${tags.join('')}</span></div><span class="acts">${r.fixes && r.fixes.length ? '<button data-a="fx">Clear fixes</button>' : ''}<button data-a="rm">Remove</button></span>`;
    d.querySelectorAll('button').forEach((b) => { b.onclick = async () => { await setSite(h, b.dataset.a === 'fx' ? { fixes: undefined } : null); renderSites(); }; });
    l.append(d);
  }
}

/* nav highlight */
const links = [...document.querySelectorAll('#tabs a')];
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.hash === '#' + e.target.id)); }, { rootMargin: '-30% 0px -60% 0px' });
document.querySelectorAll('section').forEach((s) => io.observe(s));

chrome.storage.onChanged.addListener((_, area) => { if (area === 'local' && !document.activeElement?.matches('input[type=range],input[type=text]')) refresh(); });
refresh();
