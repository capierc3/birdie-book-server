import { useMemo, useState } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useClubs } from '../../api/hooks/useClubs'
import { formatNum } from '../../utils/format'
import type { Club } from '../../api'

type ViewMode =
  | 'combined' | 'course' | 'range'
  | 'last_session' | 'last_5_sessions'
  | 'last_round' | 'last_5_rounds'

type StatSource = 'combined' | 'garmin' | 'rapsodo' | 'windowed'

interface ViewSpec {
  label: string
  source: StatSource
  windowType?: 'rounds' | 'sessions'
  windowValue?: number
}

const VIEWS: Record<ViewMode, ViewSpec> = {
  combined: { label: 'Combined', source: 'combined' },
  course: { label: 'Course', source: 'garmin' },
  range: { label: 'Range', source: 'rapsodo' },
  last_session: { label: 'Last Session', source: 'windowed', windowType: 'sessions', windowValue: 1 },
  last_5_sessions: { label: 'Last 5 Sessions', source: 'windowed', windowType: 'sessions', windowValue: 5 },
  last_round: { label: 'Last Round', source: 'windowed', windowType: 'rounds', windowValue: 1 },
  last_5_rounds: { label: 'Last 5 Rounds', source: 'windowed', windowType: 'rounds', windowValue: 5 },
}

interface RowStats {
  avg: number | null | undefined
  max: number | null | undefined
  median: number | null | undefined
  count: number | null | undefined
}

function getRowStats(club: Club, view: ViewSpec): RowStats {
  if (view.source === 'windowed') {
    const w = club.windowed_stats
    return { avg: w?.avg_yards, max: w?.max_yards, median: w?.median_yards, count: w?.sample_count }
  }
  const s = club.stats
  if (!s) return { avg: null, max: null, median: null, count: null }
  if (view.source === 'combined') {
    return { avg: s.combined_avg_yards, max: s.combined_max_yards, median: s.combined_median_yards, count: s.combined_sample_count }
  }
  if (view.source === 'rapsodo') {
    return { avg: s.range_avg_yards, max: s.range_max_yards, median: s.range_median_yards, count: s.range_sample_count }
  }
  return { avg: s.avg_yards, max: s.max_yards, median: s.median_yards, count: s.sample_count }
}

function clubSortKey(type: string): number {
  const t = type.toUpperCase()
  if (t === 'DRIVER') return 100
  const numMatch = t.match(/\d+/)
  const num = numMatch ? parseInt(numMatch[0], 10) : 5
  if (t.includes('WOOD')) return 200 + num
  if (t.includes('HYBRID')) return 300 + num
  if (t.includes('IRON')) return 400 + num
  if (t === 'PW' || t.includes('PITCHING')) return 500
  if (t === 'GW' || t.includes('GAP')) return 510
  if (t === 'SW' || t.includes('SAND')) return 520
  if (t === 'LW' || t.includes('LOB')) return 530
  if (t.includes('WEDGE')) return 540
  if (t === 'PUTTER') return 600
  return 700
}

function fmtYards(v: number | null | undefined): string {
  return v != null ? `${formatNum(v, 0)} yds` : '—'
}

export function ClubDistancesPanel({ onClose }: { onClose: () => void }) {
  const [viewMode, setViewMode] = useState<ViewMode>('combined')
  const view = VIEWS[viewMode]
  const { data: clubs, isLoading } = useClubs(view.windowType, view.windowValue)

  const rows = useMemo(() => {
    if (!clubs) return []
    return [...clubs]
      .filter((c) => !c.retired)
      .sort((a, b) => clubSortKey(a.club_type) - clubSortKey(b.club_type))
      .map((c) => ({ club: c, stats: getRowStats(c, view) }))
  }, [clubs, view])

  const cellTh: React.CSSProperties = {
    padding: '6px 4px',
    color: 'var(--text-muted)',
    fontWeight: 600,
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }
  const cellTd: React.CSSProperties = { padding: '6px 4px' }

  return (
    <FloatingPanel title="Club Distances" onClose={onClose} width={420}>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Data:</label>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            style={{
              width: 'auto',
              background: 'var(--bg, #1a1a1a)',
              color: 'var(--text)',
              border: '1px solid var(--border, #333)',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: '0.85rem',
            }}
          >
            {(Object.keys(VIEWS) as ViewMode[]).map((k) => (
              <option key={k} value={k}>{VIEWS[k].label}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No clubs found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #333)' }}>
                <th style={{ ...cellTh, textAlign: 'left' }}>Club</th>
                <th style={{ ...cellTh, textAlign: 'right' }}>Avg</th>
                <th style={{ ...cellTh, textAlign: 'right' }}>Max</th>
                <th style={{ ...cellTh, textAlign: 'right' }}>Median</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ club, stats }) => (
                <tr key={club.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ ...cellTd, fontWeight: 600 }}>
                    <span style={{ color: club.color ?? 'var(--text)' }}>{club.club_type}</span>
                    {club.name && (
                      <span style={{ color: 'var(--accent)', fontSize: '0.78rem', marginLeft: 4 }}>"{club.name}"</span>
                    )}
                  </td>
                  <td style={{ ...cellTd, textAlign: 'right' }}>{fmtYards(stats.avg)}</td>
                  <td style={{ ...cellTd, textAlign: 'right' }}>{fmtYards(stats.max)}</td>
                  <td style={{ ...cellTd, textAlign: 'right' }}>{fmtYards(stats.median)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </FloatingPanel>
  )
}
