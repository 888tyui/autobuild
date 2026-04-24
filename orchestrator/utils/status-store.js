import fs from 'node:fs/promises'
import path from 'node:path'
import { ROOT_DIR } from './context.js'

// The orchestrator publishes its current state to this file. The dashboard
// reads it directly — no IPC, no shared memory, no realtime channel. The
// file is the contract.
const STATUS_PATH = path.join(ROOT_DIR, 'state', 'orchestrator-status.json')

const initialState = {
  pid: process.pid,
  started_at: null,
  scheduler: {
    enabled: false,
    cron_expression: null,
    next_fire_iso: null,
  },
  mode: 'auto', // 'auto' = cron + manual, 'manual' = manual only (cron paused)
  max_concurrent: 3,
  current_cycles: [], // [{ project_id, cycle_mode, started_at, current_stage, stages_done, cancellable }]
  last_result: null,
  history_recent: [],
  updated_at: null,
}

let state = structuredClone(initialState)

// In-memory map of project_id → AbortController. Not persisted.
const cancelHooks = new Map()

let writeQueue = Promise.resolve()
async function flush() {
  // Serialize writes so concurrent cycles don't clobber each other.
  // IMPORTANT: recover from prior rejections via .catch(() => {}) so a
  // single disk-write failure does not poison the chain and break
  // every subsequent flush (which would cascade into unhandled
  // rejections at every call site).
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    state.updated_at = new Date().toISOString()
    await fs.mkdir(path.dirname(STATUS_PATH), { recursive: true })
    await fs.writeFile(STATUS_PATH, JSON.stringify(state, null, 2), 'utf8')
  })
  return writeQueue
}

export async function initStatus({ cron_expression, max_concurrent }) {
  state = structuredClone(initialState)
  state.pid = process.pid
  state.started_at = new Date().toISOString()
  state.scheduler.cron_expression = cron_expression
  state.scheduler.enabled = true
  state.mode = 'auto'
  if (max_concurrent) state.max_concurrent = max_concurrent
  await flush()
}

export async function setMode(mode) {
  if (mode !== 'auto' && mode !== 'manual') {
    throw new Error(`invalid mode: ${mode}`)
  }
  state.mode = mode
  state.scheduler.enabled = mode === 'auto'
  await flush()
}

export async function setMaxConcurrent(n) {
  if (typeof n !== 'number' || n < 1 || n > 20) {
    throw new Error('max_concurrent must be 1–20')
  }
  state.max_concurrent = n
  await flush()
}

export async function setNextFire(iso) {
  state.scheduler.next_fire_iso = iso
  await flush()
}

function findCycleIndex(projectId) {
  return state.current_cycles.findIndex((c) => c.project_id === projectId)
}

export async function startCycle({ projectId, cycleMode, abortController }) {
  if (abortController) cancelHooks.set(projectId, abortController)
  state.current_cycles.push({
    project_id: projectId,
    cycle_mode: cycleMode,
    started_at: new Date().toISOString(),
    current_stage: null,
    stages_done: [],
    cancellable: !!abortController,
    cancel_requested: false,
  })
  await flush()
}

export async function advanceStage({ projectId, stageIndex, stageTotal, stageLabel, kind }) {
  const i = findCycleIndex(projectId)
  if (i === -1) return
  state.current_cycles[i].current_stage = {
    index: stageIndex,
    total: stageTotal,
    label: stageLabel,
    kind,
    started_at: new Date().toISOString(),
  }
  await flush()
}

export async function finishStage({ projectId, stageLabel, status, elapsed_s }) {
  const i = findCycleIndex(projectId)
  if (i === -1) return
  state.current_cycles[i].stages_done.push({
    label: stageLabel,
    status,
    elapsed_s,
    finished_at: new Date().toISOString(),
  })
  state.current_cycles[i].current_stage = null
  await flush()
}

export async function endCycle(projectId, result) {
  cancelHooks.delete(projectId)
  const i = findCycleIndex(projectId)
  let finished = null
  if (i !== -1) {
    const c = state.current_cycles[i]
    finished = {
      project_id: c.project_id,
      cycle_mode: c.cycle_mode,
      started_at: c.started_at,
      finished_at: new Date().toISOString(),
      result,
    }
    state.last_result = finished
    state.history_recent = [finished, ...state.history_recent].slice(0, 10)
    state.current_cycles.splice(i, 1)
  }
  await flush()
  return finished
}

export function requestCancel(projectId) {
  const ctrl = cancelHooks.get(projectId)
  if (!ctrl) return false
  const i = findCycleIndex(projectId)
  if (i !== -1) {
    state.current_cycles[i].cancel_requested = true
    flush().catch(() => {})
  }
  ctrl.abort(new Error('cancelled by user'))
  return true
}

export function listActiveCycleIds() {
  return state.current_cycles.map((c) => c.project_id)
}

export function activeCount() {
  return state.current_cycles.length
}

export function maxConcurrent() {
  return state.max_concurrent
}

export function currentMode() {
  return state.mode
}

export async function readStatus() {
  try {
    const raw = await fs.readFile(STATUS_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export { STATUS_PATH }
