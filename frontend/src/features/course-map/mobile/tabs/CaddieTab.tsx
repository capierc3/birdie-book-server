import { useMemo } from 'react'
import { useMobileMap } from '../MobileMapContext'
import { haversineYards } from '../../geoUtils'
import { determineShotContext, getTeeClubTarget, rankClubs, findNearbyHazards } from '../../caddieCalc'
import type { ShotContext } from '../../caddieCalc'
import { classifySgCategory } from '../../clubColors'
import s from './tabs.module.css'

interface InsightItem {
  label: string
  value: string
  cls: '' | 'good' | 'warning' | 'danger'
  header?: string
  sub?: string        // secondary text shown in muted color
  tag?: string        // badge label
  tagColor?: string   // badge color
}

export function CaddieTab() {
  const ctx = useMobileMap()
  const { strategy, gps, teePos, greenPos, hazards, formValues, allRoundDetails, teeId, currentHole, course, viewMode, roundDetail } = ctx
  const player = strategy?.player
  const par = parseInt(formValues.par) || 4
  const yardage = parseInt(formValues.yardage) || 0

  const items = useMemo(() => {
    if (!player?.clubs?.length) return [{ label: 'No player data', value: 'Import rounds first', cls: '' as const }]
    if (!yardage) return [{ label: 'Add yardage', value: 'Edit tab to set hole data', cls: '' as const }]

    const clubs = player.clubs

    // Determine distance to green (from GPS or from tee)
    const hasGps = gps.lat != null && gps.lng != null
    const origin = hasGps ? { lat: gps.lat!, lng: gps.lng! } : teePos
    const distToGreen = (origin && greenPos)
      ? Math.round(haversineYards(origin.lat, origin.lng, greenPos.lat, greenPos.lng))
      : yardage

    // Determine context using shared function
    const context: ShotContext = hasGps && greenPos
      ? determineShotContext(distToGreen, true)
      : 'tee'

    const result: InsightItem[] = []
    const contextLabels: Record<ShotContext, string> = {
      tee: 'From the Tee',
      approach: 'Approach Shot',
      short_game: 'Short Game',
      green: 'On the Green',
    }

    result.push({
      label: hasGps ? `${distToGreen}y to green` : `${yardage}y hole`,
      value: `Par ${par}`,
      cls: '',
      header: contextLabels[context],
    })

    if (context === 'tee') {
      const targetDist = getTeeClubTarget(par, yardage)
      const ranked = rankClubs(clubs, targetDist, { count: 1 })
      const bestClub = ranked[0]

      if (bestClub) {
        const remaining = yardage - bestClub.avg
        result.push({ label: par === 3 ? 'Club to green' : 'Club off tee', value: `${bestClub.type} (${Math.round(bestClub.avg)}y)`, cls: 'good' })
        if (par !== 3 && remaining > 0) {
          const approachRanked = rankClubs(clubs, remaining, { count: 1 })
          if (approachRanked[0]) {
            result.push({ label: 'Then approach', value: `${approachRanked[0].type} (${Math.round(remaining)}y left)`, cls: '' })
          }
        }
      }

      // Scoring average
      const parAvg = (player.scoring as Record<string, number> | undefined)?.[`par${par}_avg`]
      if (parAvg) {
        const diff = parAvg - par
        result.push({ label: `Avg on par ${par}s`, value: `${parAvg} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`, cls: diff <= 0 ? 'good' : diff <= 1 ? 'warning' : 'danger' })
      }

      // FW% and GIR%
      const scoring = player.scoring as Record<string, number> | undefined
      if (scoring?.fw_pct != null) result.push({ label: 'Fairway %', value: `${Math.round(scoring.fw_pct)}%`, cls: scoring.fw_pct >= 50 ? 'good' : 'warning' })
      if (scoring?.gir_pct != null) result.push({ label: 'GIR %', value: `${Math.round(scoring.gir_pct)}%`, cls: scoring.gir_pct >= 40 ? 'good' : 'warning' })

      // Miss tendency
      if (bestClub && player.miss_tendencies) {
        const miss = player.miss_tendencies[bestClub.type]
        if (miss && miss.total_shots >= 5) {
          const dominant = miss.left_pct > miss.right_pct ? 'left' : 'right'
          const pct = Math.max(miss.left_pct, miss.right_pct)
          if (pct > 55) result.push({ label: `${bestClub.type} miss`, value: `${pct}% ${dominant}`, cls: pct > 70 ? 'danger' : 'warning' })
        }
      }

    } else if (context === 'approach') {
      const ranked = rankClubs(clubs, distToGreen, { count: 2, excludeDriver: true })
      if (ranked[0]) {
        result.push({ label: 'Recommended', value: `${ranked[0].type} (${Math.round(ranked[0].avg)}y, ${ranked[0].delta >= 0 ? '+' : ''}${ranked[0].delta}y)`, cls: 'good' })
      }
      if (ranked[1]) {
        result.push({ label: 'Alternative', value: `${ranked[1].type} (${Math.round(ranked[1].avg)}y, ${ranked[1].delta >= 0 ? '+' : ''}${ranked[1].delta}y)`, cls: '' })
      }

      if (ranked[0] && player.miss_tendencies) {
        const miss = player.miss_tendencies[ranked[0].type]
        if (miss && miss.total_shots >= 5) {
          const dominant = miss.left_pct > miss.right_pct ? 'left' : 'right'
          const pct = Math.max(miss.left_pct, miss.right_pct)
          if (pct > 55) result.push({ label: `${ranked[0].type} miss`, value: `${pct}% ${dominant}`, cls: pct > 70 ? 'danger' : 'warning' })
        }
      }

      // Find the actual club object for dispersion data
      const bestClubObj = clubs.find(c => c.club_type === ranked[0]?.type)
      if (bestClubObj?.std_dev) {
        result.push({ label: 'Dispersion', value: `±${Math.round(bestClubObj.std_dev)}y`, cls: '' })
        const lat = player.lateral_dispersion?.[bestClubObj.club_type]
        if (lat?.lateral_std_dev) result.push({ label: 'Lateral', value: `±${Math.round(lat.lateral_std_dev)}y`, cls: '' })
      }

      if (player.sg_categories?.APPROACH) {
        const sg = player.sg_categories.APPROACH
        result.push({ label: 'Approach SG', value: `${sg.avg_sg_pga >= 0 ? '+' : ''}${sg.avg_sg_pga.toFixed(2)}`, cls: sg.avg_sg_pga >= 0 ? 'good' : 'danger' })
      }

    } else if (context === 'short_game') {
      const ranked = rankClubs(clubs, distToGreen, { count: 1, excludeDriver: true })
      if (ranked[0]) result.push({ label: 'Club', value: `${ranked[0].type} (${Math.round(ranked[0].avg)}y)`, cls: 'good' })
      if (player.sg_categories?.CHIP) {
        const sg = player.sg_categories.CHIP
        result.push({ label: 'Short Game SG', value: `${sg.avg_sg_pga >= 0 ? '+' : ''}${sg.avg_sg_pga.toFixed(2)}`, cls: sg.avg_sg_pga >= 0 ? 'good' : 'danger' })
      }
      result.push({ label: 'Distance', value: `${distToGreen}y to green`, cls: '' })

    } else if (context === 'green') {
      if (player.sg_categories?.PUTT) {
        const sg = player.sg_categories.PUTT
        result.push({ label: 'Putting SG', value: `${sg.avg_sg_pga >= 0 ? '+' : ''}${sg.avg_sg_pga.toFixed(2)}`, cls: sg.avg_sg_pga >= 0 ? 'good' : 'danger' })
      }
      result.push({ label: 'Distance', value: `${distToGreen}y to pin`, cls: '' })
    }

    // Nearby hazards using shared function
    if (context !== 'green' && origin && hazards.length > 0) {
      const nearby = findNearbyHazards(origin, hazards, context)
      for (const h of nearby) {
        result.push({
          label: `${h.type}${h.name ? ` (${h.name})` : ''}`,
          value: `${h.distance}y`,
          cls: h.cls,
        })
      }
    }

    // ── Hole data section (round-specific or historic) ──
    const teeRounds = allRoundDetails.filter(r => r.tee_id === teeId)
    const holeData = teeRounds
      .map(r => (r.holes || []).find(h => h.hole_number === currentHole))
      .filter((rh): rh is NonNullable<typeof rh> => rh != null && (rh.strokes ?? 0) > 0)

    const isRoundMode = viewMode !== 'historic' && roundDetail != null
    const rh = isRoundMode ? (roundDetail.holes || []).find(h => h.hole_number === currentHole) : null

    if (isRoundMode && rh && (rh.strokes ?? 0) > 0) {
      // ── Round-specific hole review ──
      const roundDate = new Date(roundDetail.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      result.push({ label: '', value: '', cls: '', header: `Hole ${currentHole} — ${roundDate}` })

      // Score + vs avg comparison
      const scoreDiff = (rh.strokes ?? 0) - par
      let scoreVal = `${rh.strokes} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`
      let scoreCls: InsightItem['cls'] = scoreDiff <= 0 ? 'good' : scoreDiff <= 1 ? 'warning' : 'danger'

      let verdict = ''
      let verdictColor = ''
      let vsAvgStr = ''
      if (holeData.length > 0) {
        const avg = holeData.map(h => h.strokes!).reduce((a, b) => a + b, 0) / holeData.length
        const vsAvg = (rh.strokes ?? 0) - avg
        vsAvgStr = `(${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(1)} vs avg)`
        if (vsAvg <= -1) { scoreCls = 'good'; verdict = 'Great hole'; verdictColor = '#22c55e' }
        else if (vsAvg <= -0.3) { scoreCls = 'good'; verdict = 'Above average'; verdictColor = '#22c55e' }
        else if (vsAvg >= 1) { scoreCls = 'danger'; verdict = 'Below average'; verdictColor = '#ef4444' }
        else { verdict = 'Average'; verdictColor = '#3b82f6' }
      }
      result.push({ label: 'Score', value: scoreVal, cls: scoreCls, sub: vsAvgStr, tag: verdict, tagColor: verdictColor })

      // Putts with vs avg
      if (rh.putts != null) {
        const allPutts = holeData.map(h => h.putts).filter((p): p is number => p != null)
        let puttsVal = `${rh.putts}`
        if (allPutts.length > 0) {
          const pAvg = allPutts.reduce((a, b) => a + b, 0) / allPutts.length
          const pDiff = rh.putts - pAvg
          puttsVal += ` (${pDiff >= 0 ? '+' : ''}${pDiff.toFixed(1)} avg)`
        }
        result.push({ label: 'Putts', value: puttsVal, cls: '' })
      }

      // Fairway
      if (rh.fairway) result.push({ label: 'Fairway', value: rh.fairway, cls: rh.fairway === 'HIT' ? 'good' : 'warning' })

      // GIR
      if (rh.gir != null) result.push({ label: 'GIR', value: rh.gir ? 'Yes' : 'No', cls: rh.gir ? 'good' : 'danger' })

      // Penalties
      if ((rh.penalty_strokes ?? 0) > 0) result.push({ label: 'Penalties', value: `${rh.penalty_strokes}`, cls: 'danger' })

      // SG from this round's shots
      const catLabels: Record<string, string> = { off_the_tee: 'Tee', approach: 'Approach', short_game: 'Short Game', putting: 'Putting' }
      let sgPga = 0
      let sgPersonal = 0
      let sgCount = 0
      const sgByType: Record<string, number> = {}
      for (const shot of rh.shots || []) {
        if (shot.sg_pga != null) {
          sgPga += shot.sg_pga
          sgCount++
          const cat = classifySgCategory(shot, par)
          if (cat) sgByType[cat] = (sgByType[cat] || 0) + shot.sg_pga
        }
        if (shot.sg_personal != null) sgPersonal += shot.sg_personal
      }
      if (sgCount > 0) {
        result.push({ label: 'SG vs PGA', value: sgPga.toFixed(2), cls: sgPga >= 0 ? 'good' : 'danger' })
        result.push({ label: 'SG vs Personal', value: sgPersonal.toFixed(2), cls: sgPersonal >= 0 ? 'good' : 'danger' })
      }

      // Historic comparison
      if (holeData.length > 0) {
        const scores = holeData.map(h => h.strokes!)
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length
        const best = Math.min(...scores)
        result.push({ label: 'Hole Avg', value: avg.toFixed(1), cls: '' })
        result.push({ label: 'Hole Best', value: `${best}`, cls: '' })
      }

      // SG breakdown
      if (sgCount > 0) {
        const sgStr = Object.entries(sgByType)
          .map(([cat, v]) => `${catLabels[cat] || cat}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
          .join('  ')
        result.push({ label: 'SG Detail', value: sgStr, cls: '' })
      }

    } else if (teeRounds.length > 0 && par > 0 && holeData.length > 0) {
      // ── Historic hole history ──
      result.push({ label: '', value: '', cls: '', header: `Hole ${currentHole} History (${holeData.length} rnd${holeData.length !== 1 ? 's' : ''})` })

      // Best / Avg score
      const scores = holeData.map(rh2 => rh2.strokes!)
      const best = Math.min(...scores)
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      const bestDiff = best - par
      const avgDiff = avg - par
      result.push({ label: 'Best', value: `${best} (${bestDiff >= 0 ? '+' : ''}${bestDiff})`, cls: bestDiff <= 0 ? 'good' : 'danger' })
      result.push({ label: 'Average', value: `${avg.toFixed(1)} (${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)})`, cls: avgDiff <= 0 ? 'good' : avgDiff <= 0.5 ? '' : 'danger' })

      // Avg putts
      const putts = holeData.map(rh2 => rh2.putts).filter((p): p is number => p != null)
      if (putts.length > 0) {
        const avgPutts = (putts.reduce((a, b) => a + b, 0) / putts.length).toFixed(1)
        result.push({ label: 'Avg Putts', value: avgPutts, cls: '' })
      }

      // FW%
      const fwResults = holeData.map(rh2 => rh2.fairway).filter((f): f is string => f != null)
      if (fwResults.length > 0) {
        const fwHits = fwResults.filter(f => f === 'HIT').length
        const fwPct = Math.round((fwHits / fwResults.length) * 100)
        result.push({ label: 'Fairway', value: `${fwPct}% (${fwHits}/${fwResults.length})`, cls: fwPct >= 50 ? 'good' : 'warning' })
      }

      // GIR%
      const girResults = holeData.map(rh2 => rh2.gir).filter((g): g is boolean => g != null)
      if (girResults.length > 0) {
        const girHits = girResults.filter(g => g).length
        const girPct = Math.round((girHits / girResults.length) * 100)
        result.push({ label: 'GIR', value: `${girPct}% (${girHits}/${girResults.length})`, cls: girPct >= 50 ? 'good' : 'warning' })
      }

      // Top tee club
      const teeShots = teeRounds.flatMap(r => (r.holes || []).find(h => h.hole_number === currentHole)?.shots || []).filter(sh => sh.shot_number === 1 && sh.club)
      const clubCounts: Record<string, number> = {}
      teeShots.forEach(sh => { if (sh.club) clubCounts[sh.club] = (clubCounts[sh.club] || 0) + 1 })
      const topClub = Object.entries(clubCounts).sort((a, b) => b[1] - a[1])[0]
      if (topClub) result.push({ label: 'Tee Club', value: `${topClub[0]} (${topClub[1]}x)`, cls: '' })

      // Avg drive
      const driveYards = teeShots.filter(sh => sh.distance_yards).map(sh => sh.distance_yards!)
      if (driveYards.length > 0) {
        const avgDrive = Math.round(driveYards.reduce((a, b) => a + b, 0) / driveYards.length)
        result.push({ label: 'Avg Drive', value: `${avgDrive}y`, cls: '' })
      }

      // SG averages by category
      const allShots = teeRounds.flatMap(r => (r.holes || []).find(h => h.hole_number === currentHole)?.shots || [])
      const sgByType: Record<string, { total: number }> = {}
      const catLabels: Record<string, string> = { off_the_tee: 'Tee', approach: 'Approach', short_game: 'Short Game', putting: 'Putting' }
      allShots.forEach(sh => {
        if (sh.sg_pga != null) {
          const cat = classifySgCategory(sh, par)
          if (cat) {
            if (!sgByType[cat]) sgByType[cat] = { total: 0 }
            sgByType[cat].total += sh.sg_pga
          }
        }
      })
      const sgEntries = Object.entries(sgByType)
      if (sgEntries.length > 0) {
        const sgStr = sgEntries
          .map(([cat, d]) => {
            const avgSg = d.total / teeRounds.length
            return `${catLabels[cat] || cat}: ${avgSg >= 0 ? '+' : ''}${avgSg.toFixed(2)}`
          })
          .join('  ')
        result.push({ label: 'Avg SG', value: sgStr, cls: '' })
      }
    }

    return result
  }, [player, yardage, par, gps.lat, gps.lng, teePos, greenPos, hazards, allRoundDetails, teeId, currentHole, course, viewMode, roundDetail])

  const colorMap: Record<string, string> = {
    good: 'var(--accent)',
    warning: 'var(--warning, #ff9800)',
    danger: 'var(--danger)',
  }

  return (
    <div className={s.insightList}>
      {items.map((it, i) => (
        <div key={i}>
          {it.header && <div className={s.insightHeader}>{it.header}</div>}
          <div className={s.insightRow}>
            <span className={s.insightLabel}>{it.label}</span>
            <span className={s.insightValue}>
              <span style={{ color: colorMap[it.cls] || 'var(--text)', fontWeight: 600 }}>{it.value}</span>
              {it.sub && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: 4 }}>{it.sub}</span>}
              {it.tag && <span style={{ background: `${it.tagColor || '#3b82f6'}1a`, color: it.tagColor || '#3b82f6', padding: '1px 6px', borderRadius: 4, fontSize: '0.68rem', marginLeft: 5 }}>{it.tag}</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
