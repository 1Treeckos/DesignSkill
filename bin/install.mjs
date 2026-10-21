#!/usr/bin/env node
// Installs the DesignSkill skills for Claude Code and Codex.
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
  mkdirSync, copyFileSync, readdirSync, existsSync, rmSync, readFileSync, statSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Resolve against this file, never the cwd: npx runs the bin from wherever the
// user happens to be standing.
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const skillsSrc = path.join(pkgRoot, 'skills');
const scriptsDir = path.join(pkgRoot, 'scripts');

// Same SKILL.md format, two conventions: Claude Code reads ~/.claude/skills,
// Codex reads ~/.agents/skills. Install to both; each agent ignores the other.
const ROOTS = [
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(os.homedir(), '.agents', 'skills'),
];

const args = process.argv.slice(2);
const has = f => args.includes(`--${f}`) || args.includes(`-${f[0]}`);

// Every skill gets the whole scripts/ directory. They share shoot.mjs, and a
// skill that cannot run its own commands from its own folder is a skill that
// breaks the moment someone copies it somewhere else.
const skills = existsSync(skillsSrc)
  ? readdirSync(skillsSrc).filter(d => statSync(path.join(skillsSrc, d)).isDirectory())
  : [];

const targets = ROOTS.flatMap(root => skills.map(s => path.join(root, s)));

if (has('help')) {
  console.log(`
  Installs the DesignSkill skills for Claude Code and Codex.

    ${skills.map(s => `- ${s}`).join('\n    ')}

    npx designskill              install (or update) the skills
    npx designskill --force      overwrite an existing install without asking
    npx designskill --uninstall  remove them
    npx designskill --where      print the install paths and exit
`);
  process.exit(0);
}

if (has('where')) { console.log(targets.join('\n')); process.exit(0); }

if (has('uninstall')) {
  for (const dest of targets) {
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
      console.log(`\n  removed ${dest}`);
    } else {
      console.log(`\n  nothing installed at ${dest}`);
    }
  }
  console.log('');
  process.exit(0);
}

// --- sanity: are the payload files actually here? ---
if (!skills.length || !existsSync(scriptsDir)) {
  console.error(`\n  ! Package looks incomplete — skills/ or scripts/ missing under ${pkgRoot}\n`);
  process.exit(1);
}
for (const s of skills) {
  if (!existsSync(path.join(skillsSrc, s, 'SKILL.md'))) {
    console.error(`\n  ! skills/${s} has no SKILL.md\n`);
    process.exit(1);
  }
}

let version = '';
try { version = JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version; } catch {}

console.log('');
for (const root of ROOTS) {
  for (const skill of skills) {
    const dest = path.join(root, skill);
    const alreadyInstalled = existsSync(dest);
    if (alreadyInstalled && !has('force')) {
      // An update is the common case (re-running npx to pick up changes), so do it
      // rather than refusing — but say so, because silently overwriting a file
      // someone has edited locally is a nasty surprise.
      console.log(`  ${skill} already at ${dest} — updating (local edits to SKILL.md will be overwritten)`);
    }

    mkdirSync(path.join(dest, 'scripts'), { recursive: true });
    copyFileSync(path.join(skillsSrc, skill, 'SKILL.md'), path.join(dest, 'SKILL.md'));
    let n = 0;
    for (const f of readdirSync(scriptsDir)) {
      if (!f.endsWith('.mjs')) continue;
      copyFileSync(path.join(scriptsDir, f), path.join(dest, 'scripts', f));
      n++;
    }
    console.log(`  ${alreadyInstalled ? 'updated' : 'installed'} ${skill}${version ? ` v${version}` : ''}`);
    console.log(`  -> ${dest}  (SKILL.md + ${n} scripts)\n`);
  }
}

// --- dependency check: Playwright is what actually takes the screenshots ---
const require = createRequire(import.meta.url);
let playwright = false;
for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
  try { require.resolve(name); playwright = true; break; } catch {}
}
if (!playwright) {
  // Resolution is relative to this package; a project-local or global install
  // elsewhere may still be found at runtime, so this is a hint, not a failure.
  console.log('  ! Playwright not found from here. The skills need it to render pages:');
  console.log('      npm i -D playwright && npx playwright install chromium');
  console.log('    If it is already installed elsewhere, point NODE_PATH at that node_modules.\n');
} else {
  console.log('  playwright: found\n');
}

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) console.log(`  ! Node ${process.versions.node} detected; the scripts need Node 18+.\n`);

console.log('  Restart Claude Code / Codex (or reload the window) to pick them up.\n');
