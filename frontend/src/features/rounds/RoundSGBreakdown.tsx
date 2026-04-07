import { Card, CardHeader } from '../../components'
import type { RoundHole } from '../../api'
import { SG_CATEGORIES, SG_COLORS, SG_LABELS } from '../../utils/chartTheme'
import { formatSG, sgColor } from '../../utils/format'

interface Props {
  holes: RoundHole[]
}

function classifyShot(shot: { shot_type?: string | null; start_lie?: string | null }): string {
  if (shot.shot_type === 'PUTT') return 'putting'
  if (shot.shot_type === 'TEE') return 'off_the_tee'
  if (shot.shot_type === 'APPROACH') return 'approach'
  if (shot.shot_type === 'CHIP' || shot.shot_type === 'SAND') return 'short_game'
  if (shot.start_lie === 'Green' || shot.start_lie === 'ON_GREEN') return 'putting'
  if (shot.start_lie === 'Tee' || shot.start_lie === 'TEE_BOX') return 'off_the_tee'
  return 'approach'
}

export function RoundSGBreakdown({ holes }: Props) {
  const totals: Record<string, { sg: number; count: number }> = {}
  SG_CATEGORIES.forEach((c) => (totals[c] = { sg: 0, count: 0 }))

  for (const hole of holes) {
    for (const shot of hole.shots) {
      if (shot.sg_pga == null) continue
      const cat = classifyShot(shot)
      if (totals[cat]) {
        totals[cat].sg += shot.sg_pga
        totals[cat].count++
      }
    }
  }

  const hasData = Object.values(totals).some((t) => t.count > 0)
  if (!hasData) return null

  const maxVal = Math.max(...Object.values(totals).map((t) => Math.abs(t.sg)), 0.1)

  return (
    <Card>
      <CardHeader title="Strokes Gained" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SG_CATEGORIES.map((cat) => {
          const { sg, count } = totals[cat]
          if (count === 0) return null
          const pct = (Math.abs(sg) / maxVal) * 100
          return (
            <div key={cat}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {SG_LABELS[cat]}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 6 }}>
                    ({count} shots)
                  </span>
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: sgColor(sg) }}>
                  {formatSG(sg)}
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: sg >= 0 ? SG_COLORS[cat] : 'var(--danger)',
                    borderRadius: 4,
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
