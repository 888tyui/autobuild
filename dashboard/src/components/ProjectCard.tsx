'use client'

import Link from 'next/link'
import { type CycleSummary, api } from '@/lib/api'
import { fmtRelative } from '@/lib/format'

const STATUS_PILL: Record<CycleSummary['status'], string> = {
  completed: 'ok',
  rejected: 'warn',
  cancelled: 'mute',
  'in-progress': 'info',
  stalled: 'bad',
}

export function ProjectCard({ c }: { c: CycleSummary }) {
  const preview = c.preview_image ? `${api.apiBase}${c.preview_image}` : null

  return (
    <article className="project-card">
      <Link href={`/cycles/${c.project_id}`} className="project-card-media" aria-label={c.name ?? c.project_id}>
        {preview ? (
          <img src={preview} alt="" loading="lazy" />
        ) : (
          <div className="project-card-placeholder">
            <span className="mono" style={{ color: 'var(--text-faint)', fontSize: 11 }}>
              no preview
            </span>
          </div>
        )}
        <div className="project-card-tag-row">
          <span className={`pill ${STATUS_PILL[c.status]}`}>{c.status}</span>
          {c.cycle_mode && <span className="pill mute">{c.cycle_mode}</span>}
        </div>
      </Link>

      <div className="project-card-body">
        <Link href={`/cycles/${c.project_id}`} className="project-card-name">
          {c.name ?? c.project_id}
        </Link>
        <p className="project-card-oneliner">{c.one_liner ?? '—'}</p>

        <div className="project-card-meta">
          {c.world && <div><span className="label">world</span>{c.world}</div>}
          {c.fetish_object && <div><span className="label">object</span>{c.fetish_object}</div>}
        </div>

        <div className="project-card-actions">
          {c.deploy_url && (
            <a
              href={c.deploy_url}
              target="_blank"
              rel="noreferrer noopener"
              className="action-link ok"
              title={c.deploy_url}
            >
              Live ↗
            </a>
          )}
          {c.codebase_url && (
            <a
              href={c.codebase_url}
              target="_blank"
              rel="noreferrer noopener"
              className="action-link info"
              title={c.codebase_url}
            >
              Code
              {c.codebase_language ? ` · ${c.codebase_language}` : ''} ↗
            </a>
          )}
          <Link href={`/cycles/${c.project_id}`} className="action-link mute">
            detail →
          </Link>
          <span className="activity mono">{fmtRelative(c.last_activity_iso)}</span>
        </div>

        {c.rejection_trigger && (
          <p className="project-card-rejection mono">
            {c.rejection_trigger}
          </p>
        )}
      </div>
    </article>
  )
}
