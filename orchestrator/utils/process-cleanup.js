// Kill orphaned descendant processes.
//
// Why this exists: agents run `Bash` tool calls that spawn long-running
// children — `npm install`, `next build`, playwright-driven chromium,
// `node ~/.claude/tools/gemini-image/generate.mjs`, `cargo build`,
// `railway up`, and so on. The Claude Agent SDK receives an
// AbortController signal from us, and it terminates the `claude` CLI
// child it owns. But that CLI's own grand-children (npm → node → next,
// playwright → chrome-headless-shell, etc.) are not always reaped on
// Windows — the parent dies and the grand-children keep running,
// holding RAM.
//
// We defensively walk the orchestrator's descendant tree after every
// cycle and on shutdown, killing anything that was left behind.

import psTree from 'ps-tree'
import treeKill from 'tree-kill'
import { createLogger } from './logger.js'

const log = createLogger('cleanup')

const ORCHESTRATOR_PID = process.pid

function listDescendants(pid) {
  return new Promise((resolve) => {
    psTree(pid, (err, children) => {
      if (err || !Array.isArray(children)) return resolve([])
      const pids = children
        .map((c) => Number(c.PID ?? c.pid))
        .filter(
          (p) =>
            Number.isFinite(p) &&
            p > 0 &&
            p !== pid &&
            p !== ORCHESTRATOR_PID, // belt-and-suspenders — never kill self
        )
      resolve(pids)
    })
  })
}

/**
 * Kill every descendant of the orchestrator's process. Does not kill
 * `self`. The orchestrator stays alive; its Claude SDK / Playwright /
 * npm grandchildren are terminated.
 *
 * Returns the number of top-level descendant processes it attempted
 * to kill. Errors are swallowed per-pid so a single dead pid does not
 * abort the sweep.
 */
export async function reapDescendants({ self = process.pid, reason = 'sweep' } = {}) {
  const pids = await listDescendants(self)
  if (pids.length === 0) return 0
  log.info(`reaping ${pids.length} descendant process(es) (${reason})`)
  for (const pid of pids) {
    await new Promise((resolve) => {
      treeKill(pid, 'SIGTERM', (err) => {
        if (err) {
          // Last-resort fallback — process.kill is synchronous
          try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
        }
        resolve()
      })
    })
  }
  return pids.length
}

/** Synchronous best-effort reap — used from signal handlers where we
 * can't await. */
export function reapDescendantsSync({ self = process.pid } = {}) {
  // Kick off async reap; don't wait. Signal handler calls process.exit
  // shortly after, which on Windows triggers child detachment + cleanup
  // via tree-kill (fire-and-forget).
  listDescendants(self)
    .then((pids) => {
      for (const pid of pids) {
        try { treeKill(pid) } catch { /* ignore */ }
      }
    })
    .catch(() => {})
}
