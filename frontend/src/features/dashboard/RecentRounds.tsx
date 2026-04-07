import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '../../components'
import type { RoundSummary } from '../../api'
import { formatDate, formatVsPar, vsParColor } from '../../utils/format'

interface Props {
  rounds: RoundSummary[]
}

export function RecentRounds({ rounds }: Props) {
  const navigate = useNavigate()
  const recent = rounds.slice(0, 5)

  if (recent.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="Recent Rounds"
        action={
          <span
            onClick={() => navigate('/rounds')}
            style={{ fontSize: '0.78rem', color: 'var(--primary)', cursor: 'pointer' }}
          >
            View All
          </span>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recent.map((r) => (
          <div
            key={r.id}
            onClick={() => navigate(`/rounds/${r.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              transition: 'background var(--transition)',
              background: 'var(--bg)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg)')}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {r.total_strokes ?? '--'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.course_name ?? 'Unknown Course'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {formatDate(r.date)}
                {r.holes_completed ? ` · ${r.holes_completed} holes` : ''}
                {r.shots_tracked ? ` · ${r.shots_tracked} shots` : ''}
              </div>
            </div>
            {r.score_vs_par != null && (
              <span
                className={vsParColor(r.score_vs_par)}
                style={{ fontSize: '0.9rem', fontWeight: 700, flexShrink: 0 }}
              >
                {formatVsPar(r.score_vs_par)}
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
