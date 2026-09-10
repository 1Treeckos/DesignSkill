#!/usr/bin/env node
// shoot.mjs — screenshot a running web app, optionally with proposed CSS injected.
//
//   Baseline:  node shoot.mjs --url http://localhost:5173/login --out ./baseline
//   Preview:   node shoot.mjs --url http://localhost:5173/login --out ./after --css proposed.css
//
// Without --css you get the app as it is. With --css you get the app as it WOULD be.
// Same script both ways on purpose: any difference between the two shots is then
// attributable to your CSS and not to a difference in how the page was loaded.
//
// Every run also writes fidelity.json — proof that the render can be trusted.
// Read it before you believe the screenshot.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const names = ['playwright', '@playwright/test', 'playwright-core'];
  for (const n of names) { try { return require(n); } catch {} }
  // Playwright often lives outside the project (a global install, or a parent
  // directory of the cwd). Node resolves from THIS file's location, so a script
  // kept in ~/.claude/skills will not find a project-local install on its own.
  const roots = [];
  if (process.env.NODE_PATH) roots.push(...process.env.NODE_PATH.split(path.delimiter));
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch {}
  try { roots.push(path.join(execSync('npm root', { encoding: 'utf8' }).trim())); } catch {}
  for (const r of roots) {
    for (const n of names) { try { return require(path.join(r, n)); } catch {} }
  }
  console.error(
    'Playwright not found.\n' +
    '  Install:  npm i -D playwright && npx playwright install chromium\n' +
    '  Or point at an existing install:  NODE_PATH=/path/to/node_modules node shoot.mjs ...');
  process.exit(2);
}

// ---------------------------------------------------------------- args
// Value flags consume the next argument unconditionally — a CSS-related value can
// legitimately begin with "--", so sniffing for a leading dash mis-parses it.
const BOOLEAN_FLAGS = new Set(['full']);
const REPEATABLE = new Set(['rewrite']);

const args = { rewrite: [] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  let key, val;
  // --rewrite takes an a=b pair, so its own "=" must not be treated as
  // flag=value. Only split on "=" for flags that are not repeatable pairs.
  if (eq > -1 && !REPEATABLE.has(a.slice(2, eq))) { key = a.slice(2, eq); val = a.slice(eq + 1); }
  else {
    key = a.slice(2);
    val = BOOLEAN_FLAGS.has(key) ? true : process.argv[++i];
    if (val === undefined) { console.error(`--${key} needs a value`); process.exit(1); }
  }
  if (REPEATABLE.has(key)) args[key].push(val);
  else args[key] = val;
}

const url = args.url;
const out = args.out || '.';
if (!url) {
  console.error(`usage: node shoot.mjs --url <url> --out <dir> [options]

  --css <file>          CSS to inject after load. Its presence is what makes this
                        a "preview" rather than a baseline.
  --viewport <v>        desktop (1440x900, default) | mobile (390x844) | 1280x720
  --theme <t>           light (default) | dark. Sets the emulated colour scheme.
  --theme-key <k>       localStorage key the app reads its theme from, seeded
                        before any page script runs. Needed for apps that persist
                        a theme choice rather than following the OS.
  --theme-value <v>     Value to write to that key (defaults to --theme).
  --rewrite <a>=<b>     Rewrite matching network requests. Use for changes that
                        happen at load time and cannot be injected afterwards —
                        a webfont URL is the usual case. Repeatable.
  --probe <file>        JSON of { "label": ["selector", "cssProperty"] } to read
                        back after render, into fidelity.json. This is how you
                        prove the injected CSS actually applied.
  --full                Also capture a full-page screenshot.
  --wait <ms>           Extra settle time before the shot (default 800).`);
  process.exit(1);
}

const VIEWPORTS = { desktop: [1440, 900], mobile: [390, 844], tablet: [768, 1024] };
const vpArg = args.viewport || 'desktop';
const [vw, vh] = VIEWPORTS[vpArg] || vpArg.split(/[x×]/).map(Number);
if (!vw || !vh) { console.error(`Bad --viewport: ${vpArg}`); process.exit(1); }
const isMobile = vw < 768;
const theme = args.theme === 'dark' ? 'dark' : 'light';

mkdirSync(out, { recursive: true });
const { chromium } = loadPlaywright();

// ---------------------------------------------------------------- run
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: vw, height: vh },
  deviceScaleFactor: 2,
  isMobile,
  hasTouch: isMobile,
  colorScheme: theme,
});

