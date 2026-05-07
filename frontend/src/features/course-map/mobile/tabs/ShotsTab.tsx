import { useMemo, useState } from 'react'
import { useMobileMap } from '../MobileMapContext'
import { getClubColor } from '../../clubColors'
import s from './tabs.module.css'

type GroupMode = 'type' | 'club'

const TYPE_GROUPS: { key: string; label: string; matches: (shotType: string, shotNum: number) => boolean }[] = [
  { key: 'tee',       label: 'Tee Shots',  matches: (t, n) => t === 'TEE' || (n === 1 && t !== 'PUTT') },
  { key: 'approach',  label: 'Approach',   matches: (t) => t === 'APPROACH' || t === 'LAYUP' },
  { key: 'short',     label: 'Short Game', matches: (t) => t === 'CHIP' || t === 'RECOVERY' },
  { key: 'putt',      label: 'Putts',      matches: (t) => t === 'PUTT' },
  { key: 'other',     label: 'Other',      matches: () => true }, // fallback
]

function categorize(shotType: string | null | undefined, shotNum: number): string {
  const t = (shotType || '').toUpperCase()
  for (const g of TYPE_GROUPS) {
    if (g.matches(t, shotNum)) return g.key
  }
  return 'other'
}

export function ShotsTab() {
  const ctx = useMobileMap()
  const { currentHole, teeId, viewMode, roundDetail, allRoundDetails } = ctx

  const teeRounds = useMemo(() => allRoundDetails.filter(r => r.tee_id === teeId), [allRoundDetails, teeId])
  const isHistoric = viewMode === 'historic'
  const [groupMode, setGroupMode] = useState<GroupMode>('type')

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

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; color?: string; shots: typeof shots }>()
    if (groupMode === 'type') {
      // Seed in defined order so groups render top-down even if a category is empty.
      for (const g of TYPE_GROUPS) map.set(g.key, { label: g.label, shots: [] })
      for (const sh of shots) {
        const key = categorize(sh.shot_type, sh.shot_number)
        map.get(key)!.shots.push(sh)
      }
    } else {
      // Group by club, ordered by first appearance.
      for (const sh of shots) {
        const key = sh.club || 'Unknown'
        if (!map.has(key)) map.set(key, { label: key, color: getClubColor(sh.club), shots: [] })
        map.get(key)!.shots.push(sh)
      }
    }
    return Array.from(map.entries())
      .map(([key, g]) => ({ key, ...g }))
      .filter(g => g.shots.length > 0)
  }, [shots, groupMode])

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
      <div className={s.sectionTitle} style={{ marginBottom: 6 }}>
        <span>{isHistoric ? `${shots.length} shots across ${teeRounds.length} rounds` : `${shots.length} shots`}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button
            className={`${s.toolBtn} ${groupMode === 'type' ? s.toolBtnActive : ''}`}
            onClick={() => setGroupMode('type')}
          >
            Type
          </button>
          <button
            className={`${s.toolBtn} ${groupMode === 'club' ? s.toolBtnActive : ''}`}
            onClick={() => setGroupMode('club')}
          >
            Club
          </button>
        </span>
      </div>

      {groups.map(group => (
        <div key={group.key} style={{ marginTop: 10 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
              color: 'var(--text-muted)', letterSpacing: '0.04em',
              padding: '4px 0', borderBottom: '1px solid var(--border)', marginBottom: 2,
            }}
          >
            {group.color && <span className={s.shotDot} style={{ background: group.color }} />}
            <span>{group.label}</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {group.shots.length}</span>
          </div>
          {group.shots.map((shot, i) => {
            const color = getClubColor(shot.club)
            return (
              <div key={`${group.key}-${i}`} className={s.shotRow}>
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
      ))}
    </div>
  )
}
