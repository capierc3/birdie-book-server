import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '../../components'
import type { SGSummary } from '../../api'
import { SG_CATEGORIES, SG_LABELS } from '../../utils/chartTheme'
import { formatSG, sgColor } from '../../utils/format'

interface Props {
  data: SGSummary
}

export function SGSummaryCard({ data }: Props) {
  const navigate = useNavigate()
  const opportunity = data.biggest_opportunity_pga
  const opportunityVal = opportunity
    ? data.overall[opportunity]?.sg_pga_per_round
    : null

  const maxAbsVal = Math.max(
    ...SG_CATEGORIES.map((c) => Math.abs(data.overall[c]?.sg_pga_per_round ?? 0)),
    0.1
  )

  return (
    <Card>
      <CardHeader
        title="Strokes Gained"
        action={
          <span
            onClick={() => navigate('/strokes-gained')}
            style={{ fontSize: '0.78rem', color: 'var(--primary)', cursor: 'pointer' }}
          >
            Details
          </span>
        }
      />

      {opportunity && opportunityVal != null && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Your biggest opportunity is{' '}
          <strong style={{ color: 'var(--text)' }}>{SG_LABELS[opportunity] ?? opportunity}</strong>
          , costing{' '}
          <strong style={{ color: 'var(--text)' }}>{Math.abs(opportunityVal).toFixed(1)}</strong>
          {' '}strokes/round vs PGA{' '}
          <span
            onClick={() => navigate('/strokes-gained')}
            style={{ color: 'var(--success)', cursor: 'pointer', fontSize: '0.78rem' }}
          >
            Practice this →
          </span>
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SG_CATEGORIES.map((cat) => {
          const val = data.overall[cat]?.sg_pga_per_round ?? 0
          const pct = (Math.abs(val) / maxAbsVal) * 100
          const isPositive = val >= 0
          return (
            <div key={cat}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {SG_LABELS[cat]}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: sgColor(val) }}>
                  {formatSG(val)}
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
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
