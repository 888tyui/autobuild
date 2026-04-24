#!/usr/bin/env node
import cron from 'node-cron'
import { runPipeline, STAGES } from './pipeline.js'
import { createCycleContext, pickMode } from './utils/context.js'
import { createLogger } from './utils/logger.js'
import {
  initStatus,
  setMode as setStoredMode,
  setNextFire,
  readStatus,
  activeCount,
  maxConcurrent,
  currentMode,
  requestCancel,
} from './utils/status-store.js'
import { startServer, registerTriggerHandler, registerCancelHandler } from './server.js'
import { reapDescendants, reapDescendantsSync } from './utils/process-cleanup.js'

const log = createLogger('orchestrator')

const CRON_EXPR = process.env.AUTOBUILD_CRON ?? '0 */5 * * *' // every 5 hours
const HTTP_PORT = Number(process.env.AUTOBUILD_PORT ?? 4001)
const MAX_CONCURRENT = Number(process.env.AUTOBUILD_MAX_CONCURRENT ?? 3)

function parseArgs(argv) {
  const out = { runMode: 'serve' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--once') out.runMode = 'once'
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--no-server') out.noServer = true
    else if (a === '--start-mode') out.startMode = argv[++i] // 'auto' | 'manual'
    else if (a === '--project-id') out.projectId = argv[++i]
    else if (a === '--cron') out.cron = argv[++i]
    else if (a === '--mode') out.cycleMode = argv[++i]
    else if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--max-concurrent') out.maxConcurrent = Number(argv[++i])
    else if (a === '--instance') out.instance = argv[++i]
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

function printHelp() {
  console.log(`autobuild orchestrator

Usage:
  node orchestrator/index.js [options]

By default runs as a long-lived service: cron scheduler + HTTP API on port
${HTTP_PORT}. The dashboard talks to the HTTP API. Use --once for a single
cycle and exit (no HTTP server).

Options:
  --once                Run a single cycle and exit (CLI mode, no server)
  --dry-run             Skip actual agent invocation, just log what would run
  --no-server           Service mode without HTTP API (cron only)
  --start-mode <m>      Initial dashboard mode: 'auto' (cron + manual) or
                        'manual' (cron paused). Default: 'auto'.
  --max-concurrent <n>  Max simultaneous cycles (default ${MAX_CONCURRENT}).
                        Override at runtime via dashboard / API.
  --project-id <id>     Resume / re-run a specific cycle by ID (with --once)
  --mode <m>            Force cycle mode: 'trend' or 'experimental'
  --cron <expr>         Override cron expression (default: "0 */5 * * *")
  --port <n>            HTTP port for the dashboard API (default: ${HTTP_PORT})
  -h, --help            Show this message

Pipeline stages (trend mode shown; experimental swaps stage 1 to 'imagine'):`)
  for (const [i, stage] of STAGES.entries()) {
    if (stage.kind === 'parallel') {
      console.log(`  ${i + 1}. parallel: ${stage.agents.join(' ‖ ')}`)
    } else {
      console.log(`  ${i + 1}. ${stage.kind}: ${stage.agent}`)
    }
  }
}

async function runOneCycle({ projectId, dryRun, cycleMode, abortController }) {
  const mode = pickMode(cycleMode)
  const ctx = await createCycleContext({ projectId, dryRun, mode, abortController })
  log.info(`cycle context project_id=${ctx.projectId} mode=${ctx.mode} state_dir=${ctx.stateDir}`)
  const result = await runPipeline(ctx)
  log.info(`cycle result project_id=${ctx.projectId}: ${JSON.stringify(result)}`)
  return { projectId: ctx.projectId, result }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const expr = args.cron ?? CRON_EXPR
  const max = args.maxConcurrent ?? MAX_CONCURRENT
  const instanceName = args.instance ?? process.env.AUTOBUILD_INSTANCE ?? 'autobuild'

  // Distinctive process title so two side-by-side installations are
  // identifiable in Task Manager / ps. Also prevents a user from
  // killing 'node.exe' and accidentally taking down all instances.
  try { process.title = `${instanceName}-orchestrator` } catch { /* ignore */ }

  // Port resolution — start with the requested port, fall back to
  // the next 9 in case a sibling instance already owns it.
  const basePort = args.port ?? HTTP_PORT
  let port = basePort

  // CLI one-shot path
  if (args.runMode === 'once' || args.dryRun) {
    log.info(`one-shot run (dry_run=${!!args.dryRun}, cycle_mode=${args.cycleMode ?? 'auto'})`)
    try {
      await runOneCycle({
        projectId: args.projectId,
        dryRun: !!args.dryRun,
        cycleMode: args.cycleMode,
      })
      process.exit(0)
    } catch (err) {
      log.error(`one-shot failed: ${err.stack ?? err.message}`)
      process.exit(1)
    }
  }

  if (!cron.validate(expr)) {
    log.error(`invalid cron expression: ${expr}`)
    process.exit(2)
  }

  // Service mode
  await initStatus({ cron_expression: expr, max_concurrent: max })
  if (args.startMode === 'manual') {
    await setStoredMode('manual')
    log.info('starting in manual mode (cron paused)')
  } else {
    log.info(`starting in auto mode with cron "${expr}"`)
  }

  /**
   * Start a managed cycle if there is room. Returns metadata about the
   * triggered cycle (sync), while the cycle itself runs in the background.
   */
  function startManagedCycle({ cycleMode }) {
    const active = activeCount()
    const cap = maxConcurrent()
    if (active >= cap) {
      throw new Error(`max concurrent cycles reached (${active}/${cap})`)
    }
    const abortController = new AbortController()
    const promise = runOneCycle({ cycleMode, abortController })
      .catch((err) => {
        log.error(`cycle failed: ${err.stack ?? err.message}`)
        return { projectId: null, result: { status: 'failed', error: err.message } }
      })
      .finally(async () => {
        // Sweep orphaned grand-children. SDK abort only kills its direct
        // child; npm/next/playwright/cargo/railway subprocesses started
        // via the agent's Bash tool can outlive the cycle on Windows.
        try {
          const killed = await reapDescendants({ reason: 'cycle-end' })
          if (killed > 0) log.warn(`reaped ${killed} leftover subprocess(es) after cycle`)
        } catch (err) {
          log.warn(`reap on cycle end failed: ${err.message}`)
        }
      })
    return { abortController, promise }
  }

  // HTTP server
  if (!args.noServer) {
    registerTriggerHandler(async ({ cycleMode }) => {
      const { promise } = startManagedCycle({ cycleMode })
      const peek = await Promise.race([
        promise,
        new Promise((r) => setTimeout(() => r(null), 500)),
      ])
      return {
        triggered_at: new Date().toISOString(),
        cycle_mode: cycleMode ?? 'auto',
        project_id: peek?.projectId ?? null,
        active_after: activeCount(),
        max_concurrent: maxConcurrent(),
      }
    })
    registerCancelHandler(async ({ projectId }) => {
      const cancelled = requestCancel(projectId)
      return { cancelled, project_id: projectId }
    })

    // Resilient bind — if the preferred port is held by a sibling
    // instance, try the next 9. Do NOT exit the process on failure.
    let bound = false
    for (let attempt = 0; attempt < 10; attempt++) {
      const tryPort = basePort + attempt
      try {
        await startServer({ port: tryPort })
        port = tryPort
        bound = true
        if (attempt > 0) {
          log.warn(`port ${basePort} was in use; bound to ${tryPort} instead`)
        }
        break
      } catch (err) {
        if (err.code !== 'EADDRINUSE') {
          log.error(`HTTP server failed to start on ${tryPort}: ${err.message}`)
          break
        }
      }
    }
    if (!bound) {
      log.error(`could not bind any port in [${basePort}, ${basePort + 9}] — running without HTTP API`)
    } else {
      log.info(`HTTP API listening on http://localhost:${port} (instance=${instanceName})`)
    }
  }

  // Cron scheduler — fires regardless of running cycles, only paused by mode
  const task = cron.schedule(expr, async () => {
    if (currentMode() !== 'auto') {
      log.info('cron tick skipped — manual mode active')
      return
    }
    const active = activeCount()
    const cap = maxConcurrent()
    if (active >= cap) {
      log.warn(`cron tick skipped — at concurrency cap (${active}/${cap})`)
      return
    }
    log.info('cron tick — starting cycle')
    try {
      startManagedCycle({ cycleMode: args.cycleMode })
    } catch (err) {
      log.error(`scheduled cycle failed to start: ${err.message}`)
    }
  })

  try {
    const next = nextFireApprox(expr)
    if (next) await setNextFire(next.toISOString())
  } catch {
    // ignore
  }

  log.info(`orchestrator running (max_concurrent=${max}). Ctrl+C to stop.`)
  if (args.startMode !== 'manual') {
    log.info('running initial cycle on start…')
    try {
      startManagedCycle({ cycleMode: args.cycleMode })
    } catch (err) {
      log.error(`initial cycle failed to start: ${err.message}`)
    }
  }

  const shutdown = (sig) => {
    log.info(`${sig} received, stopping cron and reaping subprocesses`)
    try { task.stop() } catch { /* ignore */ }
    // Best-effort synchronous reap (fire-and-forget) — our own exit
    // gives them a window to die before Windows cleans them anyway.
    reapDescendantsSync()
    // Give the reap a moment, then exit.
    setTimeout(() => process.exit(0), 250).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

function nextFireApprox(expr) {
  return null
}

// Survive transient async errors from any subsystem — node-cron, the
// HTTP server, the SDK iterator, file IO. Without these, a single
// unhandled rejection anywhere in the long-lived process tree will
// terminate the orchestrator and kill all in-flight cycles.
process.on('unhandledRejection', (reason, promise) => {
  log.error(`unhandledRejection: ${reason?.stack ?? reason}`)
})
process.on('uncaughtException', (err) => {
  log.error(`uncaughtException: ${err.stack ?? err.message}`)
})

main().catch((err) => {
  console.error('[orchestrator] fatal:', err)
  process.exit(1)
})
