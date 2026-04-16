import { useState, useMemo } from 'react'
import { Card, CardHeader, Select } from '../../components'
import { useIsMobile } from '../../hooks/useMediaQuery'
import type { SGByClubResponse } from '../../api'
import { SG_LABELS } from '../../utils/chartTheme'
import { formatSG, sgColor } from '../../utils/format'

interface Props {
  data: SGByClubResponse
  baseline: 'pga' | 'personal'
}

type MinShots = '0' | '3' | '5' | '10'
type CategoryFilter = '' | 'off_the_tee' | 'approach' | 'short_game' | 'putting'

export function SGByClubChart({ data, baseline }: Props) {
  const isMobile = useIsMobile()
  const [minShots, setMinShots] = useState<MinShots>('5')
  const [catFilter, setCatFilter] = useState<CategoryFilter>('')

  const clubs = useMemo(() => {
    const min = parseInt(minShots)
    let filtered = [...data.clubs]
    if (min > 0) {
      filtered = filtered.filter((c) => c.shot_count >= min)
    }
    if (catFilter) {
      filtered = filtered.filter((c) => c.category === catFilter)
    }
    // Sort worst-to-best by active baseline
    filtered.sort((a, b) => {
      const av = baseline === 'pga' ? a.sg_pga_per_shot : (a.sg_personal_per_shot ?? 0)
      const bv = baseline === 'pga' ? b.sg_pga_per_shot : (b.sg_personal_per_shot ?? 0)
      return av - bv
    })
    return filtered
  }, [data.clubs, minShots, catFilter, baseline])

  const maxAbs = useMemo(() => {
    if (clubs.length === 0) return 1
    return Math.max(
      ...clubs.map((c) => {
        const v = baseline === 'pga' ? c.sg_pga_per_shot : (c.sg_personal_per_shot ?? 0)
        return Math.abs(v)
      }),
      0.01,
    )
  }, [clubs, baseline])

  return (
    <Card>
      <CardHeader
        title="SG by Club"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select
              value={minShots}
              onChange={(e) => setMinShots(e.target.value as MinShots)}
              style={{ width: 'auto' }}
            >
              <option value="0">All Shots</option>
              <option value="3">Min 3 shots</option>
              <option value="5">Min 5 shots</option>
              <option value="10">Min 10 shots</option>
            </Select>
            <Select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value as CategoryFilter)}
              style={{ width: 'auto' }}
            >
              <option value="">All Categories</option>
              <option value="off_the_tee">Off the Tee</option>
              <option value="approach">Approach</option>
              <option value="short_game">Short Game</option>
              <option value="putting">Putting</option>
            </Select>
          </div>
        }
      />

      <div style={{ padding: isMobile ? '0 12px 12px' : '0 20px 20px' }}>
        {clubs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '16px 0' }}>
            No clubs match the current filters.
          </div>
        ) : (
          clubs.map((c) => {
            const v = baseline === 'pga' ? c.sg_pga_per_shot : (c.sg_personal_per_shot ?? 0)
            const pct = Math.min((Math.abs(v) / maxAbs) * 100, 100)
            const color = v >= 0 ? '#22c55e' : '#ef4444'

            return (
              <div
                key={`${c.club_name}-${c.category}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? '1fr auto auto'
                    : '120px 90px 1fr 65px 55px',
                  alignItems: 'center',
                  gap: isMobile ? 6 : 8,
                  padding: '6px 0',
                  fontSize: '0.85rem',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {isMobile ? (
                  <>
                    <span style={{ color: 'var(--text)', fontWeight: 500, minWidth: 0 }}>
                      {c.club_name}
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: 6 }}>
                        {SG_LABELS[c.category] ?? c.category}
                      </span>
                    </span>
                    <span style={{ color: sgColor(v), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {formatSG(v)}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'right' }}>
                      {c.shot_count} shots
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.club_name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {SG_LABELS[c.category] ?? c.category}
                    </span>
                    <div style={{ position: 'relative', height: 14, background: 'transparent' }}>
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          height: '100%',
                          width: `${pct}%`,
                          background: color,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span style={{ color: sgColor(v), fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatSG(v)}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', textAlign: 'right' }}>
                      {c.shot_count} shots
                    </span>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
