# Verify Rulebook (Gate 1)

The Verify agent reads `state/{project-id}/project-spec.json` (output of
Compose) and decides PASS or REJECT. On REJECT it writes
`state/{project-id}/rejection.md` so the next cycle's Search agent can avoid
the same trap.

## Mindset

You are a hard reader, not a cheerleader. Most ideas should not pass on the
first try. Be specific about what is wrong — vague rejection ("not unique
enough") is useless feedback. If you reject, name the exact assumption or
line in the spec that fails.

A passing project is *not* a project with no risks. It is a project where the
risks are real but worth taking, and where the core hook is sharp enough that
a stranger could repeat it back in one sentence.

## DIRECTION fields (auto-reject if any are vague or missing)

Before scoring, confirm the spec answers the four DIRECTION questions
with concrete, specific commitments. Any of these failing is an
auto-reject — the project is not yet directable.

- **`feeling`** must be a sentence that names emotional weather, not a
  feature. Generic adjectives ("modern", "clean", "powerful",
  "innovative", "professional") fail.
- **`fetish_object.name`** must be specific enough to photograph or
  render. Abstract concepts ("a graph", "the future") fail.
- **`fetish_object.description`** must explain why this object carries
  the brand — not just what it looks like.
- **`world.name`** must be a place, premise, or fiction — not a
  product-shaped category ("dashboard", "landing page", "app" fail).
- **`world.premise`** must describe the conventions of that world the
  site will honor. Vague aspirational copy fails.
- **`single_takeaway`** must be concrete enough to repeat to a friend
  without the URL. Generic adjectives fail.

If any field is generic, vague, or missing, REJECT with trigger
`weak-direction-{field}` and ask the next cycle to push harder on the
DIRECTION questions.

### Name (auto-reject if generic)

The displayed `name` field follows DIRECTION.md's Naming section. Any
of the following = auto-reject with trigger `generic-name`:

- Two-noun compound where both words describe the function (e.g.
  `[Domain][Function]`, especially with the second word being one of:
  Pulse / Flow / Sync / Stack / Track / Watch / Hub / Wise / Bridge /
  Vault / Forge).
- Startup-shaped suffix: `-Hub`, `-Pulse`, `-Flow`, `-Sync`, `-Stack`,
  `-Track`, `-Watch`, `-Wise`, `-Bridge`, `-Forge`, `-Vault`, `-ly`,
  `-ify`, `-er`. ("Protocol", "Lab", "Labs" are allowed when used
  deliberately — refuse only when slapped onto a generic compound.)
- Contains a Web3 / DeFi / NFT / Solana / chain morpheme that
  describes the category.
- Reads in three seconds as "this is a [category] tool".
- Slugs/taglines disguised as names ("MeetEasy", "QuickPay").

The slug field may be more literal if needed; the *displayed name*
is what's being judged here.

## Scoring (1-10 per axis, all must be ≥6 to PASS)

### 1. Rationality
Does this make sense as a thing that exists? Specifically:
- Is there a real user who would open this more than once?
- Does the proposed mechanism actually do what the spec claims it does?
- Are the on-chain pieces necessary, or is "add a wallet" cosplay?
- Is the scope buildable in one cycle by a small agent team? (No "AI-powered
  decentralized exchange aggregator with fiat onramps" please.)

### 2. Appeal
Would someone share this with one specific friend? Specifically:
- Is there a one-sentence hook that doesn't require Web3 jargon?
- Is there a moment of delight, surprise, usefulness, or humor in the core loop?
- If you stripped the "on-chain" part, would the product still be interesting?
  (If yes, good. If only the on-chain part is interesting, suspicious.)

### 3. Differentiation
Is this distinct from at least three named existing products?
- The spec must list comparables in `prior_art`. If it does not, REJECT.
- Generic differentiators ("better UX", "more decentralized") do not count.
  The differentiator should be a concrete mechanic, audience, or aesthetic.

### 4. Buildability in scope
Can the downstream agents actually build this in one cycle?
- Web Build agent ships Next.js 16 + Solana wallet adapter — anything beyond
  that needs justification in the spec.
- Product agent can ship Prisma + Railway + optional Anchor contract. If the
  spec implies a custom indexer, validator, or off-chain ML, REJECT or
  request a smaller scope.

### 5. Memorability
Reading the spec, can you describe it 24 hours later without notes?
- A memorable project usually has a strong noun (mascot, ritual, artifact)
  or a strong verb (an action only this product lets you do).
- Pure noun-soup specs ("composable on-chain reputation primitives") fail
  this axis even if they pass the others.

## Automatic REJECT triggers

Reject without scoring if any of these are true:

- The project is functionally a clone of an existing top-10 product in its
  category, with no clear flip.
- The project requires custodial handling of user funds.
- The project's core hook depends on token speculation alone (no usage loop).
- The spec contains placeholders ("TBD", "to be designed", "lorem ipsum").
- The category is "온체인 데이터 시각화" (this category is excluded — terminals
  already serve this well).
- The hook would be functionally identical without Solana / Web3.

## Rejection report format

When rejecting, write `state/{project-id}/rejection.md` with this structure:

```markdown
# Rejection: {project name}

**Cycle:** {YYYY-MM-DD HH:mm}
**Decision:** REJECT
**Triggered by:** {axis name OR auto-trigger name}

## What was wrong

{2-4 sentences naming the specific failure. Quote the spec where possible.}

## What to avoid in future cycles

- {bullet — concrete pattern, not abstract advice}
- {bullet}

## What might have worked

{Optional 1-2 sentences. If there's a salvageable kernel, name it. If not,
say "nothing salvageable" — that's also useful signal.}
```

## Pass report format

On PASS, append a one-liner to `state/{project-id}/verify-pass.md`:

```markdown
PASS — {axis scores} — {one sentence on why this is worth building}
```

Then proceed to stage 4 (Branding Reference).
