---
name: design-brief
description: >-
  Decide how something should look before building it, from references a person
  chose, and keep the result off the default. Use this whenever new UI is about
  to be designed or redesigned and no written brief exists: "design a dashboard",
  "build the settings page", "make this look less generic", "it looks like every
  other AI app", "this looks like ChatGPT made it", "give it some personality",
  "redesign the landing page", "what should this look like". Also use when a
  finished UI needs checking for default-look fingerprints — Inter, one radius
  everywhere, indigo accent, a 4-up stat-tile row. Needs Playwright to measure
  reference pages and to run the check. Hand off to ui-change-preview once a
  specific change needs reviewing before it lands.
---

# Design brief

A model asked to build UI with no brief returns the median of everything it has
seen. That median is real and recognisable: Inter, a 4-up stat-tile row with
green delta badges, `rounded-xl` cards with a faint border and a small shadow, an
indigo accent, 24px of padding everywhere. It is competent and it is nobody's.
This is why a dashboard built this way can match, element for element, one a
stranger shows off on TikTok — you both accepted the same default.

Taste cannot be automated. What can be automated is the gap between *a decision
was made here* and *nothing was decided here*. This skill closes that gap in
three moves: a person picks the references, the references get measured into
numbers, and a check fails when the build drifts back to the median.

**The rule that makes this work: no UI code until the brief exists and names its
decisions. A reference nobody measured is a mood board, and a mood board gets
skimmed and ignored.**

## 1. Get references, and get them from a person

Ask for two or three. Never go and find them yourself — picking references *is*
the taste, and it is the one part of this that belongs to whoever is paying for
the work. "Find me something nice" produces the median with extra steps.

A URL is worth more than a screenshot, because it can be measured. A screenshot
still works; say which numbers are approximate when you only had pixels.

**Match the reference to the artifact.** This is where most briefs go wrong.
Awwwards, Godly, and Land-book are galleries of marketing and portfolio sites:
full-bleed WebGL, scroll-jacking, 120px type, a four-second intro. They are an
excellent source for a landing page and an actively bad one for a dashboard —
copy that into a table of 400 rows and you get something beautiful that nobody
can read at 8am. For dense product UI the useful references are the dense
products: Linear, Stripe, Height, Retool, a terminal, a broadsheet newspaper's
data pages.

If the references don't fit the artifact, say so before measuring them. One
honest sentence here saves a whole redesign.

And keep the references as constraints, not targets. Pulling one site's exact
palette, type and layout is not inspiration, it is a copy — and the brief should
read like a decision, not like a diff against someone else's homepage.

## 2. Measure them — do not admire them

The point is to leave with numbers. `shoot.mjs` takes any URL, not just
localhost, so a reference page can be probed exactly like your own app:

```bash
node scripts/shoot.mjs --url https://reference.example --out ./ref \
  --viewport desktop --probe ref-probe.json --full
```

```json
{
  "h1":     ["h1", "fontSize"],
  "h1face": ["h1", "fontFamily"],
  "body":   ["p", "fontSize"],
  "accent": ["a", "color"],
  "radius": [".card", "borderTopLeftRadius"]
}
```

Read the ratios, not the raw values. A reference at 64px/16px is telling you
*4x*, which survives being ported into a denser layout; 64px itself does not.

Then get the contrast facts straight before they become opinions:

```bash
node scripts/contrast.mjs "#c1471c on #f7f4f0"
```

Six numbers are enough: type scale ratio, body size, two or three radii, the
accent hue, row density, and the dominant spacing step.

## 3. Write the brief

Write it to `.agents/design-brief.md`. That path is deliberate — Codex reads
`.agents/`, and committing it means the next session, agent or person inherits
the decisions instead of re-deriving them.

Every section is a decision with a reason. A section you cannot justify is a
section where the default is still in charge.

```markdown
# Design brief — <artifact>

**References** (chosen by <who>, <date>)
- <url> — what we are taking: <the one thing>
- <url> — what we are explicitly NOT taking: <the thing that suits them, not us>

**The artifact** <what it is, who reads it, what they do in the first 5 seconds>

**Type** <face + why> / scale <ratio> / body <px> / <how many sizes total>
**Colour** ground <hex> / ink <hex> / accent <hex> at hue <n> — <where it earns its place>
**Shape** radii <px list> and what each belongs to / borders or shadows, not both
**Density** row height <px> / spacing steps <px list>
**The signature move** <the one thing a person would describe to someone else>

**Banned here** <the defaults this artifact must not fall back to>

<!-- machine-readable: slop-check.mjs reads these four lines -->
accent-hue: <n>
radii: <n, n>
font: <declared face>
allow: <gradients | cards | flat-scale — only what you deliberately chose>
```

The signature move matters more than it looks. If nothing on the page can be
described to a third party in one sentence — "the one where the table is the
whole interface" — then the page has no identity to defend, and it will drift
back to the median one small decision at a time.

## 4. Build, then check

Build against the brief. Then measure what actually rendered:

```bash
node scripts/slop-check.mjs --url http://localhost:5173/dashboard \
  --brief .agents/design-brief.md
```

It exits 3 with findings, 0 when clean. Every finding is one of two things:

- **A decision you skipped.** Fix the UI.
- **A decision you made that happens to match a default.** Declare it in the
  brief's machine-readable lines and the check goes quiet. Indigo is not
  forbidden; *unchosen* indigo is.

Those are the only two outcomes. Never silence a finding you did not actually
decide — a brief that lists every default as deliberate is a brief that has
stopped doing its job.

The rules are checked independently of the browser:

```bash
node scripts/slop-check.mjs --self-test
```

## 5. Hand off to ui-change-preview

`slop-check` tells you the look is not generic. It cannot tell you it is *good* —
no script can. Once you have a specific change in hand, switch to
**ui-change-preview** to render it before and after and put it in front of a
person. That skill is the one that gets a yes.

## What this does not do

- **It does not supply taste.** It makes unmade decisions visible and holds the
  made ones in place. Someone still has to choose the references.
- **It does not read a gallery for you.** Awwwards and similar sites disallow
  crawling their listing and search pages in `robots.txt`, have no public API,
  and render through heavy client-side JS. Individual pages a person hands you
  are fine to load and measure; harvesting the gallery is neither reliable nor
  theirs to give.
- **It does not catch everything.** The checks cover eight fingerprints. The
  ninth is whatever becomes the default next year — when you see a new tell in
  the wild, add it to `audit()` with a fixture, not to a prompt.

## Output

```markdown
**Brief** `.agents/design-brief.md` — <the decision that drove the rest>

**References** <what was taken from each, and what was left>

**Measured** type <ratio>, accent hue <n>, radii <list>, density <px>

**slop-check** <n> findings -> <n after the fixes>, <n> declared as deliberate

**Undecided** <anything the brief still leaves to the default, named plainly>
```
