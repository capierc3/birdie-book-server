import { useMobileMap } from '../MobileMapContext'
import type { RangefinderData } from '../GpsRangefinder'
import type { ToolResult } from '../MobileStrategyOverlays'
import { HAZARD_COLORS, HAZARD_LABELS } from '../../courseMapState'
import s from './tabs.module.css'

type RangefinderTool = 'none' | 'cone' | 'landing' | 'carry' | 'recommend' | 'ruler'

const TOOLS: { key: RangefinderTool; label: string; needsClub: boolean }[] = [
  { key: 'cone', label: 'Dispersion', needsClub: true },
  { key: 'landing', label: 'Landing', needsClub: true },
  { key: 'carry', label: 'Carry?', needsClub: false },
  { key: 'recommend', label: 'Club Rec', needsClub: false },
  { key: 'ruler', label: 'Ruler', needsClub: false },
]

export function RangefinderTab({ data, toolResult }: { data: RangefinderData; toolResult: ToolResult | null }) {
  const ctx = useMobileMap()
  const { gps, strategy, activeRangefinderTool, selectedClubType, playMode } = ctx

  // ── Review mode: no GPS needed, tools work from ball position ──
  if (!playMode) {
    if (data.distToGreenCenter == null) {
      return (
        <div className={s.centered}>
          <p className={s.hint}>No green position set for this hole.</p>
          <p className={s.subHint}>Use the Edit tab to place the green.</p>
        </div>
      )
    }
    // Fall through to show tool content below
  } else {
    // ── Play mode: GPS-driven ──
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
  }

  const clubs = strategy?.player?.clubs || []
  const activeTool = activeRangefinderTool

  const handleToolToggle = (tool: RangefinderTool) => {
    if (activeTool === tool) {
      ctx.setActiveRangefinderTool('none')
    } else {
      ctx.setActiveRangefinderTool(tool)
      // Auto-select first club if needed and none selected
      const toolDef = TOOLS.find(t => t.key === tool)
      if (toolDef?.needsClub && !selectedClubType && clubs.length > 0) {
        ctx.setSelectedClubType(clubs[0].club_type)
      }
    }
  }

  const needsClub = TOOLS.find(t => t.key === activeTool)?.needsClub ?? false

  return (
    <div className={s.rangefinder}>
      {/* Club recommendation */}
      {data.clubRec.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Club Recommendation</div>
          {data.clubRec.map((c, i) => (
            <div key={c.club} className={`${s.clubRow} ${i === 0 ? s.clubPrimary : ''}`}>
              <span className={s.clubName}>{c.club}</span>
              <span className={s.clubDist}>
                {c.avgYards}y avg
                <span style={{ marginLeft: 8, color: c.delta >= 0 ? 'var(--accent)' : 'var(--warning, #ff9800)', fontWeight: 600 }}>
                  {c.delta >= 0 ? '+' : ''}{c.delta}y
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tool Results */}
      {toolResult && <ToolResultDisplay result={toolResult} />}

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

      {/* GPS accuracy (play mode only) */}
      {playMode && gps.watching && (
        <div className={s.gpsMeta}>
          GPS accuracy: ±{Math.round(gps.accuracy ?? 0)}m
        </div>
      )}
    </div>
  )
}

function ToolResultDisplay({ result }: { result: ToolResult }) {
  if (result.type === 'ruler' && result.distance != null) {
    return (
      <div className={s.section}>
        <div className={s.sectionTitle}>Ruler</div>
        <div className={s.clubRow}>
          <span className={s.clubName}>Distance</span>
          <span className={s.clubDist} style={{ fontWeight: 700 }}>{result.distance}y</span>
        </div>
      </div>
    )
  }

  if (result.type === 'carry' && result.carryResults) {
    return (
      <div className={s.section}>
        <div className={s.sectionTitle}>Carry Check — {result.distance}y</div>
        {result.carryResults.length === 0 ? (
          <p className={s.hint}>No clubs with enough data</p>
        ) : (
          result.carryResults.map(r => (
            <div key={r.type} className={s.clubRow}>
              <span className={s.clubName}>{r.type} ({Math.round(r.avg)}y)</span>
              <span style={{
                fontWeight: 700,
                color: r.pct >= 80 ? 'var(--accent)' : r.pct >= 50 ? 'var(--warning, #ff9800)' : 'var(--danger)',
              }}>
                {r.pct}%
              </span>
            </div>
          ))
        )}
      </div>
    )
  }

  if (result.type === 'recommend' && result.clubResults) {
    return (
      <div className={s.section}>
        <div className={s.sectionTitle}>Club Rec — {result.distance}y</div>
        {result.clubResults.length === 0 ? (
          <p className={s.hint}>No clubs with data</p>
        ) : (
          result.clubResults.map(r => (
            <div key={r.type} className={s.clubRow}>
              <span className={s.clubName}>{r.type} ({Math.round(r.avg)}y)</span>
              <span style={{
                fontWeight: 600,
                color: r.matchPct >= 75 ? 'var(--accent)' : r.matchPct >= 40 ? 'var(--warning, #ff9800)' : 'var(--text-dim)',
              }}>
                {r.delta >= 0 ? '+' : ''}{r.delta}y
              </span>
            </div>
          ))
        )}
      </div>
    )
  }

  return null
}
