// Orchestrator HTTP server. Runs alongside (and inside) the orchestrator
// process. Exposes a small JSON API that the dashboard consumes.
//
// Endpoints:
//   GET  /api/status           — current orchestrator state
//   GET  /api/cycles           — list cycles from state/ on disk
//   GET  /api/cycles/:id       — single cycle detail (artifacts + log tail)
//   GET  /api/cycles/:id/file  — raw file inside the cycle's state dir
//   POST /api/mode             — { mode: 'auto' | 'manual' }
//   POST /api/trigger          — { mode?: 'trend' | 'experimental' }
//   GET  /healthz              — liveness
//
// No external HTTP framework — Node's http is enough for this.

import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { URL } from 'node:url'
import { ROOT_DIR } from './utils/context.js'
import { readStatus, setMode, listActiveCycleIds } from './utils/status-store.js'
import {
  startDevServer,
  stopDevServer,
  getDevServer,
  listDevServers,
} from './dev-server-manager.js'
import {
  startDeploy,
  getDeployStatus,
  cancelDeploy,
  listDeploys,
} from './deploy-runner.js'
import {
  startCodebase,
  getCodebaseStatus,
  cancelCodebase,
  listCodebases,
} from './codebase-runner.js'

const STATE_DIR = path.join(ROOT_DIR, 'state')
const PROJECTS_DIR = path.join(ROOT_DIR, 'projects')

let triggerHandler = null
export function registerTriggerHandler(fn) {
  triggerHandler = fn
}

let cancelHandler = null
export function registerCancelHandler(fn) {
  cancelHandler = fn
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(body))
}

