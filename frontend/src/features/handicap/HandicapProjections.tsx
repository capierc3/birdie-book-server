import { useMemo } from 'react'
import { Card, CardHeader } from '../../components'
import type { HandicapData } from '../../api'
import { filterTrend, regressSlope } from './handicapFilter'
import type { AxisMode, RangeValue } from './handicapFilter'

interface Props {
  data: HandicapData
  axisMode: AxisMode
  rangeValue: RangeValue
}

const MILESTONES: { target: number; label: string }[] = [
  { target: 30, label: 'Break 30' },
  { target: 25, label: 'Break 25' },
  { target: 20, label: 'Break 20' },
  { target: 18, label: 'Break 18' },
  { target: 15, label: 'Break 15' },
  { target: 10, label: 'Single digits' },
  { target: 5, label: 'Break 5' },
  { target: 0, label: 'Scratch golfer' },
]

const RANGE_LABELS: Record<RangeValue, string> = {
  '5': 'last 5 rounds',
  '10': 'last 10 rounds',
  '20': 'last 20 rounds',
  all: 'all rounds',
  '1m': 'last month',
  '3m': 'last 3 months',
  '6m': 'last 6 months',
  '1y': 'last year',
}

export function HandicapProjections({ data, axisMode, rangeValue }: Props) {
  const { rate, milestones, currentIndex, rangeLabel } = useMemo(() => {
    const sliced = filterTrend(data.trend, axisMode, rangeValue)
    const slope = regressSlope(sliced)
    const lastIdx = [...sliced].reverse().find((t) => t.handicap_index != null)?.handicap_index ?? data.handicap_index ?? null

    const ms: { milestone: number; label: string; rounds_away: number | null }[] = []
    if (slope != null && slope < 0 && lastIdx != null) {
      for (const m of MILESTONES) {
        if (lastIdx <= m.target) continue
        const rounds = Math.floor((m.target - lastIdx) / slope)
        if (rounds > 0) ms.push({ milestone: m.target, label: m.label, rounds_away: rounds })
      }
    }

    return {
      rate: slope,
      milestones: ms,
      currentIndex: lastIdx,
      rangeLabel: RANGE_LABELS[rangeValue],
    }
  }, [data.trend, data.handicap_index, axisMode, rangeValue])

  if (rate == null && milestones.length === 0) return null

  const absRate = Math.abs(rate ?? 0).toFixed(2)
  const isImproving = (rate ?? 0) < 0
  const isStable = rate === 0

  return (
    <Card>
      <CardHeader title="Projection" />
      <div style={{ padding: '0 20px 20px', fontSize: '0.88rem' }}>
        {rate != null && (
          <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
            Across {rangeLabel}, your handicap is{' '}
            <strong style={{ color: isImproving ? 'var(--birdie)' : isStable ? 'var(--text-muted)' : 'var(--bogey)' }}>
              {isImproving ? 'improving' : isStable ? 'stable' : 'increasing'}
            </strong>
            {' '}by{' '}
            <strong style={{ color: isImproving ? 'var(--birdie)' : isStable ? 'var(--text-muted)' : 'var(--bogey)' }}>
              {absRate}
            </strong>
            {' '}strokes per round.
          </p>
        )}

        {milestones.length > 0 && isImproving ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {milestones.map((p) => (
              <div
                key={p.milestone}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{p.label}</span>
                <span style={{ fontWeight: 600 }}>
                  {p.rounds_away != null ? `~${p.rounds_away} rounds away` : 'Achieved'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          !isImproving && (
            <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              At the current trend, no improvement milestones are projected. Keep practicing!
            </p>
          )
        )}

        {currentIndex == null && (
          <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            Not enough rounds in this window to project milestones.
          </p>
        )}
      </div>
    </Card>
  )
}
