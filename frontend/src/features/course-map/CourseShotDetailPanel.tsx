import { FloatingPanel } from '../../components/ui/FloatingPanel'
import type { Shot } from '../../api'
import s from './panels.module.css'

interface Props {
  shot: Shot
  onClose: () => void
}

interface DisplayField {
  label: string
  value: string | null
  color?: string
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

export function CourseShotDetailPanel({ shot, onClose }: Props) {
  const display = buildDisplay(shot)

  return (
    <FloatingPanel
      title={`Shot ${shot.shot_number} — ${shot.club || 'Unknown'}`}
      onClose={onClose}
      width={280}
    >
      {Object.entries(display).map(([key, fields]) => {
        const allNull = fields.every((f) => f.value == null)
        return (
          <div key={key} className={s.section}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              {SECTION_TITLES[key]}
            </div>
            {allNull ? (
              <div className={s.emptyText}>No data</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                {fields.map((f) => f.value != null && (
                  <div key={f.label} style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{f.label}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: f.color || 'var(--text)' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </FloatingPanel>
  )
}
