---
name: ui-change-preview
description: >-
  Show a UI change before making it. Screenshots a running web app, injects the
  proposed CSS at runtime, re-screenshots, and builds a side-by-side before/after
  sheet — so a visual change gets reviewed and approved before any source file is
  edited. Use this skill whenever someone is about to change how a running app
  looks and a person will judge the result: "polish this UI", "fix the spacing",
  "make this look less generic", "change the colours", "improve this login page",
  "our dark mode looks off", "can you show me what that would look like first",
  "preview this change", "before and after". Also use it when reporting that a
  visual change is done — re-shoot and prove the live app matches what was
  approved. Needs a running dev server (or any reachable URL) and Playwright.
---

# UI change preview

Visual changes are judged by eye, but they are usually made blind: edit CSS,
describe the edit in prose, hope the reviewer imagines the same thing you did.
Prose is a terrible medium for a 4% lightness change.

This skill closes that loop. The app is already running, so render the change
before committing to it — injected CSS costs one command and is free to throw
away, while an edit to a design system that turns out wrong costs a revert and
the reviewer's trust.

**The rule that makes this work: nothing is written to disk until a person has
seen the after-shot and said yes.**

## Workflow

### 1. Find the target and confirm it renders

Get the URL of the running app. If there is no dev server, start one — the whole
method depends on a live page. Check it answers before you build anything on top
of it:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/login
```

Settle scope too: which page, which viewports, which themes. A change that
improves desktop light and breaks mobile dark is a regression, and you only find
that out by shooting all four.

### 2. Shoot the baseline

```bash
node scripts/shoot.mjs --url http://localhost:5173/login --out ./baseline \
  --viewport desktop --theme light
```

Repeat per viewport and theme you scoped. Common set: desktop light, desktop
dark, mobile light.

If the app persists its theme rather than following the OS, pass the key it
reads so the seeded value is in place before the page's own script runs:

```bash
node scripts/shoot.mjs --url ... --out ./baseline --theme dark --theme-key "app.theme"
```

Without that, an app whose `<head>` script writes `data-theme` from
`localStorage` will ignore the emulated colour scheme and you will shoot light
mode twice, then puzzle over why "dark" looks identical.

### 3. Write the change as a CSS file

Put the proposal in one `.css` file, with a comment per change saying what it
fixes. This file is the unit of review — it is what you will paste into the
conversation, and later the thing you translate into real edits.

```css
/* Link colour: was Bootstrap's #0d6efd, 3.93:1 on the dark card — fails AA. */
a { color: var(--accent-ink); }

