import { useMobileMap } from '../MobileMapContext'
import type { RangefinderData } from '../GpsRangefinder'
import { HAZARD_COLORS, HAZARD_LABELS } from '../../courseMapState'
import s from './tabs.module.css'

export function RangefinderTab({ data }: { data: RangefinderData }) {
  const { gps } = useMobileMap()

  if (!gps.watching) {
    return (
      <div className={s.centered}>
        <button className={s.primaryBtn} onClick={gps.startWatching}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Enable GPS
        </button>
        <p className={s.hint}>Tap to start live distance tracking</p>
      </div>
    )
  }

  if (gps.error) {
    return (
      <div className={s.centered}>
        <p className={s.error}>{gps.error}</p>
        <button className={s.ghostBtn} onClick={gps.startWatching}>Retry</button>
      </div>
    )
  }

  if (data.distToGreenCenter == null && !data.gpsActive) {
    return (
      <div className={s.centered}>
        <div className={s.pulse} />
        <p className={s.hint}>Acquiring GPS signal...</p>
      </div>
    )
  }

  if (data.distToGreenCenter == null && data.gpsActive) {
    return (
      <div className={s.centered}>
        <p className={s.hint}>GPS is active but this hole has no green position set.</p>
        <p className={s.subHint}>Use the Edit tab to place the green, or edit the course on desktop.</p>
      </div>
    )
  }

  return (
    <div className={s.rangefinder}>
      {/* Distance to green */}
      <div className={s.distanceBlock}>
        <div className={s.distanceBig}>{data.distToGreenCenter}</div>
        <div className={s.distanceUnit}>yds to green</div>
      </div>

      <div className={s.frontBack}>
        <div className={s.fbItem}>
          <span className={s.fbLabel}>Front</span>
          <span className={s.fbValue}>{data.distToGreenFront ?? '—'}</span>
        </div>
        <div className={s.fbDivider} />
        <div className={s.fbItem}>
          <span className={s.fbLabel}>Back</span>
          <span className={s.fbValue}>{data.distToGreenBack ?? '—'}</span>
        </div>
      </div>

      {/* Club recommendation */}
      {data.clubRec.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Club Recommendation</div>
          {data.clubRec.map((c, i) => (
            <div key={c.club} className={`${s.clubRow} ${i === 0 ? s.clubPrimary : ''}`}>
              <span className={s.clubName}>{c.club}</span>
              <span className={s.clubDist}>{c.avgYards}y avg</span>
            </div>
          ))}
        </div>
      )}

      {/* Hazards */}
      {data.nearbyHazards.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Hazards</div>
          {data.nearbyHazards.slice(0, 3).map((h, i) => {
            const [color] = HAZARD_COLORS[h.type] || ['#999']
            return (
              <div key={i} className={s.hazardRow}>
                <span className={s.hazardDot} style={{ background: color }} />
                <span className={s.hazardName}>{HAZARD_LABELS[h.type] || h.type}{h.name ? ` (${h.name})` : ''}</span>
                <span className={s.hazardDist}>{h.distance}y</span>
              </div>
            )
          })}
        </div>
      )}

      {/* GPS accuracy */}
      <div className={s.gpsMeta}>
        GPS accuracy: ±{Math.round(gps.accuracy ?? 0)}m
      </div>
    </div>
  )
}
