import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card, CardHeader, DataTable, StatCard, Badge, Button, EmptyState } from '../../components'
import type { Column } from '../../components'
import { useCourseStats } from '../../api'
import type { CourseHoleStats, CourseRoundStats, CourseSGCategory } from '../../api'
import { formatDate, formatNum, formatPct, formatVsPar, vsParColor, formatSG, sgColor } from '../../utils/format'
import { SG_COLORS, SG_LABELS, SG_CATEGORIES, SCORE_DIST_COLORS } from '../../utils/chartTheme'
import { cn } from '../../utils/cn'
import { ScoreTrendChart } from './ScoreTrendChart'
import styles from '../../styles/pages.module.css'
import cs from './CourseStatsPage.module.css'

type SgMode = 'pga' | 'personal'
type HoleSortMode = 'difficulty' | 'number'

function vsParHoleColor(v: number): string {
  if (v <= -0.1) return cs.holeGreen
  if (v <= 0.3) return cs.holeBlue
  if (v <= 0.8) return cs.holeOrange
  return cs.holeRed
}

export function CourseStatsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const courseId = id ? Number(id) : undefined
  const { data: stats, isLoading } = useCourseStats(courseId)

  const [sgMode, setSgMode] = useState<SgMode>('pga')
  const [holeSort, setHoleSort] = useState<HoleSortMode>('difficulty')
  const [hcpPage, setHcpPage] = useState(0)
  const HCP_PER_PAGE = 5

  // ── Sorted holes ──
  const sortedHoles = useMemo(() => {
    if (!stats) return []
    const list = [...stats.hole_stats]
    if (holeSort === 'difficulty') {
      list.sort((a, b) => b.avg_vs_par - a.avg_vs_par)
    } else {
      list.sort((a, b) => a.hole_number - b.hole_number)
    }
    return list
  }, [stats, holeSort])

  // ── Rounds sorted newest first ──
  const roundsSorted = useMemo(
    () => stats ? [...stats.rounds].sort((a, b) => b.date.localeCompare(a.date)) : [],
    [stats],
  )

  if (isLoading) {
    return <div className={styles.loading}>Loading course stats...</div>
  }

  if (!stats) {
    return <EmptyState message="Course not found" />
  }

  // ── SG Breakdown data ──
  const sgValues = SG_CATEGORIES.map((cat) => {
    const sg: CourseSGCategory | undefined = stats.sg_categories[cat]
    if (!sg) return { cat, value: 0, hasData: false }
    const value = sgMode === 'pga' ? sg.per_round : (sg.personal_per_round ?? 0)
    return { cat, value, hasData: sgMode === 'pga' ? sg.round_count > 0 : sg.personal_per_round != null }
  })
  const hasSgData = sgValues.some((s) => s.hasData)
  const maxAbsSg = Math.max(0.1, ...sgValues.map((s) => Math.abs(s.value)))

  // ── Scoring distribution ──
  const dist = stats.scoring_distribution
  const distTotal = dist.birdie_or_better + dist.par + dist.bogey + dist.double + dist.triple_plus
  const distItems = [
    { label: 'Birdie+', count: dist.birdie_or_better, color: SCORE_DIST_COLORS.birdie_or_better },
    { label: 'Par', count: dist.par, color: SCORE_DIST_COLORS.par },
    { label: 'Bogey', count: dist.bogey, color: SCORE_DIST_COLORS.bogey },
    { label: 'Double', count: dist.double, color: SCORE_DIST_COLORS.double },
    { label: 'Triple+', count: dist.triple_plus, color: SCORE_DIST_COLORS.triple_plus },
  ]

  // ── Vs Par color for stat card ──
  const vsParStatColor = stats.avg_vs_par != null
    ? stats.avg_vs_par <= 0 ? 'var(--birdie)' : stats.avg_vs_par <= 5 ? 'var(--warning)' : 'var(--danger)'
    : undefined

  // ── Hole table columns ──
  const holeColumns: Column<CourseHoleStats>[] = [
    { key: 'hole_number', header: 'Hole', align: 'center' },
    { key: 'par', header: 'Par', align: 'center' },
    { key: 'yardage', header: 'Yds', align: 'center', render: (h) => h.yardage ?? '--' },
    { key: 'avg_score', header: 'Avg', align: 'center', render: (h) => formatNum(h.avg_score) },
    {
      key: 'avg_vs_par', header: 'vs Par', align: 'center',
      render: (h) => <span className={vsParHoleColor(h.avg_vs_par)}>{h.avg_vs_par > 0 ? '+' : ''}{formatNum(h.avg_vs_par)}</span>,
    },
    { key: 'birdie_pct', header: 'Birdie%', align: 'center', render: (h) => <span className={cs.holeGreen}>{formatPct(h.birdie_pct, 0)}</span> },
    { key: 'par_pct', header: 'Par%', align: 'center', render: (h) => <span className={cs.holeBlue}>{formatPct(h.par_pct, 0)}</span> },
    { key: 'bogey_pct', header: 'Bogey%', align: 'center', render: (h) => <span className={cs.holeOrange}>{formatPct(h.bogey_pct, 0)}</span> },
    { key: 'double_plus_pct', header: 'Dbl+%', align: 'center', render: (h) => <span className={cs.holeRed}>{formatPct(h.double_plus_pct, 0)}</span> },
  ]

  // ── Round table columns ──
  const roundColumns: Column<CourseRoundStats>[] = [
    {
      key: 'score', header: 'Score', align: 'center',
      render: (r) => <span className={vsParColor(r.score_vs_par)} style={{ fontWeight: 700 }}>{r.score}</span>,
    },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'tee_name', header: 'Tee', render: (r) => r.tee_name ?? '--' },
    { key: 'holes_played', header: 'Holes', align: 'center' },
    { key: 'gir_pct', header: 'GIR%', align: 'center', render: (r) => r.gir_pct != null ? formatPct(r.gir_pct, 0) : '--' },
    { key: 'fw_pct', header: 'FW%', align: 'center', render: (r) => r.fw_pct != null ? formatPct(r.fw_pct, 0) : '--' },
    { key: 'putts', header: 'Putts', align: 'center', render: (r) => r.putts ?? '--' },
    {
      key: 'score_vs_par', header: 'vs Par', align: 'center',
      render: (r) => <span className={vsParColor(r.score_vs_par)}>{formatVsPar(r.score_vs_par)}</span>,
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className={cs.backLinks}>
        <span className={cs.backLink} onClick={() => navigate('/courses')}>
          <ArrowLeft size={14} /> All Courses
        </span>
        <span className={cs.backLink} onClick={() => navigate(`/courses/club/${stats.club_id}`)}>
          <ArrowLeft size={14} /> {stats.club_name}
        </span>
      </div>

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{stats.course_name ?? stats.club_name}</h1>
        <p className={styles.pageDesc}>
          {stats.holes ?? '?'} holes &middot; Par {stats.par ?? '?'}
        </p>
      </div>

      {/* Stat Cards */}
      <div className={styles.statsRow}>
        <StatCard
          label="Rounds"
          value={stats.rounds_played}
          sub={stats.excluded_rounds > 0 ? `${stats.excluded_rounds} excluded` : undefined}
        />
        <StatCard label="Avg Score" value={stats.avg_score != null ? formatNum(stats.avg_score) : '--'} />
        <StatCard label="Best" value={stats.best_score ?? '--'} />
        <StatCard label="Avg vs Par" value={stats.avg_vs_par != null ? formatVsPar(Math.round(stats.avg_vs_par * 10) / 10) : '--'} valueColor={vsParStatColor} />
        <StatCard label="GIR %" value={stats.gir_pct != null ? formatPct(stats.gir_pct) : '--'} />
        <StatCard label="FW %" value={stats.fairway_pct != null ? formatPct(stats.fairway_pct) : '--'} />
        <StatCard label="Putts/Hole" value={stats.avg_putts_per_hole != null ? formatNum(stats.avg_putts_per_hole, 2) : '--'} />
      </div>

      {/* SG Breakdown + Handicap (2-column) */}
      <div className={styles.grid2}>
        {/* SG Breakdown */}
        <Card>
          <CardHeader
            title="Strokes Gained"
            action={
              <div className={cs.sgToggle}>
                <button
                  className={cn(cs.sgToggleBtn, sgMode === 'pga' && cs.sgToggleBtnActive)}
                  onClick={() => setSgMode('pga')}
                >
                  vs PGA
                </button>
                <button
                  className={cn(cs.sgToggleBtn, sgMode === 'personal' && cs.sgToggleBtnActive)}
                  onClick={() => setSgMode('personal')}
                >
                  vs Personal
                </button>
              </div>
            }
          />
          {hasSgData ? (
            <>
              {sgValues.map(({ cat, value }) => (
                <div key={cat} className={cs.sgRow}>
                  <span className={cs.sgLabel} style={{ color: SG_COLORS[cat] }}>
                    {SG_LABELS[cat]}
                  </span>
                  <div className={cs.sgBarWrap}>
                    <div className={cs.sgCenter} />
                    <div
                      className={cn(cs.sgBar, value >= 0 ? cs.sgBarPositive : cs.sgBarNegative)}
                      style={{
                        width: `${(Math.abs(value) / maxAbsSg) * 50}%`,
                        background: value >= 0 ? '#22c55e' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className={cs.sgValue} style={{ color: sgColor(value) }}>
                    {formatSG(value)}
                  </span>
                </div>
              ))}
              <div className={cs.sgFooter}>
                per round vs {sgMode === 'pga' ? 'PGA avg' : 'your avg'}
              </div>
            </>
          ) : (
            <EmptyState message={sgMode === 'pga' ? 'No SG data yet' : 'No personal SG baseline yet'} />
          )}
        </Card>

        {/* Handicap */}
        <Card>
          <CardHeader title="Handicap at this Course" />
          {stats.differentials.length > 0 ? (
            <>
              <div className={cs.hcpSummary}>
                <div className={cs.hcpBox}>
                  <div className={cs.hcpBoxLabel}>Avg Differential</div>
                  <div className={cs.hcpBoxValue}>
                    {stats.avg_differential != null ? formatNum(stats.avg_differential) : '--'}
                  </div>
                </div>
                <div className={cs.hcpBox}>
                  <div className={cs.hcpBoxLabel}>Best Differential</div>
                  <div className={cs.hcpBoxValue} style={{ color: 'var(--accent)' }}>
                    {stats.best_differential != null ? formatNum(stats.best_differential) : '--'}
                  </div>
                </div>
              </div>
              {(() => {
                const totalPages = Math.ceil(stats.differentials.length / HCP_PER_PAGE)
                const page = stats.differentials.slice(hcpPage * HCP_PER_PAGE, (hcpPage + 1) * HCP_PER_PAGE)
                return (
                  <>
                    <table className={cs.hcpTable}>
                      <tbody>
                        {page.map((d) => (
                          <tr key={d.round_id}>
                            <td style={{ color: 'var(--text-muted)' }}>{formatDate(d.date)}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              Score {d.score} &middot; Rating {d.rating} &middot; Slope {d.slope}
                            </td>
                            <td style={{
                              color: stats.avg_differential != null && d.differential <= stats.avg_differential
                                ? 'var(--accent)' : 'var(--warning)',
                            }}>
                              {formatNum(d.differential)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {totalPages > 1 && (
                      <div className={cs.hcpPager}>
                        <button className={cs.hcpPagerBtn} disabled={hcpPage === 0} onClick={() => setHcpPage(hcpPage - 1)}>&lsaquo; Prev</button>
                        <span className={cs.hcpPagerInfo}>{hcpPage + 1} / {totalPages}</span>
                        <button className={cs.hcpPagerBtn} disabled={hcpPage >= totalPages - 1} onClick={() => setHcpPage(hcpPage + 1)}>Next &rsaquo;</button>
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          ) : (
            <EmptyState message="No handicap data yet" />
          )}
        </Card>
      </div>

      {/* Score Trend Chart */}
      <div className={styles.section}>
        <ScoreTrendChart rounds={stats.rounds} />
      </div>

      {/* Hole Difficulty + Scoring Distribution (2-column) */}
      <div className={styles.grid2}>
        {/* Hole Difficulty */}
        <Card>
          <CardHeader
            title="Hole Difficulty"
            action={
              <div className={cs.sortToggle}>
                <button
                  className={cn(cs.sortBtn, holeSort === 'difficulty' && cs.sortBtnActive)}
                  onClick={() => setHoleSort('difficulty')}
                >
                  Hardest
                </button>
                <button
                  className={cn(cs.sortBtn, holeSort === 'number' && cs.sortBtnActive)}
                  onClick={() => setHoleSort('number')}
                >
                  By Hole
                </button>
              </div>
            }
          />
          <DataTable
            columns={holeColumns}
            data={sortedHoles}
            keyExtractor={(h) => h.hole_number}
            emptyMessage="No hole data yet"
          />
        </Card>

        {/* Scoring Distribution */}
        <Card>
          <CardHeader title="Scoring Distribution" />
          {distTotal > 0 ? (
            distItems.map((item) => (
              <div key={item.label} className={cs.distRow}>
                <span className={cs.distLabel}>{item.label}</span>
                <div className={cs.distBarWrap}>
                  <div
                    className={cs.distBar}
                    style={{
                      width: `${(item.count / distTotal) * 100}%`,
                      background: item.color,
                    }}
                  />
                </div>
                <span className={cs.distCount}>{item.count}</span>
                <span className={cs.distPct}>{((item.count / distTotal) * 100).toFixed(0)}%</span>
              </div>
            ))
          ) : (
            <EmptyState message="No scoring data yet" />
          )}
        </Card>
      </div>

      {/* Round History */}
      <div className={styles.section}>
        <Card>
          <CardHeader
            title="Rounds"
            action={<Badge variant="green">{stats.rounds_played}</Badge>}
          />
          <DataTable
            columns={roundColumns}
            data={roundsSorted}
            keyExtractor={(r) => r.round_id}
            onRowClick={(r) => navigate(`/rounds/${r.round_id}`)}
            emptyMessage="No rounds recorded at this course"
          />
        </Card>
      </div>

      {/* Action Buttons */}
      <div className={cs.actionRow}>
        <Button variant="ghost" onClick={() => navigate(`/courses/${stats.course_id}/map`)}>
          View Holes Map
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/courses/club/${stats.club_id}`)}>
          View Club
        </Button>
      </div>
    </div>
  )
}
