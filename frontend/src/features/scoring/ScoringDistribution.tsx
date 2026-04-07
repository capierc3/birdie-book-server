import { Card, CardHeader } from '../../components'
import type { ScoringDistribution as ScoringDist } from '../../api'
import { SCORE_DIST_COLORS } from '../../utils/chartTheme'

interface Props {
  data: ScoringDist
}

const LABELS: { key: keyof ScoringDist; label: string; color: string }[] = [
  { key: 'birdie_or_better', label: 'Birdie+', color: SCORE_DIST_COLORS.birdie_or_better },
  { key: 'par', label: 'Par', color: SCORE_DIST_COLORS.par },
  { key: 'bogey', label: 'Bogey', color: SCORE_DIST_COLORS.bogey },
  { key: 'double', label: 'Double', color: SCORE_DIST_COLORS.double },
  { key: 'triple_plus', label: 'Triple+', color: SCORE_DIST_COLORS.triple_plus },
]

export function ScoringDistribution({ data }: Props) {
  const total = Object.values(data).reduce((s, v) => s + v, 0)
  if (total === 0) return null

  return (
    <Card>
      <CardHeader title="Scoring Distribution" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LABELS.map(({ key, label, color }) => {
          const count = data[key]
          const pct = (count / total) * 100
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 600 }}>
                  {count} <span style={{ color: 'var(--text-dim)' }}>({pct.toFixed(1)}%)</span>
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4 }} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
