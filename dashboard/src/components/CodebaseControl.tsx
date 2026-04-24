'use client'

import { useEffect, useState } from 'react'
import { api, type CodebaseStatus } from '@/lib/api'
import { fmtRelative } from '@/lib/format'

const PILL_FOR_STATUS: Record<CodebaseStatus['status'], string> = {
  running: 'info',
  success: 'ok',
  finished: 'ok',
  failed: 'bad',
  cancelled: 'mute',
}

export function CodebaseControl({
  projectId,
  hasProject,
}: {
  projectId: string
  hasProject: boolean
}) {
  const [status, setStatus] = useState<CodebaseStatus | null>(null)
  const [pending, setPending] = useState<'start' | 'cancel' | null>(null)

  useEffect(() => {
    if (!hasProject) return
    let stopped = false
    const tick = async () => {
      try {
        const s = await api.getCodebase(projectId)
        if (!stopped) setStatus(s)
      } catch {
        if (!stopped) setStatus(null)
      }
    }
    tick()
    const id = setInterval(tick, 6000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [projectId, hasProject])

  const startCodebase = async () => {
    if (pending) return
    if (
      !confirm(
        'Build the companion codebase?\n\nThis runs an opus 4.7 1M agent that picks Rust / TypeScript / Go / Python, builds a real working project, generates 50–60 backdated commits, and pushes to a per-project GitHub repo. Cost is non-trivial (~10-20 min, ~$5-15).',
      )
    )
      return
    setPending('start')
    try {
      const s = await api.startCodebase(projectId)
      setStatus(s)
    } catch (err) {
      alert(`codebase failed to start: ${(err as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  const cancelCodebase = async () => {
    if (pending) return
    if (!confirm('Cancel the running codebase build?')) return
    setPending('cancel')
    try {
      await api.cancelCodebase(projectId)
    } catch (err) {
      alert(`cancel failed: ${(err as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  if (!hasProject) {
    return (
      <div className="empty" style={{ padding: 30 }}>
        no projects/{'{slug}'}/ on disk — nothing to build a codebase for
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {status?.status === 'running' ? (
          <>
            <span className={`pill ${PILL_FOR_STATUS[status.status]}`}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginRight: 6, verticalAlign: 1 }} />
              building… ({fmtRelative(status.started_at)})
            </span>
            {status.language && (
              <span className="pill mute">{status.language}</span>
            )}
            <button className="btn" onClick={cancelCodebase} disabled={pending !== null}>
              {pending === 'cancel' ? '…' : '✕ cancel'}
            </button>
          </>
        ) : status ? (
          <>
            <span className={`pill ${PILL_FOR_STATUS[status.status]}`}>{status.status}</span>
            {status.language && <span className="pill mute">{status.language}</span>}
            {status.repo_url && (
              <a
                href={status.repo_url}
                target="_blank"
                rel="noreferrer noopener"
                className="pill ok"
                style={{ textDecoration: 'none' }}
              >
                {status.repo_url.replace(/^https?:\/\//, '')} ↗
              </a>
            )}
            {status.commit_count !== null && (
              <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                {status.commit_count} commits
                {status.range ? ` · ${status.range}` : ''}
              </span>
            )}
            {status.finished_at && (
              <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                finished {fmtRelative(status.finished_at)}
              </span>
            )}
            <button className="btn btn-accent" onClick={startCodebase} disabled={pending !== null}>
              {pending === 'start' ? '…' : '🌱 rebuild'}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-accent" onClick={startCodebase} disabled={pending !== null}>
              {pending === 'start' ? '…' : '🌱 build companion codebase'}
            </button>
            <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
              picks language, builds real product, 50–60 backdated commits, pushes to {`{slug}`}-codebase repo
            </span>
          </>
        )}
      </div>

      {status?.error && (
        <div className="error-text" style={{ marginBottom: 10 }}>
          {status.error}
        </div>
      )}

      {status?.log_tail && (
        <pre className="log" style={{ maxHeight: 320 }}>
          {status.log_tail}
        </pre>
      )}
    </div>
  )
}
