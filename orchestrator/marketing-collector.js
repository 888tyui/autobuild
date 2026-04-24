// Collects every marketing artifact for a cycle into
// `marketing/{slug}/`. Runs as a post-cycle soft stage so the user has
// a single, named folder per product to browse, share, or hand off.
//
// Pure node — no SDK cost, no agent invocation.

import fs from 'node:fs/promises'
import path from 'node:path'
import { ROOT_DIR } from './utils/context.js'
import { createLogger } from './utils/logger.js'

const log = createLogger('marketing')

const STATE_DIR = path.join(ROOT_DIR, 'state')
const PROJECTS_DIR = path.join(ROOT_DIR, 'projects')
const MARKETING_DIR = path.join(ROOT_DIR, 'marketing')

async function safeReadJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function copyIfExists(src, dst) {
  try {
    await fs.cp(src, dst, { recursive: true, force: true, errorOnExist: false })
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

/** Copy a single file when it exists. */
async function copyFile(src, dst) {
  try {
    await fs.mkdir(path.dirname(dst), { recursive: true })
    await fs.copyFile(src, dst)
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

export async function collectMarketingKit({ projectId }) {
  const spec = await safeReadJson(path.join(STATE_DIR, projectId, 'project-spec.json'))
  if (!spec?.slug) {
    throw new Error(`cycle ${projectId} has no slug — cannot collect marketing kit`)
  }
  const slug = spec.slug
  const stateDir = path.join(STATE_DIR, projectId)
  const projDir = path.join(PROJECTS_DIR, slug)
  const marketingDir = path.join(MARKETING_DIR, slug)

  await fs.mkdir(marketingDir, { recursive: true })

  const report = {
    project_id: projectId,
    slug,
    collected_at: new Date().toISOString(),
    copied: [],
    skipped: [],
  }

  const tryCopyDir = async (src, dst, label) => {
    const ok = await copyIfExists(src, dst)
    if (ok) report.copied.push(label)
    else report.skipped.push(`${label} (missing)`)
  }
  const tryCopyFile = async (src, dst, label) => {
    const ok = await copyFile(src, dst)
    if (ok) report.copied.push(label)
    else report.skipped.push(`${label} (missing)`)
  }

  // Brand assets — logos, favicon, fetish-object renders
  await tryCopyDir(
    path.join(projDir, 'public', 'brand'),
    path.join(marketingDir, 'brand'),
    'brand/',
  )

  // Marketing images — hero, og, social, feature, supporting
  await tryCopyDir(
    path.join(projDir, 'public', 'images'),
    path.join(marketingDir, 'images'),
    'images/',
  )

  // Branding concept document (what world / texture / voice)
  await tryCopyFile(
    path.join(stateDir, 'branding-concept.md'),
    path.join(marketingDir, 'branding-concept.md'),
    'branding-concept.md',
  )

  // Branding kit JSON (palette, typography, voice)
  await tryCopyFile(
    path.join(stateDir, 'branding-kit.json'),
    path.join(marketingDir, 'branding-kit.json'),
    'branding-kit.json',
  )

  // Marketing images manifest (prompts, intended uses)
  await tryCopyFile(
    path.join(stateDir, 'marketing-images.json'),
    path.join(marketingDir, 'marketing-images.json'),
    'marketing-images.json',
  )

  // CM drafts — launch thread, reply templates, 7-day plan
  await tryCopyFile(
    path.join(stateDir, 'cm-drafts.md'),
    path.join(marketingDir, 'social-drafts.md'),
    'social-drafts.md',
  )

  // References (Pinterest-style raw inspiration — optional, can be big)
  // Skip by default; the branding-concept.md already cites what
  // informed the direction. Users who want the raw references can
  // find them under state/{id}/references/.

  // Write a README that indexes everything
  await writeMarketingReadme({ marketingDir, spec, report })

  // Write a JSON sibling so the dashboard and other tools can read it
  await fs.writeFile(
    path.join(marketingDir, 'collected.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  )

  log.ok(
    `marketing kit collected slug=${slug} copied=${report.copied.length} skipped=${report.skipped.length}`,
  )
  return { marketingDir, report }
}

async function writeMarketingReadme({ marketingDir, spec, report }) {
  const name = spec.name ?? spec.slug
  const oneLiner = spec.one_liner ?? ''
  const world = spec.world?.name ?? ''
  const fetishObj = spec.fetish_object?.name ?? ''
  const twitter = spec.external_links?.twitter?.handle ?? ''
  const token = spec.external_links?.token?.address ?? ''
  const docs = spec.external_links?.docs?.path_or_url ?? ''

  const lines = [
    `# ${name} — marketing kit`,
    ``,
    oneLiner ? `> ${oneLiner}` : '',
    ``,
    world ? `**World** &nbsp;&nbsp; ${world}` : '',
    fetishObj ? `**Fetish object** &nbsp;&nbsp; ${fetishObj}` : '',
    twitter ? `**Twitter** &nbsp;&nbsp; \`${twitter}\`` : '',
    token ? `**Token** &nbsp;&nbsp; \`${token}\`` : '',
    docs ? `**Docs** &nbsp;&nbsp; ${docs}` : '',
    ``,
    `---`,
    ``,
    `## Included`,
    ``,
    ...report.copied.map((f) => `- \`${f}\``),
    ``,
    report.skipped.length ? `## Missing` : '',
    ...report.skipped.map((f) => `- \`${f}\``),
    ``,
    `## Layout`,
    ``,
    '```',
    `marketing/${spec.slug}/`,
    `├── brand/                 — logos, favicon, fetish-object renders`,
    `├── images/                — hero.png, og.png, social-square.png, feature-*`,
    `├── branding-concept.md    — direction document (texture, voice, palette sources)`,
    `├── branding-kit.json      — hex palette + typography + motion + voice`,
    `├── marketing-images.json  — per-image prompts and intended use`,
    `├── social-drafts.md       — launch thread, 7-day plan, reply templates`,
    `├── collected.json         — manifest of what was copied`,
    `└── README.md              — this file`,
    '```',
    ``,
    `_Collected ${report.collected_at} from cycle \`${report.project_id}\`._`,
  ]
    .filter((l) => l !== '')
    .join('\n')

  await fs.writeFile(path.join(marketingDir, 'README.md'), lines + '\n', 'utf8')
}
