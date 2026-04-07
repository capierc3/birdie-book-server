import { Card, CardHeader } from '../../components'
import type { ParBreakdown as ParBreakdownType } from '../../api'
import { formatNum, formatPct } from '../../utils/format'

interface Props {
  data: ParBreakdownType[]
}

export function ParBreakdown({ data }: Props) {
  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader title="Par Breakdown" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data.map((p) => (
          <div key={p.par} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Par {p.par}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Avg: {formatNum(p.avg_score)} ({p.avg_vs_par > 0 ? '+' : ''}{formatNum(p.avg_vs_par)})
                <span style={{ marginLeft: 8 }}>{p.count} holes</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Birdie: <strong style={{ color: 'var(--birdie)' }}>{formatPct(p.birdie_pct, 0)}</strong></span>
              <span>Par: <strong style={{ color: 'var(--text)' }}>{formatPct(p.par_pct, 0)}</strong></span>
              <span>Bogey: <strong style={{ color: 'var(--bogey)' }}>{formatPct(p.bogey_pct, 0)}</strong></span>
              <span>Double+: <strong style={{ color: 'var(--double)' }}>{formatPct(p.double_plus_pct, 0)}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
