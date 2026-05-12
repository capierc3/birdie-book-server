import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { patch, post, useClubs } from '../../api'
import type { Shot } from '../../api'
import s from './panels.module.css'

interface Props {
  shot: Shot
  onClose: () => void
  /** Local-patch the shot's club in parent state (no refetch). */
  onShotUpdated?: (updatedShot: Shot) => void
  /** Fired after a successful hole-move; parent should refetch the round. */
  onShotMoved?: () => void
  /** Current hole number this shot is showing under — used as the "from" hole. */
  currentHole?: number
  /** Round id this shot belongs to (required to enable hole-move). */
  roundId?: number
  /** Available hole numbers in this round for the move picker. */
  holeNumbers?: number[]
}

interface DisplayField {
  label: string
  value: string | null
  color?: string
}

/** Bag order — driver first, putter last. Matches ShotsPanel for consistency. */
const BAG_ORDER: Record<string, number> = {
  Driver: 1, '3 Wood': 2, '5 Wood': 3, '7 Wood': 4,
  '2 Hybrid': 10, '3 Hybrid': 11, '4 Hybrid': 12, '5 Hybrid': 13,
  '2 Iron': 20, '3 Iron': 21, '4 Iron': 22, '5 Iron': 23, '6 Iron': 24, '7 Iron': 25, '8 Iron': 26, '9 Iron': 27,
  PW: 30, GW: 31, SW: 32, LW: 33,
  'Pitching Wedge': 30, 'Gap Wedge': 31, 'Sand Wedge': 32, 'Lob Wedge': 33,
  Putter: 40,
}

function bagOrder(club: string): number {
  return BAG_ORDER[club] ?? 35
}

function buildDisplay(shot: Shot): {
  info: DisplayField[]
  distance: DisplayField[]
  accuracy: DisplayField[]
  hazards: DisplayField[]
  sg: DisplayField[]
} {
  // Lie transition
  let lieTransition: string | null = null
  if (shot.start_lie && shot.end_lie) lieTransition = `${shot.start_lie} → ${shot.end_lie}`
  else if (shot.end_lie) lieTransition = shot.end_lie

  // Fairway side display
  let fairwaySide: string | null = null
  if (shot.fairway_side != null && shot.fairway_side_yards != null) {
    fairwaySide = shot.fairway_side === 'CENTER'
      ? 'CENTER'
      : `${Math.abs(shot.fairway_side_yards).toFixed(0)} ${shot.fairway_side}`
  }

  // Fairway hit
  let fairwayHit: { value: string; color: string } | null = null
  if (shot.fairway_side_yards != null) {
    const hit = Math.abs(shot.fairway_side_yards) < 18
    fairwayHit = { value: hit ? '✓' : '✗', color: hit ? 'var(--accent)' : 'var(--danger)' }
  }

  // On green
  let onGreen: { value: string; color: string } | null = null
  if (shot.on_green != null) {
    onGreen = { value: shot.on_green ? '✓' : '✗', color: shot.on_green ? 'var(--accent)' : 'var(--danger)' }
  }

  // Hazard
  let hazardDisplay: string | null = null
  if (shot.nearest_hazard_type && shot.nearest_hazard_yards != null) {
    const name = shot.nearest_hazard_name || shot.nearest_hazard_type
    hazardDisplay = `${name} — ${shot.nearest_hazard_yards.toFixed(0)} yds`
  }

  // SG
  const sgPga = shot.sg_pga != null ? `${shot.sg_pga >= 0 ? '+' : ''}${shot.sg_pga.toFixed(2)}` : null
  const sgPersonal = shot.sg_personal != null ? `${shot.sg_personal >= 0 ? '+' : ''}${shot.sg_personal.toFixed(2)}` : null

  return {
    info: [
      { label: 'Club', value: shot.club || '—' },
      { label: 'Shot Type', value: shot.shot_type || '—' },
      { label: 'Lie', value: lieTransition },
    ],
    distance: [
      { label: 'GPS Distance', value: shot.distance_yards != null ? `${shot.distance_yards.toFixed(0)} yds` : null },
      { label: 'Useful Distance', value: shot.fairway_progress_yards != null ? `${shot.fairway_progress_yards.toFixed(0)} yds` : null },
      { label: 'Pin Remaining', value: shot.pin_distance_yards != null ? `${shot.pin_distance_yards.toFixed(0)} yds` : null },
    ],
    accuracy: [
      { label: 'Side from FW', value: fairwaySide },
      fairwayHit ? { label: 'Fairway Hit', value: fairwayHit.value, color: fairwayHit.color } : { label: 'Fairway Hit', value: null },
      { label: 'Green Prox', value: shot.green_distance_yards != null ? `${shot.green_distance_yards.toFixed(0)} yds` : null },
      onGreen ? { label: 'On Green', value: onGreen.value, color: onGreen.color } : { label: 'On Green', value: null },
    ],
    hazards: [
      { label: 'Nearest Hazard', value: hazardDisplay },
    ],
    sg: [
      { label: 'SG vs PGA', value: sgPga, color: shot.sg_pga != null ? (shot.sg_pga >= 0 ? 'var(--accent)' : 'var(--danger)') : undefined },
      { label: 'SG vs Personal', value: sgPersonal, color: shot.sg_personal != null ? (shot.sg_personal >= 0 ? 'var(--accent)' : 'var(--danger)') : undefined },
    ],
  }
}

