import { Card, CardHeader } from '../../components'
import type { AnalysisSummary } from '../../api'
import { SG_CATEGORY_LABELS } from './constants'
import s from './AnalysisSummary.module.css'

interface Props {
  analysis: AnalysisSummary
  compact?: boolean
}

export function AnalysisSummaryCard({ analysis, compact }: Props) {
  const hasSG = analysis.sg_by_category && analysis.sg_by_category.length > 0
  const hasGaps =
    analysis.range_course_gaps && analysis.range_course_gaps.length > 0
  const hasMiss =
    analysis.miss_highlights && analysis.miss_highlights.length > 0
  const hasScoring = analysis.scoring_patterns
  const hasCourse = analysis.course_needs

  if (!hasSG && !hasGaps && !hasMiss && !hasScoring) return null

  return (
    <Card className={s.card}>
      <CardHeader>
        Game Analysis{' '}
        {analysis.total_rounds != null && (
          <span className={s.muted}>({analysis.total_rounds} rounds)</span>
        )}
      </CardHeader>

      {hasSG && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Strokes Gained by Category</div>
          {analysis.sg_by_category!.map((cat) => (
            <SGBarRow key={cat.category} cat={cat} />
          ))}
        </div>
      )}

      {hasGaps && !compact && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Range vs Course Gaps</div>
          <div className={s.miniTable}>
            <div className={`${s.miniRow} ${s.miniHeader}`}>
              <span>Club</span>
              <span>Gap (yd)</span>
              <span>Trend</span>
            </div>
            {analysis.range_course_gaps!.map((gap) => (
              <div key={gap.club_id} className={s.miniRow}>
                <span>{gap.club_name}</span>
                <span
                  style={{
                    color:
                      Math.abs(gap.gap) > 10
                        ? 'var(--danger, #ef4444)'
                        : 'var(--text)',
                  }}
                >
                  {gap.gap > 0 ? '+' : ''}
                  {gap.gap.toFixed(1)}
                </span>
                <span className={s.trend}>
                  {gap.trend === 'closing'
                    ? '\u2193 Closing'
                    : gap.trend === 'widening'
                      ? '\u2191 Widening'
                      : gap.trend === 'stable'
                        ? '\u2014 Stable'
                        : '\u2014'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasMiss && !compact && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Miss Tendencies</div>
          {analysis.miss_highlights!.map((m) => (
            <div key={m.club} className={s.missRow}>
              <span className={s.missClub}>{m.club}</span>
              <MissBar
                leftPct={m.dominant === 'left' ? m.pct : 100 - m.pct}
                rightPct={m.dominant === 'right' ? m.pct : 100 - m.pct}
                dominant={m.dominant}
              />
            </div>
          ))}
        </div>
      )}

      {hasScoring && !compact && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Scoring Leaks</div>
          <div className={s.scoringGrid}>
            {analysis.scoring_patterns!.three_putt_rate != null && (
              <div className={s.scoringStat}>
                <div className={s.scoringValue}>
                  {analysis.scoring_patterns!.three_putt_rate.toFixed(1)}%
                </div>
                <div className={s.scoringLabel}>3-Putt Rate</div>
              </div>
            )}
            {analysis.scoring_patterns!.scramble_pct != null && (
              <div className={s.scoringStat}>
                <div className={s.scoringValue}>
                  {analysis.scoring_patterns!.scramble_pct.toFixed(1)}%
                </div>
                <div className={s.scoringLabel}>Scrambling %</div>
              </div>
            )}
            {analysis.scoring_patterns!.penalties_per_round != null && (
              <div className={s.scoringStat}>
                <div className={s.scoringValue}>
                  {analysis.scoring_patterns!.penalties_per_round.toFixed(1)}
                </div>
                <div className={s.scoringLabel}>Penalties / Round</div>
              </div>
            )}
          </div>
        </div>
      )}

      {hasCourse && !compact && (
        <div className={s.section}>
          <div className={s.sectionTitle}>
            Course: {analysis.course_needs!.course_name}
          </div>
          {analysis.course_needs!.distance_bands &&
            analysis.course_needs!.distance_bands.length > 0 && (
              <div className={s.miniTable}>
                <div className={`${s.miniRow} ${s.miniHeader}`}>
                  <span>Distance Band</span>
                  <span>Holes</span>
                </div>
                {analysis.course_needs!.distance_bands.map((band) => (
                  <div key={band.band} className={s.miniRow}>
                    <span>{band.band}</span>
                    <span>{band.count}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </Card>
  )
}

function SGBarRow({
  cat,
}: {
  cat: {
    category: string
    label: string
    sg_per_round: number
    trend?: string | null
  }
}) {
  const maxWidth = 100
  const absVal = Math.abs(cat.sg_per_round)
  const width = Math.min(absVal * 30, maxWidth) // Scale: 1 SG = 30% width
  const isPositive = cat.sg_per_round >= 0

  return (
    <div className={s.sgRow}>
      <span className={s.sgLabel}>
        {SG_CATEGORY_LABELS[cat.category] ?? cat.label}
      </span>
      <div className={s.sgTrack}>
        <div
          className={s.sgFill}
          style={{
            width: `${width}%`,
            background: isPositive
              ? 'var(--accent, #22c55e)'
              : 'var(--danger, #ef4444)',
          }}
        />
      </div>
      <span className={s.sgValue}>
        {cat.sg_per_round >= 0 ? '+' : ''}
        {cat.sg_per_round.toFixed(2)}
        {cat.trend === 'improving' && ' \u2191'}
        {cat.trend === 'declining' && ' \u2193'}
      </span>
    </div>
  )
}

function MissBar({
  leftPct,
  rightPct,
  dominant,
}: {
  leftPct: number
  rightPct: number
  dominant: string
}) {
  const center = 100 - leftPct - rightPct
  return (
    <div className={s.missBar}>
      <div
        className={s.missSeg}
        style={{
          width: `${leftPct}%`,
          background:
            dominant === 'left'
              ? 'var(--danger, #ef4444)'
              : 'var(--text-muted)',
          opacity: dominant === 'left' ? 1 : 0.3,
        }}
      />
      <div
        className={s.missSeg}
        style={{
          width: `${Math.max(center, 0)}%`,
          background: 'var(--accent, #22c55e)',
          opacity: 0.3,
        }}
      />
      <div
        className={s.missSeg}
        style={{
          width: `${rightPct}%`,
          background:
            dominant === 'right'
              ? 'var(--danger, #ef4444)'
              : 'var(--text-muted)',
          opacity: dominant === 'right' ? 1 : 0.3,
        }}
      />
      <div className={s.missLabels}>
        <span>L {leftPct.toFixed(0)}%</span>
        <span>R {rightPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}
