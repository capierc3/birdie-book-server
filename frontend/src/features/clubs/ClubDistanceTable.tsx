import { DataTable } from '../../components'
import type { Column } from '../../components'
import type { Club, ClubDistanceStats } from '../../api'
import { formatNum } from '../../utils/format'

interface Props {
  clubs: Club[]
  dataSource: 'garmin' | 'rapsodo' | 'combined'
  compareWindow: string
  onRowClick?: (club: Club) => void
  onMerge?: (club: Club) => void
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  garmin: { label: 'G', color: '#4caf50' },
  rapsodo: { label: 'R', color: '#f59e0b' },
  trackman: { label: 'T', color: '#3b82f6' },
  manual: { label: 'M', color: '#8b8f98' },
}

function getStats(club: Club, source: string) {
  const s = club.stats
  if (!s) return null
  if (source === 'rapsodo') {
    return {
      avg: s.range_avg_yards, median: s.range_median_yards,
      max: s.range_max_yards, std: s.range_std_dev,
      count: s.range_sample_count,
    }
  }
  if (source === 'combined') {
    return {
      avg: s.combined_avg_yards, median: s.combined_median_yards,
      max: s.combined_max_yards, std: s.combined_std_dev,
      count: s.combined_sample_count,
    }
  }
  return {
    avg: s.avg_yards, median: s.median_yards,
    max: s.max_yards, std: s.std_dev,
    count: s.sample_count,
  }
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
        max_yards: s.range_max_yards, std_dev: s.range_std_dev,
        min_yards: s.range_min_yards, p10: s.range_p10, p90: s.range_p90,
        sample_count: s.range_sample_count,
      } : null
    }
    if (cmpSrc === 'garmin') {
      return s.avg_yards != null ? {
        avg_yards: s.avg_yards, median_yards: s.median_yards,
        max_yards: s.max_yards, std_dev: s.std_dev,
        min_yards: s.min_yards, p10: s.p10, p90: s.p90,
        sample_count: s.sample_count,
      } : null
    }
    return null
  }

  // Time-window comparison — use windowed_stats from API
  return club.windowed_stats ?? null
}

function formatWithDelta(allTimeVal: number | null | undefined, windowedVal: number | null | undefined) {
  if (allTimeVal == null) return <span>&mdash;</span>
  const base = `${formatNum(allTimeVal, 1)} yds`
  if (windowedVal == null) return <span>{base}</span>
  const delta = windowedVal - allTimeVal
  if (Math.abs(delta) < 0.1) return <span>{base}</span>
  const sign = delta > 0 ? '+' : ''
  const color = delta > 0 ? 'var(--green, #4caf50)' : 'var(--red, #ef5350)'
  return (
    <span>
      {base}{' '}
      <span style={{ color, fontSize: '0.82rem' }}>({sign}{formatNum(delta, 1)})</span>
    </span>
  )
}

// Sort order for club types
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

export function ClubDistanceTable({ clubs, dataSource, compareWindow, onRowClick, onMerge }: Props) {
  const sorted = [...clubs]
    .filter((c) => !c.retired)
    .sort((a, b) => clubSortKey(a.club_type) - clubSortKey(b.club_type))

  const hasComparison = compareWindow !== ''

  const columns: Column<Club>[] = [
    {
      key: 'source',
      header: '',
      render: (c) => {
        const badge = SOURCE_BADGES[c.source] ?? SOURCE_BADGES.manual
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            fontSize: '0.7rem',
            fontWeight: 700,
            background: c.color ?? badge.color,
            color: '#111',
          }}>
            {badge.label}
          </span>
        )
      },
    },
    {
      key: 'club_type',
      header: 'Club',
      sortable: true,
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600 }}>
            {c.club_type}
            {c.name && <span style={{ color: 'var(--accent)', fontSize: '0.82rem', marginLeft: 6 }}>"{c.name}"</span>}
            {c.model && <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginLeft: 6 }}>{c.model}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'avg',
      header: 'Avg',
      align: 'center',
      render: (c) => {
        const s = getStats(c, dataSource)
        if (!hasComparison) return s?.avg != null ? `${formatNum(s.avg, 1)} yds` : '\u2014'
        const w = getComparisonStats(c, compareWindow)
        return formatWithDelta(s?.avg, w?.avg_yards)
      },
    },
    {
      key: 'max',
      header: 'Max',
      align: 'center',
      render: (c) => {
        const s = getStats(c, dataSource)
        if (!hasComparison) return s?.max != null ? `${formatNum(s.max, 1)} yds` : '\u2014'
        const w = getComparisonStats(c, compareWindow)
        return formatWithDelta(s?.max, w?.max_yards)
      },
    },
    {
      key: 'median',
      header: 'Median',
      align: 'center',
      render: (c) => {
        const s = getStats(c, dataSource)
        if (!hasComparison) return s?.median != null ? `${formatNum(s.median, 1)} yds` : '\u2014'
        const w = getComparisonStats(c, compareWindow)
        return formatWithDelta(s?.median, w?.median_yards)
      },
    },
    {
      key: 'spread',
      header: 'Spread',
      align: 'center',
      render: (c) => {
        const s = getStats(c, dataSource)
        return s?.std ? `\u00B1${formatNum(s.std, 1)}` : '\u2014'
      },
    },
    {
      key: 'count',
      header: 'Shots',
      align: 'center',
      render: (c) => {
        const s = getStats(c, dataSource)
        const count = s?.count
        if (count == null) return '\u2014'
        if (!hasComparison) return count
        const w = getComparisonStats(c, compareWindow)
        const wCount = w?.sample_count
        return (
          <span>
            {count}
            {wCount != null && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> ({wCount})</span>}
          </span>
        )
      },
    },
    {
      key: 'merge',
      header: '',
      render: (c) => (
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.75rem' }}
          onClick={(e) => { e.stopPropagation(); onMerge?.(c) }}
        >
          Merge
        </button>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={sorted}
      keyExtractor={(c) => c.id}
      onRowClick={onRowClick}
      emptyMessage="No clubs found"
    />
  )
}
