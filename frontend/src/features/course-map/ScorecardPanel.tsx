import { useState, useCallback, useMemo } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap } from './courseMapState'
import { useCourseRounds } from './useCourseRounds'
import type { RoundDetail } from '../../api'
import { get } from '../../api'
import s from './panels.module.css'
import sc from './scorecard.module.css'

export function ScorecardPanel({ onClose }: { onClose: () => void }) {
  const ctx = useCourseMap()
  const { course, currentHole, teeId, viewMode, roundDetail, allRoundDetails } = ctx

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

  const [goals, setGoals] = useState<Record<number, number>>(() => getGoals())
  const [editingGoal, setEditingGoal] = useState<number | null>(null)

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

            {/* HCP row */}
            <tr className={sc.hcpRow}>
              <td className={sc.label}>HCP</td>
              {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => {
                const ch = courseHoles.find((h) => h.hole_number === n)
                return (
                  <>
                    {is18 && n === 10 && <td key="out" className={sc.total} />}
                    <td key={n} className={sc.cell}>{ch?.handicap || ''}</td>
                  </>
                )
              })}
              <td className={sc.total} />
              {is18 && <td className={sc.total} />}
            </tr>

            {/* Goal row */}
            <tr className={sc.goalRow}>
              <td className={sc.label}>Goal</td>
              {Array.from({ length: numHoles }, (_, i) => i + 1).map((n) => {
                const g = goals[n]
                const ch = courseHoles.find((h) => h.hole_number === n)
                const par = ch?.par || 0
                const cls = g && par ? scoreColor(g, par) : ''
                return (
                  <>
                    {is18 && n === 10 && <td key="out" className={sc.total}>{sumRange(Object.entries(goals).filter(([k]) => Number(k) <= 9).map(([, v]) => v)) || ''}</td>}
                    <td key={n} className={`${sc.cell} ${cls} ${sc.goalCell}`} onClick={() => setEditingGoal(n)}>
                      {editingGoal === n ? (
                        <input
                          type="number" min={1} max={12} autoFocus
                          className={sc.goalInput}
                          defaultValue={g || ''}
                          onBlur={(e) => { saveGoal(n, e.target.value); setGoals(getGoals()); setEditingGoal(null) }}
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
