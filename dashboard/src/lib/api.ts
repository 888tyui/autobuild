// Single point of contact with the orchestrator HTTP API.
// All fetches use no-store cache so the dashboard always reads fresh state.

const API_BASE =
  process.env.NEXT_PUBLIC_AUTOBUILD_API ?? 'http://localhost:4001'

async function jget<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return (await res.json()) as T
}

async function jpost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return (await res.json()) as T
}

async function tget(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return await res.text()
}

export type StageRecord = {
  label: string
  status: 'ok' | 'failed' | 'rejected'
  elapsed_s: string
  finished_at: string
}

export type CurrentStage = {
  index: number
  total: number
  label: string
  kind: string
  started_at: string
}

export type CurrentCycle = {
  project_id: string
  cycle_mode: 'trend' | 'experimental'
  started_at: string
  current_stage: CurrentStage | null
  stages_done: StageRecord[]
  cancellable: boolean
  cancel_requested: boolean
}

export type FinishedCycle = {
  project_id: string
  cycle_mode: 'trend' | 'experimental'
  started_at: string
  finished_at: string
  result: { status: string; [k: string]: unknown }
}

export type Status = {
  pid: number
  started_at: string
  scheduler: { enabled: boolean; cron_expression: string; next_fire_iso: string | null }
  mode: 'auto' | 'manual'
  max_concurrent: number
  current_cycles: CurrentCycle[]
  last_result: FinishedCycle | null
  history_recent: FinishedCycle[]
  updated_at: string
}

export type CycleSummary = {
  project_id: string
  cycle_mode: 'trend' | 'experimental' | null
  status: 'in-progress' | 'completed' | 'rejected' | 'stalled' | 'cancelled'
  last_activity_iso: string | null
  last_stage_hint: string | null
  name: string | null
  slug: string | null
  one_liner: string | null
  fetish_object: string | null
  world: string | null
  rejection_trigger: string | null
  rejection_stage: string | null
  has_human_review: boolean
  human_score: number | null
}

export type CycleDetail = CycleSummary & {
  files: { name: string; size_bytes: number; modified_iso: string; is_dir: boolean }[]
  log_tail: string
  project_path: string | null
}

export const api = {
  getStatus: () => jget<Status>('/api/status'),
  getCycles: () => jget<{ cycles: CycleSummary[] }>('/api/cycles'),
  getCycle: (id: string) => jget<CycleDetail>(`/api/cycles/${id}`),
  getCycleFile: (id: string, file: string) =>
    tget(`/api/cycles/${id}/file?path=${encodeURIComponent(file)}`),
  setMode: (mode: 'auto' | 'manual') => jpost<Status>('/api/mode', { mode }),
  trigger: (cycleMode?: 'trend' | 'experimental') =>
    jpost<{ accepted: boolean; project_id?: string; active_after?: number; max_concurrent?: number }>(
      '/api/trigger',
      cycleMode ? { mode: cycleMode } : {},
    ),
  cancel: (projectId: string) =>
    jpost<{ cancelled: boolean; project_id: string }>(`/api/cycles/${projectId}/cancel`, {}),
  apiBase: API_BASE,
}
