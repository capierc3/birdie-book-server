import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, Badge } from '../../../components'
import { useRangeSessions } from '../../../api'
import { formatDate } from '../../../utils/format'

export function RecentRangeSessionsWidget() {
  const navigate = useNavigate()
  const { data: sessions = [] } = useRangeSessions()

  const recent = sessions
    .slice()
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 5)

  if (recent.length === 0) {
    return (
      <Card>
        <CardHeader title="Recent Range Sessions" />
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>No range sessions yet</p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Recent Range Sessions"
        action={
          <span
            onClick={() => navigate('/range')}
            style={{ fontSize: '0.78rem', color: 'var(--primary)', cursor: 'pointer' }}
          >
            View All
          </span>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recent.map((s) => (
          <div
            key={s.id}
            onClick={() => navigate(`/range/${s.id}`)}
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
              {s.shot_count}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title ?? 'Range Session'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {formatDate(s.session_date)}
                {' · '}
                {s.shot_count} shot{s.shot_count !== 1 ? 's' : ''}
              </div>
            </div>
            <Badge>{s.source}</Badge>
          </div>
        ))}
      </div>
    </Card>
  )
}
