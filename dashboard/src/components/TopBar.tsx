'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, type Status } from '@/lib/api'

export function TopBar() {
  const pathname = usePathname()
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    const tick = async () => {
      try {
        const s = await api.getStatus()
        if (!stopped) {
          setStatus(s)
          setError(null)
        }
      } catch (err) {
        if (!stopped) setError((err as Error).message)
      }
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  const isActive = (path: string) => pathname === path

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="brand">
          <span className="dot" />
          autobuild ▸ control
        </span>
        <nav className="nav">
          <Link href="/" className={isActive('/') ? 'active' : ''}>
            Overview
          </Link>
          <Link href="/cycles" className={isActive('/cycles') ? 'active' : ''}>
            Cycles
          </Link>
        </nav>
      </div>

      <div className="topbar-right">
        {error ? (
          <span className="pill bad">orchestrator unreachable</span>
        ) : status ? (
          <>
            <span className={`pill ${status.mode === 'auto' ? 'ok' : 'warn'}`}>
              {status.mode}
            </span>
            {status.current_cycles.length > 0 ? (
              <span className="pill info">
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginRight: 6, verticalAlign: 1 }} />
                {status.current_cycles.length} running
                {status.max_concurrent ? ` / ${status.max_concurrent}` : ''}
              </span>
            ) : (
              <span className="pill mute">idle</span>
            )}
            <span style={{ color: 'var(--text-faint)' }}>
              :{api.apiBase.split(':').pop()}
            </span>
          </>
        ) : (
          <span className="pill mute">connecting…</span>
        )}
      </div>
    </header>
  )
}
