#!/usr/bin/env node
// slop-check.mjs — measure a rendered page against the default-AI-UI fingerprints.
//
//   node slop-check.mjs --url http://localhost:5173/dashboard
//   node slop-check.mjs --url ... --brief .agents/design-brief.md
//   node slop-check.mjs --self-test          (no browser needed)
//
// The sameness everyone recognises is not vague — it is a short list of specific
// defaults that every model reaches for unprompted: one radius everywhere, an
// indigo accent, a 4-up stat-tile row, a flat type scale, a gradient on a card.
// This measures those on the live page and exits 3 when the page looks generic.
//
// A failing check is not automatically a bug. It means "you did not decide this,
// the default did" — so either decide it, or declare it in the brief.
//
// Split in two on purpose: collect() runs in the browser and only gathers numbers,
// audit() is pure and holds every judgement. That is what makes --self-test real
// rather than a smoke test — the rules are checked against fixtures, no Chromium.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const names = ['playwright', '@playwright/test', 'playwright-core'];
  for (const n of names) { try { return require(n); } catch {} }
  const roots = [];
  if (process.env.NODE_PATH) roots.push(...process.env.NODE_PATH.split(path.delimiter));
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch {}
  try { roots.push(execSync('npm root', { encoding: 'utf8' }).trim()); } catch {}
  for (const r of roots) {
    for (const n of names) { try { return require(path.join(r, n)); } catch {} }
  }
  console.error(
    'Playwright not found.\n' +
    '  Install:  npm i -D playwright && npx playwright install chromium\n' +
    '  Or point at an existing install:  NODE_PATH=/path/to/node_modules node slop-check.mjs ...');
  process.exit(2);
}

// ---------------------------------------------------------------- rules
// Generic system stacks. A page whose headings render in one of these has not
// chosen a typeface; it accepted the one that comes for free.
const DEFAULT_FACES = [
  'inter', 'system-ui', '-apple-system', 'segoe ui', 'roboto', 'helvetica neue',
  'arial', 'sans-serif', 'ui-sans-serif',
];

// The indigo/violet band every scaffold ships with (Tailwind indigo-500 is 239).
const DEFAULT_ACCENT_HUES = [[225, 285]];

