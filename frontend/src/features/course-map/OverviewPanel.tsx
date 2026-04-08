import { useMemo } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap } from './courseMapState'
import { classifySgCategory } from './clubColors'
import s from './panels.module.css'

export function OverviewPanel({ onClose }: { onClose: () => void }) {
  const ctx = useCourseMap()
  const { course, currentHole, teeId, viewMode, roundDetail, allRoundDetails } = ctx

  const tee = course?.tees?.find((t) => t.id === teeId)
  const courseHoles = tee?.holes || []
  const ch = courseHoles.find((h) => h.hole_number === currentHole)
  const par = ch?.par || 0
  const teeRounds = useMemo(() => allRoundDetails.filter((r) => r.tee_id === teeId), [allRoundDetails, teeId])
  const isHistoric = viewMode === 'historic'

  // Historic scores (used by both modes for comparison)
  const historicScores = useMemo(() => {
    const scores: Record<number, { best: number; avg: number; rounds: number; par: number }> = {}
    const numHoles = course?.holes ?? 18
    for (let h = 1; h <= numHoles; h++) {
      const holeScores = teeRounds
        .flatMap((r) => r.holes || [])
        .filter((rh) => rh.hole_number === h && (rh.strokes ?? 0) > 0)
        .map((rh) => rh.strokes!)
      if (holeScores.length > 0) {
        const hd = courseHoles.find((c) => c.hole_number === h)
        scores[h] = {
          best: Math.min(...holeScores),
          avg: holeScores.reduce((a, b) => a + b, 0) / holeScores.length,
          rounds: holeScores.length,
          par: hd?.par || 0,
        }
      }
    }
    return scores
  }, [teeRounds, course, courseHoles])

  const hs = historicScores[currentHole]

  // ── Round mode ──
  const renderRound = () => {
    if (!roundDetail) {
      return <div className={s.emptyText}>No round selected</div>
    }

    const rh = (roundDetail.holes || []).find((h) => h.hole_number === currentHole)
    if (!rh) {
      return (
        <>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 8 }}>Hole {currentHole} — Par {par}</div>
          <div className={s.emptyText}>No data for this hole in selected round</div>
        </>
      )
    }

    // Score
    const scoreDiff = (rh.strokes ?? 0) - par
    const scoreColor = scoreDiff <= -2 ? '#FFD700' : scoreDiff === -1 ? '#f44336' : scoreDiff === 0 ? 'var(--accent)' : scoreDiff === 1 ? '#42a5f5' : '#7b1fa2'
    const scoreStr = `${rh.strokes} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`

    // Vs avg comparison
    let vsAvgStr = ''
    let vsAvgColor = 'var(--text-muted)'
    let verdictLabel = ''
    let verdictColor = ''
    if (hs) {
      const vsAvg = (rh.strokes ?? 0) - hs.avg
      vsAvgStr = `${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(1)} vs avg`
      vsAvgColor = vsAvg <= -0.5 ? 'var(--accent)' : vsAvg >= 0.5 ? 'var(--danger)' : 'var(--text-muted)'
      if (vsAvg <= -1) { verdictLabel = 'Great hole'; verdictColor = '#22c55e' }
      else if (vsAvg <= -0.3) { verdictLabel = 'Above average'; verdictColor = '#22c55e' }
      else if (vsAvg >= 1) { verdictLabel = 'Below average'; verdictColor = '#ef4444' }
      else { verdictLabel = 'Average'; verdictColor = '#3b82f6' }
    }

    // Putts vs avg
    let puttsComp = ''
    const allPuttsAvg = teeRounds.map((r) => (r.holes || []).find((h) => h.hole_number === currentHole)?.putts).filter((p): p is number => p != null)
    if (allPuttsAvg.length > 0 && rh.putts != null) {
      const pAvg = allPuttsAvg.reduce((a, b) => a + b, 0) / allPuttsAvg.length
      const pDiff = rh.putts - pAvg
      const pColor = pDiff <= -0.3 ? 'var(--accent)' : pDiff >= 0.3 ? 'var(--danger)' : 'var(--text-muted)'
      puttsComp = ` (${pDiff >= 0 ? '+' : ''}${pDiff.toFixed(1)} avg)`
      puttsComp = `<span style="color:${pColor}; font-size:0.72rem;">${puttsComp}</span>`
    }

    // SG totals + breakdown
    let sgPga = 0
    let sgPersonal = 0
    let sgCount = 0
    const sgByType: Record<string, number> = {}
    const catLabels: Record<string, string> = { off_the_tee: 'Tee', approach: 'Approach', short_game: 'Short Game', putting: 'Putting' }
    for (const shot of rh.shots || []) {
      if (shot.sg_pga != null) {
        sgPga += shot.sg_pga
        sgCount++
        const cat = classifySgCategory(shot, par)
        if (cat) sgByType[cat] = (sgByType[cat] || 0) + shot.sg_pga
      }
      if (shot.sg_personal != null) sgPersonal += shot.sg_personal
    }

    // Round date
    const roundDate = roundDetail.date
      ? new Date(roundDetail.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : ''

    return (
      <>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Hole {currentHole} — Par {par}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 10 }}>
          {roundDate} · {roundDetail.total_strokes}({(roundDetail.score_vs_par ?? 0) >= 0 ? '+' : ''}{roundDetail.score_vs_par})
        </div>

        <div className={s.statsGrid}>
          {/* Score with verdict */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Score</span>
            <span>
              <span style={{ fontWeight: 700, color: scoreColor }}>{scoreStr}</span>
              {vsAvgStr && <span style={{ color: vsAvgColor, fontSize: '0.72rem', marginLeft: 4 }}>({vsAvgStr})</span>}
              {verdictLabel && <span style={{ background: `${verdictColor}1a`, color: verdictColor, padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', marginLeft: 4 }}>{verdictLabel}</span>}
            </span>
          </div>

          <Stat label="Putts" value={`${rh.putts ?? '—'}`} extra={puttsComp} />
          <Stat label="Fairway" value={rh.fairway || '—'} />
          {rh.gir != null && <Stat label="GIR" value={rh.gir ? 'Yes' : 'No'} color={rh.gir ? 'var(--accent)' : 'var(--danger)'} />}
          {(rh.penalty_strokes ?? 0) > 0 && <Stat label="Penalties" value={`${rh.penalty_strokes}`} color="var(--danger)" />}
          {sgCount > 0 && <Stat label="SG vs PGA" value={sgPga.toFixed(2)} color={sgPga >= 0 ? 'var(--accent)' : 'var(--danger)'} />}
          {sgCount > 0 && <Stat label="SG vs Personal" value={sgPersonal.toFixed(2)} color={sgPersonal >= 0 ? 'var(--accent)' : 'var(--danger)'} />}
          {hs && <Stat label="Hole Avg" value={hs.avg.toFixed(1)} />}
          {hs && <Stat label="Hole Best" value={`${hs.best}`} />}
        </div>

        {/* SG breakdown */}
        {sgCount > 0 && (
          <div style={{ fontSize: '0.72rem', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            {Object.entries(sgByType).map(([cat, v]) => (
              <span key={cat} style={{ color: v >= 0 ? 'var(--accent)' : 'var(--danger)', marginRight: 6 }}>
                {catLabels[cat]}: {v.toFixed(2)}
              </span>
            ))}
          </div>
        )}

        {/* Hints */}
        {(() => {
          const hints: string[] = []
          if (sgCount === 0) {
            if (!ch?.tee_lat) hints.push('Add tee GPS position for strokes gained data')
            else if (!ch?.flag_lat) hints.push('Add green GPS position for strokes gained data')
            else hints.push('Recalculate shots to generate strokes gained data')
          }
          if (!rh.gir) hints.push('No GIR data available')
          return hints.length > 0 ? (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
              {hints.map((h, i) => <div key={i} style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: 2 }}>* {h}</div>)}
            </div>
          ) : null
        })()}
      </>
    )
  }

  // ── Historic mode ──
  const renderHistoric = () => {
    if (teeRounds.length === 0) {
      return <div className={s.emptyText}>No rounds on this tee</div>
    }

    // Putts
    const allPutts = teeRounds.map((r) => (r.holes || []).find((h) => h.hole_number === currentHole)?.putts).filter((p): p is number => p != null)
    const avgPutts = allPutts.length > 0 ? (allPutts.reduce((a, b) => a + b, 0) / allPutts.length).toFixed(1) : '—'

    // Fairway
    const allFw = teeRounds.map((r) => (r.holes || []).find((h) => h.hole_number === currentHole)?.fairway).filter((f): f is string => f != null)
    const fwHits = allFw.filter((f) => f === 'HIT').length
    const fwLeft = allFw.filter((f) => f === 'LEFT').length
    const fwRight = allFw.filter((f) => f === 'RIGHT').length
    const fwTotal = allFw.length
    const fwPct = fwTotal > 0 ? Math.round((fwHits / fwTotal) * 100) : null

    // Top tee club
    const teeShots = teeRounds.flatMap((r) => (r.holes || []).find((h) => h.hole_number === currentHole)?.shots || []).filter((sh) => sh.shot_number === 1 && sh.club)
    const clubCounts: Record<string, number> = {}
    teeShots.forEach((sh) => { if (sh.club) clubCounts[sh.club] = (clubCounts[sh.club] || 0) + 1 })
    const topClub = Object.entries(clubCounts).sort((a, b) => b[1] - a[1])[0]

    // Avg drive
    const driveYards = teeShots.filter((sh) => sh.distance_yards).map((sh) => sh.distance_yards!)
    const avgDrive = driveYards.length > 0 ? Math.round(driveYards.reduce((a, b) => a + b, 0) / driveYards.length) : null

    // Miss tendency
    let missTendency = ''
    if (fwTotal >= 3) {
      const leftPct = Math.round((fwLeft / fwTotal) * 100)
      const rightPct = Math.round((fwRight / fwTotal) * 100)
      if (leftPct >= 50) missTendency = `${leftPct}% left`
      else if (rightPct >= 50) missTendency = `${rightPct}% right`
    }

    // GIR
    const allGir = teeRounds.map((r) => (r.holes || []).find((h) => h.hole_number === currentHole)?.gir).filter((g): g is boolean => g != null)
    const girHits = allGir.filter((g) => g).length
    const girPct = allGir.length > 0 ? Math.round((girHits / allGir.length) * 100) : null

    // Scoring distribution
    const allScores = teeRounds.map((r) => (r.holes || []).find((h) => h.hole_number === currentHole)).filter((rh) => rh && (rh.strokes ?? 0) > 0)
    const buckets = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 }
    if (par > 0) {
      allScores.forEach((rh) => {
        const d = (rh!.strokes ?? 0) - par
        if (d <= -2) buckets.eagle++
        else if (d === -1) buckets.birdie++
        else if (d === 0) buckets.par++
        else if (d === 1) buckets.bogey++
        else buckets.double++
      })
    }

    // SG by category
    const allShots = teeRounds.flatMap((r) => (r.holes || []).find((h) => h.hole_number === currentHole)?.shots || [])
    const sgByType: Record<string, { total: number; count: number }> = {}
    allShots.forEach((sh) => {
      if (sh.sg_pga != null) {
        const cat = classifySgCategory(sh, par)
        if (cat) {
          if (!sgByType[cat]) sgByType[cat] = { total: 0, count: 0 }
          sgByType[cat].total += sh.sg_pga
          sgByType[cat].count++
        }
      }
    })
    const catLabels: Record<string, string> = { off_the_tee: 'Tee', approach: 'Approach', short_game: 'Short Game', putting: 'Putting' }

    // Difficulty rank
    let difficultyRank = ''
    if (Object.keys(historicScores).length > 1 && hs) {
      const ranked = Object.entries(historicScores)
        .map(([h, data]) => ({ hole: Number(h), vspar: data.avg - data.par }))
        .sort((a, b) => b.vspar - a.vspar)
      const pos = ranked.findIndex((r) => r.hole === currentHole) + 1
      const total = ranked.length
      if (pos === 1) difficultyRank = 'Hardest hole'
      else if (pos === total) difficultyRank = 'Easiest hole'
      else difficultyRank = `#${pos}/${total} difficulty`
    }

    const bestDiff = hs ? hs.best - par : 0
    const avgDiff = hs ? hs.avg - par : 0

    return (
      <>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 2 }}>
          Hole {currentHole} — Par {par}
          {difficultyRank && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>{difficultyRank}</span>}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 10 }}>
          {teeRounds.length} round{teeRounds.length !== 1 ? 's' : ''}
        </div>

        <div className={s.statsGrid}>
          {hs && <Stat label="Best" value={`${hs.best} (${bestDiff >= 0 ? '+' : ''}${bestDiff})`} color={bestDiff <= 0 ? 'var(--accent)' : 'var(--danger)'} />}
          {hs && <Stat label="Average" value={`${hs.avg.toFixed(1)} (${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)})`} color={avgDiff <= 0 ? 'var(--accent)' : avgDiff <= 0.5 ? 'var(--text)' : 'var(--danger)'} />}
          <Stat label="Avg Putts" value={avgPutts} />
          {girPct !== null && <Stat label="GIR" value={`${girPct}% (${girHits}/${allGir.length})`} color={girPct >= 50 ? 'var(--accent)' : 'var(--warning)'} />}
          {fwPct !== null && <Stat label="Fairway" value={`${fwPct}% (${fwHits}/${fwTotal})`} />}
          {missTendency && <Stat label="Miss Tendency" value={missTendency} color="var(--warning)" />}
          {topClub && <Stat label="Tee Club" value={`${topClub[0]} (${topClub[1]}x)`} />}
          {avgDrive != null && <Stat label="Avg Drive" value={`${avgDrive}y`} />}
        </div>

        {allScores.length > 0 && par > 0 && (
          <div style={{ fontSize: '0.72rem', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            {buckets.eagle > 0 && <span style={{ color: '#FFD700', marginRight: 6 }}>{buckets.eagle} eagle</span>}
            {buckets.birdie > 0 && <span style={{ color: '#f44336', marginRight: 6 }}>{buckets.birdie} birdie</span>}
            {buckets.par > 0 && <span style={{ color: 'var(--accent)', marginRight: 6 }}>{buckets.par} par</span>}
            {buckets.bogey > 0 && <span style={{ color: '#42a5f5', marginRight: 6 }}>{buckets.bogey} bogey</span>}
            {buckets.double > 0 && <span style={{ color: '#7b1fa2' }}>{buckets.double} double+</span>}
          </div>
        )}

        {Object.keys(sgByType).length > 0 && (
          <div style={{ fontSize: '0.72rem', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            Avg SG: {Object.entries(sgByType).map(([cat, d]) => {
              const avg = d.total / teeRounds.length
              return <span key={cat} style={{ color: avg >= 0 ? 'var(--accent)' : 'var(--danger)', marginRight: 6 }}>{catLabels[cat]}: {avg.toFixed(2)}</span>
            })}
          </div>
        )}
      </>
    )
  }

  return (
    <FloatingPanel title="Hole Overview" onClose={onClose} width={300}>
      <div className={s.section} style={{ padding: '10px 12px' }}>
        {isHistoric ? renderHistoric() : renderRound()}
      </div>
    </FloatingPanel>
  )
}

function Stat({ label, value, color, extra }: { label: string; value: string; color?: string; extra?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.78rem' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span>
        <span style={{ fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
        {extra && <span dangerouslySetInnerHTML={{ __html: extra }} />}
      </span>
    </div>
  )
}
