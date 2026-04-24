'use client'

import { useState } from 'react'
import { api, type Status } from '@/lib/api'

export function Controls({ status, onChange }: { status: Status; onChange: () => void }) {
  const [pending, setPending] = useState<string | null>(null)

  const active = status.current_cycles.length
  const atCap = active >= status.max_concurrent

  const setMode = async (mode: 'auto' | 'manual') => {
    if (pending) return
    setPending(`mode:${mode}`)
    try {
      await api.setMode(mode)
      onChange()
    } finally {
      setPending(null)
    }
  }

  const trigger = async (cycleMode: 'trend' | 'experimental') => {
    if (pending) return
    if (atCap) {
      alert(`already at concurrency cap (${active}/${status.max_concurrent})`)
      return
    }
    setPending(`trigger:${cycleMode}`)
    try {
      await api.trigger(cycleMode)
      onChange()
    } catch (err) {
      alert(`trigger failed: ${(err as Error).message}`)
    } finally {
      setPending(null)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div className="toggle" role="tablist">
        <button
          className={status.mode === 'auto' ? 'active' : ''}
          onClick={() => setMode('auto')}
          disabled={pending !== null}
        >
          auto
        </button>
        <button
          className={status.mode === 'manual' ? 'active' : ''}
          onClick={() => setMode('manual')}
          disabled={pending !== null}
        >
          manual
        </button>
      </div>

      <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
        manual trigger:
      </span>

      <button
        className="btn"
        onClick={() => trigger('trend')}
        disabled={pending !== null || atCap}
      >
        ▶ trend
      </button>
      <button
        className="btn"
        onClick={() => trigger('experimental')}
        disabled={pending !== null || atCap}
      >
        ▶ experimental
      </button>

      <span className="pill mute">
        {active} / {status.max_concurrent} slots
      </span>

      {status.scheduler.enabled && (
        <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
          cron: {status.scheduler.cron_expression}
        </span>
      )}
    </div>
  )
}
