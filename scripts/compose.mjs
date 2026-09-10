#!/usr/bin/env node
// compose.mjs — build one before/after comparison sheet from captured PNGs.
//
//   node compose.mjs --out comparison.png --title "Login polish" \
//     --pair "Desktop light|baseline/desktop-light.png|after/desktop-light.png" \
//     --pair "Mobile|baseline/mobile-light.png|after/mobile-light.png" \
//     --note "Link themed from tokens, was #0d6efd (3.9:1 on dark)"
//
// Side-by-side beats two separate images: a reviewer comparing across messages
// has to hold the first in memory, and small deltas (a 4% lightness change, 12px
// of spacing) are invisible that way but obvious when adjacent.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const names = ['playwright', '@playwright/test', 'playwright-core'];
  for (const n of names) { try { return require(n); } catch {} }
  const roots = [];
  if (process.env.NODE_PATH) roots.push(...process.env.NODE_PATH.split(path.delimiter));
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch {}
  for (const r of roots) for (const n of names) { try { return require(path.join(r, n)); } catch {} }
  console.error('Playwright not found. npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

// Value flags consume the next argument unconditionally. Checking for a leading
// "--" would break every note about a CSS custom property, since those start
// with "--" themselves ("--muted 4.41:1 -> 5.08:1").
const BOOLEAN_FLAGS = new Set([]);
const REPEATABLE = new Set(['pair', 'note']);

const args = { pair: [], note: [] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  let key, val;
  if (eq > -1) { key = a.slice(2, eq); val = a.slice(eq + 1); }
  else {
    key = a.slice(2);
    val = BOOLEAN_FLAGS.has(key) ? true : process.argv[++i];
    if (val === undefined) { console.error(`--${key} needs a value`); process.exit(1); }
  }
  if (REPEATABLE.has(key)) args[key].push(val);
  else args[key] = val;
}

if (!args.pair.length) {
  console.error(`usage: node compose.mjs --out <file.png> --pair "<label>|<before.png>|<after.png>" [more --pair] [--note "..."] [--title "..."]

  --pair    Repeatable. Pipe-separated label, before path, after path. Pipe cannot
            appear in a filename, so absolute Windows paths survive.
  --note    Repeatable. A line explaining one change. Put the measured
            delta in it (a contrast ratio, a px value) so the sheet
            carries evidence, not just adjectives.
  --title   Heading for the sheet.
  --width   Sheet width in px (default 1500).`);
  process.exit(1);
}

// Pipe is the delimiter because it cannot appear in a Windows or POSIX filename,
// so absolute paths like C:/shots/before.png survive intact. Colon is accepted
// too when it yields exactly three parts, which covers relative paths.
const pairs = args.pair.map(spec => {
  const s = String(spec);
  let parts = s.includes('|') ? s.split('|') : s.split(':');
  if (parts.length !== 3) {
    console.error(`Bad --pair (need "<label>|<before>|<after>"): ${s}`);
    process.exit(1);
  }
  const [label, before, after] = parts.map(p => p.trim());
  return { label, before, after };
});

for (const p of pairs) {
  for (const f of [p.before, p.after]) {
    if (!existsSync(f)) { console.error(`Missing image: ${f}`); process.exit(1); }
  }
}

const uri = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const narrow = p => {
  // Portrait shots (phones) should not stretch to half the sheet.
  const b = readFileSync(p);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  return h > w;
};

const html = `<!doctype html><meta charset="utf-8"><style>
  :root { color-scheme: light; }
  body { margin:0; padding:36px; background:#eceae6;
         font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#1c211f; }
  h1 { font-size:19px; margin:0 0 4px; letter-spacing:-0.01em; }
  .sub { color:#6a716d; margin:0 0 28px; font-size:12.5px; }
  .row { margin-bottom:30px; }
  .rowlabel { font-size:11.5px; font-weight:700; text-transform:uppercase;
              letter-spacing:.07em; color:#6a716d; margin-bottom:9px; }
  .pair { display:flex; gap:18px; align-items:flex-start; }
  .cell { flex:1; min-width:0; }
  .cell.narrow { flex:0 0 300px; }
  .tag { display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:.05em;
         padding:3px 8px; border-radius:999px; margin-bottom:7px; }
  .b { background:#f3dcd8; color:#8c2f22; }
  .a { background:#d7e8de; color:#20573f; }
  img { width:100%; display:block; border-radius:10px; border:1px solid rgba(17,24,39,.12); }
  .notes { margin-top:26px; padding-top:16px; border-top:1px solid rgba(17,24,39,.12);
           color:#4a524e; font-size:12.5px; }
  .notes li { margin-bottom:5px; }
  code { background:rgba(17,24,39,.06); padding:1px 4px; border-radius:4px; font-size:11.5px; }
</style>
<h1>${esc(args.title || 'Before / after')}</h1>
<p class="sub">Rendered against the running app with the proposed CSS injected. No source files changed.</p>
${pairs.map(p => {
  const cls = narrow(p.before) ? 'cell narrow' : 'cell';
  return `<div class="row">
  <div class="rowlabel">${esc(p.label)}</div>
  <div class="pair">
    <div class="${cls}"><span class="tag b">BEFORE</span><img src="${uri(p.before)}"></div>
    <div class="${cls}"><span class="tag a">AFTER</span><img src="${uri(p.after)}"></div>
  </div>
</div>`;
}).join('\n')}
${args.note.length ? `<div class="notes"><ul>${args.note.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
// Short viewport so the fullPage capture snaps to content height instead of
// padding out to a tall viewport with dead space under the last row.
const page = await browser.newPage({
  viewport: { width: Number(args.width) || 1500, height: 200 },
  deviceScaleFactor: 2,
});
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(300);
const out = args.out || 'comparison.png';
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
