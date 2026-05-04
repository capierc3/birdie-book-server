import { useState, useCallback, useMemo, useEffect } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useConfirm } from '../../components'
import { useCourseMap } from './courseMapState'
import type { Plan, PlanShot } from './courseMapState'
import { get, post, put, del } from '../../api'
import { getClubColor } from './clubColors'
import { haversineYards, normalCDF } from './geoUtils'
import { useCourseRounds } from './useCourseRounds'
import s from './panels.module.css'

interface PlanInsights {
  holes?: Record<string, {
    best_tee_club?: { club: string; avg_score: number; fw_pct?: number; rounds: number }
    fairway_impact?: { savings: number }
    club_scores?: { club: string; avg_score: number; fw_pct?: number }[]
    scoring_dist?: { eagle: number; birdie: number; par: number; bogey: number; double_plus: number }
  }>
}

export function PlanningPanel({ onClose }: { onClose: () => void }) {
  const { confirm, alert } = useConfirm()
  const ctx = useCourseMap()
  const { course, currentHole, teeId, teePos, greenPos, strategy } = ctx

  const [plans, setPlans] = useState<Plan[]>([])
  const currentPlan = ctx.currentPlan
  const setCurrentPlan = ctx.setCurrentPlan
  const [insights, setInsights] = useState<PlanInsights | null>(null)
  const [selectedClub, setSelectedClub] = useState('')

  // Load plans on mount
  useEffect(() => {
    if (!course) return
    get<Plan[]>(`/plans?course_id=${course.id}`).then(setPlans).catch(() => setPlans([]))
  }, [course])

  const teePlans = useMemo(() => plans.filter((p) => p.tee_id === teeId), [plans, teeId])
  const { data: rounds = [] } = useCourseRounds(course?.id)
  const teeRounds = useMemo(() => rounds.filter((r) => r.tee_id === teeId), [rounds, teeId])

  // Load plan detail when selected
  const loadPlan = useCallback(async (planId: number) => {
    try {
      const [plan, ins] = await Promise.all([
        get<Plan>(`/plans/${planId}`),
        get<PlanInsights>(`/plans/${planId}/insights`).catch(() => ({ holes: {} })),
      ])
      setCurrentPlan(plan)
      setInsights(ins)
      ctx.setCurrentPlanId(planId)
      ctx.triggerRedraw()
    } catch { setCurrentPlan(null); ctx.setCurrentPlanId(null) }
  }, [ctx])

  // Create plan
  const handleNewPlan = useCallback(async () => {
    if (!course) return
    const name = prompt('Plan name:', `Plan for ${course.display_name || 'Course'}`)
    if (!name) return
    const dateStr = prompt('Planned date (YYYY-MM-DD, or leave blank):', '') || null
    try {
      const plan = await post<Plan>('/plans', { course_id: course.id, tee_id: teeId, name, planned_date: dateStr })
      const updatedPlans = await get<Plan[]>(`/plans?course_id=${course.id}`)
      setPlans(updatedPlans)
      await loadPlan(plan.id)
    } catch { await alert('Failed to create plan', 'Error') }
  }, [course, teeId, loadPlan, alert])

  // Delete plan
  const handleDeletePlan = useCallback(async () => {
    if (!currentPlan) return
    const ok = await confirm({
      title: 'Delete Plan',
      message: 'Delete this plan?',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await del(`/plans/${currentPlan.id}`)
    setCurrentPlan(null)
    setInsights(null)
    ctx.setCurrentPlanId(null)
    ctx.triggerRedraw()
    if (course) setPlans(await get<Plan[]>(`/plans?course_id=${course.id}`).catch(() => []))
  }, [currentPlan, course, ctx, confirm])

  // Link/unlink round
  const handleLinkRound = useCallback(async (roundId: number) => {
    if (!currentPlan) return
    await put(`/plans/${currentPlan.id}`, { round_id: roundId, status: 'played' })
    await loadPlan(currentPlan.id)
  }, [currentPlan, loadPlan])

  const handleUnlinkRound = useCallback(async () => {
    if (!currentPlan) return
    await put(`/plans/${currentPlan.id}`, { round_id: 0, status: 'draft' })
    await loadPlan(currentPlan.id)
  }, [currentPlan, loadPlan])

  // Save shots to API
  const savePlanShots = useCallback(async (shots: PlanShot[]) => {
    if (!currentPlan) return
    await put(`/plans/${currentPlan.id}/holes/${currentHole}/shots`, {
      shots: shots.map((sh) => ({
        shot_number: sh.shot_number, club: sh.club,
        aim_lat: sh.aim_lat, aim_lng: sh.aim_lng, notes: sh.notes || null,
      })),
    })
    // Refresh plan data + redraw map overlays
    await loadPlan(currentPlan.id)
    ctx.triggerRedraw()
  }, [currentPlan, currentHole, loadPlan, ctx])

  // Delete a shot
  const handleDeleteShot = useCallback(async (idx: number) => {
    if (!currentPlan) return
    const planHole = (currentPlan.holes || []).find((h) => h.hole_number === currentHole)
    const shots = [...(planHole?.shots || [])].sort((a, b) => a.shot_number - b.shot_number)
    shots.splice(idx, 1)
    shots.forEach((sh, i) => { sh.shot_number = i + 1 })
    await savePlanShots(shots)
  }, [currentPlan, currentHole, savePlanShots])

  // Add putts
  const handleAddPutts = useCallback(async (count: number) => {
    if (!currentPlan) return
    const planHole = (currentPlan.holes || []).find((h) => h.hole_number === currentHole)
    const shots = [...(planHole?.shots || [])].sort((a, b) => a.shot_number - b.shot_number)
    for (let i = 0; i < count; i++) {
      shots.push({
        shot_number: shots.length + 1,
        club: 'Putter',
        aim_lat: greenPos?.lat || null,
        aim_lng: greenPos?.lng || null,
        notes: `Putt ${i + 1} of ${count}`,
      })
    }
    await savePlanShots(shots)
  }, [currentPlan, currentHole, greenPos, savePlanShots])

  // Enter aiming mode — PlanAimOverlay handles the map interaction
  const [aiming, setAiming] = useState(false)

  const handlePlaceShot = useCallback(async (club: string) => {
    if (!currentPlan) return
    const planHoleData = (currentPlan.holes || []).find((h) => h.hole_number === currentHole)
    const shots = [...(planHoleData?.shots || [])].sort((a, b) => a.shot_number - b.shot_number)

    // Putts have no aim — append directly with the green as the nominal target.
    // Skips the map-aim step entirely (consistent with handleAddPutts).
    if (club === 'Putter') {
      shots.push({
        shot_number: shots.length + 1,
        club: 'Putter',
        aim_lat: greenPos?.lat || null,
        aim_lng: greenPos?.lng || null,
        notes: null,
      })
      await savePlanShots(shots)
      return
    }

    // Determine ball position (tee or last shot aim point) for full shots.
    const ballPosition = shots.length === 0
      ? teePos
      : (shots[shots.length - 1].aim_lat ? { lat: shots[shots.length - 1].aim_lat!, lng: shots[shots.length - 1].aim_lng! } : teePos)

    if (!ballPosition) return

    ctx.setPlanAiming({ club, ballPos: ballPosition })
    setAiming(true)
  }, [currentPlan, currentHole, teePos, greenPos, savePlanShots, ctx])

  // Listen for aim completion from PlanAimOverlay
  useEffect(() => {
    const onComplete = async (e: Event) => {
      const { lat, lng } = (e as CustomEvent).detail as { lat: number; lng: number }
      setAiming(false)
      if (!currentPlan) return
      const planHoleData = (currentPlan.holes || []).find((h) => h.hole_number === currentHole)
      const shots = [...(planHoleData?.shots || [])].sort((a, b) => a.shot_number - b.shot_number)
      const club = ctx.planAiming?.club || selectedClub
      shots.push({ shot_number: shots.length + 1, club, aim_lat: lat, aim_lng: lng, notes: null })
      await savePlanShots(shots)
    }
    const onCancel = () => { setAiming(false) }

    window.addEventListener('plan-aim-complete', onComplete)
    window.addEventListener('plan-aim-cancel', onCancel)
    return () => {
      window.removeEventListener('plan-aim-complete', onComplete)
      window.removeEventListener('plan-aim-cancel', onCancel)
    }
  }, [currentPlan, currentHole, savePlanShots, ctx.planAiming, selectedClub])

  // Save plan-level score goal (drives personal-par allocation on the scorecard).
  // Empty string clears the goal (sent as 0 — backend interprets <=0 as null).
  const handleSaveScoreGoal = useCallback(async (raw: string) => {
    if (!currentPlan) return
    const trimmed = raw.trim()
    const goal = trimmed === '' ? 0 : parseInt(trimmed, 10)
    if (Number.isNaN(goal)) return
    try {
      await put(`/plans/${currentPlan.id}`, { score_goal: goal })
      await loadPlan(currentPlan.id)
    } catch { /* ignore */ }
  }, [currentPlan, loadPlan])

  // Save strategy notes
  const handleSaveNotes = useCallback(async (notes: string) => {
    if (!currentPlan) return
    try {
      await put(`/plans/${currentPlan.id}/holes/${currentHole}`, { strategy_notes: notes })
    } catch { /* ignore */ }
  }, [currentPlan, currentHole])

  // Current hole data
  const tee = course?.tees?.find((t) => t.id === teeId)
  const ch = tee?.holes?.find((h) => h.hole_number === currentHole)
  const par = ch?.par || 0
  const planHole = currentPlan ? (currentPlan.holes || []).find((h) => h.hole_number === currentHole) : null
  const plannedShots = (planHole?.shots || []).sort((a, b) => a.shot_number - b.shot_number)
  const insight = insights?.holes?.[String(currentHole)] || null

  // Ball position
  const ballPosition = plannedShots.length === 0
    ? teePos
    : (plannedShots[plannedShots.length - 1].aim_lat
        ? { lat: plannedShots[plannedShots.length - 1].aim_lat!, lng: plannedShots[plannedShots.length - 1].aim_lng! }
        : teePos)
  const ballToGreen = (ballPosition && greenPos)
    ? Math.round(haversineYards(ballPosition.lat, ballPosition.lng, greenPos.lat, greenPos.lng))
    : null
  const ballFromTee = (ballPosition && teePos && plannedShots.length > 0)
    ? Math.round(haversineYards(teePos.lat, teePos.lng, ballPosition.lat, ballPosition.lng))
    : null

  // Shot type determination
  const isFirstShot = plannedShots.length === 0
  let shotType: 'tee' | 'approach' | 'short_game' | 'putt' = 'approach'
  if (isFirstShot) shotType = 'tee'
  else if (ballToGreen != null && ballToGreen <= 10) shotType = 'putt'
  else if (ballToGreen != null && ballToGreen <= 50) shotType = 'short_game'

  // Available clubs
  const allClubs = useMemo(() =>
    (strategy?.player?.clubs || []).filter((c) => c.avg_yards > 0 && c.club_type !== 'Unknown')
      .sort((a, b) => (b.avg_yards || 0) - (a.avg_yards || 0)),
    [strategy])

  // Synthetic Putter option — appended so the user can manually add a putt when
  // the auto-detected "Putting" stage hasn't kicked in (e.g. green boundary missing).
  const PUTTER_OPTION = useMemo(() => ({ club_type: 'Putter', avg_yards: 5 }), [])

  const filteredClubs = useMemo(() => {
    const base = shotType === 'tee' ? allClubs : allClubs.filter((c) => c.club_type !== 'Driver')
    return base.some((c) => c.club_type === 'Putter') ? base : [...base, PUTTER_OPTION]
  }, [allClubs, shotType, PUTTER_OPTION])

  // Recommended club
  const recommendedClub = useMemo(() => {
    if (shotType === 'tee' && insight?.best_tee_club?.club) return insight.best_tee_club.club
    if (shotType === 'putt') return 'Putter'
    if (ballToGreen != null && filteredClubs.length > 0) {
      let best = filteredClubs[0], bestDiff = Infinity
      filteredClubs.forEach((c) => { const d = Math.abs(c.avg_yards - ballToGreen); if (d < bestDiff) { bestDiff = d; best = c } })
      return best.club_type
    }
    return filteredClubs[0]?.club_type || ''
  }, [shotType, insight, ballToGreen, filteredClubs])

  useEffect(() => { if (recommendedClub) setSelectedClub(recommendedClub) }, [recommendedClub])

  // ── Shot probability calculation ──
  const getClubDataForProb = (clubType: string) => {
    const c = strategy?.player?.clubs?.find((cl) => cl.club_type === clubType)
    if (!c) return null
    const lat = strategy?.player?.lateral_dispersion?.[clubType]
    return {
      avg: c.avg_yards, std: c.std_dev || c.avg_yards * 0.08,
      lateralStd: Math.min(lat?.lateral_std_dev || ((c.std_dev || 0) * 0.15) || 8, c.avg_yards * 0.12),
    }
  }

  const calcShotProb = (cd: { avg: number; std: number; lateralStd: number }, aimDist: number) => {
    if (cd.avg <= 0) return null
    const acceptRadius = Math.max(8, Math.round(cd.avg * 0.12))
    const zLow = (aimDist - acceptRadius - cd.avg) / cd.std
    const zHigh = (aimDist + acceptRadius - cd.avg) / cd.std
    const pDist = normalCDF(zHigh) - normalCDF(zLow)
    const pLat = normalCDF(acceptRadius / cd.lateralStd) - normalCDF(-acceptRadius / cd.lateralStd)
    return Math.max(0.02, Math.min(0.99, Math.sqrt(pDist * pLat)))
  }

  const { shotProbs, cumulativeProb } = useMemo(() => {
    let cumulative = 1
    const probs = plannedShots.map((ps, idx) => {
      if (ps.club === 'Putter') return 0.85
      const cd = ps.club ? getClubDataForProb(ps.club) : null
      if (!cd || cd.avg <= 0) return null
      const origin = idx === 0 ? teePos : (plannedShots[idx - 1].aim_lat ? { lat: plannedShots[idx - 1].aim_lat!, lng: plannedShots[idx - 1].aim_lng! } : null)
      if (!origin || !ps.aim_lat) return null
      const shotDist = haversineYards(origin.lat, origin.lng, ps.aim_lat, ps.aim_lng!)
      const prob = calcShotProb(cd, shotDist)
      if (prob != null) cumulative *= prob
      return prob
    })
    return { shotProbs: probs, cumulativeProb: cumulative }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedShots, teePos, strategy])

  // ── Course note editing ──
  const [editingCourseNote, setEditingCourseNote] = useState(false)
  const courseNotes = ch?.notes || ''

  const handleSaveCourseNote = useCallback(async (val: string) => {
    if (!course || !ch) return
    try {
      await put(`/courses/${course.id}/holes/${ch.id}`, { notes: val || '' })
    } catch { /* ignore */ }
    setEditingCourseNote(false)
  }, [course, ch])

  const shotTypeLabel: Record<string, string> = { tee: 'Tee Shot', approach: 'Approach', short_game: 'Short Game', putt: 'Putting' }

  return (
    <FloatingPanel title="Round Planning" onClose={onClose} width={300}>
      {/* Plan selector */}
      <div className={s.section} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          className={s.fieldInput}
          style={{ flex: 1 }}
          value={currentPlan?.id || ''}
          onChange={(e) => { const id = parseInt(e.target.value); if (id) loadPlan(id); else { setCurrentPlan(null); setInsights(null); ctx.setCurrentPlanId(null); ctx.triggerRedraw() } }}
        >
          <option value="">Select a plan...</option>
          {teePlans.map((p) => {
            const dateStr = p.planned_date ? new Date(p.planned_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
            const badge = p.status === 'played' ? ' [played]' : ''
            return <option key={p.id} value={p.id}>{p.name}{dateStr ? ` ${dateStr}` : ''}{badge}</option>
          })}
        </select>
        <button className={s.ghostBtn} style={{ whiteSpace: 'nowrap' }} onClick={handleNewPlan}>+ New</button>
      </div>

      {!currentPlan ? (
        <div className={s.section}><div className={s.emptyText}>Select or create a plan</div></div>
      ) : (
        <>
          {/* Plan header */}
          <div className={s.section}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{currentPlan.name}</div>
            {currentPlan.planned_date && (
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                {new Date(currentPlan.planned_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }} title="Target round score — drives the scorecard's per-hole goal par allocation by handicap.">
                Score Goal
              </label>
              <input
                type="number"
                min={36}
                max={200}
                className={s.fieldInput}
                style={{ width: 70, fontSize: '0.78rem', padding: '2px 6px' }}
                placeholder={(() => {
                  const def = parseInt(localStorage.getItem('birdie_book_default_score_goal') || '', 10)
                  return Number.isFinite(def) ? String(def) : '99'
                })()}
                defaultValue={currentPlan.score_goal ?? ''}
                key={`goal-${currentPlan.id}-${currentPlan.score_goal ?? ''}`}
                onBlur={(e) => handleSaveScoreGoal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
              {currentPlan.score_goal == null && (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>(no goal set)</span>
              )}
            </div>
          </div>

          {/* Hole header */}
          <div className={s.section}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>Hole {currentHole} — Par {par}</div>

            {/* Course note */}
            <div style={{ background: 'var(--bg-hover)', padding: '6px 10px', borderRadius: 6, marginTop: 8, marginBottom: 6, fontSize: '0.75rem', borderLeft: '3px solid var(--accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Course Note</span>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.65rem', padding: 0 }}
                  onClick={() => { if (editingCourseNote) { /* save handled by blur */ } setEditingCourseNote(!editingCourseNote) }}
                >
                  {editingCourseNote ? 'done' : 'edit'}
                </button>
              </div>
              {editingCourseNote ? (
                <textarea
                  className={s.fieldInput}
                  rows={2}
                  style={{ width: '100%', resize: 'vertical', fontSize: '0.75rem', marginTop: 4 }}
                  defaultValue={courseNotes}
                  autoFocus
                  onBlur={(e) => handleSaveCourseNote(e.target.value)}
                />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {courseNotes || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>No course note</span>}
                </div>
              )}
            </div>

            {/* Strategy notes */}
            <div style={{ marginTop: 6 }}>
              <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block', marginBottom: 3 }}>Hole Strategy</label>
              <textarea
                rows={2}
                className={s.fieldInput}
                style={{ width: '100%', resize: 'vertical', fontSize: '0.75rem' }}
                defaultValue={planHole?.strategy_notes || ''}
                onBlur={(e) => handleSaveNotes(e.target.value)}
                placeholder="Strategy for this hole..."
              />
            </div>
          </div>

          {/* Shot plan */}
          <div className={s.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Shot Plan</span>
              {plannedShots.length > 0 && (
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: cumulativeProb >= 0.5 ? 'var(--accent)' : cumulativeProb >= 0.25 ? 'var(--warning, #ff9800)' : 'var(--danger)' }}>
                  {Math.round(cumulativeProb * 100)}% plan probability
                </span>
              )}
            </div>

            {/* Ball position */}
            <div style={{ background: 'var(--bg-hover)', padding: '6px 10px', borderRadius: 6, marginBottom: 8, fontSize: '0.72rem', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: '#FFD700', fontWeight: 600 }}>Ball</span>
              {ballFromTee != null ? <span>{ballFromTee}y from tee</span> : <span>On tee</span>}
              {ballToGreen != null && <span>{ballToGreen}y to green</span>}
            </div>

            {/* Shot list */}
            {plannedShots.map((ps, idx) => {
              const color = getClubColor(ps.club)
              const origin = idx === 0 ? teePos : (plannedShots[idx - 1].aim_lat ? { lat: plannedShots[idx - 1].aim_lat!, lng: plannedShots[idx - 1].aim_lng! } : null)
              let distStr = ''
              if (origin && ps.aim_lat) distStr = `${Math.round(haversineYards(origin.lat, origin.lng, ps.aim_lat, ps.aim_lng!))}y`
              const prob = shotProbs[idx]
              const probStr = prob != null ? `${Math.round(prob * 100)}%` : ''
              const probColor = prob != null ? (prob >= 0.7 ? 'var(--accent)' : prob >= 0.4 ? 'var(--warning, #ff9800)' : 'var(--danger)') : ''

              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: '0.78rem' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: color, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.68rem', border: '2px dashed #fff', flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <span style={{ flex: 1 }}>{ps.club || '?'}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>{distStr}</span>
                  {probStr && <span style={{ color: probColor, fontSize: '0.68rem', fontWeight: 600 }}>{probStr}</span>}
                  <button onClick={() => handleDeleteShot(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.85rem', opacity: 0.6, padding: 0 }}>&times;</button>
                </div>
              )
            })}

            {/* Next shot */}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 8 }}>
              Next: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{shotTypeLabel[shotType]}</span>
            </div>

            {shotType === 'putt' ? (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                <label style={{ fontSize: '0.72rem' }}>Expected putts:</label>
                <input type="number" min={1} max={5} defaultValue={2} id="plan-putt-count" className={s.fieldInput} style={{ width: 50, textAlign: 'center', fontSize: '0.72rem' }} />
                <button className={s.actionBtn} style={{ fontSize: '0.72rem' }} onClick={() => {
                  const count = parseInt((document.getElementById('plan-putt-count') as HTMLInputElement)?.value) || 2
                  handleAddPutts(count)
                }}>Add Putts</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                <select className={s.fieldInput} style={{ flex: 1, fontSize: '0.72rem' }} value={selectedClub} onChange={(e) => setSelectedClub(e.target.value)}>
                  {filteredClubs.map((c) => (
                    <option key={c.club_type} value={c.club_type}>{c.club_type} ({Math.round(c.avg_yards)}y)</option>
                  ))}
                </select>
                <button className={s.actionBtn} style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }} disabled={aiming} onClick={() => handlePlaceShot(selectedClub)}>
                  {aiming ? 'Aiming... (Esc)' : selectedClub === 'Putter' ? 'Add Putt' : 'Place Shot'}
                </button>
              </div>
            )}
          </div>

          {/* Insights */}
          {insight && (
            <div className={s.section}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, marginBottom: 6, color: 'var(--accent)' }}>Insights</div>
              {insight.best_tee_club && (
                <div style={{ fontSize: '0.72rem', marginBottom: 3 }}>
                  Best tee club: <strong>{insight.best_tee_club.club}</strong> (avg {insight.best_tee_club.avg_score}{insight.best_tee_club.fw_pct != null ? `, ${insight.best_tee_club.fw_pct}% FW` : ''}, {insight.best_tee_club.rounds}x)
                </div>
              )}
              {insight.fairway_impact && insight.fairway_impact.savings > 0.3 && (
                <div style={{ fontSize: '0.72rem', marginBottom: 3 }}>
                  Hitting fairway saves <strong>{insight.fairway_impact.savings.toFixed(1)}</strong> strokes
                </div>
              )}
              {insight.scoring_dist && (
                <div style={{ fontSize: '0.72rem' }}>
                  {insight.scoring_dist.eagle > 0 && <span style={{ color: '#FFD700', marginRight: 4 }}>{insight.scoring_dist.eagle}E</span>}
                  {insight.scoring_dist.birdie > 0 && <span style={{ color: '#f44336', marginRight: 4 }}>{insight.scoring_dist.birdie}B</span>}
                  {insight.scoring_dist.par > 0 && <span style={{ color: 'var(--accent)', marginRight: 4 }}>{insight.scoring_dist.par}P</span>}
                  {insight.scoring_dist.bogey > 0 && <span style={{ color: '#42a5f5', marginRight: 4 }}>{insight.scoring_dist.bogey}Bo</span>}
                  {insight.scoring_dist.double_plus > 0 && <span style={{ color: '#7b1fa2' }}>{insight.scoring_dist.double_plus}D+</span>}
                </div>
              )}
            </div>
          )}

          {/* Round linking + actions */}
          <div className={s.section}>
            {currentPlan.round_id ? (
              <>
                <div style={{ fontSize: '0.72rem', color: 'var(--accent)', marginBottom: 6 }}>
                  Linked to round #{currentPlan.round_id}
                </div>
                <button className={s.ghostBtn} style={{ width: '100%', fontSize: '0.68rem', marginBottom: 4 }} onClick={handleUnlinkRound}>Unlink Round</button>
              </>
            ) : teeRounds.length > 0 ? (
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                <select id="plan-link-select" className={s.fieldInput} style={{ flex: 1, fontSize: '0.72rem' }}>
                  <option value="">Link to round...</option>
                  {teeRounds.map((r) => {
                    const d = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    return <option key={r.id} value={r.id}>{d} {r.total_strokes}({(r.score_vs_par ?? 0) >= 0 ? '+' : ''}{r.score_vs_par})</option>
                  })}
                </select>
                <button className={s.ghostBtn} style={{ fontSize: '0.68rem' }} onClick={() => {
                  const sel = document.getElementById('plan-link-select') as HTMLSelectElement
                  const id = parseInt(sel?.value)
                  if (id) handleLinkRound(id)
                }}>Link</button>
              </div>
            ) : null}
            <button className={s.ghostBtn} style={{ width: '100%', color: 'var(--danger)', fontSize: '0.68rem' }} onClick={handleDeletePlan}>Delete Plan</button>
          </div>
        </>
      )}
    </FloatingPanel>
  )
}
