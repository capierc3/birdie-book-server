import { useState, useCallback, useMemo } from 'react'
import { useMobileMap } from '../MobileMapContext'
import { useCourseRounds } from '../../useCourseRounds'
import { get } from '../../../../api'
import type { RoundDetail } from '../../../../api'
import { RoundScorecard } from '../../../rounds/RoundScorecard'
import { ResponsiveSelect } from '../../../../components'
import s from './tabs.module.css'
import sc from '../../../rounds/RoundScorecard.module.css'

export function ScorecardTab() {
  const ctx = useMobileMap()
  const { course, courseId, currentHole, teeId, viewMode, roundDetail, allRoundDetails } = ctx

  const { data: rounds = [] } = useCourseRounds(courseId)
  const teeRounds = useMemo(() => rounds.filter((r) => r.tee_id === teeId), [rounds, teeId])

  const [loading, setLoading] = useState(false)

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

  useState(() => { loadAllRounds() })

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

  // Build parMap from course tee data
  const tee = course?.tees?.find((t) => t.id === teeId)
  const parMap = useMemo(() => {
    const map: Record<number, number> = {}
    for (const h of tee?.holes || []) {
      if (h.par) map[h.hole_number] = h.par
    }
    return map
  }, [tee])

  // Historic mode: build synthetic "best" holes + avg map
  const { historicHoles, avgMap: historicAvgMap } = useMemo(() => {
    if (allRoundDetails.length === 0) return { historicHoles: [], avgMap: {} as Record<number, number> }
    const filtered = allRoundDetails.filter((r) => r.tee_id === teeId)
    const numHoles = course?.holes ?? 18
    const result: { hole_number: number; strokes: number | null; putts: number | null }[] = []
    const avg: Record<number, number> = {}
    for (let h = 1; h <= numHoles; h++) {
      const holeScores = filtered
        .flatMap((r) => r.holes || [])
        .filter((rh) => rh.hole_number === h && (rh.strokes ?? 0) > 0)
      if (holeScores.length > 0) {
        const best = holeScores.reduce((a, b) => (a.strokes! < b.strokes! ? a : b))
        result.push({ hole_number: h, strokes: best.strokes ?? null, putts: best.putts ?? null })
        avg[h] = holeScores.reduce((s, rh) => s + rh.strokes!, 0) / holeScores.length
      }
    }
    return { historicHoles: result, avgMap: avg }
  }, [allRoundDetails, course, teeId])

  // Which holes to render
  const displayHoles = viewMode === 'historic'
    ? historicHoles
    : (roundDetail?.holes || [])

  const roundOptions = useMemo(() => {
    const opts = [{
      value: 'historic',
      label: loading ? 'Loading...' : `Historic (${teeRounds.length} round${teeRounds.length !== 1 ? 's' : ''})`,
    }]
    for (const r of teeRounds) {
      const d = new Date(r.date)
      const label = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${r.total_strokes ?? ''}(${(r.score_vs_par ?? 0) >= 0 ? '+' : ''}${r.score_vs_par ?? ''})`
      opts.push({ value: String(r.id), label })
    }
    return opts
  }, [teeRounds, loading])

  return (
    <div>
      {/* Round selector */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Round</div>
        <ResponsiveSelect
          value={viewMode === 'historic' ? 'historic' : String(viewMode)}
          onChange={handleRoundChange}
          options={roundOptions}
          title="Select round"
        />
      </div>

      {/* Scorecard — reuse RoundScorecard's stacked front/back 9 */}
      <div className={s.section}>
        {displayHoles.length > 0 ? (
          <RoundScorecard holes={displayHoles as any} parMap={parMap} avgMap={viewMode === 'historic' ? historicAvgMap : undefined} />
        ) : (
          <div className={s.hint} style={{ padding: '16px 0', textAlign: 'center' }}>
            {loading ? 'Loading round data...' : 'No scorecard data available'}
          </div>
        )}
      </div>
    </div>
  )
}
