import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Map as MapIcon } from 'lucide-react'
import {
  usePlaySession,
  useUpdatePlaySession,
  useSampleWeather,
  useCourseStats,
  useSGSummary,
  useTags,
  useRangeTrends,
} from '../../api'
import type { SGPerRound, CourseHoleStats } from '../../api'
import { Button, Card, CardHeader, useConfirm } from '../../components'
import { TagPicker } from './TagPicker'
import s from './CourseOverviewPage.module.css'

const PERFORMANCE_MAX = 3
const AUTOSAVE_DELAY_MS = 800

const SG_CATEGORIES: { key: keyof Pick<SGPerRound, 'off_the_tee' | 'approach' | 'short_game' | 'putting'>; label: string }[] = [
  { key: 'off_the_tee', label: 'Off the tee' },
  { key: 'approach', label: 'Approach' },
  { key: 'short_game', label: 'Short game' },
  { key: 'putting', label: 'Putting' },
]

function formatRoundDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatSg(value: number): string {
  if (Number.isNaN(value)) return '—'
  const rounded = value.toFixed(1)
  return value > 0 ? `+${rounded}` : rounded
}

function fmtPct(v: number | null | undefined): string {
  // Backend returns percentages already scaled 0-100, not fractions.
  return v == null ? '—' : `${Math.round(v)}%`
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  return v == null ? '—' : v.toFixed(digits)
}

