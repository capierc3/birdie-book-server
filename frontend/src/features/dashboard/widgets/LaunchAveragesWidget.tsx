import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '../../../components'
import { useClubs } from '../../../api'
import type { Club } from '../../../api'
import { formatNum } from '../../../utils/format'

function clubSortKey(type: string): number {
  const t = type.toUpperCase()
  if (t === 'DRIVER') return 100
  if (t.includes('WOOD')) return 200
  if (t.includes('HYBRID')) return 300
  if (t.includes('IRON')) return 400
  if (t.includes('WEDGE') || t === 'PW' || t === 'GW' || t === 'SW' || t === 'LW') return 500
  if (t === 'PUTTER') return 600
  return 700
}

export function LaunchAveragesWidget() {
  const navigate = useNavigate()
  const { data: clubs = [] } = useClubs()

  const withRangeData = clubs
    .filter((c) => !c.retired && c.club_type !== 'Unknown' && c.club_type !== 'Putter' && c.stats?.range_sample_count)
    .sort((a, b) => clubSortKey(a.club_type) - clubSortKey(b.club_type))

  if (withRangeData.length === 0) {
    return (
      <Card>
        <CardHeader title="Launch Monitor Averages" />
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>No range data yet</p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Launch Monitor Averages"
        action={
          <span
            onClick={() => navigate('/clubs')}
            style={{ fontSize: '0.78rem', color: 'var(--primary)', cursor: 'pointer' }}
          >
            Details
          </span>
        }
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.5px' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Club</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Carry</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Total</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Shots</th>
            </tr>
          </thead>
          <tbody>
            {withRangeData.map((c) => (
              <tr
                key={c.id}
                onClick={() => navigate(`/clubs/${c.id}`)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <td style={{ padding: '8px', fontWeight: 600, color: c.color ?? 'var(--text)' }}>
                  {c.club_type}
                </td>
                <td style={{ textAlign: 'right', padding: '8px' }}>
                  {c.stats?.range_avg_yards != null ? formatNum(c.stats.range_avg_yards, 0) : '--'}
                </td>
                <td style={{ textAlign: 'right', padding: '8px', color: 'var(--text-muted)' }}>
                  {c.stats?.combined_avg_yards != null ? formatNum(c.stats.combined_avg_yards, 0) : '--'}
                </td>
                <td style={{ textAlign: 'right', padding: '8px', color: 'var(--text-muted)' }}>
                  {c.stats?.range_sample_count ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
