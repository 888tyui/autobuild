# autobuild

Automated Web3 product factory powered by Claude Code subagents.

## What it does

Every 5 hours, an orchestrator runs an 11-stage agent pipeline that researches a Web3 product idea, validates it, designs branding, builds the frontend + backend (with Solana wallet integration and optional Anchor contracts), and drafts launch content for Twitter. Rejected projects leave a report so the next cycle learns what to avoid. Humans can score finished projects after the fact and that signal feeds back into future cycles.

## Pipeline

```
1. Search             → trends, keywords, stack research
2. Compose            → project specification
3. Verify             → gate (rationality + appeal)
4. Branding Reference → Playwright scrapes references (Awwwards, Pinterest, etc.)
5. Branding           → concept, feeling, texture
6. Branding Kit       ┐ parallel
7. Marketing Image    ┘  (Gemini Nano Banana)
8. Web Build          ┐ parallel  (Next.js 16 + Solana wallet adapter)
9. Product            ┘  (Prisma + Railway backend, optional Anchor contract)
10. Frontend Verify   → gate (completeness, anti-AI-generic)
11. CM                → Twitter draft posts (no API call, file only)
```

## Layout

```
presets/         project categories, branding moods, reference sources
rulebook/        verification criteria for the two gates
schema/          JSON schemas for state files
orchestrator/    Node scheduler + pipeline runner (Phase 2)
.claude/agents/  11 subagent definitions
state/           per-cycle artifacts: {project-id}/...
memory/          accumulated rejection patterns + human review scores
projects/        actually built products: {YYYYMMDD-HHmm}-{slug}/
```

## Conventions

- All projects target **Solana** (CLAUDE.md global rule: exclude Ledger / hardware-USB wallets).
- Default stack: **Next.js 16 + Prisma + Railway**, with Anchor when contracts are warranted.
- All rejected projects are kept under `projects/` for human review and scoring.
- Human reviews live at `state/{project-id}/human-review.md` and feed back into Search.

## Setup

```bash
npm install
npx playwright install chromium
```

Auth:

- **Local runs:** if you've authenticated Claude Code (`claude` in
  terminal at least once), the SDK reuses that login. Nothing else
  needed.
- **Remote / Railway runs:** Anthropic policy disallows reusing the
  claude.ai login for third-party deployments. Set
  `ANTHROPIC_API_KEY=...` from <https://console.anthropic.com/>.

Required env vars:

- `GEMINI_API_KEY` — Gemini Nano Banana for marketing image generation
  (the agent invokes `~/.claude/tools/gemini-image/generate.mjs`).
  Already configured in `~/.claude/settings.json` per CLAUDE.md.

Optional:

- `ANTHROPIC_API_KEY` — only when Claude Code login is unavailable
  (remote deploys, CI, etc.).
- `AUTOBUILD_CRON` — cron expression override. Default `0 */5 * * *`
  (every 5 hours on the hour).

## Run

```bash
# one-time setup (installs orchestrator + dashboard deps + playwright)
npm run setup

# start the whole thing — orchestrator service + dashboard UI
npm start

# then open the dashboard at http://localhost:4000
```

Two long-lived processes start (via concurrently):
- **orchestrator** on `:4001` — cron scheduler + HTTP API + status writer
- **dashboard** on `:4000` — Next.js UI that reads / controls the orchestrator

Other useful entry points:

```bash
# one cycle from CLI (no service, no dashboard), then exit
npm run cycle:once

# dry-run — verify pipeline graph without invoking agents
npm run cycle:dry

# orchestrator service starting in MANUAL mode (cron paused, dashboard
# still drives manual triggers)
npm run orchestrator:manual

# resume / re-run a specific cycle by ID
node orchestrator/index.js --once --project-id 20260424-1500-abc123
```

## Dashboard

`http://localhost:4000` — operations console. Three pages:

- **Overview** — live cycle progress, mode toggle (auto/manual), manual
  trigger buttons (▶ trend / ▶ experimental), counts per status, recent
  cycle list, last-result block.
- **Cycles** — full list with filters (status, mode) and free-text
  search across name / world / fetish object.
- **Cycle detail** — every artifact in `state/{id}/` with click-to-view
  preview, cycle log tail, project path link.

The dashboard polls the orchestrator HTTP API every 3–5 seconds. It is
read-only against `state/` on disk; mutations happen only via the
orchestrator's `/api/mode` and `/api/trigger`.

## How a cycle works

1. `index.js` creates a cycle context (`project_id`, `state/{id}/`,
   `mode`).
2. `pipeline.js` walks the 9-stage list (stage 1 is `search` in trend
   mode or `imagine` in experimental mode). Single stages run
   sequentially; the Branding Kit ‖ Marketing Image and Web Build ‖
   Product pairs run via `Promise.all`. Stage progress is published to
   `state/orchestrator-status.json` for the dashboard to read.
3. `agent-runner.js` invokes each subagent via
   `@anthropic-ai/claude-agent-sdk` `query()` — the `.md` agent body
   becomes `systemPrompt`, the frontmatter `tools` becomes
   `allowedTools`, `model` is honored. No turn cap by default.
4. Gates (Verify, Frontend Verify) check for `state/{id}/rejection.json`
   after their agent completes. If present, the pipeline ends without
   running downstream stages, and the rejection is logged for the next
   cycle's Search/Imagine to learn from.
5. Branding Reference invokes `reference-scraper.js` via Bash, which uses
   Playwright to capture screenshots into `state/{id}/references/`.

## Auto vs manual mode

The orchestrator runs both modes from the same process; the dashboard
flips between them.

- **auto** — cron fires on `AUTOBUILD_CRON` (default `0 */5 * * *`).
  Manual triggers from the dashboard still work.
- **manual** — cron is paused. Cycles only run when the dashboard
  triggers one. Useful for when you want to babysit / debug rather than
  run hands-off.

The orchestrator persists mode in `state/orchestrator-status.json`, so
restarting the orchestrator does not change it (use `--start-mode` to
override on boot).

## Status

- **Phase 1** ✅ — base files, presets, rulebook, schemas, 11 agent definitions.
- **Phase 2** ✅ — orchestrator (`index.js`, `pipeline.js`, `agent-runner.js`),
  Playwright scraper (`reference-scraper.js`), Claude Agent SDK wiring.
  Dry-run verified.
- **Phase 3** (next) — first real cycle, observability, retry policy,
  human-review tooling, Railway deployment notes.
