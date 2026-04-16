import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatCard, Card, CardHeader, DataTable, EmptyState, MobileCardList } from '../../components'
import type { Column } from '../../components'
import { useScoring } from '../../api'
import type { ScoringRound } from '../../api'
import { formatPct, formatNum, formatDate, formatVsPar, vsParColor } from '../../utils/format'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { ScoringDistribution } from './ScoringDistribution'
import { ParBreakdown } from './ParBreakdown'
import { ScoreOverTimeChart } from './ScoreOverTimeChart'
import { ScoringTrendChart } from './ScoringTrendChart'
import styles from '../../styles/pages.module.css'

export function ScoringPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { data, isLoading } = useScoring()

  // Sort per-round data newest-first
  const sortedRounds = useMemo(() => {
    if (!data?.per_round) return []
    return [...data.per_round].sort((a, b) => b.date.localeCompare(a.date))
  }, [data?.per_round])

  if (isLoading) return <div className={styles.loading}>Loading...</div>
  if (!data) return <EmptyState message="No scoring data" description="Import rounds to see scoring statistics." />

  const columns: Column<ScoringRound>[] = [
    { key: 'date', header: 'Date', sortable: true, render: (r) => formatDate(r.date) },
    { key: 'course_name', header: 'Course', sortable: true },
    { key: 'holes_played', header: 'Holes', align: 'center', sortable: true },
    { key: 'score', header: 'Score', align: 'center', sortable: true },
    {
      key: 'score_vs_par', header: 'vs Par', align: 'center', sortable: true,
      render: (r) => <span className={vsParColor(r.score_vs_par)}>{formatVsPar(r.score_vs_par)}</span>,
    },
    { key: 'gir_pct', header: 'GIR%', align: 'center', render: (r) => formatPct(r.gir_pct, 0) },
    { key: 'fw_pct', header: 'FW%', align: 'center', render: (r) => formatPct(r.fw_pct, 0) },
    { key: 'putts', header: 'Putts', align: 'center', render: (r) => r.putts ?? '--' },
    { key: 'three_putts', header: '3-Putts', align: 'center' },
  ]

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Stats</h1>
      </div>

      <div className={styles.statsRow}>
        <StatCard label="GIR %" value={formatPct(data.gir_pct)} />
        <StatCard label="Fairway %" value={formatPct(data.fairway_pct)} />
        <StatCard label="Putts/Hole" value={formatNum(data.avg_putts_per_hole)} />
        <StatCard label="Putts/GIR" value={formatNum(data.putts_per_gir)} />
        <StatCard label="Scrambling %" value={formatPct(data.scramble_pct)} />
        <StatCard label="3-Putt %" value={formatPct(data.three_putt_pct)} />
      </div>

      {/* Score Over Time chart */}
      <div className={styles.section}>
        <ScoreOverTimeChart rounds={data.per_round} />
      </div>

      <div className={styles.grid2}>
        <ScoringDistribution data={data.scoring_distribution} />
        <ParBreakdown data={data.par_breakdown} />
      </div>

      {/* Scoring Trend chart */}
      <div className={styles.section}>
        <ScoringTrendChart rounds={data.per_round} />
      </div>

      {/* Per-Round table wrapped in Card, sorted newest-first */}
      <Card>
        <CardHeader title="Stats by Round" />
        {isMobile ? (
          <MobileCardList
            data={sortedRounds}
            keyExtractor={(r) => r.round_id}
            onCardClick={(r) => navigate(`/rounds/${r.round_id}`)}
            emptyMessage="No round data"
            renderCard={(r) => (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.course_name}</div>
                  <span className={vsParColor(r.score_vs_par)} style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {r.score} ({formatVsPar(r.score_vs_par)})
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 12 }}>
                  <span>{formatDate(r.date)}</span>
                  <span>{r.holes_played}h</span>
                  <span>GIR {formatPct(r.gir_pct, 0)}</span>
                  <span>FW {formatPct(r.fw_pct, 0)}</span>
                  <span>{r.putts ?? '--'} putts</span>
                </div>
              </div>
            )}
          />
        ) : (
          <DataTable
            columns={columns}
            data={sortedRounds}
            keyExtractor={(r) => r.round_id}
            onRowClick={(r) => navigate(`/rounds/${r.round_id}`)}
            emptyMessage="No round data"
          />
        )}
      </Card>
    </div>
  )
}
