import { useMemo } from 'react'
import { useMobileMap } from '../MobileMapContext'
import { haversineYards } from '../../geoUtils'
import s from './tabs.module.css'

type Context = 'tee' | 'approach' | 'short_game' | 'green'

interface InsightItem {
  label: string
  value: string
  cls: '' | 'good' | 'warning' | 'danger'
  header?: string
}

export function CaddieTab() {
  const ctx = useMobileMap()
  const { strategy, gps, teePos, greenPos, hazards, formValues } = ctx
  const player = strategy?.player
  const par = parseInt(formValues.par) || 4
  const yardage = parseInt(formValues.yardage) || 0

  const items = useMemo(() => {
    if (!player?.clubs?.length) return [{ label: 'No player data', value: 'Import rounds first', cls: '' as const }]
    if (!yardage) return [{ label: 'Add yardage', value: 'Edit tab to set hole data', cls: '' as const }]

    const clubs = [...player.clubs].sort((a, b) => (b.avg_yards || 0) - (a.avg_yards || 0))

    // Determine distance to green (from GPS or from tee)
    const hasGps = gps.lat != null && gps.lng != null
    const origin = hasGps ? { lat: gps.lat!, lng: gps.lng! } : teePos
    const distToGreen = (origin && greenPos)
      ? Math.round(haversineYards(origin.lat, origin.lng, greenPos.lat, greenPos.lng))
      : yardage

    // Determine context
    let context: Context = 'tee'
    if (hasGps && greenPos) {
      if (distToGreen <= 10) context = 'green'
      else if (distToGreen <= 50) context = 'short_game'
      else if (distToGreen <= 350) context = 'approach'
    }

    const result: InsightItem[] = []
    const contextLabels: Record<Context, string> = {
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
      const targetDist = par === 3 ? yardage : par === 4 ? yardage - 140 : Math.min(yardage * 0.55, 280)
      let bestClub = clubs[0], bestDiff = Infinity
      for (const c of clubs) {
        const diff = Math.abs((c.avg_yards || 0) - targetDist)
        if (diff < bestDiff) { bestDiff = diff; bestClub = c }
      }
      if (bestClub) {
        const remaining = yardage - (bestClub.avg_yards || 0)
        result.push({ label: par === 3 ? 'Club to green' : 'Club off tee', value: `${bestClub.club_type} (${Math.round(bestClub.avg_yards)}y)`, cls: 'good' })
        if (par !== 3 && remaining > 0) {
          let approachClub = clubs[clubs.length - 1], aDiff = Infinity
          for (const c of clubs) { const d = Math.abs((c.avg_yards || 0) - remaining); if (d < aDiff) { aDiff = d; approachClub = c } }
          result.push({ label: 'Then approach', value: `${approachClub.club_type} (${Math.round(remaining)}y left)`, cls: '' })
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
        const miss = player.miss_tendencies[bestClub.club_type]
        if (miss && miss.total_shots >= 5) {
          const dominant = miss.left_pct > miss.right_pct ? 'left' : 'right'
          const pct = Math.max(miss.left_pct, miss.right_pct)
          if (pct > 55) result.push({ label: `${bestClub.club_type} miss`, value: `${pct}% ${dominant}`, cls: pct > 70 ? 'danger' : 'warning' })
        }
      }

    } else if (context === 'approach') {
      let bestClub = null as typeof clubs[0] | null, bestDiff = Infinity
      for (const c of clubs) {
        if (c.club_type === 'Driver' || c.club_type === 'Unknown') continue
        const diff = Math.abs((c.avg_yards || 0) - distToGreen)
        if (diff < bestDiff) { bestDiff = diff; bestClub = c }
      }
      if (bestClub) {
        const delta = Math.round(bestClub.avg_yards) - distToGreen
        result.push({ label: 'Recommended', value: `${bestClub.club_type} (${Math.round(bestClub.avg_yards)}y, ${delta >= 0 ? '+' : ''}${delta}y)`, cls: 'good' })
      }

      let secondClub = null as typeof clubs[0] | null, secondDiff = Infinity
      for (const c of clubs) {
        if (c.club_type === 'Driver' || c.club_type === 'Unknown' || c === bestClub) continue
        const diff = Math.abs((c.avg_yards || 0) - distToGreen)
        if (diff < secondDiff) { secondDiff = diff; secondClub = c }
      }
      if (secondClub) {
        const delta = Math.round(secondClub.avg_yards) - distToGreen
        result.push({ label: 'Alternative', value: `${secondClub.club_type} (${Math.round(secondClub.avg_yards)}y, ${delta >= 0 ? '+' : ''}${delta}y)`, cls: '' })
      }

      if (bestClub && player.miss_tendencies) {
        const miss = player.miss_tendencies[bestClub.club_type]
        if (miss && miss.total_shots >= 5) {
          const dominant = miss.left_pct > miss.right_pct ? 'left' : 'right'
          const pct = Math.max(miss.left_pct, miss.right_pct)
          if (pct > 55) result.push({ label: `${bestClub.club_type} miss`, value: `${pct}% ${dominant}`, cls: pct > 70 ? 'danger' : 'warning' })
        }
      }

      if (bestClub?.std_dev) {
        result.push({ label: 'Dispersion', value: `±${Math.round(bestClub.std_dev)}y`, cls: '' })
        const lat = player.lateral_dispersion?.[bestClub.club_type]
        if (lat?.lateral_std_dev) result.push({ label: 'Lateral', value: `±${Math.round(lat.lateral_std_dev)}y`, cls: '' })
      }

      if (player.sg_categories?.APPROACH) {
        const sg = player.sg_categories.APPROACH
        result.push({ label: 'Approach SG', value: `${sg.avg_sg_pga >= 0 ? '+' : ''}${sg.avg_sg_pga.toFixed(2)}`, cls: sg.avg_sg_pga >= 0 ? 'good' : 'danger' })
      }

    } else if (context === 'short_game') {
      let bestClub = null as typeof clubs[0] | null, bestDiff = Infinity
      for (const c of clubs) {
        if (c.club_type === 'Driver' || c.club_type === 'Unknown') continue
        const diff = Math.abs((c.avg_yards || 0) - distToGreen)
        if (diff < bestDiff) { bestDiff = diff; bestClub = c }
      }
      if (bestClub) result.push({ label: 'Club', value: `${bestClub.club_type} (${Math.round(bestClub.avg_yards)}y)`, cls: 'good' })
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

    // Nearby hazards
    if (context !== 'green' && origin && hazards.length > 0) {
      for (const h of hazards) {
        if (h._deleted || h.boundary.length < 3) continue
        let minDist = Infinity
        for (const p of h.boundary) {
          const d = haversineYards(origin.lat, origin.lng, p.lat, p.lng)
          if (d < minDist) minDist = d
        }
        if (minDist > 20 && minDist < (context === 'tee' ? 350 : 200)) {
          result.push({
            label: `${h.hazard_type}${h.name ? ` (${h.name})` : ''}`,
            value: `${Math.round(minDist)}y`,
            cls: minDist < 30 ? 'danger' : minDist < 80 ? 'warning' : '',
          })
        }
      }
    }

    return result
  }, [player, yardage, par, gps.lat, gps.lng, teePos, greenPos, hazards])

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
            <span className={s.insightValue} style={{ color: colorMap[it.cls] || 'var(--text)' }}>{it.value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