export function CourseOverviewPage() {
  const { id } = useParams<{ id: string }>()
  const sessionId = id ? Number(id) : undefined
  const navigate = useNavigate()
  const { confirm } = useConfirm()

  const { data: session, isLoading } = usePlaySession(sessionId)
  const updateMutation = useUpdatePlaySession(sessionId ?? 0)
  const sampleMutation = useSampleWeather(sessionId ?? 0)
  const { data: courseStats } = useCourseStats(session?.course_id ?? undefined)
  const { data: sgSummary } = useSGSummary()
  const { data: allTags } = useTags()
  const { data: rangeTrends } = useRangeTrends(30, 5)
  const [sgMode, setSgMode] = useState<'pga' | 'personal'>('pga')

  // Performance tags are edited on this page; tags from PRE (intention,
  // bring_in, pull_out) must be preserved in every PATCH or we'd wipe them.
  // Keep performance editable in local state, leave the rest alone.
  const [performanceTagIds, setPerformanceTagIds] = useState<number[] | null>(null)
  const [saveStatus, setSaveStatus] = useState<string>('')
  const lastSyncedRef = useRef<string>('')
  const saveTimerRef = useRef<number | null>(null)

  const tagCategoryById = useMemo(() => {
    const m = new Map<number, 'bring_in' | 'pull_out' | 'intention' | 'performance'>()
    for (const t of allTags ?? []) m.set(t.id, t.category)
    return m
  }, [allTags])

  const nonPerformanceTagIds = useMemo(() => {
    if (!session) return [] as number[]
    return session.tag_ids.filter((id) => tagCategoryById.get(id) !== 'performance')
  }, [session, tagCategoryById])

  // On load (and whenever session/tags become available), seed the editable
  // performance set from the session's current tag list.
  useEffect(() => {
    if (!session || !allTags) return
    const initial = session.tag_ids.filter((id) => tagCategoryById.get(id) === 'performance')
    setPerformanceTagIds(initial)
    lastSyncedRef.current = JSON.stringify(initial)
  }, [session, allTags, tagCategoryById])

  // Debounced auto-save: when the user toggles performance tags, PATCH the
  // union (preserved-non-performance + edited-performance).
  useEffect(() => {
    if (performanceTagIds == null || !session) return
    if (session.state === 'COMPLETE' || session.state === 'ABANDONED') return
    const snapshot = JSON.stringify(performanceTagIds)
    if (snapshot === lastSyncedRef.current) return

    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(async () => {
      setSaveStatus('Saving…')
      try {
        await updateMutation.mutateAsync({
          tag_ids: [...nonPerformanceTagIds, ...performanceTagIds],
        })
        lastSyncedRef.current = snapshot
        setSaveStatus('Saved')
        window.setTimeout(() => setSaveStatus(''), 1200)
      } catch (e) {
        setSaveStatus(`Error: ${(e as Error).message}`)
      }
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    }
  }, [performanceTagIds, nonPerformanceTagIds, session, updateMutation])

  // If the user navigates here but the session isn't actually in
  // COURSE_OVERVIEW (e.g. they typed the URL or used a stale link), bounce
  // them to the right screen for the current state.
  useEffect(() => {
    if (!session) return
    if (session.state === 'PRE') {
      navigate(`/play/sessions/${session.id}`, { replace: true })
    } else if (session.state === 'ACTIVE' && session.course_id != null) {
      const params = new URLSearchParams({ mode: 'play' })
      if (session.tee_id != null) params.set('tee', String(session.tee_id))
      params.set('session', String(session.id))
      navigate(`/courses/${session.course_id}/map?${params.toString()}`, { replace: true })
    } else if (session.state === 'COMPLETE' || session.state === 'ABANDONED') {
      navigate(`/play/sessions/${session.id}`, { replace: true })
    }
  }, [session, navigate])

  if (!sessionId) return <div className={s.page}>Invalid session.</div>
  if (isLoading || !session) return <div className={s.page}>Loading…</div>

  const goToMap = () => {
    if (session.course_id == null) return
    const params = new URLSearchParams({ mode: 'play' })
    if (session.tee_id != null) params.set('tee', String(session.tee_id))
    params.set('session', String(session.id))
    navigate(`/courses/${session.course_id}/map?${params.toString()}`)
  }

  const flushPending = async () => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (performanceTagIds == null) return
    const snapshot = JSON.stringify(performanceTagIds)
    if (snapshot === lastSyncedRef.current) return
    await updateMutation.mutateAsync({
      tag_ids: [...nonPerformanceTagIds, ...performanceTagIds],
    })
    lastSyncedRef.current = snapshot
  }

  const handleTeeOff = async () => {
    await flushPending()
    await updateMutation.mutateAsync({ state: 'ACTIVE' })
    // Capture the at-tee-off weather sample. Failures are non-fatal — the
    // map will still render without wind data.
    sampleMutation.mutateAsync(undefined).catch(() => {})
    goToMap()
  }

  const handleBackToPre = async () => {
    await flushPending()
    await updateMutation.mutateAsync({ state: 'PRE' })
    navigate(`/play/sessions/${sessionId}`)
  }

  const handleAbandon = async () => {
    const ok = await confirm({
      title: 'Abandon round?',
      message: 'This marks the round as abandoned. You can still view it later.',
      confirmLabel: 'Abandon',
    })
    if (!ok) return
    await updateMutation.mutateAsync({ state: 'ABANDONED' })
    navigate('/play')
  }

  const recentRounds: SGPerRound[] = (sgSummary?.per_round ?? []).slice(0, 5)
  const sgField = sgMode === 'pga' ? 'sg_pga' : 'sg_personal'
  const sgAverages = SG_CATEGORIES.map(({ key, label }) => {
    const values = recentRounds
      .map((r) => r[key]?.[sgField])
      .filter((v): v is number => typeof v === 'number')
    if (values.length === 0) return { key, label, avg: null as number | null, n: 0 }
    return {
      key,
      label,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      n: values.length,
    }
  })

  const biggestOpportunity =
    sgMode === 'pga'
      ? sgSummary?.biggest_opportunity_pga
      : sgSummary?.biggest_opportunity_personal

  // Top 3 hardest holes at this course by avg-vs-par. Only count holes
  // you've actually played; a hole with `times_played === 0` carries no signal.
  const hardestHoles: CourseHoleStats[] = (courseStats?.hole_stats ?? [])
    .filter((h) => h.times_played > 0)
    .sort((a, b) => b.avg_vs_par - a.avg_vs_par)
    .slice(0, 3)

  return (
    <div className={s.page}>
      <button className={s.backLink} onClick={handleBackToPre}>
        <ArrowLeft size={14} /> Back to Pre-Round
      </button>

      <div className={s.header}>
        <h1 className={s.title}>{session.course_name || 'Course Overview'}</h1>
        <div className={s.subtitle}>
          {session.date} · {session.tee_name || '—'} · {session.holes_played ?? 18} holes · {session.game_format}
        </div>
      </div>

      <Card>
        <CardHeader title="Your history at this course" />
        <div className={s.cardBody}>
          {!courseStats ? (
            <div className={s.empty}>Loading course stats…</div>
          ) : courseStats.rounds_played === 0 ? (
            <div className={s.empty}>First time at this course — no history yet. Good luck out there.</div>
          ) : (
            <>
              <div className={s.statGrid}>
                <div className={s.stat}>
                  <span className={s.statLabel}>Rounds played</span>
                  <span className={s.statValue}>{courseStats.rounds_played}</span>
                </div>
                <div className={s.stat}>
                  <span className={s.statLabel}>Avg score</span>
                  <span className={s.statValue}>
                    {fmtNum(courseStats.avg_score)}
                    {courseStats.avg_vs_par != null && (
                      <span className={s.statDelta}> ({formatSg(courseStats.avg_vs_par)})</span>
                    )}
                  </span>
                </div>
                <div className={s.stat}>
                  <span className={s.statLabel}>Best</span>
                  <span className={s.statValue}>{courseStats.best_score ?? '—'}</span>
                </div>
                <div className={s.stat}>
                  <span className={s.statLabel}>Fairways</span>
                  <span className={s.statValue}>{fmtPct(courseStats.fairway_pct)}</span>
                </div>
                <div className={s.stat}>
                  <span className={s.statLabel}>Greens in reg</span>
                  <span className={s.statValue}>{fmtPct(courseStats.gir_pct)}</span>
                </div>
                <div className={s.stat}>
                  <span className={s.statLabel}>Putts / hole</span>
                  <span className={s.statValue}>{fmtNum(courseStats.avg_putts_per_hole, 2)}</span>
                </div>
              </div>

              {courseStats.rounds.length > 0 && (
                <div className={s.recentRounds}>
                  <div className={s.subHead}>Last 3 rounds here</div>
                  <ul className={s.recentList}>
                    {courseStats.rounds.slice(0, 3).map((r) => (
                      <li key={r.round_id} className={s.recentRow}>
                        <span>
                          {formatRoundDate(r.date)}
                          <span className={s.statDelta}> · {r.holes_played}h</span>
                        </span>
                        <span>
                          {r.score} <span className={s.statDelta}>({formatSg(r.score_vs_par)})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent SG snapshot — last 5 rounds" />
        <div className={s.cardBody}>
          <div className={s.sgToggle} role="tablist" aria-label="SG baseline">
            <button
              type="button"
              role="tab"
              aria-selected={sgMode === 'pga'}
              className={`${s.sgToggleBtn} ${sgMode === 'pga' ? s.sgToggleOn : ''}`}
              onClick={() => setSgMode('pga')}
            >
              PGA
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sgMode === 'personal'}
              className={`${s.sgToggleBtn} ${sgMode === 'personal' ? s.sgToggleOn : ''}`}
              onClick={() => setSgMode('personal')}
            >
              Personal
            </button>
          </div>
          {!sgSummary ? (
            <div className={s.empty}>Loading SG…</div>
          ) : recentRounds.length === 0 ? (
            <div className={s.empty}>No SG data yet — play a tracked round to see this.</div>
          ) : (
            <>
              <div className={s.sgGrid}>
                {sgAverages.map((cat) => (
                  <div key={cat.key} className={s.sgRow}>
                    <span className={s.sgLabel}>{cat.label}</span>
                    <span
                      className={`${s.sgValue} ${
                        cat.avg == null ? '' : cat.avg > 0 ? s.sgPositive : s.sgNegative
                      }`}
                    >
                      {cat.avg == null ? '—' : formatSg(cat.avg)}
                    </span>
                  </div>
                ))}
              </div>
              {biggestOpportunity && (
                <div className={s.sgFooter}>
                  Biggest opportunity:{' '}
                  <strong>{biggestOpportunity.replace(/_/g, ' ')}</strong>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Performance focus for today"
          action={saveStatus ? <span className={s.saveStatus}>{saveStatus}</span> : undefined}
        />
        <div className={s.cardBody}>
          <p className={s.cardHint}>
            Pick up to {PERFORMANCE_MAX} technical or tactical goals for this round.
          </p>
          <TagPicker
            category="performance"
            selectedIds={performanceTagIds ?? []}
            onChange={(ids) => setPerformanceTagIds(ids)}
            maxSelection={PERFORMANCE_MAX}
          />
        </div>
      </Card>

      {hardestHoles.length > 0 && (
        <Card>
          <CardHeader title="Toughest holes for you here" />
          <div className={s.cardBody}>
            <ul className={s.recentList}>
              {hardestHoles.map((h) => (
                <li key={h.hole_number} className={s.recentRow}>
                  <span>
                    Hole {h.hole_number}
                    <span className={s.statDelta}> · par {h.par}</span>
                  </span>
                  <span>
                    {fmtNum(h.avg_score)}{' '}
                    <span className={s.statDelta}>({formatSg(h.avg_vs_par)})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {rangeTrends && rangeTrends.clubs.length > 0 && (
        <Card>
          <CardHeader
            title={`Range trends — last ${rangeTrends.days} days`}
            action={
              <span className={s.saveStatus}>
                {rangeTrends.recent_session_count} session
                {rangeTrends.recent_session_count === 1 ? '' : 's'}
              </span>
            }
          />
          <div className={s.cardBody}>
            <ul className={s.recentList}>
              {rangeTrends.clubs.map((c) => {
                const carryDir =
                  c.carry_delta == null
                    ? null
                    : c.carry_delta > 0.5
                    ? 'up'
                    : c.carry_delta < -0.5
                    ? 'down'
                    : 'flat'
                // Tighter dispersion (smaller std dev) = good. Improvement is
                // a NEGATIVE delta, so flip the sign for color/arrow logic.
                const dispersionDir =
                  c.side_std_dev_delta == null
                    ? null
                    : c.side_std_dev_delta < -0.5
                    ? 'up'
                    : c.side_std_dev_delta > 0.5
                    ? 'down'
                    : 'flat'
                return (
                  <li key={c.club_type} className={s.rangeRow}>
                    <div className={s.rangeRowTop}>
                      <span className={s.rangeClubName}>{c.club_type}</span>
                      <span className={s.statDelta}>· {c.shot_count} shots</span>
                    </div>
                    <div className={s.rangeMetrics}>
                      {c.avg_carry != null && (
                        <span
                          className={`${s.rangeMetric} ${
                            carryDir === 'up' ? s.sgPositive : carryDir === 'down' ? s.sgNegative : ''
                          }`}
                          title={
                            c.carry_delta != null
                              ? `Avg carry ${c.avg_carry}y (Δ ${formatSg(c.carry_delta)} vs prior 30 days)`
                              : `Avg carry ${c.avg_carry}y`
                          }
                        >
                          {c.avg_carry}y
                          {c.carry_delta != null && (
                            <span className={s.statDelta}> ({formatSg(c.carry_delta)})</span>
                          )}
                        </span>
                      )}
                      {c.side_std_dev != null && (
                        <span
                          className={`${s.rangeMetric} ${
                            dispersionDir === 'up'
                              ? s.sgPositive
                              : dispersionDir === 'down'
                              ? s.sgNegative
                              : ''
                          }`}
                          title={
                            c.side_std_dev_delta != null
                              ? `Side dispersion σ ${c.side_std_dev}y (Δ ${formatSg(c.side_std_dev_delta)} vs prior 30 days, lower is better)`
                              : `Side dispersion σ ${c.side_std_dev}y`
                          }
                        >
                          σ{c.side_std_dev}y
                          {c.side_std_dev_delta != null && (
                            <span className={s.statDelta}> ({formatSg(c.side_std_dev_delta)})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </Card>
      )}

      <div className={s.actions}>
        <Button
          variant="primary"
          onClick={handleTeeOff}
          disabled={updateMutation.isPending}
          className={s.teeOffBtn}
        >
          <MapIcon size={14} /> Tee Off
        </Button>
        <Button variant="ghost" className={s.dangerBtn} onClick={handleAbandon}>
          Abandon
        </Button>
      </div>
    </div>
  )
}
