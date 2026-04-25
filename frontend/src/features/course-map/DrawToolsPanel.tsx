import { useMemo } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap, HAZARD_COLORS, HAZARD_LABELS } from './courseMapState'
import type { DrawTool, HazardType } from './courseMapState'
import { haversineYards } from './geoUtils'
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
  const { activeTool, hazardType, currentFwBoundary, currentHazard, fairwayBoundaries, greenBoundary, hazards, fairwayPath, teePos, greenPos, showUnlinkedOsm, course } = ctx

  // Count unlinked OSM holes (osm_holes not referenced by any CourseHole.osm_hole_id)
  const unlinkedOsmCount = useMemo(() => {
    if (!course?.osm_holes?.length) return 0
    const linked = new Set<number>()
    for (const t of course.tees || []) {
      for (const h of t.holes || []) {
        if (h.osm_hole_id) linked.add(h.osm_hole_id)
      }
    }
    return course.osm_holes.filter((oh) => !linked.has(oh.id)).length
  }, [course])

  // Fairway guide: recommended nodes + gap warning
  const fairwayGuide = useMemo(() => {
    if (activeTool !== 'fairway') return null
    const par = parseInt(ctx._formValues.par) || 0
    let recommended = ''
    if (par === 3) recommended = '3–4'
    else if (par === 4) recommended = '7–8'
    else if (par === 5) recommended = '10–12'
    else if (par >= 6) recommended = '5–7'

    const count = fairwayPath.length

    // Build full path: tee → waypoints → green for gap check
    const fullPath = [
      ...(teePos ? [teePos] : []),
      ...fairwayPath,
      ...(greenPos ? [greenPos] : []),
    ]
    let maxGap = 0
    for (let i = 1; i < fullPath.length; i++) {
      const d = haversineYards(fullPath[i - 1].lat, fullPath[i - 1].lng, fullPath[i].lat, fullPath[i].lng)
      if (d > maxGap) maxGap = d
    }

    return { par, recommended, count, maxGap: Math.round(maxGap) }
  }, [activeTool, ctx._formValues.par, fairwayPath, teePos, greenPos])

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

  // Stage 20f: drawing tools are disabled while the desktop map migrates from
  // Leaflet to MapLibre. The implementation below stays intact and returns in
  // Stage 20g (full feature parity). Delete this notice block to re-enable.
  return (
    <FloatingPanel title="Drawing Tools" onClose={onClose} width={300}>
      <div style={{ padding: '12px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
          Drawing tools are migrating
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted, #aaa)' }}>
          The desktop map is being upgraded from Leaflet to MapLibre. Drawing tools
          (place tee/green, fairway lines and boundaries, hazards) return in the next
          release.
          <br /><br />
          On mobile, all drawing already works via the new map. To edit course data on
          desktop in the meantime, open the page on a phone or tablet.
        </div>
      </div>
    </FloatingPanel>
  )

  // eslint-disable-next-line no-unreachable
  return (
    <FloatingPanel title="Drawing Tools" onClose={onClose} width={280}>
      {/* Unlinked OSM features toggle */}
      {unlinkedOsmCount > 0 && (
        <div className={s.section}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showUnlinkedOsm}
              onChange={(e) => ctx.setShowUnlinkedOsm(e.target.checked)}
            />
            <span>
              Show unlinked OSM features
              <span style={{ color: '#FF7043', fontWeight: 600, marginLeft: 4 }}>({unlinkedOsmCount})</span>
            </span>
          </label>
          {showUnlinkedOsm && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #aaa)', marginTop: 4 }}>
              Click a marker to assign a hole. Place Tee / Place Green will snap to nearby features.
            </div>
          )}
        </div>
      )}

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

      {/* Fairway line guide */}
      {fairwayGuide && fairwayGuide.par >= 3 && (
        <div className={s.section}>
          <div style={{ fontSize: 12, color: fairwayGuide.recommended && fairwayGuide.count >= parseInt(fairwayGuide.recommended) ? 'var(--color-success, #66BB6A)' : 'var(--color-text-secondary, #aaa)' }}>
            Fairway: {fairwayGuide.count} / {fairwayGuide.recommended} recommended for par {fairwayGuide.par}
          </div>
          {fairwayGuide.maxGap > 80 && (
            <div style={{ fontSize: 12, color: '#f44336', marginTop: 2 }}>
              {fairwayGuide.maxGap} yd gap — add a point to improve accuracy
            </div>
          )}
        </div>
      )}

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
