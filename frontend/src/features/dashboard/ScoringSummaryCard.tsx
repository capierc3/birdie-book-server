import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '../../components'
import type { ScoringStats } from '../../api'
import { formatPct, formatNum } from '../../utils/format'
import styles from '../../styles/pages.module.css'

interface Props {
  data: ScoringStats
}

export function ScoringSummaryCard({ data }: Props) {
  const navigate = useNavigate()
  const stats = [
    { label: 'GIR %', value: formatPct(data.gir_pct) },
    { label: 'Fairway %', value: formatPct(data.fairway_pct) },
    { label: 'Putts/Hole', value: formatNum(data.avg_putts_per_hole) },
    { label: 'Scramble %', value: formatPct(data.scramble_pct) },
    { label: '3-Putt %', value: formatPct(data.three_putt_pct) },
  ]

  return (
    <Card>
      <CardHeader
        title="Key Stats"
        action={
          <span
            onClick={() => navigate('/scoring')}
            style={{ fontSize: '0.78rem', color: 'var(--primary)', cursor: 'pointer' }}
          >
            Details
          </span>
        }
      />
      <div className={styles.statsRow}>
        {stats.map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
