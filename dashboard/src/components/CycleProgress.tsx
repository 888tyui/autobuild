'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api, type CurrentCycle } from '@/lib/api'
import { fmtElapsed, fmtRelative } from '@/lib/format'

const TOTAL_STAGES = 9

export function CycleProgress({ cycle, onChange }: { cycle: CurrentCycle; onChange: () => void }) {
  const [cancelling, setCancelling] = useState(false)
  const done = cycle.stages_done.length
  const current = cycle.current_stage
  const total = current?.total ?? TOTAL_STAGES
  const progress = current ? (current.index - 1) / total : done / total

  const handleCancel = async () => {
    if (cancelling) return
    if (!confirm(`Cancel cycle ${cycle.project_id}?\nAny in-flight agent call will be aborted.`)) return
    setCancelling(true)
    try {
      await api.cancel(cycle.project_id)
      onChange()
    } catch (err) {
      alert(`cancel failed: ${(err as Error).message}`)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="live-cycle">
        <span className="live-dot" style={cycle.cancel_requested ? { background: 'var(--warn)', boxShadow: '0 0 12px var(--warn)' } : undefined} />
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
            <Link href={`/cycles/${cycle.project_id}`} style={{ color: 'var(--text)' }}>
              {cycle.project_id}
            </Link>
            <span style={{ color: 'var(--text-faint)', marginLeft: 12 }}>
              [{cycle.cycle_mode}]
            </span>
            {cycle.cancel_requested && (
              <span className="pill warn" style={{ marginLeft: 10 }}>
                cancelling…
              </span>
            )}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-dim)' }}>
            {current ? (
              <>
                stage {current.index}/{current.total} —{' '}
                <span style={{ color: 'var(--text)' }}>{current.label}</span>{' '}
                <span style={{ color: 'var(--text-faint)' }}>
                  ({fmtRelative(current.started_at)})
                </span>
              </>
            ) : (
              <>between stages…</>
            )}
          </div>
          <div className="progress" style={{ marginTop: 10 }}>
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)' }}>STARTED</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtRelative(cycle.started_at)}</div>
          </div>
          {cycle.cancellable && !cycle.cancel_requested && (
            <button
              className="btn"
              onClick={handleCancel}
              disabled={cancelling}
              style={{ padding: '4px 10px', fontSize: 10 }}
            >
              {cancelling ? '…' : '✕ cancel'}
            </button>
          )}
        </div>
      </div>

      {cycle.stages_done.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {cycle.stages_done.map((s, i) => (
            <span
              key={i}
              className={`pill ${
                s.status === 'ok'
                  ? 'ok'
                  : s.status === 'rejected' || s.status === 'cancelled'
                    ? 'warn'
                    : 'bad'
              }`}
              title={`${s.label} — ${s.status} in ${fmtElapsed(s.elapsed_s)}`}
            >
              {s.label} · {fmtElapsed(s.elapsed_s)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
