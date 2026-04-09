import { Card, CardHeader } from '../../components'
import type { PlanReviewResponse } from '../../api'
import { SG_CATEGORY_LABELS } from './constants'
import { formatDate, formatNum } from '../../utils/format'
import s from './PlanReview.module.css'

interface Props {
  review: PlanReviewResponse
}

export function PlanReview({ review }: Props) {
  const { before, deltas } = review
  const hasSG = deltas.sg_categories && deltas.sg_categories.length > 0
  const hasScoring = deltas.scoring
  const hasRange = deltas.range_session
  const hasMiss = deltas.miss_direction && deltas.miss_direction.length > 0
  const hasGaps = deltas.gaps && deltas.gaps.length > 0

  if (!hasSG && !hasScoring && !hasRange && !hasMiss && !hasGaps) return null

  return (
    <div>
      <h3 className={s.title}>Plan Review</h3>

      {hasRange && (
        <Card className={s.reviewCard}>
          <CardHeader>
            Linked Range Session
            {deltas.range_session!.session_date && (
              <span className={s.muted}>
                {' '}
                — {formatDate(deltas.range_session!.session_date!)}
              </span>
            )}
          </CardHeader>
          {deltas.range_session!.title && (
            <div className={s.subtitle}>{deltas.range_session!.title}</div>
          )}
          <div className={s.subtitle}>
            {deltas.range_session!.shot_count} shots
          </div>

          {Object.keys(deltas.range_session!.clubs).length > 0 && (
            <div className={s.table}>
              <div className={`${s.tableRow} ${s.tableHeader}`}>
                <span>Club</span>
                <span>Shots</span>
                <span>Avg Carry</span>
                <span>Std Dev</span>
                <span>Avg Lateral</span>
                <span>Ball Speed</span>
              </div>
              {Object.entries(deltas.range_session!.clubs).map(
                ([club, stats]) => (
                  <div key={club} className={s.tableRow}>
                    <span>{club}</span>
                    <span>{stats.shot_count}</span>
                    <span>
                      {stats.avg_carry != null
                        ? `${formatNum(stats.avg_carry, 1)} yd`
                        : '\u2014'}
                    </span>
                    <span>
                      {stats.std_carry != null
                        ? `\u00B1${formatNum(stats.std_carry, 1)}`
                        : '\u2014'}
                    </span>
                    <span>
                      {stats.avg_lateral != null
                        ? `${formatNum(stats.avg_lateral, 1)} yd`
                        : '\u2014'}
                    </span>
                    <span>
                      {stats.avg_ball_speed != null
                        ? `${formatNum(stats.avg_ball_speed, 1)} mph`
                        : '\u2014'}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </Card>
      )}

      {hasSG && (
        <Card className={s.reviewCard}>
          <CardHeader>Strokes Gained Snapshot</CardHeader>
          <div className={s.table}>
            <div className={`${s.tableRow} ${s.tableHeader}`}>
              <span>Category</span>
              <span>SG / Round (at generation)</span>
            </div>
            {deltas.sg_categories!.map((cat) => (
              <div key={cat.category} className={s.tableRow}>
                <span>
                  {SG_CATEGORY_LABELS[cat.category] ?? cat.label}
                </span>
                <span
                  style={{
                    color:
                      cat.before >= 0
                        ? 'var(--accent, #22c55e)'
                        : 'var(--danger, #ef4444)',
                  }}
                >
                  {cat.before >= 0 ? '+' : ''}
                  {cat.before.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {hasScoring && (
        <Card className={s.reviewCard}>
          <CardHeader>Scoring Delta</CardHeader>
          <div className={s.deltaRow}>
            <span className={s.deltaLabel}>3-Putt Rate</span>
            <span className={s.deltaValues}>
              {deltas.scoring!.three_putt_before != null
                ? `${deltas.scoring!.three_putt_before.toFixed(1)}%`
                : '\u2014'}
              {' \u2192 '}
              {deltas.scoring!.three_putt_after != null ? (
                <span
                  style={{
                    color:
                      deltas.scoring!.three_putt_after <
                      (deltas.scoring!.three_putt_before ?? 999)
                        ? 'var(--accent, #22c55e)'
                        : 'var(--danger, #ef4444)',
                  }}
                >
                  {deltas.scoring!.three_putt_after.toFixed(1)}%
                </span>
              ) : (
                '\u2014'
              )}
            </span>
          </div>
        </Card>
      )}

      {hasMiss && (
        <Card className={s.reviewCard}>
          <CardHeader>Miss Direction Changes</CardHeader>
          <div className={s.table}>
            <div className={`${s.tableRow} ${s.tableHeader}`}>
              <span>Club</span>
              <span>Before</span>
              <span>After</span>
            </div>
            {deltas.miss_direction!.map((m) => (
              <div key={m.club} className={s.tableRow}>
                <span>{m.club}</span>
                <span>
                  {m.before_pct.toFixed(0)}% {m.before_side}
                </span>
                <span>
                  {m.after_pct != null
                    ? `${m.after_pct.toFixed(0)}% ${m.after_dominant ?? ''}`
                    : '\u2014'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {hasGaps && (
        <Card className={s.reviewCard}>
          <CardHeader>Range-Course Gap Changes</CardHeader>
          <div className={s.table}>
            <div className={`${s.tableRow} ${s.tableHeader}`}>
              <span>Club</span>
              <span>Before</span>
              <span>After</span>
              <span>Trend</span>
            </div>
            {deltas.gaps!.map((g) => (
              <div key={g.club} className={s.tableRow}>
                <span>{g.club}</span>
                <span>{g.before_gap.toFixed(1)} yd</span>
                <span>{g.after_gap.toFixed(1)} yd</span>
                <span
                  style={{
                    color:
                      g.trend === 'closing'
                        ? 'var(--accent, #22c55e)'
                        : g.trend === 'widening'
                          ? 'var(--danger, #ef4444)'
                          : 'var(--text-muted)',
                  }}
                >
                  {g.trend === 'closing'
                    ? '\u2193 Closing'
                    : g.trend === 'widening'
                      ? '\u2191 Widening'
                      : '\u2014 Stable'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
