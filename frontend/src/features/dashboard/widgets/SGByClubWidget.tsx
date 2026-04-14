import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '../../../components'
import { useSGByClub } from '../../../api'
import { formatSG, sgColor } from '../../../utils/format'

export function SGByClubWidget() {
  const navigate = useNavigate()
  const { data } = useSGByClub()

  if (!data || data.clubs.length === 0) {
    return (
      <Card>
        <CardHeader title="Strokes Gained by Club" />
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Not enough data yet</p>
      </Card>
    )
  }

  // Sort by SG per shot, show top 5 gainers and top 5 losers
  const sorted = [...data.clubs]
    .filter((c) => c.shot_count >= 5)
    .sort((a, b) => b.sg_pga_per_shot - a.sg_pga_per_shot)

  const top = sorted.slice(0, 5)
  const bottom = sorted.slice(-5).reverse()
  const displayed = [...top, ...bottom]
    // deduplicate in case there are fewer than 10 clubs
    .filter((c, i, arr) => arr.findIndex((x) => x.club_name === c.club_name && x.category === c.category) === i)

  const maxAbs = Math.max(...displayed.map((c) => Math.abs(c.sg_pga_per_shot)), 0.01)

  return (
    <Card>
      <CardHeader
        title="Strokes Gained by Club"
        action={
          <span
            onClick={() => navigate('/strokes-gained')}
            style={{ fontSize: '0.78rem', color: 'var(--primary)', cursor: 'pointer' }}
          >
            Details
          </span>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayed.map((c, i) => {
          const pct = (Math.abs(c.sg_pga_per_shot) / maxAbs) * 100
          const isPositive = c.sg_pga_per_shot >= 0
          return (
            <div key={`${c.club_name}-${c.category}-${i}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {c.club_name}
                  <span style={{ fontSize: '0.7rem', marginLeft: 6, color: 'var(--text-dim)' }}>
                    {c.category.replace(/_/g, ' ')}
                  </span>
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: sgColor(c.sg_pga_per_shot) }}>
                  {formatSG(c.sg_pga_per_shot)}
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: isPositive ? 'var(--success)' : 'var(--danger)',
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