// Seed the app's persisted theme before any page script runs. Apps that write
// data-theme from localStorage in a <head> script will otherwise ignore the
// emulated colour scheme entirely.
if (args['theme-key']) {
  await ctx.addInitScript(([k, v]) => {
    try { window.localStorage.setItem(k, v); } catch {}
  }, [args['theme-key'], args['theme-value'] || theme]);
}

// Rewriting a request beats swapping the element in JS: the page loads with the
// right resource from the start, exactly as it would after you edit the source.
// Removing and re-adding a stylesheet <link> at runtime drops already-resolved
// resources (webfonts especially) and gives you a screenshot of a fallback.
const rewrites = args.rewrite.filter(r => typeof r === 'string');
for (const r of rewrites) {
  const eq = r.indexOf('=');
  const [from, to] = [r.slice(0, eq), r.slice(eq + 1)];
  await ctx.route(u => u.href.includes(from), route => route.continue({ url: to }));
}

const page = await ctx.newPage();
const failures = [];
page.on('requestfailed', r => failures.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
// 401/403 are the normal state of a logged-out view — an auth probe returning
// 401 on a login page is the app working, not a broken render. Flagging those
// trains you to ignore the warnings that matter.
page.on('response', r => {
  const s = r.status();
  if (s >= 400 && s !== 401 && s !== 403) failures.push(`HTTP ${s} ${r.url().slice(0, 120)}`);
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  .catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }));
await page.waitForTimeout(600);

// Settle lazy content, then return to the top so the fold shot is the fold.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100));
  }
  window.scrollTo(0, 0);
});

if (args.css) await page.addStyleTag({ content: readFileSync(args.css, 'utf8') });

await page.evaluate(() => document.fonts?.ready).catch(() => {});
await page.waitForTimeout(Number(args.wait) || 800);

const stem = `${vpArg}-${theme}`;
const shot = path.join(out, `${stem}.png`);
await page.screenshot({ path: shot });
const shots = [shot];
if (args.full) {
  const full = path.join(out, `${stem}-full.png`);
  await page.screenshot({ path: full, fullPage: true });
  shots.push(full);
}

// ------------------------------------------------- fidelity: is this shot real?
// A preview is only evidence if the page rendered the way the real app does.
// The classic failure is a webfont that silently did not load, leaving the whole
// screenshot in a fallback face — the layout you are judging is then fiction.
let probe = {};
try { probe = args.probe ? JSON.parse(readFileSync(args.probe, 'utf8')) : {}; } catch {}

const fidelity = await page.evaluate(probeSpec => {
  const faces = [...(document.fonts || [])];
  const readProbe = {};
  for (const [label, [selector, prop]] of Object.entries(probeSpec)) {
    const el = document.querySelector(selector);
    readProbe[label] = el
      ? (prop.startsWith('--')
          ? getComputedStyle(el).getPropertyValue(prop).trim()
          : getComputedStyle(el)[prop])
      : null;
  }
  return {
    title: document.title,
    activeTheme: document.documentElement.dataset.theme
      || document.documentElement.getAttribute('data-bs-theme')
      || (document.documentElement.className.includes('dark') ? 'dark(class)' : null),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    fontsLoaded: [...new Set(faces.filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight}`))],
    fontsUnloaded: [...new Set(faces.filter(f => f.status !== 'loaded').map(f => `${f.family} ${f.weight}`))].slice(0, 12),
    probe: readProbe,
  };
}, probe);

fidelity.injectedCss = args.css || null;
fidelity.rewrites = rewrites;
fidelity.requestFailures = [...new Set(failures)].slice(0, 10);
fidelity.warnings = [];
if (!fidelity.fontsLoaded.length) {
  fidelity.warnings.push(
    'NO WEBFONTS LOADED — this screenshot is probably rendering in a fallback face. ' +
    'Do not judge typography from it. If you swapped a font <link> in JS, use --rewrite instead.');
}
if (fidelity.requestFailures.length) {
  fidelity.warnings.push('Some requests failed; see requestFailures. A 400 on a font CSS URL usually means an invalid weight range.');
}

writeFileSync(path.join(out, `${stem}.fidelity.json`), JSON.stringify(fidelity, null, 2));
await browser.close();

console.log(JSON.stringify({ shots, fidelity: `${path.join(out, stem)}.fidelity.json`, ...fidelity }, null, 2));
if (fidelity.warnings.length) process.exitCode = 3;
