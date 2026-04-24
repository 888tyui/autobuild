'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { api, type Status, type CycleSummary } from '@/lib/api'
import { fmtDateTime, fmtRelative } from '@/lib/format'
import { CycleProgress } from '@/components/CycleProgress'
import { Controls } from '@/components/Controls'
import { ProjectCard } from '@/components/ProjectCard'

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
  const deployed = cycles.filter((c) => c.deploy_url).length

  const recent = cycles.slice(0, 9)
  const featured = cycles.filter((c) => c.deploy_url).slice(0, 6)

  return (
    <>
      <div className="overview-hero">
        <h1>Control</h1>
        <p>
          An always-on product factory. Each cycle runs an eleven-stage Claude Opus 4.7 pipeline,
          ships a working site with a Railway deploy, and opens a companion codebase repo.
        </p>
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

      <div className="stat-row">
        <div className="stat-card">
          <h2 style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 14, fontWeight: 500 }}>
            Completed
          </h2>
          <div className="stat">{completed}</div>
          <div className="stat-sub">passed both gates</div>
        </div>
        <div className="stat-card info">
          <h2 style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 14, fontWeight: 500 }}>
            Deployed
          </h2>
          <div className="stat" style={{ color: 'var(--info)' }}>{deployed}</div>
          <div className="stat-sub">live on Railway</div>
        </div>
        <div className="stat-card warn">
          <h2 style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 14, fontWeight: 500 }}>
            Rejected
          </h2>
          <div className="stat" style={{ color: 'var(--warn)' }}>{rejected}</div>
          <div className="stat-sub">failed a gate</div>
        </div>
        <div className="stat-card bad">
          <h2 style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 14, fontWeight: 500 }}>
            In-flight · stalled
          </h2>
          <div className="stat">
            {inProgress}
            <span style={{ color: 'var(--text-faint)', fontSize: 24, fontWeight: 400 }}> · {stalled}</span>
          </div>
          <div className="stat-sub">live vs abandoned</div>
        </div>
      </div>

      {featured.length > 0 && (
        <>
          <div className="section-head lg">
            <h1>Shipped</h1>
            <span className="meta">{featured.length} live</span>
          </div>
          <div className="project-grid" style={{ marginBottom: 32 }}>
            {featured.map((c) => (
              <ProjectCard key={c.project_id} c={c} />
            ))}
          </div>
        </>
      )}

      <div className="section-head lg">
        <h1>Recent</h1>
        <Link href="/cycles" className="btn btn-ghost">view all →</Link>
      </div>
      {recent.length === 0 ? (
        <div className="card empty">no cycles yet</div>
      ) : (
        <div className="project-grid">
          {recent.map((c) => (
            <ProjectCard key={c.project_id} c={c} />
          ))}
        </div>
      )}

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

function ResultPill({ status }: { status: string }) {
  if (status === 'success') return <span className="pill ok">{status}</span>
  if (status === 'rejected') return <span className="pill warn">{status}</span>
  return <span className="pill bad">{status}</span>
}