const isDefaultFace = family =>
  String(family).split(',').map(f => f.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .every(f => !f || DEFAULT_FACES.includes(f));

function hsl({ r, g, b }) {
  const [R, G, B] = [r, g, b].map(v => v / 255);
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

const parseRgb = str => {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/.exec(String(str));
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  return a === 0 ? null : { r: +m[1], g: +m[2], b: +m[3] };
};

// ---------------------------------------------------------------- audit (pure)
// Takes the numbers collect() gathered plus whatever the brief declared, and
// returns findings. No DOM, no I/O — this is the whole opinion of the tool.
export function audit(snap, brief = {}) {
  const findings = [];
  const flag = (id, severity, detail, fix) => findings.push({ id, severity, detail, fix });

  // --- typeface: did anyone choose one?
  if (brief.font === undefined && snap.headingFont && isDefaultFace(snap.headingFont)) {
    flag('default-typeface', 'high',
      `Headings render in "${snap.headingFont}" — a free system stack.`,
      'Pick a face with a point of view, or declare the system stack in the brief as a decision.');
  }

  // --- radius: one value everywhere is the scaffold default, not a system
  const radii = (snap.radii || []).filter(r => r.value > 0);
  const distinct = new Set(radii.map(r => r.value));
  const total = radii.reduce((n, r) => n + r.count, 0);
  if (total >= 8 && distinct.size === 1) {
    const only = [...distinct][0];
    if (!brief.radii?.includes(only) && only >= 6 && only <= 20) {
      flag('uniform-radius', 'medium',
        `Every rounded surface uses ${only}px (${total} elements, no second value).`,
        'A real system varies radius by element size — a tag and a modal should not match. Or declare it.');
    }
  }

  // --- accent hue: the indigo everything ships with
  if (snap.accent) {
    const { h, s } = hsl(snap.accent);
    const inBand = DEFAULT_ACCENT_HUES.some(([lo, hi]) => h >= lo && h <= hi);
    const declared = brief.accentHue !== undefined && Math.abs(brief.accentHue - h) <= 12;
    if (inBand && s > 0.35 && !declared) {
      flag('default-accent', 'high',
        `Accent sits at hue ${Math.round(h)} (indigo/violet), the scaffold default.`,
        'Derive the accent from your reference, or declare this hue in the brief with accentHue.');
    }
  }

  // --- the 4-up stat tile row
  for (const row of snap.tileRows || []) {
    if (row.count >= 3 && row.count <= 4) {
      flag('stat-tile-row', 'high',
        `${row.count} equal-width tiles in a row near the top, each a short number plus a label${row.hasDeltaBadge ? ', with delta badges' : ''}.`,
        'This is the single most recognisable AI-dashboard tell. Earn the layout from what the reader checks first, or declare it.');
      break;
    }
  }

  // --- type scale: flat scale reads as a wireframe
  if (snap.maxFontSize && snap.bodyFontSize) {
    const ratio = snap.maxFontSize / snap.bodyFontSize;
    if (ratio < 1.9 && !brief.flatScaleOk) {
      flag('flat-type-scale', 'medium',
        `Largest text is only ${ratio.toFixed(2)}x body (${snap.maxFontSize}px vs ${snap.bodyFontSize}px).`,
        'Nothing leads the page. Either commit to a real jump, or make density the point and say so.');
    }
  }

  // --- decorative gradients
  if (snap.gradients > 0 && !brief.gradientsOk) {
    flag('decorative-gradient', 'low',
      `${snap.gradients} gradient background${snap.gradients > 1 ? 's' : ''} on surfaces.`,
      'Usually arrives unrequested. Keep it only if it carries meaning.');
  }

  // --- every surface bordered AND shadowed: belt-and-braces card soup
  if (snap.cardsWithBorderAndShadow >= 4 && !brief.cardsOk) {
    flag('card-soup', 'medium',
      `${snap.cardsWithBorderAndShadow} surfaces carry a border and a shadow.`,
      'Pick one separation mechanism. Two is the default stack applying both because neither was chosen.');
  }

  // --- one padding value everywhere: no density hierarchy
  const pads = snap.paddings || [];
  const dominant = pads[0];
  const padTotal = pads.reduce((n, p) => n + p.count, 0);
  if (dominant && padTotal >= 10 && dominant.count / padTotal > 0.8) {
    flag('uniform-padding', 'low',
      `${Math.round(dominant.count / padTotal * 100)}% of padded elements use ${dominant.value}px.`,
      'Spacing is where density lives; one value means it was never considered.');
  }

  return findings;
}

// ---------------------------------------------------------------- collect
// Runs inside the page. Gathers numbers only — every threshold lives in audit()
// so the rules stay testable without a browser.
function collect() {
  const els = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  const tally = () => new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const radiusCounts = tally(), padCounts = tally(), fontSizes = tally(), colorCounts = tally();
  let gradients = 0, cardsWithBorderAndShadow = 0;

  for (const el of els) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    const radius = Math.round(parseFloat(cs.borderTopLeftRadius) || 0);
    if (radius > 0 && rect.width > 24) bump(radiusCounts, radius);

    const pad = Math.round(parseFloat(cs.paddingTop) || 0);
    if (pad > 0 && rect.width > 80) bump(padCounts, pad);

    const size = Math.round(parseFloat(cs.fontSize) || 0);
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (size && ownText) bump(fontSizes, size);

    if (/gradient/.test(cs.backgroundImage) && rect.width > 60 && rect.height > 30) gradients++;

    const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    const shadowed = cs.boxShadow && cs.boxShadow !== 'none';
    if (bordered && shadowed && rect.width > 120 && rect.height > 60) cardsWithBorderAndShadow++;

    // Accent candidates: saturated colour used on text, buttons or fills.
    for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
      const v = cs[prop];
      if (v && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent') bump(colorCounts, v);
    }
  }

  // Heading face: the largest text on the page is what sets the page's voice.
  let headingFont = null, maxFontSize = 0;
  for (const el of els) {
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize) || 0;
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (ownText && size > maxFontSize) { maxFontSize = size; headingFont = cs.fontFamily; }
  }

  const sizeEntries = [...fontSizes.entries()].sort((a, b) => b[1] - a[1]);
  const bodyFontSize = sizeEntries.length ? sizeEntries[0][0] : null;

  // Stat-tile rows: >=3 siblings of equal width sharing a top edge, each holding
  // a short number and little else. The shape, not the class names.
  const tileRows = [];
  const parents = new Set(els.map(el => el.parentElement).filter(Boolean));
  for (const parent of parents) {
    const kids = [...parent.children].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 80 && r.height > 40;
    });
    if (kids.length < 3 || kids.length > 6) continue;
    const boxes = kids.map(k => k.getBoundingClientRect());
    const sameTop = boxes.every(b => Math.abs(b.top - boxes[0].top) < 12);
    const sameWidth = boxes.every(b => Math.abs(b.width - boxes[0].width) < 8);
    if (!sameTop || !sameWidth) continue;
    if (boxes[0].top > window.innerHeight) continue;
    const numeric = kids.filter(k => {
      const t = k.innerText?.trim() || '';
      return t.length < 60 && /[\d][\d.,]*\s*[%kKmM$€]?/.test(t) && t.split('\n').length <= 4;
    });
    if (numeric.length < kids.length) continue;
    const hasDeltaBadge = kids.some(k => /[▲▼↑↓+\-]\s?\d+(\.\d+)?%/.test(k.innerText || ''));
    tileRows.push({ count: kids.length, hasDeltaBadge, top: Math.round(boxes[0].top) });
  }

  // Accent = the most saturated mid-lightness colour that appears more than once.
  const accentCandidates = [...colorCounts.entries()]
    .map(([v, count]) => ({ v, count }))
    .filter(c => c.count > 1);

  return {
    headingFont,
    maxFontSize: Math.round(maxFontSize) || null,
    bodyFontSize,
    radii: [...radiusCounts.entries()].map(([value, count]) => ({ value, count })),
    paddings: [...padCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    gradients,
    cardsWithBorderAndShadow,
    colorCandidates: accentCandidates,
    tileRows,
  };
}

