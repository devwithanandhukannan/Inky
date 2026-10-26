import { getSettings, updateSettings, getSites, setSite, getAllPalettes } from '../shared/storage.js';
import '../shared/custom-designs.js';

const D = globalThis.InkyCustomDesigns;
const $ = (id) => document.getElementById(id);
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

let tab = null, host = '', settings = null, sites = {}, palettes = [], status = null;

async function load() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  host = tab?.url?.startsWith('http') ? hostOf(tab.url) : '';
  [settings, sites, palettes] = await Promise.all([getSettings(), getSites(), getAllPalettes()]);
  status = null;
  if (host && tab.id) {
    try { status = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, { frameId: 0 }); } catch { /* page not scriptable */ }
  }
  render();
}

function siteRule() {
  const parts = host.split('.');
  for (let i = 0; i <= parts.length - 2; i++) { const r = sites[parts.slice(i).join('.')]; if (r) return r; }
  return {};
}
const ruleKey = () => {
  const parts = host.split('.');
  for (let i = 0; i <= parts.length - 2; i++) { const k = parts.slice(i).join('.'); if (sites[k]) return k; }
  return host;
};

function render() {
  $('power').checked = settings.enabled;
  $('host').textContent = host || 'This page';
  const rule = siteRule();
  const mode = rule.mode || 'auto';

  // status line
  let line = 'Inky can’t run on this page';
  if (status) {
    if (status.skipped === 'dark') line = 'Already dark — left untouched';
    else if (status.active) line = `Dark · ${status.mode === 'filter' ? 'Filter' : 'Smart'}`;
    else line = mode === 'off' ? 'Off for this site' : settings.enabled ? 'Light' : 'Dark mode is off';
    if (status.night) line += ' · Night light';
  }
  $('status').textContent = line;
  $('pick').hidden = !(status && status.active);
  const nf = (siteRule().fixes || []).length;
  $('fixInfo').textContent = nf ? `${nf} fix${nf > 1 ? 'es' : ''} on this site · add another` : 'Something look wrong? Point at it.';
  $('force').hidden = !(status && status.skipped === 'dark');
  $('siteMode').style.opacity = host && status ? 1 : .4;
  $('siteMode').style.pointerEvents = host && status ? '' : 'none';

  const modes = ['auto', 'smart', 'filter', 'off'];
  document.querySelectorAll('#siteMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelector('#siteMode .thumb').style.transform = `translateX(${modes.indexOf(mode) * 100}%)`;

  // custom design for famous site domain
  const cdBox = $('cdBox');
  const customSite = status?.customSite || (D ? D.find(host) : null);
  if (customSite && host) {
    cdBox.hidden = false;
    const isCdOn = settings.customDesigns !== false && (settings.customSites?.[customSite.id] !== false);
    $('cdName').textContent = `${customSite.name} Design`;
    const siteObj = D ? D.find(host) : null;
    if (siteObj && $('cdDesc')) $('cdDesc').textContent = siteObj.description;
    $('cdToggle').checked = isCdOn;
    $('cdTick').style.display = isCdOn ? 'inline-flex' : 'none';
    cdBox.classList.toggle('active', isCdOn);
    $('cdToggle').onchange = async (e) => {
      const checked = e.target.checked;
      const customSites = { ...(settings.customSites || {}), [customSite.id]: checked };
      settings = await updateSettings({ customSites });
      $('cdTick').style.display = checked ? 'inline-flex' : 'none';
      cdBox.classList.toggle('active', checked);
      setTimeout(load, 350);
    };
  } else {
    cdBox.hidden = true;
  }

  // theme cards: deselect theme if site is off or dark mode is disabled
  const isOff = !settings.enabled || mode === 'off';
  const sel = isOff ? null : (rule.palette || settings.palette);
  const themeSection = $('themeSection');
  if (themeSection) {
    themeSection.classList.toggle('theme-off', isOff);
    $('themeStatus').textContent = isOff ? 'Deselected (Site is Off)' : '';
  }

  const cards = $('cards'); cards.textContent = '';
  for (const p of palettes.filter((x) => x.primary)) {
    const b = document.createElement('button');
    b.className = 'card' + (p.id === sel ? ' sel' : '');
    b.innerHTML = `<div class="pv" style="background:${p.bg}"><div><div class="ln" style="background:${p.fg}"></div><div class="ln s" style="background:${p.fg};margin-top:4px"></div></div><div class="pl" style="background:${p.accent}"></div></div>
      <div class="nm"><span>${p.name}</span><span class="dots"><i style="background:${p.bg}"></i><i style="background:${p.fg}"></i><i style="background:${p.accent}"></i></span></div>`;
    b.onclick = async () => {
      if (mode === 'off') {
        sites = await setSite(ruleKey(), { mode: undefined });
      }
      pickPalette(p.id);
    };
    cards.append(b);
  }
  const chips = $('chips'); chips.textContent = '';
  for (const p of palettes.filter((x) => !x.primary)) {
    const b = document.createElement('button');
    b.className = 'chip' + (p.id === sel ? ' sel' : '');
    b.innerHTML = `<i style="background:linear-gradient(135deg,${p.bg} 50%,${p.accent} 50%)"></i>${p.name.replace(/</g, '&lt;')}`;
    b.onclick = async () => {
      if (mode === 'off') {
        sites = await setSite(ruleKey(), { mode: undefined });
      }
      pickPalette(p.id);
    };
    chips.append(b);
  }
  const add = document.createElement('button');
  add.className = 'chip add'; add.textContent = '+ Custom';
  add.onclick = openOptions;
  chips.append(add);

  // night
  const n = settings.night;
  $('nightOn').checked = n.on;
  $('nightBody').parentElement.classList.toggle('open', n.on);
  setSlider('warmth', n.warmth, '%'); setSlider('dim', n.dim, '%');
  setSlider('brightness', settings.brightness, '%'); setSlider('contrast', settings.contrast, '%'); setSlider('imageDim', settings.imageDim, '%');
}

function setSlider(id, v, unit) {
  const el = $(id);
  if (document.activeElement !== el) el.value = v;
  el.nextElementSibling.textContent = v + unit;
}

async function pickPalette(id) {
  if (host && siteRule().palette && siteRule().palette !== id) await setSite(ruleKey(), { palette: undefined });
  settings = await updateSettings({ palette: id });
  sites = await getSites();
  render();
}

function openOptions() { chrome.runtime.openOptionsPage(); window.close(); }

/* throttled writer for sliders */
let pend = null, tmr = 0;
function queueWrite(patch) {
  pend = { ...(pend || {}), ...patch, night: { ...(pend?.night || {}), ...(patch.night || {}) } };
  clearTimeout(tmr);
  tmr = setTimeout(async () => { const p = pend; pend = null; settings = await updateSettings(p); }, 40);
}
function bindSlider(id, apply) {
  const el = $(id);
  el.addEventListener('input', () => { el.nextElementSibling.textContent = el.value + '%'; queueWrite(apply(+el.value)); });
}

$('power').onchange = async (e) => { settings = await updateSettings({ enabled: e.target.checked }); setTimeout(load, 500); };
$('nightOn').onchange = async (e) => {
  const on = e.target.checked;
  settings = await updateSettings({ night: { on } });
  $('nightBody').parentElement.classList.toggle('open', on);
  setTimeout(load, 300);
};
bindSlider('warmth', (v) => ({ night: { warmth: v } }));
bindSlider('dim', (v) => ({ night: { dim: v } }));
bindSlider('brightness', (v) => ({ brightness: v }));
bindSlider('contrast', (v) => ({ contrast: v }));
bindSlider('imageDim', (v) => ({ imageDim: v }));

document.querySelectorAll('#siteMode button').forEach((b) => {
  b.onclick = async () => {
    if (!host) return;
    const m = b.dataset.m;
    sites = await setSite(ruleKey(), { mode: m === 'auto' ? undefined : m, force: m === 'auto' ? undefined : undefined });
    setTimeout(load, 700);
    render();
  };
});
$('force').onclick = async () => { sites = await setSite(ruleKey(), { force: true }); setTimeout(load, 900); };
$('settings').onclick = openOptions;
$('pick').onclick = async () => { try { await chrome.tabs.sendMessage(tab.id, { type: 'PICK' }, { frameId: 0 }); } catch { /* ignore */ } window.close(); };

chrome.storage.onChanged.addListener((_, area) => { if (area === 'local' && !document.activeElement?.matches('input[type=range]')) load(); });
load();
