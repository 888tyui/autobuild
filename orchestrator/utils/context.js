import path from 'node:path'
import fs from 'node:fs/promises'
import { customAlphabet } from 'nanoid'

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..')
const slugId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6)

function pad(n, w = 2) {
  return String(n).padStart(w, '0')
}

export function newProjectId(now = new Date()) {
  const yyyy = now.getFullYear()
  const date = `${yyyy}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`
  return `${date}-${time}-${slugId()}`
}

export async function createCycleContext({ projectId, dryRun = false, mode, abortController } = {}) {
  const id = projectId ?? newProjectId()
  const cycleStartedAt = new Date().toISOString()
  const stateDir = path.join(ROOT_DIR, 'state', id)
  const projectsDir = path.join(ROOT_DIR, 'projects')

  if (!dryRun) {
    await fs.mkdir(stateDir, { recursive: true })
  }

  return {
    projectId: id,
    cycleStartedAt,
    rootDir: ROOT_DIR,
    stateDir,
    projectsDir,
    dryRun,
    mode: mode ?? 'trend',
    abortController: abortController ?? null,
  }
}

export function pickMode(forced) {
  if (forced === 'trend' || forced === 'experimental') return forced
  // default rotation: 1/3 chance experimental, 2/3 trend
  return Math.random() < 1 / 3 ? 'experimental' : 'trend'
}

export async function readSpec(ctx) {
  const specPath = path.join(ctx.stateDir, 'project-spec.json')
  try {
    const raw = await fs.readFile(specPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function getSlug(ctx) {
  const spec = await readSpec(ctx)
  return spec?.slug ?? null
}

export async function checkRejection(ctx) {
  const rj = path.join(ctx.stateDir, 'rejection.json')
  try {
    await fs.access(rj)
    return JSON.parse(await fs.readFile(rj, 'utf8'))
  } catch {
    return null
  }
}

export { ROOT_DIR }
