import { Card, CardHeader, StatCard } from '../../components'
import type { RoundSummary } from '../../api'
import { formatNum, formatVsPar, stdDev } from '../../utils/format'
import styles from '../../styles/pages.module.css'

interface Props {
  title: string
  rounds: RoundSummary[]
}

export function ScoringBreakdown({ title, rounds }: Props) {
  const eligible = rounds.filter(
    (r) => r.total_strokes && r.score_vs_par != null && !r.exclude_from_stats
  )

  if (eligible.length === 0) {
    return (
      <Card>
        <CardHeader title={title} />
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>No rounds yet</p>
      </Card>
    )
  }

  const scores = eligible.map((r) => r.total_strokes!)
  const vsPars = eligible.map((r) => r.score_vs_par!)

  const best = Math.min(...scores)
  const avgVsPar = vsPars.reduce((a, b) => a + b, 0) / vsPars.length
  const sd = stdDev(vsPars)

  return (
    <Card>
      <CardHeader title={title} />
      <div className={styles.statsRow}>
        <StatCard label="Rounds" value={eligible.length} />
        <StatCard label="Best" value={best} />
        <StatCard label="Avg vs Par" value={formatVsPar(Math.round(avgVsPar * 10) / 10)} />
        <StatCard label="Std Dev" value={formatNum(sd, 1)} />
      </div>
    </Card>
  )
}
