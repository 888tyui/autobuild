import { runAgent } from './agent-runner.js'
import { checkRejection } from './utils/context.js'
import { createLogger, appendCycleLog } from './utils/logger.js'
import {
  startCycle,
  advanceStage,
  finishStage,
  endCycle,
} from './utils/status-store.js'

const log = createLogger('pipeline')

function makeStages(mode) {
  const sourceAgent = mode === 'experimental' ? 'imagine' : 'search'
  return [
    { kind: 'single', agent: sourceAgent },
    { kind: 'single', agent: 'compose' },
    { kind: 'gate', agent: 'verify' },
    { kind: 'single', agent: 'branding-reference' },
    { kind: 'single', agent: 'branding' },
    { kind: 'parallel', agents: ['branding-kit', 'marketing-image'] },
    { kind: 'parallel', agents: ['web-build', 'product'] },
    { kind: 'gate', agent: 'frontend-verify' },
    { kind: 'single', agent: 'cm' },
    { kind: 'single', agent: 'codebase' },
  ]
}

// Static stage list for `--help` enumeration only. Real runs build stages
// per cycle from `makeStages(ctx.mode)`.
const STAGES = makeStages('trend')

function isAborted(ctx) {
  return ctx.abortController?.signal?.aborted === true
}

export async function runPipeline(ctx) {
  const stages = makeStages(ctx.mode)
  log.info(`pipeline start project_id=${ctx.projectId} mode=${ctx.mode} dry_run=${ctx.dryRun}`)
  await appendCycleLog(ctx, `PIPELINE START project_id=${ctx.projectId} mode=${ctx.mode}`)

  if (!ctx.dryRun) {
    await startCycle({
      projectId: ctx.projectId,
      cycleMode: ctx.mode,
      abortController: ctx.abortController,
    })
  }

  const startedAt = Date.now()

  const finish = async (result) => {
    if (!ctx.dryRun) await endCycle(ctx.projectId, result)
    return result
  }

  for (const [i, stage] of stages.entries()) {
    const tag = `${i + 1}/${stages.length}`
    const stageLabel = stage.kind === 'parallel' ? stage.agents.join(' ‖ ') : stage.agent

    if (isAborted(ctx)) {
      log.warn(`pipeline aborted before stage ${tag}`)
      await appendCycleLog(ctx, `PIPELINE CANCEL before ${stageLabel}`)
      return finish({
        status: 'cancelled',
        stage: tag,
        elapsed_s: ((Date.now() - startedAt) / 1000).toFixed(1),
      })
    }

    if (!ctx.dryRun) {
      await advanceStage({
        projectId: ctx.projectId,
        stageIndex: i + 1,
        stageTotal: stages.length,
        stageLabel,
        kind: stage.kind,
      })
    }

    const stageStartedAt = Date.now()

    if (stage.kind === 'parallel') {
      log.info(`stage ${tag} parallel: ${stageLabel}`)
      const results = await Promise.allSettled(
        stage.agents.map((a) => runAgent(a, ctx)),
      )
      const stageElapsed = ((Date.now() - stageStartedAt) / 1000).toFixed(1)
      const failures = results.filter((r) => r.status === 'rejected')
      const cancellations = failures.filter((r) => r.reason?.cancelled)

      if (cancellations.length) {
        await appendCycleLog(ctx, `PIPELINE CANCEL parallel stage ${tag}`)
        if (!ctx.dryRun) await finishStage({ projectId: ctx.projectId, stageLabel, status: 'cancelled', elapsed_s: stageElapsed })
        return finish({
          status: 'cancelled',
          stage: tag,
          elapsed_s: ((Date.now() - startedAt) / 1000).toFixed(1),
        })
      }

      if (failures.length) {
        log.error(`parallel stage failed: ${failures.length}/${results.length} agents`)
        for (const f of failures) log.error(String(f.reason))
        await appendCycleLog(ctx, `PIPELINE FAIL parallel stage ${tag}`)
        if (!ctx.dryRun) await finishStage({ projectId: ctx.projectId, stageLabel, status: 'failed', elapsed_s: stageElapsed })
        return finish({ status: 'failed', stage: tag, failures: failures.map((f) => String(f.reason)) })
      }
      if (!ctx.dryRun) await finishStage({ projectId: ctx.projectId, stageLabel, status: 'ok', elapsed_s: stageElapsed })
    } else {
      log.info(`stage ${tag} ${stage.kind}: ${stage.agent}`)
      try {
        await runAgent(stage.agent, ctx)
      } catch (err) {
        const stageElapsed = ((Date.now() - stageStartedAt) / 1000).toFixed(1)
        if (err.cancelled) {
          await appendCycleLog(ctx, `PIPELINE CANCEL ${stage.agent}`)
          if (!ctx.dryRun) await finishStage({ projectId: ctx.projectId, stageLabel, status: 'cancelled', elapsed_s: stageElapsed })
          return finish({
            status: 'cancelled',
            stage: tag,
            agent: stage.agent,
            elapsed_s: ((Date.now() - startedAt) / 1000).toFixed(1),
          })
        }
        log.error(`stage ${tag} ${stage.agent} threw: ${err.message}`)
        await appendCycleLog(ctx, `PIPELINE FAIL ${stage.agent}: ${err.message}`)
        if (!ctx.dryRun) await finishStage({ projectId: ctx.projectId, stageLabel, status: 'failed', elapsed_s: stageElapsed })
        return finish({ status: 'failed', stage: tag, agent: stage.agent, error: err.message })
      }

      const stageElapsed = ((Date.now() - stageStartedAt) / 1000).toFixed(1)

      if (stage.kind === 'gate' && !ctx.dryRun) {
        const rejection = await checkRejection(ctx)
        if (rejection) {
          log.warn(`gate ${stage.agent} REJECTED — pipeline ends here`)
          await appendCycleLog(
            ctx,
            `PIPELINE END rejected at ${stage.agent}: ${rejection.trigger ?? 'no trigger'}`,
          )
          await finishStage({ projectId: ctx.projectId, stageLabel, status: 'rejected', elapsed_s: stageElapsed })
          return finish({
            status: 'rejected',
            stage: tag,
            agent: stage.agent,
            rejection,
            elapsed_s: ((Date.now() - startedAt) / 1000).toFixed(1),
          })
        }
      }

      if (!ctx.dryRun) await finishStage({ projectId: ctx.projectId, stageLabel, status: 'ok', elapsed_s: stageElapsed })
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  log.ok(`pipeline complete in ${elapsed}s`)
  await appendCycleLog(ctx, `PIPELINE END success ${elapsed}s`)
  return finish({ status: 'success', elapsed_s: elapsed })
}

export { STAGES }
