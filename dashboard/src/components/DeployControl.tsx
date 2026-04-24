'use client'

import { useEffect, useState } from 'react'
import { api, type DeployStatus } from '@/lib/api'
import { fmtRelative } from '@/lib/format'

const PILL_FOR_STATUS: Record<DeployStatus['status'], string> = {
  running: 'info',
  success: 'ok',
  partial: 'warn',
  blocked: 'warn',
  failed: 'bad',
  finished: 'ok',
  cancelled: 'mute',
}

export function DeployControl({
  projectId,
  hasProject,
}: {
  projectId: string
  hasProject: boolean
}) {
  const [status, setStatus] = useState<DeployStatus | null>(null)
  const [pending, setPending] = useState<'start' | 'cancel' | null>(null)

  useEffect(() => {
    if (!hasProject) return
    let stopped = false
    const tick = async () => {
      try {
        const s = await api.getDeploy(projectId)
        if (!stopped) setStatus(s)
      } catch {
        if (!stopped) setStatus(null)
      }
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [projectId, hasProject])

  const startDeploy = async () => {
    if (pending) return
    if (
      !confirm(
        'Deploy this project to Railway?\n\nThis will create resources in your Railway account (project + Postgres). Make sure the Railway CLI is installed and you are logged in (`railway login`).',
      )
    )
      return
    setPending('start')
    try {
      const s = await api.startDeploy(projectId)
      setStatus(s)
    } catch (err) {
      alert(`deploy failed: ${(err as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  const cancelDeploy = async () => {
    if (pending) return
    if (!confirm('Cancel the running deploy?')) return
    setPending('cancel')
    try {
      await api.cancelDeploy(projectId)
    } catch (err) {
      alert(`cancel failed: ${(err as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  if (!hasProject) {
    return (
      <div className="empty" style={{ padding: 30 }}>
        no projects/{'{slug}'}/ on disk — nothing to deploy
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        {status?.status === 'running' ? (
          <>
            <span className={`pill ${PILL_FOR_STATUS[status.status]}`}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginRight: 6, verticalAlign: 1 }} />
              deploying… ({fmtRelative(status.started_at)})
            </span>
            <button className="btn" onClick={cancelDeploy} disabled={pending !== null}>
              {pending === 'cancel' ? '…' : '✕ cancel'}
            </button>
          </>
        ) : status ? (
          <>
            <span className={`pill ${PILL_FOR_STATUS[status.status]}`}>
              {status.status}
              {status.final_status_word && status.final_status_word !== status.status
                ? ` · ${status.final_status_word}`
                : ''}
            </span>
            {status.url && (
              <a
                href={status.url}
                target="_blank"
                rel="noreferrer noopener"
                className="pill ok"
                style={{ textDecoration: 'none' }}
              >
                {status.url} ↗
              </a>
            )}
            {status.finished_at && (
              <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                finished {fmtRelative(status.finished_at)}
              </span>
            )}
            <button className="btn btn-accent" onClick={startDeploy} disabled={pending !== null}>
              {pending === 'start' ? '…' : '🚀 redeploy'}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-accent" onClick={startDeploy} disabled={pending !== null}>
              {pending === 'start' ? '…' : '🚀 deploy to Railway'}
            </button>
            <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
              requires `railway` CLI installed and authenticated
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
