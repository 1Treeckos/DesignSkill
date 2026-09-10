#!/usr/bin/env node
// contrast.mjs — WCAG contrast ratios, for turning "looks better" into a number.
//
//   node contrast.mjs "#0d6efd on #121a18" "#5f6b64 on #f7f4f0"
//   node contrast.mjs --find "#6b7280" --on "#f7f4f0,#ffffff"
//
// A colour change is an opinion until it has a ratio attached. Reviewers accept
// "4.41 -> 5.08, clears AA on both surfaces" far more readily than "warmer grey".

const AA_TEXT = 4.5, AA_LARGE = 3.0;

const hex2rgb = h => {
  const s = h.trim().replace(/^#/, '');
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16));
};
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = rgb => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => {
  const [x, y] = [lum(hex2rgb(a)), lum(hex2rgb(b))].sort((p, q) => q - p);
  return +((x + 0.05) / (y + 0.05)).toFixed(2);
};
const verdict = r => r >= 7 ? 'AAA' : r >= AA_TEXT ? 'AA' : r >= AA_LARGE ? 'AA large only' : 'FAIL';

const argv = process.argv.slice(2);
const flag = n => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : null; };

// --find: walk the colour darker in equal steps until it clears AA on every surface.
if (flag('find')) {
  const start = flag('find');
  const surfaces = (flag('on') || '#ffffff').split(',').map(s => s.trim());
  const target = Number(flag('target')) || AA_TEXT;
  const [r0, g0, b0] = hex2rgb(start);
  console.log(`Darkening ${start} until it clears ${target}:1 on ${surfaces.join(', ')}\n`);
  for (let step = 0; step <= 60; step += 3) {
    const rgb = [r0, g0, b0].map(v => Math.max(0, Math.round(v - step)));
    const hex = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
    const rs = surfaces.map(s => ratio(hex, s));
    const ok = rs.every(r => r >= target);
    console.log(`  ${hex}  ${rs.map(r => String(r).padEnd(6)).join('')} ${ok ? 'PASS' : ''}`);
    if (ok) { console.log(`\nFirst passing value: ${hex}`); break; }
  }
  process.exit(0);
}

if (!argv.length) {
  console.error(`usage:
  node contrast.mjs "#fg on #bg" ["#fg2 on #bg2" ...]
  node contrast.mjs --find "#6b7280" --on "#f7f4f0,#ffffff" [--target 4.5]

Reports the WCAG 2.1 ratio and whether it clears AA (4.5:1 body, 3:1 large).
--find walks a colour darker until it passes on every surface you name, which
is the quickest way to fix a token that fails on one background but not another.`);
  process.exit(1);
}

let worst = Infinity;
for (const spec of argv) {
  const m = String(spec).match(/(#?[0-9a-fA-F]{3,6})\s+on\s+(#?[0-9a-fA-F]{3,6})/);
  if (!m) { console.error(`Skipping unparseable: ${spec}`); continue; }
  const r = ratio(m[1], m[2]);
  worst = Math.min(worst, r);
  console.log(`${m[1]} on ${m[2]}  ${String(r).padEnd(6)} ${verdict(r)}`);
}
// Non-zero exit when anything fails AA, so this can gate a check in CI.
if (worst < AA_TEXT) process.exitCode = 1;
