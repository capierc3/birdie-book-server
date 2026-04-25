import { useMemo } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap } from './courseMapState'
import s from './panels.module.css'

export type StrategyTool = 'ruler' | 'cone' | 'landing' | 'carry' | 'recommend' | 'placeball'

const TOOLS: { id: StrategyTool; label: string; title: string }[] = [
  { id: 'ruler', label: 'Ruler', title: 'Measure distance' },
  { id: 'cone', label: 'Dispersion', title: 'Shot Dispersion Cone' },
  { id: 'landing', label: 'Landing', title: 'Landing Zone' },
  { id: 'carry', label: 'Carry?', title: 'Can I Carry?' },
  { id: 'recommend', label: 'Club Rec', title: 'Club Recommendation' },
  { id: 'placeball', label: 'Place Ball', title: 'Place ball position' },
]

const TOOL_INSTRUCTIONS: Record<StrategyTool, string> = {
  ruler: 'Click & drag to measure distance',
  cone: 'Click & drag from a spot to aim your shot',
  landing: 'Click a spot to see where the ball lands',
  carry: 'Click a point to check carry distances',
  recommend: 'Click a target to get club recommendations',
  placeball: 'Click to place ball position (used by Carry & Club Rec)',
}

export function StrategyToolsPanel({ onClose }: { onClose: () => void }) {
  const ctx = useCourseMap()
  const { strategy, ballPos } = ctx

  const activeTool = ctx.activeStrategyTool as StrategyTool
  const setActiveTool = (tool: StrategyTool) => ctx.setActiveStrategyTool(tool)

  const clubs = useMemo(() => strategy?.player?.clubs || [], [strategy])

  const handleToolSelect = (tool: StrategyTool) => {
    setActiveTool(tool)
    // Hide results section when switching tools
    const el = document.getElementById('strategy-results-section')
    if (el) el.style.display = 'none'
  }

  const handleResetBall = () => {
    ctx.setBallPos(null)
    ctx.triggerRedraw()
  }

  // Stage 20f: strategy tools (ruler, cone, landing, carry, recommend) all rely
  // on Leaflet map mousemove/click events. They return in Stage 20g alongside
  // drawing tools. The implementation below stays intact for restoration.
  return (
    <FloatingPanel title="Strategy" onClose={onClose} width={300}>
      <div style={{ padding: '12px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
          Strategy tools are migrating
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted, #aaa)' }}>
          The ruler, dispersion cone, landing zone, carry check, and club recommend
          tools depend on map cursor events that are being rebuilt for MapLibre. They
          return in the next release.
        </div>
      </div>
    </FloatingPanel>
  )

  // eslint-disable-next-line no-unreachable
  return (
    <FloatingPanel title="Strategy" onClose={onClose} width={300}>
      {/* Tool buttons */}
      <div className={s.section}>
        <div className={s.toolGrid}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`${s.toolBtn} ${activeTool === t.id ? s.toolBtnActive : ''}`}
              title={t.title}
              onClick={() => handleToolSelect(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Club selector */}
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Club</label>
          <select id="strategy-club-select" className={s.fieldInput} style={{ width: '100%' }}>
            {clubs.map((c) => (
              <option key={c.club_type} value={c.club_type}>
                {c.club_type} ({Math.round(c.avg_yards)}y)
              </option>
            ))}
          </select>
        </div>

        {/* Ball position */}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          Ball: <span style={{ color: 'var(--text)' }}>{ballPos ? 'Custom' : 'Tee'}</span>
          {ballPos && (
            <button className={s.ghostBtn} style={{ fontSize: '0.65rem', padding: '1px 4px' }} onClick={handleResetBall}>Reset to Tee</button>
          )}
        </div>

        {/* Instructions */}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 4 }}>
          {TOOL_INSTRUCTIONS[activeTool]}
        </div>
      </div>

      {/* Results (populated by StrategyOverlays via DOM) */}
      <div id="strategy-results-section" className={s.section} style={{ display: 'none' }}>
        <div className={s.sectionLabel}>Results</div>
        <div id="strategy-results-content" /></div>
    </FloatingPanel>
  )
}