/* --muted measured 4.41:1 on the page ground. This clears AA on both surfaces. */
:root { --muted: #5f6b64; }
```

Prefer changing tokens over patching components. If a project has a token layer,
a one-line token change that fixes forty components is both a better preview and
a better eventual edit than forty overrides.

### 4. Shoot the preview

Same script, plus `--css`. Using one script for both shots is deliberate: any
difference between the images is then attributable to your CSS rather than to
some difference in how the two pages were loaded.

```bash
node scripts/shoot.mjs --url http://localhost:5173/login --out ./after \
  --viewport desktop --theme light --css proposed.css
```

### 5. Verify the preview is real — do not skip this

Every run writes `<viewport>-<theme>.fidelity.json`, and `shoot.mjs` exits 3 when
something looks wrong. Read it before trusting the image.

The failure that matters most: **a screenshot rendered in a fallback font looks
plausible and is worthless.** You will happily judge type weight and spacing off
an image that is not showing your typeface. `fontsLoaded: []` means exactly that,
and it is why the fidelity report exists.

Use `--probe` to prove the injected CSS actually took effect, rather than
inferring it from pixels:

```json
{ "signupLink": ["a.signup", "color"], "mutedToken": [":root", "--muted"] }
```

```bash
node scripts/shoot.mjs --url ... --css proposed.css --probe probe.json --out ./after
```

If a probe comes back `null` or unchanged, your selector lost a specificity
fight — fix that before showing anyone the sheet.

### 6. Handle changes that injection cannot reach

Some things are decided at load time and cannot be patched afterwards. Webfonts
are the usual case: swapping a stylesheet `<link>` in JS drops the already
resolved faces and leaves you in a fallback. Rewrite the request instead, which
is exactly what editing the source would do:

```bash
node scripts/shoot.mjs --url ... --out ./after \
  --rewrite "fonts.googleapis.com/css2=https://fonts.googleapis.com/css2?family=Manrope:wght@400..800&display=swap"
```

Verify the resource you are switching to actually exists before building a case
on it. Font services return an error page for an invalid axis range, and a
variable font's weight axis is a hard limit — asking for a weight outside it
silently clamps forever, so no amount of loading fixes it:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://fonts.googleapis.com/css2?family=Manrope:wght@400..900"
```

**And some changes genuinely cannot be previewed this way.** Replacing thirty
ad-hoc spacing values with a token scale across twenty stylesheets is a real
refactor, not an override. Say so plainly and handle it as ordinary reviewed
edits. Faking a preview of a systemic change is worse than not previewing it,
because it implies a confidence the screenshot does not support.

### 7. Build the comparison sheet

```bash
node scripts/compose.mjs --out comparison.png --title "Login polish" \
  --pair "Desktop light|baseline/desktop-light.png|after/desktop-light.png" \
  --pair "Desktop dark|baseline/desktop-dark.png|after/desktop-dark.png" \
  --pair "Mobile 390px|baseline/mobile-light.png|after/mobile-light.png" \
  --note "Link themed from tokens — was #0d6efd, 3.93:1 on dark, failed AA" \
  --note "--muted 4.41:1 -> 5.08:1, clears AA on page ground and cards"
```

Side by side matters. A reviewer comparing across two messages holds the first
image in memory and misses small deltas; adjacent, the same delta is obvious.

Attach measured numbers to each note. `contrast.mjs` turns a colour opinion into
a ratio, and `--find` walks a failing colour darker until it passes on every
surface you name:

```bash
node scripts/contrast.mjs "#0d6efd on #121a18" "#5f6b64 on #f7f4f0"
node scripts/contrast.mjs --find "#6b7280" --on "#f7f4f0,#ffffff"
```

### 8. Show it, then wait

Put the sheet in front of the person. State what changed, what it measured
before and after, and — importantly — what you could not preview.

Then stop. The point of the whole exercise is that they get to say no cheaply.

### 9. Apply, then prove it

Once approved, translate the CSS file into real edits: token changes in the token
layer, component fixes in their own files, load-time changes in the HTML. Prefer
the smallest edit that generalises.

Then re-shoot the live app with **no** `--css` and compare against the approved
sheet. This catches the gap between "worked as an override" and "works in the
cascade" — an injected rule sits at the end of the document and wins fights that
the same rule, written into a stylesheet, will lose. Reporting a visual change as
done without this step is reporting a guess.

## Output

Lead with the sheet, then a short accounting:

```markdown
[comparison sheet]

**Changed**
- <what>, <measured before> -> <measured after>

**Not previewable**
- <systemic change and why injection could not show it>

**Fidelity**
- Fonts loaded: <yes/which>. Probes: <what confirmed the CSS applied>.
```

Keep it honest about limits. Screenshots are one state: hover, focus, error,
loading and empty states are not in them, and neither is real content variation.
Say which of those the change might affect.

## Setup

Needs Node and Playwright with Chromium:

```bash
npm i -D playwright && npx playwright install chromium
```

Playwright does not have to be in the project. These scripts search the project,
`NODE_PATH`, and the global npm root, because the skill usually lives outside the
repo it is pointed at. If resolution fails, name the location:

```bash
NODE_PATH=/path/to/node_modules node scripts/shoot.mjs --url ...
```

Run `node scripts/shoot.mjs` with no arguments for the full flag list.
