import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Map as MapIcon } from 'lucide-react'
import {
  usePlaySession,
  useUpdatePlaySession,
  useSampleWeather,
  useCourseStats,
  useSGSummary,
} from '../../api'
import type { SGPerRound } from '../../api'
import { Button, Card, CardHeader, useConfirm } from '../../components'
import s from './CourseOverviewPage.module.css'

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
  const [sgMode, setSgMode] = useState<'pga' | 'personal'>('pga')

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

  const handleTeeOff = async () => {
    await updateMutation.mutateAsync({ state: 'ACTIVE' })
    // Capture the at-tee-off weather sample. Failures are non-fatal — the
    // map will still render without wind data.
    sampleMutation.mutateAsync(undefined).catch(() => {})
    goToMap()
  }

  const handleBackToPre = async () => {
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
