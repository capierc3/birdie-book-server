import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { StatCard, Card, CardHeader, Badge, Button, EmptyState } from '../../components'
import { useRound, useCourse } from '../../api'
import { formatDate, formatVsPar, formatPct, formatNum, formatGameFormat, vsParColor } from '../../utils/format'
import { RoundScorecard } from './RoundScorecard'
import { RoundSGBreakdown } from './RoundSGBreakdown'
import { RoundHighlights } from './RoundHighlights'
import styles from '../../styles/pages.module.css'

export function RoundDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const roundId = id ? Number(id) : undefined
  const { data: round, isLoading } = useRound(roundId)
  const { data: course } = useCourse(round?.course_id ?? undefined)

  const parMap = useMemo(() => {
    if (!course || !round?.tee_id) return {} as Record<number, number>
    const tee = course.tees.find((t) => t.id === round.tee_id)
    if (!tee) return {} as Record<number, number>
    const map: Record<number, number> = {}
    for (const h of tee.holes) {
      map[h.hole_number] = h.par
    }
    return map
  }, [course, round])

  if (isLoading) return <div className={styles.loading}>Loading...</div>
  if (!round) return <EmptyState message="Round not found" />

  const holes = round.holes ?? []

  // Compute stats from holes
  const girHoles = holes.filter((h) => h.gir != null)
  const girPct = girHoles.length > 0
    ? (girHoles.filter((h) => h.gir).length / girHoles.length) * 100
    : null

  const fwHoles = holes.filter((h) => h.fairway != null)
  const fwPct = fwHoles.length > 0
    ? (fwHoles.filter((h) => h.fairway === 'HIT').length / fwHoles.length) * 100
    : null

  const puttHoles = holes.filter((h) => h.putts != null)
  const puttsPerHole = puttHoles.length > 0
    ? puttHoles.reduce((s, h) => s + h.putts!, 0) / puttHoles.length
    : null

  const threePutts = holes.filter((h) => h.putts != null && h.putts >= 3).length
  const penalties = holes.reduce((s, h) => s + (h.penalty_strokes ?? 0), 0)

  // Subtitle parts
  const subtitleParts = [
    round.course_name,
    round.tee_name ? `${round.tee_name} tees` : null,
    `${round.holes_completed ?? holes.length} holes`,
    round.shots_tracked ? `${round.shots_tracked} shots` : null,
  ].filter(Boolean)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/rounds')}>
          <ArrowLeft size={16} /> Back to Rounds
        </Button>
      </div>

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{formatDate(round.date)}</h1>
        <p className={styles.pageDesc}>{subtitleParts.join(' · ')}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          {round.total_strokes && (
            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {round.total_strokes}
            </span>
          )}
          {round.score_vs_par != null && (
            <span className={vsParColor(round.score_vs_par)} style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              ({formatVsPar(round.score_vs_par)})
            </span>
          )}
          {round.exclude_from_stats && <Badge variant="yellow">Excluded</Badge>}
          {round.game_format && round.game_format !== 'STROKE_PLAY' && (
            <Badge variant="blue">{formatGameFormat(round.game_format)}</Badge>
          )}
          {round.weather_temp_f != null && (
            <Badge variant="muted">{round.weather_temp_f}°F {round.weather_description ?? ''}</Badge>
          )}
          {round.source && <Badge variant="muted">{round.source}</Badge>}
        </div>
      </div>

      <div className={styles.statsRow}>
        <StatCard label="Score" value={round.total_strokes ?? '--'} />
        <StatCard label="vs Par" value={formatVsPar(round.score_vs_par)} />
        <StatCard label="GIR %" value={formatPct(girPct)} />
        <StatCard label="Fairway %" value={formatPct(fwPct)} />
        <StatCard label="Putts/Hole" value={formatNum(puttsPerHole)} />
        <StatCard label="3-Putts" value={threePutts} />
        {penalties > 0 && <StatCard label="Penalties" value={penalties} />}
      </div>

      <Card>
        <CardHeader title="Scorecard" />
        <RoundScorecard holes={holes} parMap={parMap} />
      </Card>

      <div style={{ marginTop: 24 }} />

      <div className={styles.grid2}>
        <RoundHighlights holes={holes} parMap={parMap} />
        <RoundSGBreakdown holes={holes} />
      </div>

      {round.key_takeaway && (
        <Card>
          <CardHeader title="Notes" />
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
            {round.key_takeaway}
          </p>
        </Card>
      )}
    </div>
  )
}
