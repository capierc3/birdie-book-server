import { useMemo } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap } from './courseMapState'
import { haversineYards } from './geoUtils'
import { determineShotContext, getTeeClubTarget, rankClubs, findNearbyHazards } from './caddieCalc'
import type { ShotContext } from './caddieCalc'
import s from './panels.module.css'

/**
 * Strategy Insights panel — context-aware club recommendations
 * based on ball position (tee / approach / short game / green).
 */
export function InsightsPanel({ onClose }: { onClose: () => void }) {
  const ctx = useCourseMap()
  const { strategy, teePos, greenPos, ballPos, hazards } = ctx
  const player = strategy?.player

  // Read par/yardage from form values
  const par = parseInt(ctx._formValues.par) || 4
  const yardage = parseInt(ctx._formValues.yardage) || 0

  const items = useMemo(() => {
    if (!player?.clubs?.length) return [{ label: 'No player data available', value: '', cls: '', header: '' }]
    if (!yardage) return [{ label: 'Add yardage to see insights', value: '', cls: '', header: '' }]

    const clubs = player.clubs
    const ballOrigin = ballPos || teePos
    const distToGreen = (ballOrigin && greenPos)
      ? Math.round(haversineYards(ballOrigin.lat, ballOrigin.lng, greenPos.lat, greenPos.lng))
      : yardage
    const distFromTee = (ballPos && teePos)
      ? Math.round(haversineYards(teePos.lat, teePos.lng, ballPos.lat, ballPos.lng))
      : 0
    const hasBallPlaced = !!ballPos

    // Determine context using shared function
    const context: ShotContext = determineShotContext(distToGreen, hasBallPlaced)

    const result: { label: string; value: string; cls: string; header?: string }[] = []
    const contextLabels = { tee: 'From the Tee', approach: 'Approach Shot', short_game: 'Short Game', green: 'On the Green' }

    result.push({
      label: hasBallPlaced ? `${distFromTee}y from tee` : 'Hole Overview',
      value: hasBallPlaced ? `${distToGreen}y to green` : `${yardage}y par ${par}`,
      cls: '',
      header: contextLabels[context],
    })

    if (context === 'tee') {
      const targetDist = getTeeClubTarget(par, yardage)
      const ranked = rankClubs(clubs, targetDist, { count: 1 })
      const bestClub = ranked[0]

      if (bestClub) {
        const remaining = yardage - bestClub.avg
        result.push({ label: par === 3 ? 'Club to green' : 'Club off tee', value: `${bestClub.type} (${Math.round(bestClub.avg)}y avg)`, cls: 'good' })
        if (par !== 3 && remaining > 0) {
          const approachRanked = rankClubs(clubs, remaining, { count: 1 })
          if (approachRanked[0]) {
            result.push({ label: 'Approach club', value: `${approachRanked[0].type} (${Math.round(remaining)}y to green)`, cls: '' })
          }
        }
      }

      // Scoring avg
      const parAvg = (player.scoring as Record<string, number> | undefined)?.[`par${par}_avg`]
      if (parAvg) {
        const diff = parAvg - par
        result.push({ label: `Your avg on par ${par}s`, value: `${parAvg} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})`, cls: diff <= 0 ? 'good' : diff <= 1 ? 'warning' : 'danger' })
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
          if (pct > 55) result.push({ label: `${bestClub.type} miss`, value: `${pct}% ${dominant} (${miss.total_shots} shots)`, cls: pct > 70 ? 'danger' : 'warning' })
        }
      }

      // Dispersion
      const bestClubObj = clubs.find(c => c.club_type === bestClub?.type)
      if (bestClubObj?.std_dev) result.push({ label: `${bestClubObj.club_type} spread`, value: `${Math.round(bestClubObj.std_dev * 2)}yd (2σ)`, cls: '' })

    } else if (context === 'approach') {
      const ranked = rankClubs(clubs, distToGreen, { count: 2, excludeDriver: true })
      if (ranked[0]) {
        result.push({ label: 'Recommended club', value: `${ranked[0].type} (${Math.round(ranked[0].avg)}y, ${ranked[0].delta >= 0 ? '+' : ''}${ranked[0].delta}y)`, cls: 'good' })
      }
      if (ranked[1]) {
        result.push({ label: 'Alternative', value: `${ranked[1].type} (${Math.round(ranked[1].avg)}y, ${ranked[1].delta >= 0 ? '+' : ''}${ranked[1].delta}y)`, cls: '' })
      }

      // Miss tendency
      if (ranked[0] && player.miss_tendencies) {
        const miss = player.miss_tendencies[ranked[0].type]
        if (miss && miss.total_shots >= 5) {
          const dominant = miss.left_pct > miss.right_pct ? 'left' : 'right'
          const pct = Math.max(miss.left_pct, miss.right_pct)
          if (pct > 55) result.push({ label: `${ranked[0].type} miss`, value: `${pct}% ${dominant}`, cls: pct > 70 ? 'danger' : 'warning' })
        }
      }

      // Dispersion
      const bestClubObj = clubs.find(c => c.club_type === ranked[0]?.type)
      if (bestClubObj?.std_dev) {
        result.push({ label: 'Dispersion', value: `±${Math.round(bestClubObj.std_dev)}y (1σ)`, cls: '' })
        const lateralDisp = player.lateral_dispersion?.[bestClubObj.club_type]
        if (lateralDisp?.lateral_std_dev) result.push({ label: 'Lateral spread', value: `±${Math.round(lateralDisp.lateral_std_dev)}y`, cls: '' })
      }

      // SG approach
      if (player.sg_categories?.APPROACH) {
        const sg = player.sg_categories.APPROACH
        result.push({ label: 'Approach SG', value: `${sg.avg_sg_pga >= 0 ? '+' : ''}${sg.avg_sg_pga.toFixed(2)}/shot (${sg.shot_count} shots)`, cls: sg.avg_sg_pga >= 0 ? 'good' : 'danger' })
      }

    } else if (context === 'short_game') {
      const ranked = rankClubs(clubs, distToGreen, { count: 1, excludeDriver: true })
      if (ranked[0]) result.push({ label: 'Club recommendation', value: `${ranked[0].type} (${Math.round(ranked[0].avg)}y avg)`, cls: 'good' })
      if (player.sg_categories?.CHIP) {
        const sg = player.sg_categories.CHIP
        result.push({ label: 'Short Game SG', value: `${sg.avg_sg_pga >= 0 ? '+' : ''}${sg.avg_sg_pga.toFixed(2)}/shot`, cls: sg.avg_sg_pga >= 0 ? 'good' : 'danger' })
      }
      result.push({ label: 'Distance', value: `${distToGreen}y to green`, cls: '' })

    } else if (context === 'green') {
      if (player.sg_categories?.PUTT) {
        const sg = player.sg_categories.PUTT
        result.push({ label: 'Putting SG', value: `${sg.avg_sg_pga >= 0 ? '+' : ''}${sg.avg_sg_pga.toFixed(2)}/shot`, cls: sg.avg_sg_pga >= 0 ? 'good' : 'danger' })
      }
      result.push({ label: 'Distance', value: `${distToGreen}y to pin`, cls: '' })
    }

    // Nearby hazards using shared function
    if (context !== 'green' && ballOrigin && hazards.length > 0) {
      const nearby = findNearbyHazards(ballOrigin, hazards, context)
      for (const h of nearby) {
        result.push({
          label: `${h.type}${h.name ? ' (' + h.name + ')' : ''}`,
          value: `${h.distance}y away`,
          cls: h.cls,
        })
      }
    }

    return result
  }, [player, yardage, par, ballPos, teePos, greenPos, hazards])

  const colorMap: Record<string, string> = { good: 'var(--accent)', warning: 'var(--warning, #ff9800)', danger: 'var(--danger)' }

  return (
    <FloatingPanel title="Strategy Insights" onClose={onClose} width={280}>
      <div className={s.section} style={{ padding: '10px 12px' }}>
        {items.length === 0 || (items.length === 1 && !items[0].value) ? (
          <div className={s.emptyText}>{items[0]?.label || 'Add more data for insights'}</div>
        ) : (
          items.map((it, i) => (
            <div key={i}>
              {it.header && (
                <div style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 600, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                  {it.header}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{it.label}</span>
                <span style={{ fontWeight: 600, color: colorMap[it.cls] || 'var(--text)' }}>{it.value}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </FloatingPanel>
  )
}