function text(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', (chunk) => (buf += chunk))
    req.on('end', () => {
      if (!buf) return resolve({})
      try { resolve(JSON.parse(buf)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

const PROJECT_ID_RE = /^[0-9]{8}-[0-9]{4}-[a-z0-9-]+$/

async function listCycles() {
  let entries = []
  try {
    entries = await fs.readdir(STATE_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const cycles = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (!PROJECT_ID_RE.test(e.name)) continue
    const dir = path.join(STATE_DIR, e.name)
    const cycle = await summarizeCycle(e.name, dir)
    cycles.push(cycle)
  }
  cycles.sort((a, b) => (a.project_id < b.project_id ? 1 : -1))
  return cycles
}

async function summarizeCycle(projectId, dir) {
  const files = await safeReadDir(dir)
  const has = (name) => files.includes(name)

  let spec = null
  if (has('project-spec.json')) {
    spec = await safeReadJson(path.join(dir, 'project-spec.json'))
  }

  let rejection = null
  if (has('rejection.json')) {
    rejection = await safeReadJson(path.join(dir, 'rejection.json'))
  }

  let humanReview = null
  if (has('human-review.json')) {
    humanReview = await safeReadJson(path.join(dir, 'human-review.json'))
  }

  let mode = null
  if (has('imagine-report.json')) mode = 'experimental'
  else if (has('search-report.json')) mode = 'trend'

  // Determine status from artifacts and log
  let status = 'in-progress'
  if (rejection) status = 'rejected'
  else if (has('cm-drafts.md')) status = 'completed'
  else if (has('frontend-verify-pass.md')) status = 'in-progress'

  // Cancellation detection — scan log tail for explicit cancel marker
  if (status === 'in-progress' && has('cycle.log')) {
    const tailForCancel = await tailLog(path.join(dir, 'cycle.log'), 5)
    if (tailForCancel.includes('PIPELINE CANCEL') || tailForCancel.includes('PIPELINE END cancelled')) {
      status = 'cancelled'
    }
  }
  // Stale in-progress detection: if cycle.log is older than 30 minutes and
  // no current status update, consider stalled. The current_cycle field on
  // orchestrator-status.json is the authoritative live indicator; this is
  // a heuristic for cycles that pre-date the status store.
  let lastActivityIso = null
  let stalled = false
  if (has('cycle.log')) {
    const stat = await fs.stat(path.join(dir, 'cycle.log')).catch(() => null)
    if (stat) lastActivityIso = stat.mtime.toISOString()
    if (status === 'in-progress' && stat && Date.now() - stat.mtimeMs > 30 * 60 * 1000) {
      stalled = true
    }
  }

  // Read the last few lines of cycle.log for the latest stage hint
  let lastStage = null
  if (has('cycle.log')) {
    const tail = await tailLog(path.join(dir, 'cycle.log'), 40)
    const startLines = tail
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('START '))
    if (startLines.length) lastStage = startLines[startLines.length - 1]
  }

  return {
    project_id: projectId,
    cycle_mode: mode,
    status: stalled && status === 'in-progress' ? 'stalled' : status,
    last_activity_iso: lastActivityIso,
    last_stage_hint: lastStage,
    name: spec?.name ?? null,
    slug: spec?.slug ?? null,
    one_liner: spec?.one_liner ?? null,
    fetish_object: spec?.fetish_object?.name ?? null,
    world: spec?.world?.name ?? null,
    rejection_trigger: rejection?.trigger ?? null,
    rejection_stage: rejection?.stage ?? null,
    has_human_review: !!humanReview,
    human_score: humanReview?.score ?? null,
  }
}

async function safeReadDir(dir) {
  try { return await fs.readdir(dir) } catch { return [] }
}

async function safeReadJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function tailLog(file, lines) {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return raw.split('\n').slice(-lines).join('\n')
  } catch {
    return ''
  }
}

async function getCycleDetail(projectId) {
  const dir = path.join(STATE_DIR, projectId)
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat || !stat.isDirectory()) return null

  const summary = await summarizeCycle(projectId, dir)
  const files = await safeReadDir(dir)

  const fileMeta = []
  for (const f of files) {
    if (f.startsWith('.')) continue
    const fp = path.join(dir, f)
    const st = await fs.stat(fp).catch(() => null)
    if (!st) continue
    fileMeta.push({
      name: f,
      size_bytes: st.size,
      modified_iso: st.mtime.toISOString(),
      is_dir: st.isDirectory(),
    })
  }

  const logTail = await tailLog(path.join(dir, 'cycle.log'), 200)

  // If there's a built project, surface the path
  let projectPath = null
  if (summary.slug) {
    const candidate = path.join(ROOT_DIR, 'projects', summary.slug)
    const candidateStat = await fs.stat(candidate).catch(() => null)
    if (candidateStat?.isDirectory()) projectPath = path.relative(ROOT_DIR, candidate)
  }

  return {
    ...summary,
    files: fileMeta,
    log_tail: logTail,
    project_path: projectPath,
  }
}

async function deleteCycle(projectId) {
  const stateDir = path.join(STATE_DIR, projectId)
  // Path-traversal guard — resolved path must remain inside STATE_DIR
  const resolvedState = path.resolve(stateDir)
  if (!resolvedState.startsWith(path.resolve(STATE_DIR) + path.sep)) {
    throw new Error('refusing to delete: path outside state/')
  }

  // Look up slug from spec before we wipe state, so we can also remove the
  // built project under projects/{slug}/.
  let slug = null
  const spec = await safeReadJson(path.join(stateDir, 'project-spec.json'))
  if (spec?.slug && /^[a-z0-9-]+$/.test(spec.slug)) slug = spec.slug

  const removed = { project_id: projectId, state_removed: false, project_removed: false }

  try {
    await fs.rm(stateDir, { recursive: true, force: true })
    removed.state_removed = true
  } catch (err) {
    removed.state_error = err.message
  }

  if (slug) {
    const projDir = path.join(PROJECTS_DIR, slug)
    const resolvedProj = path.resolve(projDir)
    if (resolvedProj.startsWith(path.resolve(PROJECTS_DIR) + path.sep)) {
      try {
        await fs.rm(projDir, { recursive: true, force: true })
        removed.project_removed = true
        removed.project_path = path.relative(ROOT_DIR, projDir)
      } catch (err) {
        removed.project_error = err.message
      }
    }
  }

  return removed
}

async function getCycleFile(projectId, relativePath) {
  // Restrict to the cycle's state directory to prevent path traversal.
  const dir = path.join(STATE_DIR, projectId)
  const target = path.resolve(dir, relativePath)
  const rel = path.relative(dir, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  try {
    return await fs.readFile(target, 'utf8')
  } catch {
    return null
  }
}

export function startServer({ port }) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      return res.end()
    }

    const url = new URL(req.url, `http://${req.headers.host}`)
    const p = url.pathname

    try {
      if (p === '/healthz') return text(res, 200, 'ok')

      if (p === '/api/status' && req.method === 'GET') {
        const status = await readStatus()
        return json(res, 200, status ?? { error: 'no status yet' })
      }

      if (p === '/api/cycles' && req.method === 'GET') {
        const cycles = await listCycles()
        return json(res, 200, { cycles })
      }

      const detailMatch = p.match(/^\/api\/cycles\/([^/]+)$/)
      if (detailMatch && req.method === 'GET') {
        const projectId = detailMatch[1]
        if (!PROJECT_ID_RE.test(projectId)) return json(res, 400, { error: 'invalid project_id' })
        const detail = await getCycleDetail(projectId)
        if (!detail) return json(res, 404, { error: 'not found' })
        return json(res, 200, detail)
      }

      const fileMatch = p.match(/^\/api\/cycles\/([^/]+)\/file$/)
      if (fileMatch && req.method === 'GET') {
        const projectId = fileMatch[1]
        if (!PROJECT_ID_RE.test(projectId)) return json(res, 400, { error: 'invalid project_id' })
        const f = url.searchParams.get('path')
        if (!f) return json(res, 400, { error: 'path query required' })
        const body = await getCycleFile(projectId, f)
        if (body === null) return json(res, 404, { error: 'not readable' })
        return text(res, 200, body)
      }

      if (p === '/api/mode' && req.method === 'POST') {
        const body = await readBody(req)
        if (!body.mode) return json(res, 400, { error: 'mode required' })
        await setMode(body.mode)
        return json(res, 200, await readStatus())
      }

      if (p === '/api/trigger' && req.method === 'POST') {
        if (!triggerHandler) return json(res, 503, { error: 'trigger not available' })
        const body = await readBody(req)
        try {
          const result = await triggerHandler({ cycleMode: body.mode })
          return json(res, 202, { accepted: true, ...result })
        } catch (err) {
          return json(res, 409, { error: err.message })
        }
      }

      const cancelMatch = p.match(/^\/api\/cycles\/([^/]+)\/cancel$/)
      if (cancelMatch && req.method === 'POST') {
        if (!cancelHandler) return json(res, 503, { error: 'cancel not available' })
        const projectId = cancelMatch[1]
        if (!PROJECT_ID_RE.test(projectId)) return json(res, 400, { error: 'invalid project_id' })
        const result = await cancelHandler({ projectId })
        if (!result.cancelled) return json(res, 404, { error: 'cycle not active or not cancellable' })
        return json(res, 202, result)
      }

      // Dev server controls — start, status, stop per cycle
      const devMatch = p.match(/^\/api\/cycles\/([^/]+)\/dev-server$/)
      if (devMatch) {
        const projectId = devMatch[1]
        if (!PROJECT_ID_RE.test(projectId)) return json(res, 400, { error: 'invalid project_id' })

        if (req.method === 'POST') {
          // Need slug — read it from the cycle's spec
          const spec = await safeReadJson(path.join(STATE_DIR, projectId, 'project-spec.json'))
          const slug = spec?.slug
          if (!slug) return json(res, 400, { error: 'cycle has no slug — nothing to run' })
          try {
            const entry = await startDevServer({ projectId, slug })
            return json(res, 202, entry)
          } catch (err) {
            return json(res, 500, { error: err.message })
          }
        }
        if (req.method === 'GET') {
          const entry = getDevServer(projectId)
          if (!entry) return json(res, 404, { error: 'not running' })
          return json(res, 200, entry)
        }
        if (req.method === 'DELETE') {
          const result = await stopDevServer({ projectId })
          return json(res, 200, result)
        }
      }

      if (p === '/api/dev-servers' && req.method === 'GET') {
        return json(res, 200, { dev_servers: listDevServers() })
      }

      // Deploy controls
      const deployMatch = p.match(/^\/api\/cycles\/([^/]+)\/deploy$/)
      if (deployMatch) {
        const projectId = deployMatch[1]
        if (!PROJECT_ID_RE.test(projectId)) return json(res, 400, { error: 'invalid project_id' })

        if (req.method === 'POST') {
          try {
            const result = await startDeploy({ projectId })
            return json(res, 202, result)
          } catch (err) {
            return json(res, 400, { error: err.message })
          }
        }
        if (req.method === 'GET') {
          const status = getDeployStatus(projectId)
          if (!status) return json(res, 404, { error: 'no deploy' })
          return json(res, 200, status)
        }
        if (req.method === 'DELETE') {
          const ok = cancelDeploy(projectId)
          return json(res, ok ? 202 : 404, { cancelled: ok })
        }
      }

      if (p === '/api/deploys' && req.method === 'GET') {
        return json(res, 200, { deploys: listDeploys() })
      }

      // Codebase controls — same lifecycle as deploy
      const codebaseMatch = p.match(/^\/api\/cycles\/([^/]+)\/codebase$/)
      if (codebaseMatch) {
        const projectId = codebaseMatch[1]
        if (!PROJECT_ID_RE.test(projectId)) return json(res, 400, { error: 'invalid project_id' })

        if (req.method === 'POST') {
          try {
            const result = await startCodebase({ projectId })
            return json(res, 202, result)
          } catch (err) {
            return json(res, 400, { error: err.message })
          }
        }
        if (req.method === 'GET') {
          const status = getCodebaseStatus(projectId)
          if (!status) return json(res, 404, { error: 'no codebase build' })
          return json(res, 200, status)
        }
        if (req.method === 'DELETE') {
          const ok = cancelCodebase(projectId)
          return json(res, ok ? 202 : 404, { cancelled: ok })
        }
      }

      if (p === '/api/codebases' && req.method === 'GET') {
        return json(res, 200, { codebases: listCodebases() })
      }

      const deleteMatch = p.match(/^\/api\/cycles\/([^/]+)$/)
      if (deleteMatch && req.method === 'DELETE') {
        const projectId = deleteMatch[1]
        if (!PROJECT_ID_RE.test(projectId)) return json(res, 400, { error: 'invalid project_id' })
        // Refuse to delete a live cycle
        if (listActiveCycleIds().includes(projectId)) {
          return json(res, 409, { error: 'cycle is live — cancel it first' })
        }
        const removed = await deleteCycle(projectId)
        return json(res, 200, removed)
      }

      return json(res, 404, { error: 'not found' })
    } catch (err) {
      return json(res, 500, { error: err.message, stack: err.stack })
    }
  })

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server)
    })
  })
}
