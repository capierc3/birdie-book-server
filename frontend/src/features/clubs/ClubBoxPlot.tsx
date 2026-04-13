import { Card, CardHeader } from '../../components'
import type { Club, ClubDistanceStats } from '../../api'

interface Props {
  clubs: Club[]
  dataSource: 'garmin' | 'rapsodo' | 'combined'
  compareWindow: string
  compareLabel: string
}

function getStats(club: Club, source: string) {
  const s = club.stats
  if (!s) return null
  if (source === 'rapsodo') {
    return { avg: s.range_avg_yards, median: s.range_median_yards, min: s.range_min_yards, max: s.range_max_yards, p10: s.range_p10, p90: s.range_p90, count: s.range_sample_count }
  }
  if (source === 'combined') {
    return { avg: s.combined_avg_yards, median: s.combined_median_yards, min: s.combined_min_yards, max: s.combined_max_yards, p10: s.combined_p10, p90: s.combined_p90, count: s.combined_sample_count }
  }
  return { avg: s.avg_yards, median: s.median_yards, min: s.min_yards, max: s.max_yards, p10: s.p10, p90: s.p90, count: s.sample_count }
}

function getComparisonStats(club: Club, compareWindow: string): ClubDistanceStats | null {
  if (!compareWindow) return null
  const s = club.stats
  if (!s) return null

  if (compareWindow.startsWith('source:')) {
    const cmpSrc = compareWindow.split(':')[1]
    if (cmpSrc === 'rapsodo') {
      return s.range_avg_yards != null ? {
        avg_yards: s.range_avg_yards, median_yards: s.range_median_yards,
        min_yards: s.range_min_yards, max_yards: s.range_max_yards,
        p10: s.range_p10, p90: s.range_p90, sample_count: s.range_sample_count,
      } : null
    }
    if (cmpSrc === 'garmin') {
      return s.avg_yards != null ? {
        avg_yards: s.avg_yards, median_yards: s.median_yards,
        min_yards: s.min_yards, max_yards: s.max_yards,
        p10: s.p10, p90: s.p90, sample_count: s.sample_count,
      } : null
    }
    return null
  }
  return club.windowed_stats ?? null
}

function clubSortKey(type: string): number {
  const t = type.toUpperCase()
  if (t === 'DRIVER') return 100
  if (t.includes('WOOD')) return 200
  if (t.includes('HYBRID')) return 300
  if (t.includes('IRON')) return 400
  if (t.includes('WEDGE') || t === 'PW' || t === 'GW' || t === 'SW' || t === 'LW') return 500
  if (t === 'PUTTER') return 600
  return 700
}

const sourceLabels: Record<string, string> = {
  garmin: 'Garmin',
  rapsodo: 'Rapsodo',
  combined: 'Combined',
}

