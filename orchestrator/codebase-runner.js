// Mirrors deploy-runner.js. Invokes the codebase agent — either as
// the final pipeline stage or on demand from the dashboard for an
// already-completed cycle. Per-cycle state lives in memory; the
// dashboard polls.

import path from 'node:path'
import fs from 'node:fs/promises'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { readAgentFile } from './utils/agent-file.js'
import { ROOT_DIR } from './utils/context.js'
import { createLogger } from './utils/logger.js'

const STATE_DIR = path.join(ROOT_DIR, 'state')
const log = createLogger('codebase')

const codebases = new Map()
const LOG_TAIL_BYTES = 16384

export function getCodebaseStatus(projectId) {
  const e = codebases.get(projectId)
  return e ? summarize(e) : null
}

export function listCodebases() {
  return [...codebases.values()].map(summarize)
}

export async function startCodebase({ projectId }) {
  const existing = codebases.get(projectId)
  if (existing && existing.status === 'running') return summarize(existing)

  const spec = await readJson(path.join(STATE_DIR, projectId, 'project-spec.json'))
  if (!spec?.slug) throw new Error('cycle has no project-spec.json or no slug')
  const slug = spec.slug

  const abortController = new AbortController()
  const entry = {
    project_id: projectId,
    slug,
    status: 'running',
    started_at: new Date().toISOString(),
    finished_at: null,
    language: null,
    repo_url: null,
    commit_count: null,
    range: null,
    log_tail: '',
    error: null,
    abortController,
  }
  codebases.set(projectId, entry)

  runCodebaseAgent(entry).catch((err) => {
    entry.status = 'failed'
    entry.error = err.message
    entry.finished_at = new Date().toISOString()
  })

  return summarize(entry)
}

export function cancelCodebase(projectId) {
  const e = codebases.get(projectId)
  if (!e || e.status !== 'running') return false
  e.abortController?.abort(new Error('cancelled by user'))
  return true
}

async function runCodebaseAgent(entry) {
  log.info(`codebase starting project_id=${entry.project_id} slug=${entry.slug}`)
  const agent = await readAgentFile(ROOT_DIR, 'codebase')
  const prompt = buildPrompt(entry)

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
            const lang = block.text.match(/LANGUAGE:\s*(rust|typescript|go|python)/i)
            if (lang) entry.language = lang[1].toLowerCase()
            const repo = block.text.match(/REPO:\s*(https?:\/\/\S+)/i)
            if (repo) entry.repo_url = repo[1]
            const commits = block.text.match(/COMMITS:\s*(\d+)/i)
            if (commits) entry.commit_count = Number(commits[1])
            const range = block.text.match(/RANGE:\s*([^\n]+)/i)
            if (range) entry.range = range[1].trim()
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
    log.error(`codebase failed project_id=${entry.project_id}: ${err.message}`)
    return
  }

  entry.finished_at = new Date().toISOString()
  entry.status = entry.repo_url || entry.commit_count ? 'success' : 'finished'
  log.ok(`codebase ${entry.status} project_id=${entry.project_id} repo=${entry.repo_url ?? 'local-only'}`)
}

function buildPrompt(entry) {
  return [
    `You are running as the \`codebase\` subagent.`,
    ``,
    `Cycle context:`,
    `  project_id  = ${entry.project_id}`,
    `  slug        = ${entry.slug}`,
    `  state_dir   = ${path.join(STATE_DIR, entry.project_id)}`,
    `  project_dir = ${path.join(ROOT_DIR, 'projects', entry.slug)}`,
    `  codebase_dir = ${path.join(ROOT_DIR, 'projects', entry.slug, 'codebase')}`,
    ``,
    `Build the companion codebase per your system prompt. Always write`,
    `state/${entry.project_id}/codebase-report.md before stopping.`,
    `End your final message with:`,
    ``,
    `  LANGUAGE: <rust|typescript|go|python>`,
    `  REPO: <url or "local-only">`,
    `  COMMITS: <count>`,
    `  RANGE: <YYYY-MM-DD>..<YYYY-MM-DD>`,
    ``,
    `Stop when done.`,
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
    language: e.language,
    repo_url: e.repo_url,
    commit_count: e.commit_count,
    range: e.range,
    log_tail: e.log_tail,
    error: e.error,
  }
}
