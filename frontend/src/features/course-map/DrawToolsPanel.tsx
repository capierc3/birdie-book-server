import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap, HAZARD_COLORS, HAZARD_LABELS } from './courseMapState'
import type { DrawTool, HazardType } from './courseMapState'
import s from './panels.module.css'

const TOOLS: { id: DrawTool; label: string }[] = [
  { id: 'tee', label: 'Place Tee' },
  { id: 'green', label: 'Place Green' },
  { id: 'fairway', label: 'FW Line' },
  { id: 'fairway-boundary', label: 'FW Boundary' },
  { id: 'green-boundary', label: 'Green Boundary' },
  { id: 'hazard', label: 'Hazard' },
]

const HAZARD_OPTIONS: { value: HazardType; label: string }[] = [
  { value: 'bunker', label: 'Bunker' },
  { value: 'water', label: 'Water' },
  { value: 'out_of_bounds', label: 'Out of Bounds' },
  { value: 'trees', label: 'Trees' },
  { value: 'waste_area', label: 'Waste Area' },
]

export function DrawToolsPanel({ onClose }: { onClose: () => void }) {
  const ctx = useCourseMap()
  const { activeTool, hazardType, currentFwBoundary, currentHazard, fairwayBoundaries, greenBoundary, hazards } = ctx

  const handleToolSelect = (tool: DrawTool) => {
    // Finish in-progress drawing if switching away
    if (activeTool !== 'hazard' && ctx.currentHazard.length >= 3) {
      ctx.finishHazard()
    }
    if (activeTool !== 'fairway-boundary' && ctx.currentFwBoundary.length >= 3) {
      ctx.finishFwBoundary()
    }
    ctx.setActiveTool(activeTool === tool ? null : tool)
  }

  const handleClearFairway = () => {
    ctx.setFairwayPath([])
    ctx.setDirty(true)
    ctx.triggerRedraw()
  }

  const handleClearGreenBoundary = () => {
    ctx.setGreenBoundary([])
    ctx.setDirty(true)
    ctx.triggerRedraw()
  }

  const handleFinishFwBoundary = () => {
    ctx.finishFwBoundary()
  }

  const handleDiscardFwBoundary = () => {
    ctx.setCurrentFwBoundary([])
    ctx.triggerRedraw()
  }

  const handleFinishHazard = () => {
    ctx.finishHazard()
  }

  const handleDiscardHazard = () => {
    ctx.setCurrentHazard([])
    ctx.triggerRedraw()
  }

  // Object list rendering
  const renderObjectList = () => {
    if (activeTool === 'hazard') {
      const filtered = hazards
        .map((h, i) => ({ ...h, _idx: i }))
        .filter((h) => h.hazard_type === hazardType && !h._deleted)
      return (
        <div className={s.section}>
          <div className={s.sectionLabel}>{HAZARD_LABELS[hazardType] || 'Hazards'}</div>
          {filtered.length === 0 ? (
            <div className={s.emptyText}>None drawn</div>
          ) : (
            filtered.map((h) => (
              <div key={h._idx} className={s.objectItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={s.colorDot} style={{ background: HAZARD_COLORS[h.hazard_type]?.[0] || '#999' }} />
                  <span>{HAZARD_LABELS[h.hazard_type] || h.hazard_type}{h.name ? ` — ${h.name}` : ''}</span>
                </div>
                <button className={s.deleteBtn} onClick={() => {
                  const next = [...hazards]
                  if (next[h._idx].id) next[h._idx] = { ...next[h._idx], _deleted: true }
                  else next.splice(h._idx, 1)
                  ctx.setHazards(next)
                  ctx.setDirty(true)
                  ctx.triggerRedraw()
                }}>&times;</button>
              </div>
            ))
          )}
        </div>
      )
    }

    if (activeTool === 'fairway-boundary') {
      return (
        <div className={s.section}>
          <div className={s.sectionLabel}>Fairway Boundaries</div>
          {fairwayBoundaries.length === 0 ? (
            <div className={s.emptyText}>None drawn</div>
          ) : (
            fairwayBoundaries.map((b, i) => (
              <div key={i} className={s.objectItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={s.colorDot} style={{ background: '#66BB6A' }} />
                  <span>FW Boundary {i + 1} ({b.length} pts)</span>
                </div>
                <button className={s.deleteBtn} onClick={() => {
                  const next = [...fairwayBoundaries]
                  next.splice(i, 1)
                  ctx.setFairwayBoundaries(next)
                  ctx.setDirty(true)
                  ctx.triggerRedraw()
                }}>&times;</button>
              </div>
            ))
          )}
        </div>
      )
    }

    if (activeTool === 'green-boundary') {
      return (
        <div className={s.section}>
          <div className={s.sectionLabel}>Green Boundary</div>
          {greenBoundary.length === 0 ? (
            <div className={s.emptyText}>None drawn</div>
          ) : (
            <div className={s.objectItem}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={s.colorDot} style={{ background: '#4CAF50' }} />
                <span>Green Boundary ({greenBoundary.length} pts)</span>
              </div>
              <button className={s.deleteBtn} onClick={() => {
                ctx.setGreenBoundary([])
                ctx.setDirty(true)
                ctx.triggerRedraw()
              }}>&times;</button>
            </div>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <FloatingPanel title="Drawing Tools" onClose={onClose} width={280}>
      {/* Tool buttons */}
      <div className={s.section}>
        <div className={s.toolGrid}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`${s.toolBtn} ${activeTool === t.id ? s.toolBtnActive : ''}`}
              onClick={() => handleToolSelect(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tool options */}
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button className={s.ghostBtn} onClick={handleClearFairway}>Clear FW Line</button>
          <button className={s.ghostBtn} onClick={handleClearGreenBoundary}>Clear Green Bnd</button>
        </div>
      </div>

      {/* FW Boundary in-progress section */}
      {activeTool === 'fairway-boundary' && currentFwBoundary.length > 0 && (
        <div className={s.section}>
          <div className={s.emptyText} style={{ marginBottom: 4 }}>
            Click to draw boundary polygon. Double-click or Done to finish. Draw multiple for split fairways.
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={s.actionBtn} onClick={handleFinishFwBoundary}>Done</button>
            <button className={s.ghostBtn} onClick={handleDiscardFwBoundary}>Discard</button>
          </div>
        </div>
      )}

      {/* Hazard section */}
      {activeTool === 'hazard' && (
        <div className={s.section}>
          <select
            className={s.fieldInput}
            style={{ width: '100%' }}
            value={hazardType}
            onChange={(e) => ctx.setHazardType(e.target.value as HazardType)}
          >
            {HAZARD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {currentHazard.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
              <button className={s.actionBtn} onClick={handleFinishHazard}>Done</button>
              <button className={s.ghostBtn} onClick={handleDiscardHazard}>Discard</button>
            </div>
          )}
        </div>
      )}

      {/* Object list */}
      {renderObjectList()}
    </FloatingPanel>
  )
}
