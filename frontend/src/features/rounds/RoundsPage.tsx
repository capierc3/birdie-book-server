import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, DataTable, ResponsiveSelect, MobileCardList } from '../../components'
import type { Column } from '../../components'
import { useRounds } from '../../api'
import type { RoundSummary } from '../../api'
import { patch } from '../../api'
import { formatDate, formatVsPar, vsParColor, formatGameFormat } from '../../utils/format'
import { useIsMobile } from '../../hooks/useMediaQuery'
import styles from '../../styles/pages.module.css'

type SortDir = 'asc' | 'desc'

const FORMAT_OPTIONS = ['STROKE_PLAY', 'SCRAMBLE', 'MATCH_PLAY', 'BEST_BALL', 'STABLEFORD', 'OTHER']

const FORMAT_COLORS: Record<string, string> = {
  STROKE_PLAY: '#888',
  SCRAMBLE: '#FF9800',
  MATCH_PLAY: '#9C27B0',
  BEST_BALL: '#2196F3',
  STABLEFORD: '#4CAF50',
  OTHER: '#78909C',
}

export function RoundsPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { data: rounds = [], refetch } = useRounds()

  const [holesFilter, setHolesFilter] = useState<'all' | '18' | '9'>('all')
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const filtered = useMemo(() => {
    let list = [...rounds]
    if (holesFilter === '18') list = list.filter((r) => (r.holes_completed ?? 0) >= 18)
    if (holesFilter === '9') list = list.filter((r) => {
      const h = r.holes_completed ?? 0
      return h >= 7 && h < 18
    })

    list.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey]
      const bv = (b as unknown as Record<string, unknown>)[sortKey]
      let cmp = 0
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv)
      } else {
        cmp = ((av as number) ?? 0) - ((bv as number) ?? 0)
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return list
  }, [rounds, holesFilter, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'asc')
    }
  }

  const toggleExclude = async (e: React.MouseEvent, round: RoundSummary) => {
    e.stopPropagation()
    await patch(`/rounds/${round.id}`, { exclude_from_stats: !round.exclude_from_stats })
    refetch()
  }

  const setFormat = async (e: React.ChangeEvent<HTMLSelectElement>, round: RoundSummary) => {
    e.stopPropagation()
    await patch(`/rounds/${round.id}`, { game_format: e.target.value })
    refetch()
  }

  const columns: Column<RoundSummary>[] = [
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (r) => formatDate(r.date),
    },
    {
      key: 'course_name',
      header: 'Course',
      sortable: true,
      render: (r) => r.course_name ?? '--',
    },
    {
      key: 'total_strokes',
      header: 'Score',
      sortable: true,
      align: 'center',
      render: (r) => r.total_strokes ?? '--',
    },
    {
      key: 'score_vs_par',
      header: 'vs Par',
      sortable: true,
      align: 'center',
      render: (r) => (
        <span className={vsParColor(r.score_vs_par)}>
          {formatVsPar(r.score_vs_par)}
        </span>
      ),
    },
    {
      key: 'holes_completed',
      header: 'Holes',
      sortable: true,
      align: 'center',
    },
    {
      key: 'shots_tracked',
      header: 'Shots',
      sortable: true,
      align: 'center',
      render: (r) => r.shots_tracked ?? '--',
    },
    {
      key: 'game_format',
      header: 'Format',
      sortable: true,
      render: (r) => {
        const fmtColor = FORMAT_COLORS[r.game_format ?? 'STROKE_PLAY'] ?? '#888'
        return (
          <select
            value={r.game_format ?? 'STROKE_PLAY'}
            onChange={(e) => setFormat(e, r)}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg, #13161b)',
              color: fmtColor,
              border: `1px solid ${fmtColor}`,
              borderRadius: 4,
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '2px 6px',
              cursor: 'pointer',
            }}
          >
            {FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f} style={{ background: '#1e2128', color: '#ccc' }}>{formatGameFormat(f)}</option>
            ))}
          </select>
        )
      },
    },
    {
      key: 'exclude',
      header: 'Stats',
      render: (r) => (
        <span
          onClick={(e) => toggleExclude(e, r)}
          style={{
            cursor: 'pointer',
            fontSize: '0.8rem',
            color: r.exclude_from_stats ? 'var(--danger)' : 'var(--accent)',
            fontWeight: 600,
          }}
          title={r.exclude_from_stats ? 'Excluded from stats — click to include' : 'Included in stats — click to exclude'}
        >
          {r.exclude_from_stats ? 'Excluded' : 'Included'}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Rounds</h1>
      </div>

      <div className={styles.filterBar}>
        <ResponsiveSelect
          value={holesFilter}
          onChange={(v) => setHolesFilter(v as 'all' | '18' | '9')}
          options={[
            { value: 'all', label: 'All Rounds' },
            { value: '18', label: '18 Hole Only' },
            { value: '9', label: '9 Hole Only' },
          ]}
          title="Holes"
        />
      </div>

      <Card>
        {isMobile ? (
          <MobileCardList
            data={filtered}
            keyExtractor={(r) => r.id}
            onCardClick={(r) => navigate(`/rounds/${r.id}`)}
            emptyMessage="No rounds found"
            renderCard={(r) => (
              <div style={{ opacity: r.exclude_from_stats ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {r.course_name ?? 'Unknown Course'}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{r.total_strokes ?? '--'}</span>
                    {r.score_vs_par != null && (
                      <span className={vsParColor(r.score_vs_par)} style={{ fontWeight: 600, marginLeft: 6 }}>
                        {formatVsPar(r.score_vs_par)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{formatDate(r.date)}</span>
                  <span>{r.holes_completed ?? '--'}h</span>
                  {r.shots_tracked != null && <span>{r.shots_tracked} shots</span>}
                  {r.game_format && r.game_format !== 'STROKE_PLAY' && (
                    <span style={{ color: FORMAT_COLORS[r.game_format] ?? '#888' }}>
                      {formatGameFormat(r.game_format)}
                    </span>
                  )}
                </div>
              </div>
            )}
          />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => navigate(`/rounds/${r.id}`)}
            rowStyle={(r) => r.exclude_from_stats ? { opacity: 0.5 } : undefined}
            sortKey={sortKey}
            sortDirection={sortDir}
            onSort={handleSort}
            emptyMessage="No rounds found"
          />
        )}
      </Card>
    </div>
  )
}