const SECTION_TITLES: Record<string, string> = {
  info: 'Shot Info',
  distance: 'Distance',
  accuracy: 'Accuracy',
  hazards: 'Hazards',
  sg: 'Strokes Gained',
}

export function CourseShotDetailPanel({
  shot, onClose, onShotUpdated, onShotMoved,
  currentHole, roundId, holeNumbers,
}: Props) {
  const display = buildDisplay(shot)
  const { data: clubs = [] } = useClubs()
  const queryClient = useQueryClient()
  const [editingClub, setEditingClub] = useState(false)
  const [editingHole, setEditingHole] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canMoveHole = roundId != null && currentHole != null && holeNumbers && holeNumbers.length > 1

  const sortedClubs = useMemo(() => {
    return [...clubs]
      .filter((c) => !c.retired)
      .sort((a, b) => bagOrder(a.club_type) - bagOrder(b.club_type))
  }, [clubs])

  const handleClubChange = async (clubId: number, clubType: string) => {
    setBusy(true)
    setError(null)
    try {
      await post('/clubs/reassign-shot', {
        shot_type: 'course',
        shot_id: shot.id,
        target_club_id: clubId,
      })
      onShotUpdated?.({ ...shot, club: clubType })
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      setEditingClub(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reassign failed')
    } finally {
      setBusy(false)
    }
  }

  const handleHoleMove = async (targetHole: number) => {
    if (roundId == null || targetHole === currentHole) {
      setEditingHole(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await patch(`/rounds/${roundId}/shots/${shot.id}/move`, { hole_number: targetHole })
      setEditingHole(false)
      onShotMoved?.()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Move failed')
    } finally {
      setBusy(false)
    }
  }

  const renderHoleField = () => {
    if (currentHole == null) return null
    if (editingHole && canMoveHole) {
      return (
        <div key="Hole" style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Hole</span>
          <select
            autoFocus
            disabled={busy}
            defaultValue=""
            onChange={(e) => {
              const n = Number(e.target.value)
              if (n) handleHoleMove(n)
            }}
            onBlur={() => { if (!busy) setEditingHole(false) }}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '2px 4px',
              outline: 'none',
              minWidth: 0,
              maxWidth: '100%',
            }}
          >
            <option value="" disabled>Move to hole…</option>
            {holeNumbers!.filter((n) => n !== currentHole).map((n) => (
              <option key={n} value={n}>Hole {n}</option>
            ))}
          </select>
        </div>
      )
    }
    return (
      <div
        key="Hole"
        onClick={() => canMoveHole && !busy && setEditingHole(true)}
        title={canMoveHole ? 'Click to move shot to a different hole' : undefined}
        style={{
          display: 'flex', flexDirection: 'column', padding: '2px 0',
          cursor: canMoveHole ? (busy ? 'wait' : 'pointer') : 'default',
        }}
      >
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Hole</span>
        <span style={{
          fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={canMoveHole ? { borderBottom: '1px dotted var(--text-dim)' } : undefined}>{currentHole}</span>
          {canMoveHole && <Pencil size={10} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
        </span>
      </div>
    )
  }

  const renderClubField = () => {
    if (editingClub) {
      return (
        <div key="Club" style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Club</span>
          <select
            autoFocus
            disabled={busy || sortedClubs.length === 0}
            defaultValue=""
            onChange={(e) => {
              const id = Number(e.target.value)
              const c = sortedClubs.find((x) => x.id === id)
              if (c) handleClubChange(c.id, c.club_type)
            }}
            onBlur={() => { if (!busy) setEditingClub(false) }}
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '2px 4px',
              outline: 'none',
              minWidth: 0,
              maxWidth: '100%',
            }}
          >
            <option value="" disabled>Select club…</option>
            {sortedClubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.club_type}{c.name ? ` — ${c.name}` : ''}
              </option>
            ))}
          </select>
        </div>
      )
    }
    return (
      <div
        key="Club"
        onClick={() => !busy && setEditingClub(true)}
        title="Click to reassign club"
        style={{
          display: 'flex', flexDirection: 'column', padding: '2px 0',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Club</span>
        <span style={{
          fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ borderBottom: '1px dotted var(--text-dim)' }}>{shot.club || '—'}</span>
          <Pencil size={10} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        </span>
      </div>
    )
  }

  return (
    <FloatingPanel
      title={`Shot ${shot.shot_number} — ${shot.club || 'Unknown'}`}
      onClose={onClose}
      width={280}
    >
      {Object.entries(display).map(([key, fields]) => {
        const isInfo = key === 'info'
        const allNull = fields.every((f) => f.value == null)
        return (
          <div key={key} className={s.section}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              {SECTION_TITLES[key]}
            </div>
            {isInfo && error && (
              <div style={{ fontSize: '0.7rem', color: 'var(--danger)', marginBottom: 4 }}>{error}</div>
            )}
            {allNull ? (
              <div className={s.emptyText}>No data</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                {fields.map((f) => {
                  if (isInfo && f.label === 'Club') return renderClubField()
                  if (f.value == null) return null
                  return (
                    <div key={f.label} style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{f.label}</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: f.color || 'var(--text)' }}>{f.value}</span>
                    </div>
                  )
                })}
                {isInfo && renderHoleField()}
              </div>
            )}
          </div>
        )
      })}
    </FloatingPanel>
  )
}
