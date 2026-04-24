'use client'

import { useEffect, useState } from 'react'
import { api, type DevServerEntry } from '@/lib/api'

/**
 * Compact start/stop button for a project's dev server. Polls the
 * orchestrator for the per-cycle dev-server state every few seconds so
 * multiple instances on a list stay in sync.
 *
 * `compact` mode renders a single button suitable for table rows.
 */
export function DevServerControl({
  projectId,
  hasProject,
  compact = false,
}: {
  projectId: string
  hasProject: boolean
  compact?: boolean
}) {
  const [entry, setEntry] = useState<DevServerEntry | null>(null)
  const [pending, setPending] = useState<'start' | 'stop' | null>(null)

  useEffect(() => {
    if (!hasProject) return
    let stopped = false
    const tick = async () => {
      try {
        const e = await api.getDevServer(projectId)
        if (!stopped) setEntry(e)
      } catch {
        if (!stopped) setEntry(null)
      }
    }
    tick()
    const id = setInterval(tick, 4000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [projectId, hasProject])

  const start = async () => {
    if (pending) return
    setPending('start')
    try {
      const e = await api.startDevServer(projectId)
      setEntry(e)
    } catch (err) {
      alert(`start failed: ${(err as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  const stop = async () => {
    if (pending) return
    setPending('stop')
    try {
      await api.stopDevServer(projectId)
      setEntry(null)
    } catch (err) {
      alert(`stop failed: ${(err as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  if (!hasProject) {
    return (
      <span className="pill mute" title="no projects/{slug}/ on disk">
        no project
      </span>
    )
  }

  if (entry?.url) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <a
          href={entry.url}
          target="_blank"
          rel="noreferrer noopener"
          className="pill ok"
          style={{ textDecoration: 'none' }}
          title={`http://localhost:${entry.port}`}
        >
          :{entry.port} ↗
        </a>
        {!compact && (
          <button className="btn" onClick={stop} disabled={pending !== null} style={{ padding: '4px 10px', fontSize: 10 }}>
            {pending === 'stop' ? '…' : '✕'}
          </button>
        )}
      </div>
    )
  }

  if (entry && !entry.ready) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="pill info">starting…</span>
        {!compact && (
          <button className="btn" onClick={stop} disabled={pending !== null} style={{ padding: '4px 10px', fontSize: 10 }}>
            ✕
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      className="btn"
      onClick={start}
      disabled={pending !== null}
      style={compact ? { padding: '4px 10px', fontSize: 10 } : undefined}
      title="start the project's Next.js dev server"
    >
      {pending === 'start' ? '…' : '▶ dev'}
    </button>
  )
}
