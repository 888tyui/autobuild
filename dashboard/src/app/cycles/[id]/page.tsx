'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { api, type CycleDetail, type Status } from '@/lib/api'
import { fmtBytes, fmtDateTime, fmtRelative } from '@/lib/format'

export default function CycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [detail, setDetail] = useState<CycleDetail | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [fileBody, setFileBody] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let stopped = false
    const tick = async () => {
      try {
        const [d, s] = await Promise.all([api.getCycle(id), api.getStatus()])
        if (!stopped) {
          setDetail(d)
          setStatus(s)
          setError(null)
        }
      } catch (err) {
        if (!stopped) setError((err as Error).message)
      }
    }
    tick()
    const refreshMs = 4000
    const intervalId = setInterval(tick, refreshMs)
    return () => {
      stopped = true
      clearInterval(intervalId)
    }
  }, [id])

  const live = status?.current_cycles.find((c) => c.project_id === id)
  const handleCancel = async () => {
    if (!live || cancelling) return
    if (!confirm(`Cancel cycle ${id}?\nAny in-flight agent call will be aborted.`)) return
    setCancelling(true)
    try {
      await api.cancel(id)
    } catch (err) {
      alert(`cancel failed: ${(err as Error).message}`)
    } finally {
      setCancelling(false)
    }
  }

  useEffect(() => {
    if (!openFile) {
      setFileBody(null)
      setFileError(null)
      return
    }
    let stopped = false
    api
      .getCycleFile(id, openFile)
      .then((b) => !stopped && setFileBody(b))
      .catch((e) => !stopped && setFileError((e as Error).message))
    return () => {
      stopped = true
    }
  }, [id, openFile])

  if (error) return <div className="empty">cycle unreachable: {error}</div>
  if (!detail) return <div className="empty">loading…</div>

  return (
    <>
      <div className="crumbs">
        <Link href="/">Overview</Link>
        <span>/</span>
        <Link href="/cycles">Cycles</Link>
        <span>/</span>
        <span style={{ color: 'var(--text)' }}>{detail.project_id}</span>
      </div>

      <div className="section-head">
        <h1>{detail.name ?? detail.project_id}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {live && (
            <span className="pill info">
              live {live.current_stage ? `· ${live.current_stage.label}` : ''}
            </span>
          )}
          {live?.cancellable && !live.cancel_requested && (
            <button className="btn" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? '…' : '✕ cancel cycle'}
            </button>
          )}
          {live?.cancel_requested && <span className="pill warn">cancelling…</span>}
          <span className="meta">{fmtRelative(detail.last_activity_iso)}</span>
        </div>
      </div>

      <div className="row row-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <h2>Overview</h2>
          <dl className="kv">
            <dt>project_id</dt>
            <dd className="mono">{detail.project_id}</dd>
            <dt>name</dt>
            <dd>{detail.name ?? '—'}</dd>
            <dt>slug</dt>
            <dd className="mono">{detail.slug ?? '—'}</dd>
            <dt>one-liner</dt>
            <dd>{detail.one_liner ?? '—'}</dd>
            <dt>fetish object</dt>
            <dd>{detail.fetish_object ?? '—'}</dd>
            <dt>world</dt>
            <dd>{detail.world ?? '—'}</dd>
            <dt>cycle mode</dt>
            <dd className="mono">{detail.cycle_mode ?? '—'}</dd>
            <dt>status</dt>
            <dd><StatusPill status={detail.status} /></dd>
            {detail.rejection_trigger && (
              <>
                <dt>rejection</dt>
                <dd>
                  <span style={{ color: 'var(--warn)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {detail.rejection_stage}: {detail.rejection_trigger}
                  </span>
                </dd>
              </>
            )}
            {detail.has_human_review && (
              <>
                <dt>human score</dt>
                <dd>{detail.human_score} / 10</dd>
              </>
            )}
            {detail.project_path && (
              <>
                <dt>project</dt>
                <dd className="mono">{detail.project_path}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="card">
          <h2>Cycle log (tail)</h2>
          <pre className="log">{detail.log_tail || <em>no log yet</em>}</pre>
        </div>
      </div>

      <div className="section-head">
        <h1>Artifacts</h1>
        <span className="meta">{detail.files.length} files</span>
      </div>

      <div className="row row-2">
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>file</th>
                <th>size</th>
                <th>modified</th>
              </tr>
            </thead>
            <tbody>
              {detail.files.map((f) => (
                <tr
                  key={f.name}
                  onClick={() => !f.is_dir && setOpenFile(f.name)}
                  style={{ cursor: f.is_dir ? 'default' : 'pointer' }}
                >
                  <td className="mono" style={{ color: f.is_dir ? 'var(--text-faint)' : openFile === f.name ? 'var(--accent)' : 'var(--text)' }}>
                    {f.is_dir ? '📁 ' : ''}{f.name}
                  </td>
                  <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                    {f.is_dir ? '—' : fmtBytes(f.size_bytes)}
                  </td>
                  <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                    {fmtDateTime(f.modified_iso)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>{openFile ?? 'select a file to preview'}</h2>
          {openFile ? (
            fileError ? (
              <div className="error-text">{fileError}</div>
            ) : fileBody === null ? (
              <div className="empty" style={{ padding: 30 }}>loading…</div>
            ) : (
              <pre className="log" style={{ maxHeight: 600 }}>{fileBody}</pre>
            )
          ) : (
            <div className="empty" style={{ padding: 30 }}>
              click any file in the left list to preview
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function StatusPill({ status }: { status: CycleDetail['status'] }) {
  const map: Record<CycleDetail['status'], string> = {
    completed: 'ok',
    rejected: 'warn',
    cancelled: 'mute',
    'in-progress': 'info',
    stalled: 'bad',
  }
  return <span className={`pill ${map[status]}`}>{status}</span>
}
