#!/usr/bin/env node
// Installs the ui-change-preview skill into ~/.claude/skills/.
//
//   npx designskill                 (once published to npm)
//   npx github:1Treeckos/DesignSkill
//   node bin/install.mjs            (from a clone)
//
// Node rather than a shell script so one code path covers Windows, macOS and
// Linux — npx runs this the same way everywhere, and a .sh/.ps1 pair drifts.

import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  mkdirSync, copyFileSync, readdirSync, existsSync, rmSync, readFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SKILL_NAME = 'ui-change-preview';

// Resolve against this file, never the cwd: npx runs the bin from wherever the
// user happens to be standing.
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const dest = path.join(os.homedir(), '.claude', 'skills', SKILL_NAME);

const args = process.argv.slice(2);
const has = f => args.includes(`--${f}`) || args.includes(`-${f[0]}`);

if (has('help')) {
  console.log(`
  Installs the ${SKILL_NAME} skill for Claude Code.

    npx designskill              install (or update) the skill
    npx designskill --force      overwrite an existing install without asking
    npx designskill --uninstall  remove it
    npx designskill --where      print the install path and exit
`);
  process.exit(0);
}

if (has('where')) { console.log(dest); process.exit(0); }

if (has('uninstall')) {
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
    console.log(`\n  removed ${dest}\n`);
  } else {
    console.log(`\n  nothing installed at ${dest}\n`);
  }
  process.exit(0);
}

// --- sanity: are the payload files actually here? ---
const skillFile = path.join(pkgRoot, 'SKILL.md');
const scriptsDir = path.join(pkgRoot, 'scripts');
if (!existsSync(skillFile) || !existsSync(scriptsDir)) {
  console.error(`\n  ! Package looks incomplete — SKILL.md or scripts/ missing under ${pkgRoot}\n`);
  process.exit(1);
}

const alreadyInstalled = existsSync(dest);
if (alreadyInstalled && !has('force')) {
  // An update is the common case (re-running npx to pick up changes), so do it
  // rather than refusing — but say so, because silently overwriting a file
  // someone has edited locally is a nasty surprise.
  console.log(`\n  ${SKILL_NAME} is already installed — updating it.`);
  console.log(`  (local edits to ${path.join(dest, 'SKILL.md')} will be overwritten)`);
}

mkdirSync(path.join(dest, 'scripts'), { recursive: true });
copyFileSync(skillFile, path.join(dest, 'SKILL.md'));
let n = 0;
for (const f of readdirSync(scriptsDir)) {
  if (!f.endsWith('.mjs')) continue;
  copyFileSync(path.join(scriptsDir, f), path.join(dest, 'scripts', f));
  n++;
}

let version = '';
try { version = JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version; } catch {}

console.log(`\n  ${alreadyInstalled ? 'updated' : 'installed'} ${SKILL_NAME}${version ? ` v${version}` : ''}`);
console.log(`  -> ${dest}  (SKILL.md + ${n} scripts)\n`);

// --- dependency check: Playwright is what actually takes the screenshots ---
const require = createRequire(import.meta.url);
let playwright = false;
for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
  try { require.resolve(name); playwright = true; break; } catch {}
}
if (!playwright) {
  // Resolution is relative to this package; a project-local or global install
  // elsewhere may still be found at runtime, so this is a hint, not a failure.
  console.log('  ! Playwright not found from here. The skill needs it to take screenshots:');
  console.log('      npm i -D playwright && npx playwright install chromium');
  console.log('    If it is already installed elsewhere, point NODE_PATH at that node_modules.\n');
} else {
  console.log('  playwright: found\n');
}

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) console.log(`  ! Node ${process.versions.node} detected; the scripts need Node 18+.\n`);

console.log('  Restart Claude Code (or reload the window) to pick it up.\n');
