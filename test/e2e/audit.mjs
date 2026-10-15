import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const srv = http.createServer((q,r)=>{const f=path.join(FX,q.url.split('?')[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.svg')?'image/svg+xml':'image/png'});r.end(d)})}).listen(8125);
import { fileURLToPath } from 'url';
const HERE=path.dirname(fileURLToPath(import.meta.url));const FX=path.join(HERE,'fixtures');const ext=path.resolve(HERE,'../..');
const ctx = await chromium.launchPersistentContext('/tmp/inky-e2e-audit',{headless:true,ignoreDefaultArgs:['--disable-extensions'],...(process.env.CHROME?{executablePath:process.env.CHROME}:{channel:'chromium'}),args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-sandbox'],viewport:{width:900,height:700}});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
await new Promise(r=>setTimeout(r,1500));await sw.evaluate(()=>chrome.storage.local.set({settings:{},sites:{}}));
const AUDIT = () => {
  const parse=s=>{const m=/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?/.exec(s);return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null};
  const lin=c=>{c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)};
  const lum=c=>.2126*lin(c[0])+.7152*lin(c[1])+.0722*lin(c[2]);
  const bgOf=el=>{let layers=[];let e=el;while(e){const cs=getComputedStyle(e);if(cs.backgroundImage!=='none')return null;const c=parse(cs.backgroundColor);if(c&&c[3]>0){layers.push(c);if(c[3]>=.99)break}e=e.parentElement||(e.getRootNode().host)}
    let base=[255,255,255];if(!(layers.length&&layers[layers.length-1][3]>=.99)) base=[28,28,30]; // canvas (dark scheme)
    for(let i=layers.length-1;i>=0;i--){const l=layers[i];base=base.map((v,k)=>v*(1-l[3])+l[k]*l[3])}return base};
  const bad=[];const walk=(root)=>{for(const el of root.querySelectorAll('*')){
    if(el.shadowRoot)walk(el.shadowRoot);
    const t=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');if(!t)continue;
    const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;
    const fg=parse(cs.color),bg=bgOf(el);if(!fg||!bg)continue;
    const f=fg.slice(0,3).map((v,k)=>v*fg[3]+bg[k]*(1-fg[3]));
    const L1=lum(f),L2=lum(bg),r=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    if(r<3)bad.push(`${el.tagName.toLowerCase()}.${el.className||''} "${t.slice(0,24)}" ${r.toFixed(2)} fg=${cs.color} bg=${bg.map(Math.round)}`)}};
  walk(document);return bad};
for (const f of ['github','wiki','shop','spa']) {
  const p = await ctx.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto(`http://localhost:8125/${f}.html`); await p.waitForTimeout(1800);
  const bad = await p.evaluate(AUDIT);
  console.log(`\n== ${f}: ${bad.length} low-contrast text nodes`); bad.slice(0,8).forEach(b=>console.log('  ',b));
  if(bad.length)process.exitCode=1;
  await p.close();
}
await ctx.close(); srv.close();
