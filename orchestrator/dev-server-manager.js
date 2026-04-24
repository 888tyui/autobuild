// In-process registry of dev servers we've spawned. Each entry runs
// `npm run dev -- -p <port>` inside the project's directory. We track
// the child process, the port, ready-state, and a tail of its log.
//
// Cross-platform process termination via `tree-kill` — npm spawns Next.js
// as a child, and on Windows killing only the npm process leaves Next.js
// orphaned. tree-kill walks the tree.

import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs/promises'
import treeKill from 'tree-kill'
import { ROOT_DIR } from './utils/context.js'

const PROJECTS_DIR = path.join(ROOT_DIR, 'projects')
const PORT_BASE = 3000
const PORT_MAX = 3300
const LOG_TAIL_BYTES = 8192

const READY_PATTERNS = [/Local:\s+http:\/\/.+:(\d+)/i, /Ready in \d+/]

const servers = new Map() // projectId -> entry

async function findFreePort(start = PORT_BASE, max = PORT_MAX) {
  // Avoid ports already used by tracked dev servers
  const taken = new Set([...servers.values()].map((e) => e.port))
  for (let p = start; p <= max; p++) {
    if (taken.has(p)) continue
    if (await isPortFree(p)) return p
  }
  throw new Error(`no free port in [${start}, ${max}]`)
}

function isPortFree(port) {
  // Check both IPv4 and IPv6 — Next.js binds dual-stack on :: by default,
  // so a port "free" on 127.0.0.1 can still collide on ::.
  return checkOne(port, '127.0.0.1').then((v4) => (v4 ? checkOne(port, '::') : false))
}

function checkOne(port, host) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    try {
      s.listen(port, host)
    } catch {
      resolve(false)
    }
  })
}

async function projectExists(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) return false
  try {
    const stat = await fs.stat(path.join(PROJECTS_DIR, slug, 'package.json'))
    return stat.isFile()
  } catch {
    return false
  }
}

export async function startDevServer({ projectId, slug }) {
  const existing = servers.get(projectId)
  if (existing) return summarize(existing)

  if (!(await projectExists(slug))) {
    throw new Error(`projects/${slug} does not have a package.json — nothing to run`)
  }

  const port = await findFreePort()
  const cwd = path.join(PROJECTS_DIR, slug)

  // npm on Windows is a .cmd shim — spawn needs shell:true to find it.
  const proc = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
    cwd,
    shell: true,
    env: { ...process.env, PORT: String(port), FORCE_COLOR: '0' },
    windowsHide: true,
  })

  const entry = {
    project_id: projectId,
    slug,
    port,
    pid: proc.pid,
    started_at: new Date().toISOString(),
    ready: false,
    log: '',
    proc,
    error: null,
  }
  servers.set(projectId, entry)

  const onChunk = (data) => {
    const s = data.toString()
    entry.log = (entry.log + s).slice(-LOG_TAIL_BYTES)
    if (!entry.ready) {
      for (const re of READY_PATTERNS) {
        if (re.test(s)) {
          entry.ready = true
          break
        }
      }
    }
  }
  proc.stdout?.on('data', onChunk)
  proc.stderr?.on('data', onChunk)
  proc.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      // user-requested stop — drop the entry
      servers.delete(projectId)
      return
    }
    if (code === 0) {
      servers.delete(projectId)
      return
    }
    // Crashed on its own — keep the entry so the dashboard can show why
    entry.error = `exited with code ${code}${signal ? ` (signal ${signal})` : ''}`
    entry.ready = false
    entry.exited_at = new Date().toISOString()
  })
  proc.on('error', (err) => {
    entry.error = err.message
  })

  return summarize(entry)
}

export async function stopDevServer({ projectId }) {
  const entry = servers.get(projectId)
  if (!entry) return { stopped: false, reason: 'not running' }
  await new Promise((resolve) => {
    treeKill(entry.proc.pid, 'SIGTERM', (err) => {
      if (err) {
        // Last-resort fallback
        try { entry.proc.kill('SIGKILL') } catch { /* ignore */ }
      }
      resolve()
    })
  })
  servers.delete(projectId)
  return { stopped: true, project_id: projectId }
}

export function getDevServer(projectId) {
  const entry = servers.get(projectId)
  return entry ? summarize(entry) : null
}

export function listDevServers() {
  return [...servers.values()].map(summarize)
}

function summarize(e) {
  return {
    project_id: e.project_id,
    slug: e.slug,
    port: e.port,
    pid: e.pid,
    started_at: e.started_at,
    ready: e.ready,
    url: e.ready ? `http://localhost:${e.port}` : null,
    log_tail: e.log,
    error: e.error,
  }
}

// Stop everything on orchestrator shutdown so we don't orphan child trees.
function cleanup() {
  for (const e of servers.values()) {
    try { treeKill(e.proc.pid) } catch { /* ignore */ }
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(0) })
process.on('SIGTERM', () => { cleanup(); process.exit(0) })
