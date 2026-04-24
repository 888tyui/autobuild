'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, type CycleSummary } from '@/lib/api'
import { ProjectCard } from '@/components/ProjectCard'

type Filter = 'all' | 'completed' | 'rejected' | 'in-progress' | 'stalled' | 'cancelled'
type ModeFilter = 'all' | 'trend' | 'experimental'
type DeployFilter = 'all' | 'deployed' | 'not-deployed'

export default function CyclesListPage() {
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [deployFilter, setDeployFilter] = useState<DeployFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let stopped = false
    const tick = async () => {
      try {
        const c = await api.getCycles()
        if (!stopped) {
          setCycles(c.cycles)
          setError(null)
        }
      } catch (err) {
        if (!stopped) setError((err as Error).message)
      }
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  const filtered = useMemo(() => {
    if (!cycles) return []
    return cycles.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false
      if (modeFilter !== 'all' && c.cycle_mode !== modeFilter) return false
      if (deployFilter === 'deployed' && !c.deploy_url) return false
      if (deployFilter === 'not-deployed' && c.deploy_url) return false
      if (search) {
        const s = search.toLowerCase()
        const hay = [c.project_id, c.name, c.one_liner, c.fetish_object, c.world]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [cycles, filter, modeFilter, deployFilter, search])

  if (error) return <div className="empty">orchestrator unreachable: {error}</div>
  if (!cycles) return <div className="empty">loading…</div>

  const counts = {
    all: cycles.length,
    completed: cycles.filter((c) => c.status === 'completed').length,
    rejected: cycles.filter((c) => c.status === 'rejected').length,
    cancelled: cycles.filter((c) => c.status === 'cancelled').length,
    'in-progress': cycles.filter((c) => c.status === 'in-progress').length,
    stalled: cycles.filter((c) => c.status === 'stalled').length,
  }

  return (
    <>
      <div className="section-head lg">
        <h1>All cycles</h1>
        <span className="meta">{filtered.length} of {cycles.length}</span>
      </div>

      <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="toggle">
          {(['all', 'completed', 'rejected', 'cancelled', 'in-progress', 'stalled'] as Filter[]).map((f) => (
            <button
              key={f}
              className={filter === f ? 'active' : ''}
              onClick={() => setFilter(f)}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        <div className="toggle">
          {(['all', 'trend', 'experimental'] as ModeFilter[]).map((m) => (
            <button
              key={m}
              className={modeFilter === m ? 'active' : ''}
              onClick={() => setModeFilter(m)}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="toggle">
          {(['all', 'deployed', 'not-deployed'] as DeployFilter[]).map((d) => (
            <button
              key={d}
              className={deployFilter === d ? 'active' : ''}
              onClick={() => setDeployFilter(d)}
            >
              {d}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="search name / world / fetish object…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 260px',
            minWidth: 200,
            padding: '8px 12px',
            background: 'var(--bg-elev-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)',
            fontFamily: 'var(--mono)',
            fontSize: 12,
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card empty">no cycles match these filters</div>
      ) : (
        <div className="project-grid">
          {filtered.map((c) => (
            <ProjectCard key={c.project_id} c={c} />
          ))}
        </div>
      )}
    </>
  )
}
