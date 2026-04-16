import { useMemo } from 'react'
import { useMobileMap } from '../MobileMapContext'
import { getClubColor } from '../../clubColors'
import s from './tabs.module.css'

export function ShotsTab() {
  const ctx = useMobileMap()
  const { currentHole, teeId, viewMode, roundDetail, allRoundDetails } = ctx

  const teeRounds = useMemo(() => allRoundDetails.filter(r => r.tee_id === teeId), [allRoundDetails, teeId])
  const isHistoric = viewMode === 'historic'

  const shots = useMemo(() => {
    if (isHistoric) {
      return teeRounds
        .flatMap(r => (r.holes || [])
          .filter(h => h.hole_number === currentHole)
          .flatMap(h => (h.shots || []).map(sh => ({ ...sh, roundDate: r.date }))))
        .filter(sh => sh.start_lat && sh.end_lat)
    }
    if (roundDetail) {
      const rh = (roundDetail.holes || []).find(h => h.hole_number === currentHole)
      return (rh?.shots || [])
        .filter(sh => sh.start_lat && sh.end_lat)
        .map(sh => ({ ...sh, roundDate: roundDetail.date }))
    }
    return []
  }, [isHistoric, teeRounds, roundDetail, currentHole])

  if (shots.length === 0) {
    return (
      <div className={s.centered}>
        <p className={s.hint}>No shot data for this hole</p>
        <p className={s.subHint}>Import round data from the desktop app</p>
      </div>
    )
  }

  return (
    <div className={s.shotList}>
      <div className={s.sectionTitle}>{isHistoric ? `${shots.length} shots across ${teeRounds.length} rounds` : `${shots.length} shots`}</div>
      {shots.map((shot, i) => {
        const color = getClubColor(shot.club)
        return (
          <div key={i} className={s.shotRow}>
            <span className={s.shotDot} style={{ background: color }} />
            <span className={s.shotClub}>{shot.club || 'Unknown'}</span>
            <span className={s.shotDist}>
              {shot.distance_yards ? `${shot.distance_yards.toFixed(0)}y` : '—'}
            </span>
            {shot.sg_pga != null && (
              <span className={s.shotSg} style={{ color: shot.sg_pga >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                {shot.sg_pga >= 0 ? '+' : ''}{shot.sg_pga.toFixed(2)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
