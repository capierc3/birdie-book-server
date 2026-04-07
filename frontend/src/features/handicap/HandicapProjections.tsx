import { Card, CardHeader } from '../../components'
import type { HandicapData } from '../../api'

interface Props {
  data: HandicapData
}

export function HandicapProjections({ data }: Props) {
  if (data.improvement_per_round == null && data.projections.length === 0) return null

  const rate = data.improvement_per_round ?? 0
  const absRate = Math.abs(rate).toFixed(2)
  const isImproving = rate < 0
  const isStable = rate === 0

  return (
    <Card>
      <CardHeader title="Projection" />
      <div style={{ padding: '0 20px 20px', fontSize: '0.88rem' }}>
        {data.improvement_per_round != null && (
          <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
            Your handicap is{' '}
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

        {data.projections.length > 0 && isImproving ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.projections.map((p) => (
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
      </div>
    </Card>
  )
}
