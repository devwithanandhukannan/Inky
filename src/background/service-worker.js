/**
 * Inky service worker. Deliberately thin: pages read settings straight from
 * storage, so the worker only does what content scripts cannot:
 *   • fetch cross-origin icons for analysis (host permission bypasses CORS)
 *   • keyboard shortcuts
 *   • inject into tabs that were open before install/update
 */
import { getSettings, updateSettings } from '../shared/storage.js';

const SCRIPTS = ['src/shared/palettes.js', 'src/shared/color.js', 'src/content/engine.js'];

chrome.runtime.onInstalled.addListener(async (details) => {
  const cur = await chrome.storage.local.get('settings');
  if (!cur.settings) await updateSettings({});
  if (details.reason === 'install' || details.reason === 'update') {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const t of tabs) {
      chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: SCRIPTS }).catch(() => {});
    }
  }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  const s = await getSettings();
  if (cmd === 'toggle-dark') await updateSettings({ enabled: !s.enabled });
  if (cmd === 'toggle-night') await updateSettings({ night: { on: !s.night.on } });
});

/* ── image analysis ── */
const cache = new Map(); // url -> result (small LRU)
const MAX_CACHE = 600;

async function analyze(url) {
  if (cache.has(url)) return cache.get(url);
  let out = null;
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
    if (res.ok) {
      const type = res.headers.get('content-type') || '';
      const len = +(res.headers.get('content-length') || 0);
      if (type.includes('svg') || /\.svg(\?|$)/i.test(url) || url.startsWith('data:image/svg')) {
        out = { svg: (await res.text()).slice(0, 20000) };
      } else if (!len || len < 300000) {
        const blob = await res.blob();
        if (blob.size < 300000) {
          const bmp = await createImageBitmap(blob, { resizeWidth: 24, resizeHeight: 24, resizeQuality: 'medium' });
          const oc = new OffscreenCanvas(24, 24);
          const cx = oc.getContext('2d', { willReadFrequently: true });
          cx.drawImage(bmp, 0, 0);
          out = { px: Array.from(cx.getImageData(0, 0, 24, 24).data) };
          bmp.close();
        }
      }
    }
  } catch (e) { out = null; }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(url, out);
  return out;
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg?.type !== 'ANALYZE_IMAGES' || !Array.isArray(msg.urls)) return;
  (async () => {
    const res = {};
    await Promise.all(msg.urls.slice(0, 24).map(async (u) => { res[u] = await analyze(u); }));
    send(res);
  })();
  return true;
});
