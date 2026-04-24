import { query } from '@anthropic-ai/claude-agent-sdk'
import { readAgentFile } from './utils/agent-file.js'
import { createLogger, appendCycleLog } from './utils/logger.js'
import { getSlug } from './utils/context.js'

// No turn cap by default — let agents work until they're done. The Claude
// Agent SDK still enforces other guards (cost budget, abort signals).
const DEFAULT_MAX_TURNS = undefined
const MAX_TURNS_OVERRIDES = {}

export async function runAgent(agentName, ctx, opts = {}) {
  const log = createLogger(`agent:${agentName}`)
  const agent = await readAgentFile(ctx.rootDir, agentName)
  const slug = await getSlug(ctx)

  if (ctx.dryRun) {
    log.info(`[dry-run] would invoke ${agentName} with model=${agent.model}, tools=${agent.tools?.join(',')}`)
    return { agentName, status: 'skipped-dry-run' }
  }

  log.info(`starting (model=${agent.model}, tools=${agent.tools?.length ?? 'all'})`)
  await appendCycleLog(ctx, `START ${agentName}`)

  const userPrompt = buildUserPrompt(agentName, ctx, slug)
  const startedAt = Date.now()

  // Note: we deliberately do NOT accumulate message objects — long
  // agents (web-build, codebase) can emit hundreds of megabytes across
  // a run and the caller does not need the history. We count only.
  let toolUseCount = 0
  let textChars = 0

  try {
    const maxTurns = opts.maxTurns ?? MAX_TURNS_OVERRIDES[agentName] ?? DEFAULT_MAX_TURNS

    const queryOptions = {
      systemPrompt: agent.body,
      allowedTools: agent.tools,
      cwd: ctx.rootDir,
      model: agent.model,
      settingSources: ['project'],
      env: process.env,
    }
    if (maxTurns !== undefined) queryOptions.maxTurns = maxTurns
    if (ctx.abortController) queryOptions.abortController = ctx.abortController

    for await (const msg of query({
      prompt: userPrompt,
      options: queryOptions,
    })) {
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            toolUseCount++
            log.info(`tool_use ${block.name}`)
          } else if (block.type === 'text' && typeof block.text === 'string') {
            textChars += block.text.length
          }
        }
      }
      if (msg.type === 'result') {
        log.info(
          `result subtype=${msg.subtype ?? '?'} duration_ms=${msg.duration_ms ?? '?'} cost_usd=${msg.total_cost_usd ?? '?'}`,
        )
      }
    }
  } catch (err) {
    if (ctx.abortController?.signal?.aborted) {
      log.warn(`cancelled mid-${agentName}`)
      await appendCycleLog(ctx, `CANCEL ${agentName}`)
      const cancelErr = new Error('cancelled')
      cancelErr.cancelled = true
      throw cancelErr
    }
    log.error(`failed: ${err.message}`)
    await appendCycleLog(ctx, `FAIL ${agentName}: ${err.message}`)
    throw err
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  log.ok(`done in ${elapsed}s (tool_use=${toolUseCount}, text=${textChars} chars)`)
  await appendCycleLog(ctx, `END ${agentName} ${elapsed}s tool_use=${toolUseCount}`)

  return { agentName, status: 'ok', elapsed, toolUseCount }
}

function buildUserPrompt(agentName, ctx, slug) {
  return [
    `You are running as the \`${agentName}\` subagent in the autobuild pipeline.`,
    ``,
    `Cycle context:`,
    `  project_id        = ${ctx.projectId}`,
    `  cycle_started_at  = ${ctx.cycleStartedAt}`,
    `  cycle_mode        = ${ctx.mode}    # 'trend' (Search) or 'experimental' (Imagine)`,
    `  root_dir          = ${ctx.rootDir}`,
    `  state_dir         = ${ctx.stateDir}`,
    `  projects_dir      = ${ctx.projectsDir}`,
    slug ? `  slug              = ${slug}` : `  slug              = (not yet decided — comes from project-spec.json)`,
    ``,
    `Run your agent now per your system prompt. Read your inputs, do your work,`,
    `write your outputs to the paths specified in your system prompt. Stop when`,
    `done — do not start the next stage.`,
  ].join('\n')
}
