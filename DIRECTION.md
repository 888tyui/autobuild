# DIRECTION

The shared design philosophy for every project autobuild ships.
Read by the Compose, Branding, Branding Kit, Branding Reference, Marketing
Image, Web Build, and Frontend Verify agents at the top of every cycle.
This is **direction**, not a menu. There are no presets, no categories,
and no example sites referenced here on purpose. Every cycle invents.

---

## The bias

When uncertain, lean toward:

- **commitment over safety** — one strong choice beats four hedged ones
- **deconstruction over template** — break the grid on purpose, overlap
  containers, let type cross other elements, abandon the safe SaaS layout
- **specificity over genericness** — name a real thing, color, place,
  hour, object, person; never "modern", "clean", "powerful", "innovative"
- **becoming over describing** — the site *is* the metaphor, never
  *explains* it
- **air over fill** — a near-empty page is almost always more confident
  than a section-stacked one
- **one type with voice over three balanced fonts** — let one face do
  the talking, treat the rest as utility
- **color from the world over color from a palette generator** — name
  it the way a paint catalog or a pigment supplier would
- **diegetic UI over chrome UI** — menus, badges, status indicators,
  metadata strips should *belong to the world the site is set in*
- **a single fetish object over a generic hero illustration** — the
  brand should have a thing it returns to: a device, an artifact, a
  photograph, a recurring mark — something with weight
- **wit that lowers the temperature over earnestness that raises it** —
  one self-aware line ("the world's most unnecessarily X") beats a
  paragraph of value-prop copy
- **author's hand visible over template seamlessness** — a slightly
  off-grid mark, a handwritten tag, a rough edge that signals a person
  was here

When in genuine doubt between two directions, take the more extreme one.
The system corrects toward safety on its own; you do not need to help.

---

## Naming

The project name is part of its first impression. The default LLM
behavior is to produce two-noun compounds where both nouns describe
the function: a domain word stuck onto a function word, often
camelCased, often ending in -Hub / -Lab / -Pulse / -Flow / -Sync /
-Stack / -Track / -Watch. The name reads in three seconds as
"a [category] tool". Refuse this entire family.

### Refuse
- Two-noun stacks where both words describe what the product does.
- The "domain + function" concatenation pattern in any casing.
- Startup-shaped suffixes: -Hub, -Pulse, -Flow, -Sync, -Stack, -Track,
  -Watch, -Wise, -Bridge, -Forge, -Vault, -ly, -ify, -er.
  ("Protocol", "Lab", "Labs", "Network", "Finance" are *fine* when
  used deliberately — they signal a kind of work, not a category
  cliché. Refuse them only if they're slapped on a generic two-noun
  compound to dress it up.)
- Names that read as a slug or a tagline.
- Names whose meaning the visitor decodes in three seconds.
- Names that contain a Solana / DeFi / NFT / Web3 jargon morpheme.

### Bias toward
- A single invented word with weight — no obvious morpheme breakdown.
- A real word that meant something else first, borrowed from a
  domain unrelated to the product.
- A place name or proper noun.
- A name that is *oblique* to what the product does — the visitor
  learns what the name means after using it, not before.
- A name that does not obviously read as a software product.
- One word, when one word can carry the weight.

The good name is one the visitor remembers *because* they cannot
immediately decode it. The slug is allowed to be more descriptive if
needed for SEO, but the displayed name is the brand.

---

## Four questions, answered before any pixel

Every project commits to a one-sentence answer for each before any
visual work begins. Vague answers fail Verify.

1. **What does this product actually feel like to use?**
   Not what it does — what it *feels* like. The emotional weather.
   Specific, not vague. Generic adjectives ("modern", "clean",
   "powerful") fail.

2. **What is its fetish object?**
   The single physical thing the brand returns to. Must be
   photograph-able or render-able — abstract concepts do not count.

3. **What world is the site set in?**
   This is not the *aesthetic*. It is the *premise* — the fiction the
   site asks the visitor to step into. Not "dashboard" / "landing
   page" / "app".

4. **What is the one thing they remember after closing the tab?**
   If the answer is a generic adjective ("clean", "professional",
   "the design"), start over. The right answer is concrete enough that
   the visitor could describe it to a friend without the URL.

---

## What to refuse

These patterns ship by default when no one is looking. Refuse them.

### Layout
- The hero-headline-plus-side-mockup composition (Linear, Vercel,
  every YC SaaS — it is the literal default).
- The three-column feature row, regardless of whether the columns use
  icons, numbers, or emoji.
- The "How it works" sectioned explainer.
- The trusted-by logo wall.
- The FAQ accordion no real user asked.
- The footer divided into Product / Company / Resources / Legal.
- Any page that scrolls past 3000px because sections were added to
  fill the page.
- Section after section divided by the same horizontal rule.

### Aesthetic defaults
- Pure black background with a single neon accent — the default
  cypherpunk costume of the last several years.
- Purple-to-pink, blue-to-cyan, or any other gradient used as the
  primary visual identity rather than a deliberate accent.
- Glassmorphism (translucent blurred panels) used decoratively.
- Stock-feeling 3D blob, low-poly geometric shape, or generic gradient
  mesh as a hero decoration.
- Default shadcn / Material / Tailwind palette and component shapes
  shipped without being themed.
- The "fintech-dashboard mockup beside a headline" hero, even when
  the data shown is project-specific.

### Copy defaults
- "The [adjective] [noun] for [audience]."
- "Built for builders." "Made with love." "Reimagining the future of X."
- "Excited to announce..." / "We've been heads down building..."
- Sentence-case body copy in 16px gray on slightly-darker-gray.
- Paragraphs that explain what the product does instead of letting the
  product show what it does.

---

## What to bias toward

Direction, not prescription. The cycle invents inside these.

### Layout
- Pages that are mostly air, with one composition that earns the air.
- Compositions where text and image cross, overlap, share columns,
  bracket each other, refuse to sit in clean tiles.
- A single large object — photographed, rendered, drawn, scanned —
  that the page is built around rather than decorated with.
- Diegetic chrome — whatever metadata belongs to the world the site
  is set in.
- Structures borrowed from the world's own conventions when the
  project supports them.
- Asymmetry. Negative space that is structural, not decorative.

### Aesthetic
- Color from a real source — name what the color is *of*, not its
  role.
- Texture from the world the project is set in, never as default.
  Whatever the world's substrate actually is — derive it from the
  spec's `world` and `fetish_object`, do not reach for a familiar
  recipe. Nothing decorative.
- Typography that signals position before it is read.
- A single consistent type voice for everything load-bearing; utility
  type is allowed to be neutral.
- One color move that breaks the rest, when it earns the break.

### Copy
- The fewest words that work.
- One self-aware line per page that lowers the marketing temperature.
- Specific numbers, dates, and proper nouns over qualifiers.
- A voice that sounds like one person, not a brand committee.

---

## Verification — the questions that matter

The Frontend Verify gate asks the agent to look at the built page and
answer:

1. **Did this site become its world, or does it explain its world?**
   If a stranger landed here, would they step into a fiction, or read a
   pitch?
2. **What is the one thing they would describe to a friend?**
   If the answer is a generic adjective ("clean", "dark mode",
   "professional"), reject.
3. **Could a person have made this, or only a template?**
   Is there at least one mark, choice, line of copy, or layout
   decision that signals authorship?
4. **Has anything been *refused*?**
   Restraint is visible in good design. If the page contains everything
   a marketing template would contain, it has refused nothing.

A passing project answers all four cleanly.
A rejected project leaves a report naming the specific failure so the
next cycle starts from that failure as a constraint.
