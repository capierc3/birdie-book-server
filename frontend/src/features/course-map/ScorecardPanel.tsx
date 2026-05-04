import { useState, useCallback, useMemo } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap } from './courseMapState'
import { useCourseRounds } from './useCourseRounds'
import { computePersonalPars } from './personalPar'
import type { RoundDetail } from '../../api'
import { get } from '../../api'
import s from './panels.module.css'
import sc from './scorecard.module.css'

export function ScorecardPanel({ onClose }: { onClose: () => void }) {
  const ctx = useCourseMap()
  const { course, currentHole, teeId, viewMode, roundDetail, allRoundDetails, currentPlan } = ctx

  const { data: rounds = [] } = useCourseRounds(course?.id)
  const teeRounds = useMemo(() => rounds.filter((r) => r.tee_id === teeId), [rounds, teeId])

  const [loading, setLoading] = useState(false)

  // Lazy-load all round details for historic mode
  const loadAllRounds = useCallback(async () => {
    if (allRoundDetails.length > 0 || rounds.length === 0) return
    setLoading(true)
    const details: RoundDetail[] = []
    for (const r of rounds) {
      try { details.push(await get<RoundDetail>(`/rounds/${r.id}`)) } catch { /* skip */ }
    }
    ctx.setAllRoundDetails(details)
    setLoading(false)
  }, [rounds, allRoundDetails.length, ctx])

  // Load on first open
  useState(() => { loadAllRounds() })

  // Round selector change — updates shared context
  const handleRoundChange = useCallback(async (val: string) => {
    if (val === 'historic') {
      ctx.setViewMode('historic')
      ctx.setRoundDetail(null)
      await loadAllRounds()
    } else {
      const roundId = parseInt(val)
      ctx.setViewMode(roundId)
      let detail = allRoundDetails.find((r) => r.id === roundId)
      if (!detail) {
        try {
          detail = await get<RoundDetail>(`/rounds/${roundId}`)
          ctx.setAllRoundDetails([...allRoundDetails, detail])
        } catch { /* */ }
      }
      ctx.setRoundDetail(detail ?? null)
    }
  }, [loadAllRounds, allRoundDetails, ctx])

  // Compute historic scores
  const historicScores = useMemo(() => {
    const scores: Record<number, { best: number; avg: number; rounds: number; par: number }> = {}
    if (allRoundDetails.length === 0) return scores
    const tee = course?.tees?.find((t) => t.id === teeId)
    const courseHoles = tee?.holes || []
    const filtered = allRoundDetails.filter((r) => r.tee_id === teeId)
    const numHoles = course?.holes ?? 18
    for (let h = 1; h <= numHoles; h++) {
      const holeScores = filtered
        .flatMap((r) => r.holes || [])
        .filter((rh) => rh.hole_number === h && (rh.strokes ?? 0) > 0)
        .map((rh) => rh.strokes!)
      if (holeScores.length > 0) {
        const ch = courseHoles.find((c) => c.hole_number === h)
        scores[h] = {
          best: Math.min(...holeScores),
          avg: holeScores.reduce((a, b) => a + b, 0) / holeScores.length,
          rounds: holeScores.length,
          par: ch?.par || 0,
        }
      }
    }
    return scores
  }, [allRoundDetails, course, teeId])

  // Goals (localStorage)
  const getGoals = useCallback((): Record<number, number> => {
    if (!course) return {}
    try { return JSON.parse(localStorage.getItem(`birdie_book_goals_${course.id}`) || '{}') } catch { return {} }
  }, [course])

  const saveGoal = useCallback((holeNum: number, value: string) => {
    if (!course) return
    const goals = getGoals()
    if (value) goals[holeNum] = parseInt(value)
    else delete goals[holeNum]
    localStorage.setItem(`birdie_book_goals_${course.id}`, JSON.stringify(goals))
  }, [course, getGoals])

  const [manualGoals, setManualGoals] = useState<Record<number, number>>(() => getGoals())
  const [editingGoal, setEditingGoal] = useState<number | null>(null)

  // When a round plan is active, derive Goals from its shot counts (one row per
  // planned shot per hole). Otherwise fall back to the manual localStorage values.
  const planGoals = useMemo<Record<number, number>>(() => {
    if (!currentPlan) return {}
    const out: Record<number, number> = {}
    for (const h of currentPlan.holes || []) {
      const n = h.shots?.length || 0
      if (n > 0) out[h.hole_number] = n
    }
    return out
  }, [currentPlan])

  const goals = currentPlan ? planGoals : manualGoals
  const goalsFromPlan = !!currentPlan

  // When the active plan has a target round score, allocate personal par per hole
  // (same handicap-driven algorithm the mobile Play view uses). Falls back to
  // stock par when there's no goal — Goal cells just compare against par as before.
  const personalPars = useMemo<Map<number, number> | null>(() => {
    const tee = course?.tees?.find((t) => t.id === teeId)
    const goal = currentPlan?.score_goal
    if (!tee || !goal || goal <= 0) return null
    const holes = (tee.holes || []).map((h) => ({
      hole_number: h.hole_number,
      par: h.par || 0,
      handicap: h.handicap ?? null,
      yardage: h.yardage ?? null,
    }))
    if (holes.length === 0) return null
    return computePersonalPars(goal, holes).byHole
  }, [course, teeId, currentPlan?.score_goal])

  // Build scorecard data
  const tee = course?.tees?.find((t) => t.id === teeId)
  const courseHoles = tee?.holes || []
  const numHoles = courseHoles.length || course?.holes || 9
  const is18 = numHoles > 9

  const scoreData: Record<number, { strokes?: number; best?: number; avg?: number }> = {}
  if (viewMode === 'historic') {
    Object.entries(historicScores).forEach(([k, v]) => { scoreData[Number(k)] = v })
  } else if (roundDetail) {
    (roundDetail.holes || []).forEach((h) => { scoreData[h.hole_number] = { strokes: h.strokes ?? undefined } })
  }

  const scoreColor = (strokes: number, par: number) => {
    const diff = strokes - par
    if (diff <= -2) return sc.eagle
    if (diff === -1) return sc.birdie
    if (diff === 0) return sc.par
    if (diff === 1) return sc.bogey
    return sc.double
  }

  // Sums helper
  const sumRange = (arr: number[]) => arr.reduce((a, b) => a + b, 0)

  return (
    <FloatingPanel title="Scorecard" onClose={onClose} width={is18 ? 740 : 420}>
      {/* Selectors */}
      <div className={s.section} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className={s.teeFieldLabel}>Round</label>
          <select className={s.fieldInput} value={viewMode === 'historic' ? 'historic' : viewMode} onChange={(e) => handleRoundChange(e.target.value)}>
            <option value="historic">{loading ? 'Loading...' : `Historic (${teeRounds.length} round${teeRounds.length !== 1 ? 's' : ''})`}</option>
            {teeRounds.map((r) => {
              const d = new Date(r.date)
              const label = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${r.total_strokes ?? ''}(${(r.score_vs_par ?? 0) >= 0 ? '+' : ''}${r.score_vs_par ?? ''})`
              return <option key={r.id} value={r.id}>{label}</option>
            })}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label className={s.teeFieldLabel}>Tee</label>
          <select className={s.fieldInput} value={teeId ?? ''} onChange={(e) => ctx.setTeeId(Number(e.target.value))}>
            {(course?.tees || []).map((t) => <option key={t.id} value={t.id}>{t.tee_name} ({t.total_yards || '?'}yd)</option>)}
          </select>
        </div>
      </div>

      {/* Scorecard table */}
      <div className={s.section} style={{ overflowX: 'auto', padding: '8px 0' }}>
        <table className={sc.table}>
          <tbody>
            {/* Hole row */}
            <tr className={sc.headerRow}>
              <td className={sc.label}>Hole</td>
              {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => (
                <>
                  {is18 && n === 10 && <td key="out" className={sc.total}>OUT</td>}
                  <td key={n} className={`${sc.cell} ${n === currentHole ? sc.activeCell : ''}`} style={{ cursor: 'pointer' }} onClick={() => ctx.selectHole(n)}>{n}</td>
                </>
              ))}
              <td className={sc.total}>{is18 ? 'IN' : 'OUT'}</td>
              {is18 && <td className={sc.total}>TOT</td>}
            </tr>

            {/* Yds row */}
            <tr className={sc.yardRow}>
              <td className={sc.label}>Yds</td>
              {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => {
                const ch = courseHoles.find((h) => h.hole_number === n)
                return (
                  <>
                    {is18 && n === 10 && <td key="out" className={sc.total}>{sumRange(courseHoles.filter((h) => h.hole_number <= 9).map((h) => h.yardage || 0)) || ''}</td>}
                    <td key={n} className={sc.cell}>{ch?.yardage || ''}</td>
                  </>
                )
              })}
              <td className={sc.total}>{sumRange(courseHoles.filter((h) => is18 ? h.hole_number > 9 : true).map((h) => h.yardage || 0)) || ''}</td>
              {is18 && <td className={sc.total}>{sumRange(courseHoles.map((h) => h.yardage || 0)) || ''}</td>}
            </tr>

            {/* Par row */}
            <tr className={sc.parRow}>
              <td className={sc.label}>Par</td>
              {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => {
                const ch = courseHoles.find((h) => h.hole_number === n)
                return (
                  <>
                    {is18 && n === 10 && <td key="out" className={sc.total}>{sumRange(courseHoles.filter((h) => h.hole_number <= 9).map((h) => h.par || 0)) || ''}</td>}
                    <td key={n} className={sc.cell}>{ch?.par || ''}</td>
                  </>
                )
              })}
              <td className={sc.total}>{sumRange(courseHoles.filter((h) => is18 ? h.hole_number > 9 : true).map((h) => h.par || 0)) || ''}</td>
              {is18 && <td className={sc.total}>{sumRange(courseHoles.map((h) => h.par || 0)) || ''}</td>}
            </tr>

            {/* HCP row — repurposed as "Goal Par" when the active plan has a score goal:
                shows allocated par with delta, e.g. "5(+2)" for a par-3 hole that
                got 2 extra strokes. Falls back to stock HCP index otherwise. */}
            <tr className={sc.hcpRow}>
              <td
                className={sc.label}
                title={personalPars
                  ? `Goal Par per hole, allocated by handicap from your plan's score goal of ${currentPlan?.score_goal}`
                  : 'Handicap difficulty index (1 = hardest)'
                }
              >
                {personalPars ? 'GP' : 'HCP'}
              </td>
              {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => {
                const ch = courseHoles.find((h) => h.hole_number === n)
                let cellContent: string = ''
                let deltaClass = ''
                if (personalPars) {
                  const ppar = personalPars.get(n)
                  const par = ch?.par || 0
                  if (ppar != null && par) {
                    const delta = ppar - par
                    const sign = delta > 0 ? '+' : delta < 0 ? '' : '±'
                    cellContent = delta === 0 ? `${ppar}` : `${ppar}(${sign}${delta})`
                    // Color the cell by how many extra strokes the goal allocates
                    // here — same scale used by the Score row, so a "+2" hole reads
                    // red (lots of cushion), "+1" yellow, "0" green.
                    deltaClass = scoreColor(ppar, par)
                  }
                } else {
                  cellContent = ch?.handicap ? String(ch.handicap) : ''
                }
                const cellClasses = personalPars
                  ? `${sc.cell} ${sc.gpCell} ${deltaClass}`
                  : sc.cell
                return (
                  <>
                    {is18 && n === 10 && (
                      <td key="out" className={sc.total}>
                        {personalPars
                          ? sumRange(Array.from({ length: 9 }, (_, i) => personalPars.get(i + 1) || 0)) || ''
                          : ''}
                      </td>
                    )}
                    <td
                      key={n}
                      className={cellClasses}
                      style={{ fontSize: personalPars && cellContent.length > 2 ? '0.72rem' : undefined }}
                    >
                      {cellContent}
                    </td>
                  </>
                )
              })}
              <td className={sc.total}>
                {personalPars
                  ? sumRange(Array.from({ length: numHoles }, (_, i) => personalPars.get(i + 1) || 0).slice(is18 ? 9 : 0)) || ''
                  : ''}
              </td>
              {is18 && (
                <td className={sc.total}>
                  {personalPars
                    ? sumRange(Array.from({ length: 18 }, (_, i) => personalPars.get(i + 1) || 0)) || ''
                    : ''}
                </td>
              )}
            </tr>

            {/* Goal row */}
            <tr className={sc.goalRow}>
              <td className={sc.label} title={goalsFromPlan ? `From active plan: ${currentPlan?.name}` : undefined}>
                Goal{goalsFromPlan ? ' *' : ''}
              </td>
              {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => {
                const g = goals[n]
                const ch = courseHoles.find((h) => h.hole_number === n)
                const stockPar = ch?.par || 0
                // When a score goal is active, color cells against the personal par
                // for that hole (so a planned 5 on a goal-par-5 hole reads as "par"
                // even though stock par is 3). Otherwise compare to stock par as before.
                const refPar = personalPars?.get(n) ?? stockPar
                const cls = g && refPar ? scoreColor(g, refPar) : ''
                const cellTitle = goalsFromPlan
                  ? (g
                      ? `${g} planned shot${g === 1 ? '' : 's'}${personalPars ? ` vs goal par ${refPar}` : ''}`
                      : 'No shots planned for this hole')
                  : undefined
                return (
                  <>
                    {is18 && n === 10 && <td key="out" className={sc.total}>{sumRange(Object.entries(goals).filter(([k]) => Number(k) <= 9).map(([, v]) => v)) || ''}</td>}
                    <td
                      key={n}
                      className={`${sc.cell} ${cls} ${sc.goalCell}`}
                      title={cellTitle}
                      style={goalsFromPlan ? { cursor: 'default', opacity: g ? 1 : 0.4 } : undefined}
                      onClick={() => { if (!goalsFromPlan) setEditingGoal(n) }}
                    >
                      {editingGoal === n && !goalsFromPlan ? (
                        <input
                          type="number" min={1} max={12} autoFocus
                          className={sc.goalInput}
                          defaultValue={g || ''}
                          onBlur={(e) => { saveGoal(n, e.target.value); setManualGoals(getGoals()); setEditingGoal(null) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingGoal(null) }}
                        />
                      ) : (g || '')}
                    </td>
                  </>
                )
              })}
              <td className={sc.total}>{sumRange(Object.entries(goals).filter(([k]) => is18 ? Number(k) > 9 : true).map(([, v]) => v)) || ''}</td>
              {is18 && <td className={sc.total}>{sumRange(Object.values(goals)) || ''}</td>}
            </tr>

            {/* Score/Best row */}
            <tr className={sc.scoreRow}>
              <td className={sc.label}>{viewMode === 'historic' ? 'Best' : 'Score'}</td>
              {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => {
                const sd = scoreData[n]
                const ch = courseHoles.find((h) => h.hole_number === n)
                const par = ch?.par || 0
                const strokes = viewMode === 'historic' ? sd?.best : sd?.strokes
                const cls = strokes && par ? scoreColor(strokes, par) : ''
                return (
                  <>
                    {is18 && n === 10 && <td key="out" className={sc.total}>{/* front 9 sum */}</td>}
                    <td key={n} className={`${sc.cell} ${cls} ${n === currentHole ? sc.activeCell : ''}`} style={{ cursor: 'pointer' }} onClick={() => ctx.selectHole(n)}>
                      {strokes || ''}
                    </td>
                  </>
                )
              })}
              <td className={sc.total} />
              {is18 && <td className={sc.total} />}
            </tr>

            {/* Avg row (historic only) */}
            {viewMode === 'historic' && Object.keys(historicScores).length > 0 && (
              <tr className={sc.avgRow}>
                <td className={sc.label}>Avg</td>
                {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => {
                  const hs = historicScores[n]
                  return (
                    <>
                      {is18 && n === 10 && <td key="out" className={sc.total} />}
                      <td key={n} className={sc.cell}>{hs?.avg ? hs.avg.toFixed(1) : ''}</td>
                    </>
                  )
                })}
                <td className={sc.total} />
                {is18 && <td className={sc.total} />}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </FloatingPanel>
  )
}
