'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api, type CycleSummary } from '@/lib/api'
import { fmtRelative } from '@/lib/format'
import { DevServerControl } from '@/components/DevServerControl'

type Filter = 'all' | 'completed' | 'rejected' | 'in-progress' | 'stalled' | 'cancelled'
type ModeFilter = 'all' | 'trend' | 'experimental'

export default function CyclesListPage() {
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
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
  }, [cycles, filter, modeFilter, search])

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
      <div className="section-head">
        <h1>All cycles</h1>
        <span className="meta">{filtered.length} of {cycles.length}</span>
      </div>

      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
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
            borderRadius: 6,
            color: 'var(--text)',
            fontFamily: 'var(--mono)',
            fontSize: 12,
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty">no cycles match these filters</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>cycle</th>
                <th>name / one-liner</th>
                <th>world</th>
                <th>fetish object</th>
                <th>mode</th>
                <th>status</th>
                <th>activity</th>
                <th>dev</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.project_id}>
                  <td>
                    <Link href={`/cycles/${c.project_id}`} className="mono" style={{ color: 'var(--text)' }}>
                      {c.project_id}
                    </Link>
                  </td>
                  <td>
                    <div className="truncate">{c.name ?? <em style={{ color: 'var(--text-faint)' }}>—</em>}</div>
                    <div className="truncate" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                      {c.one_liner ?? ''}
                    </div>
                  </td>
                  <td className="truncate" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    {c.world ?? '—'}
                  </td>
                  <td className="truncate" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    {c.fetish_object ?? '—'}
                  </td>
                  <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    {c.cycle_mode ?? '—'}
                  </td>
                  <td>
                    <StatusPill status={c.status} />
                    {c.rejection_trigger && (
                      <div style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 4 }}>
                        {c.rejection_trigger}
                      </div>
                    )}
                  </td>
                  <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    {fmtRelative(c.last_activity_iso)}
                  </td>
                  <td>
                    {c.slug ? (
                      <DevServerControl projectId={c.project_id} hasProject={true} compact />
                    ) : (
                      <span className="pill mute">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function StatusPill({ status }: { status: CycleSummary['status'] }) {
  const map: Record<CycleSummary['status'], string> = {
    completed: 'ok',
    rejected: 'warn',
    cancelled: 'mute',
    'in-progress': 'info',
    stalled: 'bad',
  }
  return <span className={`pill ${map[status]}`}>{status}</span>
}
