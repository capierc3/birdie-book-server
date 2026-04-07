import { useMemo } from 'react'
import { Card, CardHeader } from '../../components'
import type { RangeShotResponse } from '../../api'
import { formatNum } from '../../utils/format'
import styles from './RangeDetailPage.module.css'

interface Props {
  primaryShots: RangeShotResponse[]
  compareShots: RangeShotResponse[]
  primaryLabel: string
  compareLabel: string
}

interface MetricDef {
  key: string
  label: string
  higherBetter: boolean
  zeroIsBest?: boolean
  decimals?: number
}

const COMPARE_METRICS: MetricDef[] = [
  { key: 'carry_yards', label: 'Carry', higherBetter: true },
  { key: 'total_yards', label: 'Total', higherBetter: true },
  { key: 'ball_speed_mph', label: 'Ball Spd', higherBetter: true },
  { key: 'club_speed_mph', label: 'Club Spd', higherBetter: true },
  { key: 'launch_angle_deg', label: 'Launch', higherBetter: false },
  { key: 'spin_rate_rpm', label: 'Spin', higherBetter: false },
  { key: 'apex_yards', label: 'Apex', higherBetter: false },
  { key: 'side_carry_yards', label: 'Side', higherBetter: false, zeroIsBest: true },
  { key: 'smash_factor', label: 'Smash', higherBetter: true, decimals: 2 },
]

function avg(shots: RangeShotResponse[], key: string): number | null {
  const vals = shots
    .map((s) => (s as unknown as Record<string, unknown>)[key] as number | null)
    .filter((v): v is number => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

function deltaClass(delta: number, metric: MetricDef): string {
  if (Math.abs(delta) < 0.05) return ''
  if (metric.zeroIsBest) {
    return Math.abs(delta) < 0 ? styles.deltaPos : styles.deltaNeg
  }
  if (metric.higherBetter) {
    return delta > 0 ? styles.deltaPos : styles.deltaNeg
  }
  return ''
}

export function CompareStats({ primaryShots, compareShots, primaryLabel, compareLabel }: Props) {
  // Group by club
  const clubs = useMemo(() => {
    const clubSet = new Set<string>()
    for (const s of primaryShots) clubSet.add(s.club_name ?? s.club_type_raw)
    for (const s of compareShots) clubSet.add(s.club_name ?? s.club_type_raw)
    return Array.from(clubSet).sort()
  }, [primaryShots, compareShots])

  const grouped = useMemo(() => {
    const primary = new Map<string, RangeShotResponse[]>()
    const compare = new Map<string, RangeShotResponse[]>()
    for (const s of primaryShots) {
      const name = s.club_name ?? s.club_type_raw
      if (!primary.has(name)) primary.set(name, [])
      primary.get(name)!.push(s)
    }
    for (const s of compareShots) {
      const name = s.club_name ?? s.club_type_raw
      if (!compare.has(name)) compare.set(name, [])
      compare.get(name)!.push(s)
    }
    return { primary, compare }
  }, [primaryShots, compareShots])

  return (
    <Card>
      <CardHeader title={`Compare: ${primaryLabel} vs ${compareLabel}`} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th className={styles.compareTh}>Club</th>
              {COMPARE_METRICS.map((m) => (
                <th key={m.key} className={styles.compareTh}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clubs.map((club) => {
              const pShots = grouped.primary.get(club) ?? []
              const cShots = grouped.compare.get(club) ?? []
              if (pShots.length === 0 && cShots.length === 0) return null
              return (
                <tr key={club} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{club}</td>
                  {COMPARE_METRICS.map((m) => {
                    const pVal = avg(pShots, m.key)
                    const cVal = avg(cShots, m.key)
                    const d = m.decimals ?? 1
                    const delta = pVal != null && cVal != null ? pVal - cVal : null
                    return (
                      <td key={m.key} style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{pVal != null ? formatNum(pVal, d) : '\u2014'}</span>
                        {delta != null && Math.abs(delta) >= 0.05 && (
                          <span className={deltaClass(delta, m)} style={{ fontSize: '0.72rem', marginLeft: 4 }}>
                            {delta > 0 ? '+' : ''}{formatNum(delta, d)}
                          </span>
                        )}
                        <br />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {cVal != null ? formatNum(cVal, d) : '\u2014'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
