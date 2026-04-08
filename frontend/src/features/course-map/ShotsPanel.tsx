import { useMemo, useState } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap } from './courseMapState'
import { getClubColor } from './clubColors'
import { CourseShotDetailPanel } from './CourseShotDetailPanel'
import type { Shot } from '../../api'
import s from './panels.module.css'

/** Bag order for sorting clubs (driver first → lob wedge last) */
const BAG_ORDER: Record<string, number> = {
  Driver: 1, '3 Wood': 2, '5 Wood': 3, '7 Wood': 4,
  '2 Hybrid': 10, '3 Hybrid': 11, '4 Hybrid': 12, '5 Hybrid': 13,
  '2 Iron': 20, '3 Iron': 21, '4 Iron': 22, '5 Iron': 23, '6 Iron': 24, '7 Iron': 25, '8 Iron': 26, '9 Iron': 27,
  PW: 30, GW: 31, SW: 32, LW: 33, 'Lob Wedge': 33, 'Sand Wedge': 32, 'Gap Wedge': 31, 'Pitching Wedge': 30,
  Putter: 40,
}

function bagOrder(club: string): number {
  return BAG_ORDER[club] ?? 35
}

const SHOT_TYPE_LABELS: Record<string, string> = {
  TEE: 'Tee', APPROACH: 'Approach', CHIP: 'Chip', LAYUP: 'Layup', RECOVERY: 'Recovery', PUTT: 'Putt',
}

export function ShotsPanel({ onClose }: { onClose: () => void }) {
  const ctx = useCourseMap()
  const { currentHole, teeId, viewMode, roundDetail, allRoundDetails, strategy } = ctx
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null)

  const teeRounds = useMemo(() => allRoundDetails.filter((r) => r.tee_id === teeId), [allRoundDetails, teeId])
  const isHistoric = viewMode === 'historic'

  // All shots for current hole (including non-GPS for the list)
  const allShots = useMemo(() => {
    if (isHistoric) {
      return teeRounds
        .flatMap((r) => (r.holes || []).filter((h) => h.hole_number === currentHole).flatMap((h) => h.shots || []))
    }
    if (roundDetail) {
      const rh = (roundDetail.holes || []).find((h) => h.hole_number === currentHole)
      return rh?.shots || []
    }
    return []
  }, [isHistoric, teeRounds, roundDetail, currentHole])

  // Club avg lookup from strategy data
  const clubAvgs = useMemo(() => {
    const avgs: Record<string, number> = {}
    ;(strategy?.player?.clubs || []).forEach((c) => {
      if (c.avg_yards) avgs[c.club_type] = c.avg_yards
    })
    return avgs
  }, [strategy])

  // Historic: club breakdown sorted by bag order
  const clubStats = useMemo(() => {
    if (!isHistoric) return []
    const stats: Record<string, { count: number; totalDist: number; distCount: number }> = {}
    allShots.forEach((sh) => {
      if (!sh.club) return
      if (!stats[sh.club]) stats[sh.club] = { count: 0, totalDist: 0, distCount: 0 }
      stats[sh.club].count++
      if (sh.distance_yards) { stats[sh.club].totalDist += sh.distance_yards; stats[sh.club].distCount++ }
    })
    return Object.entries(stats).sort((a, b) => bagOrder(a[0]) - bagOrder(b[0]))
  }, [isHistoric, allShots])

  // Round mode: shots sorted by shot_number
  const roundShots = useMemo(() => {
    if (isHistoric) return []
    return [...allShots].sort((a, b) => (a.shot_number ?? 0) - (b.shot_number ?? 0))
  }, [isHistoric, allShots])

  const panel = (
    <FloatingPanel title="Shots" onClose={onClose} width={320}>
      <div className={s.section} style={{ padding: '8px 12px' }}>
        {allShots.length === 0 ? (
          <div className={s.emptyText}>{isHistoric ? 'No shot data for this hole' : 'Select a round to see shots'}</div>
        ) : isHistoric ? (
          <>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Hole {currentHole} · {allShots.length} shots across {teeRounds.length} round{teeRounds.length !== 1 ? 's' : ''}
            </div>
            {clubStats.map(([club, stats]) => {
              const color = getClubColor(club)
              const avgDist = stats.distCount > 0 ? Math.round(stats.totalDist / stats.distCount) : null
              return (
                <div key={club} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: '0.78rem' }}>
                  <span style={{ width: 24, height: 20, borderRadius: 4, background: color, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.68rem', flexShrink: 0 }}>
                    {stats.count}
                  </span>
                  <span style={{ flex: 1, color: 'var(--text)' }}>{club}</span>
                  {avgDist != null && <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>{avgDist}y avg</span>}
                </div>
              )
            })}
          </>
        ) : (
          <>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Hole {currentHole} · {roundShots.length} shot{roundShots.length !== 1 ? 's' : ''}
            </div>
            {roundShots.map((sh, i) => {
              const color = getClubColor(sh.club)
              const clubName = sh.club || 'Unknown'
              const dist = sh.distance_yards ? sh.distance_yards.toFixed(0) : ''
              const typeLabel = SHOT_TYPE_LABELS[sh.shot_type ?? ''] || ''

              // Delta vs club avg
              let deltaEl: React.ReactNode = null
              if (sh.distance_yards && sh.club && clubAvgs[sh.club]) {
                const delta = sh.distance_yards - clubAvgs[sh.club]
                if (Math.abs(delta) >= 1) {
                  const deltaColor = delta > 0 ? 'var(--accent)' : 'var(--danger)'
                  deltaEl = <span style={{ color: deltaColor, fontSize: '0.72rem' }}>{delta > 0 ? '+' : ''}{delta.toFixed(0)}</span>
                }
              }

              // SG badge
              let sgEl: React.ReactNode = null
              if (sh.sg_pga != null) {
                const sgColor = sh.sg_pga >= 0 ? 'var(--accent)' : 'var(--danger)'
                sgEl = <span style={{ color: sgColor, fontSize: '0.72rem', marginLeft: 4 }}>{sh.sg_pga >= 0 ? '+' : ''}{sh.sg_pga.toFixed(2)}</span>
              }

              return (
                <div key={sh.id ?? i} onClick={() => setSelectedShot(sh)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.78rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedShot?.id === sh.id ? 'var(--bg-hover)' : undefined, borderRadius: 4 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: color, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.72rem', flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>{clubName}</span>
                      {typeLabel && <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 3 }}>{typeLabel}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {dist && <span style={{ fontWeight: 600 }}>{dist} yds</span>}
                    {deltaEl && <> {deltaEl}</>}
                    {sgEl}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </FloatingPanel>
  )

  return (
    <>
      {panel}
      {!isHistoric && selectedShot && (
        <CourseShotDetailPanel shot={selectedShot} onClose={() => setSelectedShot(null)} />
      )}
    </>
  )
}