// Accent selection needs colour maths, so it happens here rather than in the page.
function pickAccent(candidates = []) {
  let best = null, bestScore = 0;
  for (const { v, count } of candidates) {
    const rgb = parseRgb(v);
    if (!rgb) continue;
    const { s, l } = hsl(rgb);
    if (s < 0.3 || l < 0.2 || l > 0.75) continue;   // greys, near-black, near-white
    const score = s * Math.log(count + 1);
    if (score > bestScore) { bestScore = score; best = rgb; }
  }
  return best;
}

// A brief is prose for humans; these are the few lines a machine reads from it.
//   accent-hue: 18
//   radii: 4, 12
//   font: declared
//   allow: gradients, cards
function parseBrief(text) {
  const brief = {};
  const get = re => (re.exec(text) || [])[1];
  const hue = get(/^\s*accent-?hue\s*:\s*([\d.]+)/mi);
  if (hue !== undefined) brief.accentHue = Number(hue);
  const radii = get(/^\s*radi(?:i|us)\s*:\s*([\d,\s]+)/mi);
  if (radii) brief.radii = radii.split(',').map(n => Number(n.trim())).filter(n => !Number.isNaN(n));
  if (/^\s*font\s*:/mi.test(text)) brief.font = get(/^\s*font\s*:\s*(.+)$/mi)?.trim();
  const allow = (get(/^\s*allow\s*:\s*(.+)$/mi) || '').toLowerCase();
  if (allow.includes('gradient')) brief.gradientsOk = true;
  if (allow.includes('card')) brief.cardsOk = true;
  if (allow.includes('flat-scale')) brief.flatScaleOk = true;
  return brief;
}

