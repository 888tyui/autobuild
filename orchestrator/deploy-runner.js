// Deploy is a one-shot agent invocation, not part of the autobuild
// pipeline. The dashboard calls it on demand for completed cycles.
// We track per-cycle state in memory so the dashboard can poll
// progress and show the final URL.

import path from 'node:path'
import fs from 'node:fs/promises'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { readAgentFile } from './utils/agent-file.js'
import { ROOT_DIR } from './utils/context.js'
import { createLogger } from './utils/logger.js'

const STATE_DIR = path.join(ROOT_DIR, 'state')
const log = createLogger('deploy')

// project_id -> { status, started_at, finished_at, url, log_tail, error, abortController }
const deploys = new Map()
const LOG_TAIL_BYTES = 16384

export function getDeployStatus(projectId) {
  const e = deploys.get(projectId)
  if (!e) return null
  return summarize(e)
}

export function listDeploys() {
  return [...deploys.values()].map(summarize)
}

export async function startDeploy({ projectId }) {
  const existing = deploys.get(projectId)
  if (existing && existing.status === 'running') {
    return summarize(existing)
  }

  // Sanity: cycle exists and has a built project
  const spec = await readJson(path.join(STATE_DIR, projectId, 'project-spec.json'))
  if (!spec?.slug) throw new Error('cycle has no project-spec.json or no slug')
  const slug = spec.slug
  const projectDir = path.join(ROOT_DIR, 'projects', slug)
  const projectStat = await fs.stat(projectDir).catch(() => null)
  if (!projectStat?.isDirectory()) {
    throw new Error(`projects/${slug}/ does not exist — nothing to deploy`)
  }

  const abortController = new AbortController()
  const entry = {
    project_id: projectId,
    slug,
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    url: null,
    final_status_word: null, // 'success' | 'partial' | 'blocked' | 'failed'
    log_tail: '',
    error: null,
    abortController,
  }
  deploys.set(projectId, entry)

  // Run async — dashboard polls
  runDeployAgent(entry).catch((err) => {
    entry.status = 'failed'
    entry.error = err.message
    entry.finished_at = new Date().toISOString()
  })

  return summarize(entry)
}

export function cancelDeploy(projectId) {
  const e = deploys.get(projectId)
  if (!e || e.status !== 'running') return false
  e.abortController?.abort(new Error('cancelled by user'))
  return true
}

async function runDeployAgent(entry) {
  log.info(`deploy starting project_id=${entry.project_id} slug=${entry.slug}`)
  const agent = await readAgentFile(ROOT_DIR, 'deploy')
  const prompt = buildDeployPrompt(entry)

  let textBuf = ''
  try {
    for await (const msg of query({
      prompt,
      options: {
        systemPrompt: agent.body,
        allowedTools: agent.tools,
        cwd: ROOT_DIR,
        model: agent.model,
        settingSources: ['project'],
        env: process.env,
        abortController: entry.abortController,
      },
    })) {
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            textBuf = (textBuf + block.text + '\n').slice(-LOG_TAIL_BYTES)
            entry.log_tail = textBuf
            const m = block.text.match(/STATUS:\s*(success|partial|blocked|failed)/i)
            if (m) entry.final_status_word = m[1].toLowerCase()
            const u = block.text.match(/https?:\/\/[^\s)]+(?:\.up\.railway\.app|\.railway\.app)\S*/i)
            if (u) entry.url = u[0]
          }
        }
      }
    }
  } catch (err) {
    if (entry.abortController.signal.aborted) {
      entry.status = 'cancelled'
      entry.error = 'cancelled'
    } else {
      entry.status = 'failed'
      entry.error = err.message
    }
    entry.finished_at = new Date().toISOString()
    log.error(`deploy failed project_id=${entry.project_id}: ${err.message}`)
    return
  }

  entry.finished_at = new Date().toISOString()
  if (entry.final_status_word === 'success') entry.status = 'success'
  else if (entry.final_status_word) entry.status = entry.final_status_word
  else entry.status = 'finished'
  log.ok(`deploy ${entry.status} project_id=${entry.project_id} url=${entry.url ?? 'none'}`)
  // Persist so the summary survives orchestrator restart.
  const persistPath = path.join(STATE_DIR, entry.project_id, 'deploy.json')
  try {
    await fs.writeFile(persistPath, JSON.stringify(summarize(entry), null, 2), 'utf8')
  } catch (err) {
    log.warn(`failed to persist deploy.json: ${err.message}`)
  }
}

export async function runDeployToCompletion({ projectId }) {
  // Used by the pipeline — starts the deploy and awaits the runner's
  // async work synchronously. Returns the final summary.
  const existing = deploys.get(projectId)
  if (existing && existing.status === 'running') {
    // Wait for it to finish if already running.
    while (deploys.get(projectId)?.status === 'running') {
      await new Promise((r) => setTimeout(r, 1500))
    }
    return summarize(deploys.get(projectId))
  }
  await startDeploy({ projectId })
  while (deploys.get(projectId)?.status === 'running') {
    await new Promise((r) => setTimeout(r, 1500))
  }
  return summarize(deploys.get(projectId))
}

function buildDeployPrompt(entry) {
  return [
    `You are running as the \`deploy\` subagent.`,
    ``,
    `Cycle context:`,
    `  project_id  = ${entry.project_id}`,
    `  slug        = ${entry.slug}`,
    `  state_dir   = ${path.join(STATE_DIR, entry.project_id)}`,
    `  project_dir = ${path.join(ROOT_DIR, 'projects', entry.slug)}`,
    ``,
    `Run your agent now per your system prompt. Deploy projects/${entry.slug}/`,
    `to Railway. Always write state/${entry.project_id}/deploy-report.md before`,
    `stopping. End your final message with a line of the form:`,
    ``,
    `  STATUS: <success|partial|blocked|failed>`,
    `  URL: <public url if any>`,
    ``,
    `Stop when the report is written.`,
  ].join('\n')
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

function summarize(e) {
  return {
    project_id: e.project_id,
    slug: e.slug,
    status: e.status,
    started_at: e.started_at,
    finished_at: e.finished_at,
    url: e.url,
    final_status_word: e.final_status_word,
    log_tail: e.log_tail,
    error: e.error,
  }
}
