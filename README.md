# ui-change-preview

A [Claude Code](https://claude.com/claude-code) skill that shows a UI change
**before** it's made.

It screenshots your running app, injects the proposed CSS at runtime,
re-screenshots, and builds a side-by-side before/after sheet — so a visual change
gets reviewed and approved before any source file is touched.

Nothing is written to disk until a person has seen the after-shot and said yes.

## Why

Visual changes get judged by eye but made blind: edit CSS, describe the edit in
prose, hope the reviewer pictures what you pictured. Prose is a bad medium for a
4% lightness change.

Your app is already running. Render the change instead of describing it.

## Install

```bash
git clone https://github.com/<you>/ui-change-preview
cd ui-change-preview
./install.sh            # macOS / Linux / Git Bash
```

On Windows PowerShell:

```powershell
git clone https://github.com/<you>/ui-change-preview
cd ui-change-preview
./install.ps1
```

Installs to `~/.claude/skills/ui-change-preview/`. Restart Claude Code (or reload
the window) to pick it up. Pass `--force` to overwrite an existing install.

Requires Node 18+ and Playwright with Chromium:

```bash
npm i -D playwright && npx playwright install chromium
```

Playwright doesn't need to be in the project you're working on — the scripts
search the project, `NODE_PATH`, and the global npm root.

## Use

Once installed it triggers on its own for requests like "polish this login page",
"our dark mode looks off", or "show me what that would look like first". You can
also invoke it by name.

The scripts are usable standalone:

```bash
# baseline
node scripts/shoot.mjs --url http://localhost:5173/login --out ./baseline

# preview a change
node scripts/shoot.mjs --url http://localhost:5173/login --out ./after --css proposed.css

# comparison sheet
node scripts/compose.mjs --out comparison.png \
  --pair "Desktop|baseline/desktop-light.png|after/desktop-light.png"

# contrast maths
node scripts/contrast.mjs "#0d6efd on #121a18"
node scripts/contrast.mjs --find "#6b7280" --on "#f7f4f0,#ffffff"
```

Run any script with no arguments for its flags.

## What's in the box

| File | Does |
|---|---|
| `SKILL.md` | The workflow Claude follows |
| `scripts/shoot.mjs` | Screenshot with or without injected CSS, plus a fidelity report |
| `scripts/compose.mjs` | Before/after comparison sheet |
| `scripts/contrast.mjs` | WCAG ratios; `--find` walks a failing colour until it passes |

## The fidelity report

Every shot writes a `.fidelity.json` beside it, and `shoot.mjs` exits non-zero
when something looks wrong.

This exists because of the failure mode that ruins this technique: **a screenshot
rendered in a fallback font looks completely plausible and is worthless.** You'll
confidently judge weight and spacing from an image that isn't showing your
typeface. `fontsLoaded: []` catches it.

Use `--probe` to prove the injected CSS actually applied rather than inferring it
from pixels:

```json
{ "signupLink": ["a.signup", "color"], "mutedToken": [":root", "--muted"] }
```

## Limits

- **Load-time changes need `--rewrite`, not injection.** Swapping a stylesheet
  `<link>` in JS drops resolved webfonts and leaves you in a fallback. Rewriting
  the request does what editing the source would.
- **Systemic refactors can't be previewed.** Replacing thirty ad-hoc spacing
  values with a token scale is a real refactor, not an override. The skill says
  so instead of faking it.
- **Screenshots are one state.** Hover, focus, error, loading and empty states
  aren't in them, and neither is real content variation.

## License

MIT