// ---------------------------------------------------------------- self-test
// Two fixtures: the generic dashboard everyone has seen, and a page that made
// decisions. The rules are worthless if they cannot tell these apart.
function selfTest() {
  const slop = {
    headingFont: 'Inter, system-ui, sans-serif',
    maxFontSize: 24, bodyFontSize: 14,
    radii: [{ value: 12, count: 18 }],
    paddings: [{ value: 24, count: 19 }, { value: 8, count: 2 }],
    gradients: 2,
    cardsWithBorderAndShadow: 6,
    tileRows: [{ count: 4, hasDeltaBadge: true, top: 96 }],
    colorCandidates: [{ v: 'rgb(99, 102, 241)', count: 9 }],
  };
  const decided = {
    headingFont: '"GT Sectra", Georgia, serif',
    maxFontSize: 56, bodyFontSize: 15,
    radii: [{ value: 2, count: 12 }, { value: 10, count: 3 }],
    paddings: [{ value: 12, count: 9 }, { value: 20, count: 6 }, { value: 32, count: 4 }],
    gradients: 0,
    cardsWithBorderAndShadow: 0,
    tileRows: [],
    colorCandidates: [{ v: 'rgb(193, 71, 28)', count: 7 }],
  };

  const run = (snap, brief) => audit({ ...snap, accent: pickAccent(snap.colorCandidates) }, brief);
  const ids = f => f.map(x => x.id).sort();
  const fails = [];
  const expect = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails.push(`${label}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  };

  expect('generic dashboard trips every fingerprint', ids(run(slop)), [
    'card-soup', 'decorative-gradient', 'default-accent', 'default-typeface',
    'flat-type-scale', 'stat-tile-row', 'uniform-padding', 'uniform-radius',
  ]);
  expect('a page that made decisions is clean', ids(run(decided)), []);
  // A declared decision must silence the check — otherwise the brief is advisory
  // and the tool just nags.
  expect('brief declaring the hue silences default-accent',
    ids(run(slop, parseBrief('accent-hue: 241\nradii: 12\nfont: Inter, deliberate\nallow: gradients, cards, flat-scale'))),
    ['stat-tile-row', 'uniform-padding']);
  expect('parseBrief reads the machine-readable lines',
    parseBrief('accent-hue: 18\nradii: 4, 12\nallow: gradients'),
    { accentHue: 18, radii: [4, 12], gradientsOk: true });

  console.log(fails.length ? `\n${fails.length} failed:\n  ${fails.join('\n  ')}\n` : '\nall passed\n');
  process.exit(fails.length ? 1 : 0);
}

// ---------------------------------------------------------------- main
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq > -1) { args[a.slice(2, eq)] = a.slice(eq + 1); continue; }
  const key = a.slice(2);
  args[key] = ['self-test', 'json'].includes(key) ? true : process.argv[++i];
}

if (args['self-test']) selfTest();

if (!args.url) {
  console.error(`usage: node slop-check.mjs --url <url> [options]

  --brief <file>     design brief; its machine-readable lines (accent-hue,
                     radii, font, allow) turn a finding into a declared decision
  --viewport <v>     desktop (default) | mobile | 1280x720
  --theme <t>        light (default) | dark
  --theme-key <k>    localStorage key the app reads its theme from
  --json             print the raw measurements too
  --self-test        check the rules against fixtures, no browser

exit 0 clean, 3 findings, 2 playwright missing`);
  process.exit(1);
}

const VIEWPORTS = { desktop: [1440, 900], mobile: [390, 844], tablet: [768, 1024] };
const vpArg = args.viewport || 'desktop';
const [vw, vh] = VIEWPORTS[vpArg] || String(vpArg).split(/[x×]/).map(Number);
if (!vw || !vh) { console.error(`Bad --viewport: ${vpArg}`); process.exit(1); }
const theme = args.theme === 'dark' ? 'dark' : 'light';

const brief = args.brief ? parseBrief(readFileSync(args.brief, 'utf8')) : {};

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: vw, height: vh },
  isMobile: vw < 768,
  colorScheme: theme,
});
if (args['theme-key']) {
  await ctx.addInitScript(([k, v]) => {
    try { window.localStorage.setItem(k, v); } catch {}
  }, [args['theme-key'], args['theme-value'] || theme]);
}
const page = await ctx.newPage();
await page.goto(args.url, { waitUntil: 'networkidle', timeout: 60000 })
  .catch(() => page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60000 }));
await page.evaluate(() => document.fonts?.ready).catch(() => {});
await page.waitForTimeout(600);

const snap = await page.evaluate(collect);
await browser.close();

snap.accent = pickAccent(snap.colorCandidates);
const findings = audit(snap, brief);

const order = { high: 0, medium: 1, low: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);

console.log(`\nslop-check  ${args.url}  (${vpArg} ${theme})\n`);
if (!findings.length) {
  console.log('  no default fingerprints found — the look appears decided.\n');
} else {
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.id}`);
    console.log(`    ${f.detail}`);
    console.log(`    -> ${f.fix}\n`);
  }
  console.log(`  ${findings.length} finding${findings.length > 1 ? 's' : ''}. ` +
    'Each is either a decision to make or a line to add to the brief.\n');
}
if (args.json) console.log(JSON.stringify(snap, null, 2));

process.exitCode = findings.length ? 3 : 0;