export function ClubBoxPlot({ clubs, dataSource, compareWindow, compareLabel }: Props) {
  const sorted = clubs
    .filter((c) => !c.retired && c.club_type !== 'Unknown' && c.club_type !== 'Putter')
    .sort((a, b) => clubSortKey(a.club_type) - clubSortKey(b.club_type))
    .filter((c) => {
      const s = getStats(c, dataSource)
      return s && s.avg != null && (s.count ?? 0) > 0
    })

  if (sorted.length === 0) return null

  const hasComparison = compareWindow !== ''

  // Find global min/max for scale, including comparison data
  let globalMin = Infinity, globalMax = 0
  for (const c of sorted) {
    const s = getStats(c, dataSource)!
    if (s.min != null && s.min < globalMin) globalMin = s.min
    if (s.max != null && s.max > globalMax) globalMax = s.max
    if (hasComparison) {
      const w = getComparisonStats(c, compareWindow)
      if (w?.min_yards != null && w.min_yards < globalMin) globalMin = w.min_yards
      if (w?.max_yards != null && w.max_yards > globalMax) globalMax = w.max_yards
    }
  }
  globalMin = Math.floor(globalMin / 10) * 10
  globalMax = Math.ceil(globalMax / 10) * 10
  const range = globalMax - globalMin || 1

  const MAIN_ROW_H = 36
  const COMPARE_ROW_H = 28
  const LABEL_W = 150

  const pctOf = (v: number) => ((v - globalMin) / range) * 100
  const srcLabel = sourceLabels[dataSource] ?? dataSource

  return (
    <Card>
      <CardHeader title="Club Gaps" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Grid lines / scale at top */}
        <div style={{ display: 'flex', paddingLeft: LABEL_W, marginBottom: 4 }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            <span>{globalMin}</span>
            <span>{Math.round(globalMin + range * 0.25)}</span>
            <span>{Math.round(globalMin + range * 0.5)}</span>
            <span>{Math.round(globalMin + range * 0.75)}</span>
            <span>{globalMax}</span>
          </div>
        </div>

        {sorted.map((club, idx) => {
          const s = getStats(club, dataSource)!
          const w = hasComparison ? getComparisonStats(club, compareWindow) : null

          const minPct = pctOf(s.min ?? s.avg ?? 0)
          const maxPct = pctOf(s.max ?? s.avg ?? 0)
          const p10Pct = pctOf(s.p10 ?? s.min ?? s.avg ?? 0)
          const p90Pct = pctOf(s.p90 ?? s.max ?? s.avg ?? 0)
          const avgPct = pctOf(s.avg ?? 0)
          const medPct = pctOf(s.median ?? s.avg ?? 0)

          return (
            <div key={club.id}>
              {/* Main row */}
              <div style={{ display: 'flex', alignItems: 'center', height: MAIN_ROW_H }}>
                <div style={{
                  width: LABEL_W,
                  flexShrink: 0,
                  paddingRight: 10,
                  textAlign: 'right',
                }}>
                  <div style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: club.color ?? 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {club.club_type}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{srcLabel}</div>
                </div>
                <div style={{ flex: 1, position: 'relative', height: 20 }}>
                  {/* Whisker line (min to max) */}
                  <div style={{
                    position: 'absolute', top: '50%', left: `${minPct}%`,
                    width: `${maxPct - minPct}%`, height: 2,
                    background: club.color ? `${club.color}80` : 'var(--text-dim)',
                    transform: 'translateY(-50%)',
                  }} />
                  {/* Whisker caps */}
                  <div style={{
                    position: 'absolute', top: '50%', left: `${minPct}%`,
                    width: 1, height: 8, transform: 'translate(-50%, -50%)',
                    background: club.color ? `${club.color}80` : 'var(--text-dim)',
                  }} />
                  <div style={{
                    position: 'absolute', top: '50%', left: `${maxPct}%`,
                    width: 1, height: 8, transform: 'translate(-50%, -50%)',
                    background: club.color ? `${club.color}80` : 'var(--text-dim)',
                  }} />
                  {/* Box (P10 to P90) */}
                  <div style={{
                    position: 'absolute', top: 1, left: `${p10Pct}%`,
                    width: `${p90Pct - p10Pct}%`, height: 18,
                    background: club.color ? `${club.color}33` : 'var(--accent-dim)',
                    border: `1.5px solid ${club.color ?? 'var(--accent)'}`,
                    borderRadius: 2,
                  }} />
                  {/* Median line */}
                  <div style={{
                    position: 'absolute', top: 3, left: `${medPct}%`,
                    width: 2, height: 14, background: '#fff',
                  }} />
                  {/* Avg dot */}
                  <div style={{
                    position: 'absolute', top: '50%', left: `${avgPct}%`,
                    width: 8, height: 8, borderRadius: '50%',
                    background: club.color ?? 'var(--accent)',
                    transform: 'translate(-50%, -50%)',
                    border: '1.5px solid #fff',
                  }} />
                </div>
              </div>

              {/* Comparison row */}
              {hasComparison && (
                <div style={{ display: 'flex', alignItems: 'center', height: COMPARE_ROW_H }}>
                  <div style={{
                    width: LABEL_W, flexShrink: 0, paddingRight: 10, textAlign: 'right',
                    fontSize: '0.65rem', color: 'var(--text-dim)',
                  }}>
                    {compareLabel}
                  </div>
                  <div style={{ flex: 1, position: 'relative', height: 14 }}>
                    {w && w.min_yards != null && w.max_yards != null ? (() => {
                      const wMinPct = pctOf(w.min_yards!)
                      const wMaxPct = pctOf(w.max_yards!)
                      const wP10Pct = pctOf(w.p10 ?? w.min_yards!)
                      const wP90Pct = pctOf(w.p90 ?? w.max_yards!)
                      const wAvgPct = pctOf(w.avg_yards ?? 0)
                      const wMedPct = pctOf(w.median_yards ?? w.avg_yards ?? 0)
                      const clr = club.color ?? 'var(--text-dim)'

                      return (
                        <>
                          {/* Dashed whisker line */}
                          <div style={{
                            position: 'absolute', top: '50%', left: `${wMinPct}%`,
                            width: `${wMaxPct - wMinPct}%`, height: 0,
                            borderTop: `1.5px dashed ${clr}50`,
                            transform: 'translateY(-50%)',
                          }} />
                          {/* Dashed whisker caps */}
                          <div style={{
                            position: 'absolute', top: '50%', left: `${wMinPct}%`,
                            width: 0, height: 6, transform: 'translate(-50%, -50%)',
                            borderLeft: `1.5px dashed ${clr}50`,
                          }} />
                          <div style={{
                            position: 'absolute', top: '50%', left: `${wMaxPct}%`,
                            width: 0, height: 6, transform: 'translate(-50%, -50%)',
                            borderLeft: `1.5px dashed ${clr}50`,
                          }} />
                          {/* Dashed box outline (no fill) */}
                          <div style={{
                            position: 'absolute', top: 1, left: `${wP10Pct}%`,
                            width: `${wP90Pct - wP10Pct}%`, height: 12,
                            border: `1.5px dashed ${clr}80`,
                            borderRadius: 2,
                          }} />
                          {/* Median line */}
                          <div style={{
                            position: 'absolute', top: 1, left: `${wMedPct}%`,
                            width: 1.5, height: 12,
                            background: clr,
                          }} />
                          {/* Avg dot (outline only) */}
                          <div style={{
                            position: 'absolute', top: '50%', left: `${wAvgPct}%`,
                            width: 6, height: 6, borderRadius: '50%',
                            border: `1.5px solid ${clr}`,
                            transform: 'translate(-50%, -50%)',
                          }} />
                        </>
                      )
                    })() : (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', paddingLeft: 10 }}>No data</span>
                    )}
                  </div>
                </div>
              )}

              {/* Separator line between clubs when comparing */}
              {hasComparison && idx < sorted.length - 1 && (
                <div style={{ borderBottom: '1px solid var(--border, #222630)', marginLeft: LABEL_W }} />
              )}
            </div>
          )
        })}

        {/* Scale labels at bottom */}
        <div style={{ display: 'flex', paddingLeft: LABEL_W, marginTop: 4 }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            <span>{globalMin}</span>
            <span>{Math.round(globalMin + range * 0.25)}</span>
            <span>{Math.round(globalMin + range * 0.5)}</span>
            <span>{Math.round(globalMin + range * 0.75)}</span>
            <span>{globalMax}</span>
          </div>
        </div>
        {/* "Yards" label */}
        <div style={{ textAlign: 'center', paddingLeft: LABEL_W, fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>
          Yards
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '12px 20px',
        padding: '12px 16px', borderTop: '1px solid var(--border, #222630)',
        fontSize: '0.75rem', color: 'var(--text-muted)',
        alignItems: 'center',
      }}>
        {/* Whiskers: Min / Max */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="40" height="14" style={{ verticalAlign: 'middle' }}>
            <line x1="0" y1="7" x2="8" y2="7" stroke="#888" strokeWidth="1" />
            <line x1="8" y1="3" x2="8" y2="11" stroke="#888" strokeWidth="1" />
            <rect x="8" y="2" width="18" height="10" fill="#888" fillOpacity="0.3" stroke="#888" strokeWidth="1.5" rx="1" />
            <line x1="26" y1="3" x2="26" y2="11" stroke="#888" strokeWidth="1" />
            <line x1="26" y1="7" x2="40" y2="7" stroke="#888" strokeWidth="1" />
          </svg>
          <span>Whiskers: Min / Max</span>
        </div>
        {/* Box: P10 - P90 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="20" height="14" style={{ verticalAlign: 'middle' }}>
            <rect x="1" y="2" width="18" height="10" fill="#888" fillOpacity="0.3" stroke="#888" strokeWidth="1.5" rx="1" />
          </svg>
          <span>Box: P10 - P90 (80% of shots)</span>
        </div>
        {/* Median */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" style={{ verticalAlign: 'middle' }}>
            <line x1="7" y1="1" x2="7" y2="13" stroke="#fff" strokeWidth="2" />
          </svg>
          <span>Median</span>
        </div>
        {/* Average */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" style={{ verticalAlign: 'middle' }}>
            <circle cx="7" cy="7" r="4" fill="none" stroke="#888" strokeWidth="1.5" />
          </svg>
          <span>Average</span>
        </div>
        {/* Comparison window (only when comparing) */}
        {hasComparison && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="30" height="14" style={{ verticalAlign: 'middle' }}>
              <rect x="1" y="2" width="28" height="10" fill="none" stroke="#888" strokeWidth="1.5" strokeDasharray="3,2" rx="1" />
            </svg>
            <span>Comparison window</span>
          </div>
        )}
      </div>
    </Card>
  )
}
