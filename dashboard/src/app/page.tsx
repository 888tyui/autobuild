'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { api, type Status, type CycleSummary } from '@/lib/api'
import { fmtDateTime, fmtRelative } from '@/lib/format'
import { CycleProgress } from '@/components/CycleProgress'
import { Controls } from '@/components/Controls'
import { DevServerControl } from '@/components/DevServerControl'

export default function OverviewPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [cycles, setCycles] = useState<CycleSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.getStatus(), api.getCycles()])
      setStatus(s)
      setCycles(c.cycles)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  if (error) {
    return (
      <div className="empty">
        <p style={{ marginBottom: 12 }}>orchestrator unreachable</p>
        <p style={{ color: 'var(--text-faint)' }}>{error}</p>
        <p style={{ marginTop: 24, color: 'var(--text-faint)', fontSize: 11 }}>
          start it with{' '}
          <code style={{ color: 'var(--accent)' }}>npm run orchestrator</code>{' '}
          from the autobuild root.
        </p>
      </div>
    )
  }

  if (!status || !cycles) {
    return <div className="empty">connecting…</div>
  }

  const completed = cycles.filter((c) => c.status === 'completed').length
  const rejected = cycles.filter((c) => c.status === 'rejected').length
  const inProgress = cycles.filter((c) => c.status === 'in-progress').length
  const stalled = cycles.filter((c) => c.status === 'stalled').length

  return (
    <>
      <div className="section-head">
        <h1>Overview</h1>
        <span className="meta">
          updated {fmtRelative(status.updated_at)}
        </span>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <Controls status={status} onChange={refresh} />
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2>Live cycles ({status.current_cycles.length}/{status.max_concurrent})</h2>
        {status.current_cycles.length > 0 ? (
          status.current_cycles.map((c) => (
            <CycleProgress key={c.project_id} cycle={c} onChange={refresh} />
          ))
        ) : (
          <div style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 12 }}>
            idle — no cycles in flight.{' '}
            {status.mode === 'auto'
              ? `next scheduled tick: per cron (${status.scheduler.cron_expression})`
              : 'manual mode — trigger one above.'}
          </div>
        )}
      </div>

      <div className="row row-3" style={{ marginBottom: 24 }}>
        <div className="card">
          <h2>Completed</h2>
          <div className="stat">{completed}</div>
          <div className="stat-sub">passed both gates</div>
        </div>
        <div className="card">
          <h2>Rejected</h2>
          <div className="stat" style={{ color: 'var(--warn)' }}>{rejected}</div>
          <div className="stat-sub">failed verify or frontend-verify</div>
        </div>
        <div className="card">
          <h2>In-flight / stalled</h2>
          <div className="stat" style={{ color: 'var(--info)' }}>
            {inProgress + stalled}
          </div>
          <div className="stat-sub">
            {inProgress} live, {stalled} stalled
          </div>
        </div>
      </div>

      <div className="section-head">
        <h1>Recent cycles</h1>
        <Link href="/cycles" className="btn btn-ghost">view all →</Link>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <RecentCyclesTable cycles={cycles.slice(0, 8)} />
      </div>

      {status.last_result && (
        <>
          <div className="section-head">
            <h1>Last result</h1>
          </div>
          <div className="card">
            <dl className="kv">
              <dt>project</dt>
              <dd>
                <Link href={`/cycles/${status.last_result.project_id}`}>
                  {status.last_result.project_id}
                </Link>
              </dd>
              <dt>mode</dt>
              <dd>{status.last_result.cycle_mode}</dd>
              <dt>started</dt>
              <dd>{fmtDateTime(status.last_result.started_at)}</dd>
              <dt>finished</dt>
              <dd>{fmtDateTime(status.last_result.finished_at)}</dd>
              <dt>status</dt>
              <dd>
                <ResultPill status={String(status.last_result.result.status)} />
              </dd>
            </dl>
          </div>
        </>
      )}
    </>
  )
}

function RecentCyclesTable({ cycles }: { cycles: CycleSummary[] }) {
  if (cycles.length === 0) {
    return <div className="empty">no cycles yet</div>
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>cycle</th>
          <th>name</th>
          <th>mode</th>
          <th>status</th>
          <th>activity</th>
          <th>dev</th>
        </tr>
      </thead>
      <tbody>
        {cycles.map((c) => (
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

function ResultPill({ status }: { status: string }) {
  if (status === 'success') return <span className="pill ok">{status}</span>
  if (status === 'rejected') return <span className="pill warn">{status}</span>
  return <span className="pill bad">{status}</span>
}
