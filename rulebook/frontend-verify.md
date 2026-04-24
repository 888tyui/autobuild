# Frontend Verify Rulebook (Gate 2)

The Frontend Verify agent reads the built site under `projects/{slug}/`
and the supporting state files, then decides PASS or REJECT. On REJECT
it writes `state/{project-id}/rejection.md` and the cycle ends without
a CM draft.

The job is to catch the things that make AI-built sites read as
AI-built. Be specific. "Doesn't look polished" is not a useful
rejection reason. The next cycle reads your reasons and turns them
into constraints — vague reasons produce vague improvements.

## Mindset

You are not grading effort. You are grading whether the site *became
its world*, the way the project's spec and concept committed it to.
A passing site does not need to be flawless. It needs to feel
intentional. One brave choice beats ten safe-but-generic ones.

A site that looks template-shaped — even with bespoke colors and
custom copy — fails. The shape is what readers feel first.

## The four direction questions (any vague answer = REJECT)

These are the same four questions DIRECTION.md asks, applied to the
*built page*. Walk the routes. Then answer:

1. **Did this site become its world, or does it explain its world?**
   The spec named a `world` (e.g. "a doctor's clipboard", "a press
   proof"). Did the page step into that fiction, or did it produce a
   marketing description of it? If the world is named in copy but the
   layout is still a SaaS landing page, REJECT.

2. **What is the one thing they would describe to a friend?**
   Imagine a stranger closes the tab. What do they tell someone? If
   your honest answer is a generic adjective ("clean", "professional",
   "dark mode"), the site is generic. REJECT. The right answer is a
   concrete moment, image, gesture, or sentence.

3. **Could a person have made this, or only a template?**
   Find at least one mark of authorship — an off-grid choice, an
   in-joke, a mark, a copy line, a layout decision — that signals a
   human was here. If you find none, REJECT.

4. **Has anything been *refused*?**
   Restraint is visible. If the page contains everything a marketing
   template would contain (hero + features + CTAs + FAQ + footer
   columns), it has refused nothing. The page should *miss* obvious
   things on purpose. If it contains all defaults, REJECT.

## Hard checks (any single failure = REJECT)

### Mockup / placeholder leakage
- No `lorem`, `Lorem`, `Placeholder`, `Sample text`, or filler.
- No `Click me` / `Get Started →` buttons that go nowhere.
- No commented-out sections that should have been deleted.
- No `// TODO`, `// FIXME`, or `console.log` in shipped code. If a
  stub is needed, it must use `// STUB` or
  `// PENDING_SDK_INTEGRATION` and be documented in
  `web-build-notes.md`, not in shipped source.
- No unused imports or dead routes.
- Every marketing image listed in `marketing-images.json` must be
  referenced somewhere in `src/`. Orphaned assets fail.

### Wallet integration is real
- Wallet connect button actually opens a wallet picker (Phantom,
  Solflare, Backpack at minimum — never Ledger / hardware-USB per
  CLAUDE.md).
- Connected state actually changes the UI in a way that *belongs to
  the world* (a stamp on the clipboard, a serial on the press proof,
  a callsign on the control panel — never just a header address).
- Disconnect works.

### Brand alignment
- Brand tokens CSS file imported in `src/app/globals.css`.
- Source-named colors from the kit (e.g. `--anodize-blue`,
  `--enamel-cream`, `--phosphor-amber` — names should match the
  project's actual material palette, not always paper) are actually
  consumed in components. No hardcoded hex.
- Typography matches the kit's faces and weights.
- The fetish object from the kit appears in the site at least twice,
  in deliberate compositions — not as a tiny icon, not only as a
  favicon.

### External presence (Twitter / Token / Docs)
- Twitter handle from `spec.external_links.twitter.handle` is
  rendered somewhere on the home page within one screen of scrolling.
- Token CA from `spec.external_links.token.address` is rendered when
  present in spec; entirely absent when omitted from spec (do not
  invent).
- Docs link from `spec.external_links.docs` is rendered. If `kind:
  internal`, the `/docs` route exists and is voiced in-world.
- **Anti-default**: a top-right `Twitter | Discord | Docs` cluster
  with default link styling is forbidden. The links must integrate
  into the world (colophon, marginalia, sidebar, dedicated card
  stack). REJECT on default-cluster pattern.

## Structural anti-defaults (any single match = REJECT)

These are not word patterns. They are *shapes* the AI default
produces. Walk the source and the rendered page; if the page matches
the shape, REJECT — the shape is the failure regardless of what's
inside it.

- The hero-with-side-mockup composition: a left column with 3-line
  headline + body + CTA pair, a right column with a product
  screenshot or fake dashboard. This is the literal Linear / Vercel /
  YC SaaS default and is forbidden.
- The three-feature-card row: three roughly equal columns each with
  a small icon (or number, or emoji) at top, a 2–4 word heading, and
  a 1–2 line description. Numbered variants ("01 / 02 / 03") count.
  Tile-grid variants count.
- The "How it works" sectioned explainer with sequential steps.
- The trusted-by logo wall.
- The FAQ accordion with copywriter-invented questions.
- The footer divided into Product / Company / Resources / Legal
  columns.
- A page that scrolls past 3000px because sections were added to
  fill it. (Run `document.body.scrollHeight` in the rendered page —
  if > 3000 and the world doesn't *demand* the length, REJECT.)
- Section after section divided by the same horizontal rule.
- A nav with logo-left, centered links, CTA-right that does not
  belong to the world (a doctor's clipboard does not have a
  centered SaaS nav).

## Aesthetic anti-defaults (≥2 matches = REJECT)

- Pure black background with a single neon accent as the primary
  identity. (If the concept *committed* to this and the site has
  another distinctive move that lifts it, soft-note it; otherwise
  REJECT.)
- Parchment / vellum / aged-paper background with sepia / iron-gall
  / handwritten-style typography when the project's `world` is NOT a
  manuscript / journal / printed thing. The paper-and-ink aesthetic
  has become the AI-tasteful safe choice; it should appear only when
  the world genuinely lives on paper. If the world is e.g. a control
  panel, an aquarium, a kitchen, a press kit, or a workshop, but the
  page reads as parchment-with-warm-serif, REJECT — the world is not
  being honored.
- Purple-to-pink, blue-to-cyan, or any other gradient as the
  primary visual identity rather than as a deliberate single accent.
- Glassmorphism (translucent blurred panels) used decoratively.
- Stock-feeling 3D blob, low-poly geometric shape, or generic
  gradient mesh in the hero.
- Default shadcn / Material / Tailwind component shapes shipped
  without being themed.
- Identical card components used 4+ times in a row with no rhythm
  break.
- Hero copy in the format "The [adjective] [noun] for [audience]."
- Section headings like "Built for builders." / "Made with love." /
  "Reimagining the future of X."
- Generic motion (fade-in on scroll for every element). Either one
  large gesture or none.

## Soft checks (note, do not reject alone)

- Loading states exist where they matter.
- Empty states exist for any list/grid that could be empty.
- 404 page is customized and deepens the world.
- Mobile layout doesn't visibly break at 375px.
- Favicon is set and is not the framework default.
- Page title and meta description are written, not "Create Next App".
- Diegetic chrome from the world is present somewhere — version
  pin, time stamp, status dot, slug line, page number, etc.

## Rejection report format

```markdown
# Frontend Rejection: {project name}

**Cycle:** {YYYY-MM-DD HH:mm}
**Decision:** REJECT
**Direction question failed:** {1, 2, 3, 4 — name it}
**Hard fails:** {list, or "none"}
**Structural anti-defaults matched:** {list, or "none"}
**Aesthetic anti-default count:** {n} — {list}
**Soft notes:** {list}

## Specific evidence

{Cite file paths, line numbers, screenshot paths. Quote the
component code where the default pattern lives.}

## What to avoid in future cycles

- {bullet — concrete pattern, not abstract advice}
- {bullet}

## What worked

{1–2 sentences. There is almost always something. Name it specifically
so the next cycle keeps it.}
```

## Pass report format

```markdown
PASS — direction questions answered cleanly, structural defaults: 0,
aesthetic defaults: {n}/many — {one sentence naming the strongest
single thing the site does that makes it feel intentional}
```

Then proceed to stage 11 (CM).
