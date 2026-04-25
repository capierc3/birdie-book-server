import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useCourseMap, TEE_COLORS, HAZARD_COLORS } from './courseMapState'
import type { LatLng } from './courseMapState'
import type { CourseDetail, OSMHole } from '../../api'
import { haversineYards, pointToSegmentDist } from './geoUtils'

// Snap threshold: clicking within this distance of an unlinked OSM feature
// with Place Tee / Place Green active snaps to it and auto-links.
const OSM_SNAP_YARDS = 30

function getUnlinkedOsmHoles(course: CourseDetail): OSMHole[] {
  const linkedIds = new Set<number>()
  for (const t of course.tees || []) {
    for (const h of t.holes || []) {
      if (h.osm_hole_id) linkedIds.add(h.osm_hole_id)
    }
  }
  return (course.osm_holes || []).filter((oh) => !linkedIds.has(oh.id))
}

/**
 * MapOverlays: Renders all editor overlays on the Leaflet map.
 * This is a headless component (renders null) that uses useMap() + imperative Leaflet API.
 * Re-renders when redrawKey changes.
 */
export function MapOverlays() {
  const map = useMap()
  const ctx = useCourseMap()
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx // Always keep ref in sync with latest context
  const layerGroupRef = useRef<L.LayerGroup>(L.layerGroup())

  // Add layer group to map (handles StrictMode remounts)
  useEffect(() => {
    const lg = layerGroupRef.current
    if (!map.hasLayer(lg)) {
      lg.addTo(map)
    }
    return () => {
      lg.clearLayers()
      if (map.hasLayer(lg)) map.removeLayer(lg)
    }
  }, [map])

  // Redraw all overlays when redrawKey changes
  useEffect(() => {
    const lg = layerGroupRef.current
    lg.clearLayers()

    const drawOpen = ctx.drawPanelOpen
    const activeTee = ctx.course?.tees?.find((t) => t.id === ctx.teeId)
    const activeTeeName = activeTee?.tee_name ?? ''

    // ── Fairway centerline ──
    const { teePos, greenPos, fairwayPath } = ctx
    const hasFairwayData = fairwayPath.length >= 1 || (teePos && greenPos)
    let fairwayLine: L.Polyline | null = null

    if (hasFairwayData) {
      const pts: [number, number][] = []
      if (teePos) pts.push([teePos.lat, teePos.lng])
      fairwayPath.forEach((p) => pts.push([p.lat, p.lng]))
      if (greenPos) pts.push([greenPos.lat, greenPos.lng])

      if (pts.length >= 2) {
        fairwayLine = L.polyline(pts, {
          color: '#FFD700', weight: 2, dashArray: '6,4', interactive: false,
        }).addTo(lg)
      }

      // Waypoint markers + segment distances (only when draw panel open)
      if (drawOpen) {
        fairwayPath.forEach((p, i) => {
          // Segment distance label
          if (i > 0 || teePos) {
            const prev = i === 0 ? teePos! : fairwayPath[i - 1]
            const segDist = Math.round(haversineYards(prev.lat, prev.lng, p.lat, p.lng))
            const midLat = (prev.lat + p.lat) / 2
            const midLng = (prev.lng + p.lng) / 2
            L.marker([midLat, midLng], {
              icon: L.divIcon({
                className: 'leaflet-seg-label',
                html: `<div style="color:#FFD700;font-size:10px;font-weight:700;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;">${segDist}y</div>`,
                iconSize: [0, 0], iconAnchor: [0, 6],
              }),
              interactive: false,
            }).addTo(lg)
          }

          // Draggable waypoint marker
          const m = L.marker([p.lat, p.lng], {
            draggable: true,
            icon: L.divIcon({
              className: 'leaflet-fairway-wp',
              html: '<div style="width:12px;height:12px;border-radius:50%;background:#FFD700;border:2px solid #fff;margin:-6px 0 0 -6px;"></div>',
              iconSize: [0, 0],
            }),
          }).addTo(lg)

          m.on('drag', (e: L.LeafletEvent) => {
            const ll = (e as L.LeafletMouseEvent).latlng ?? (e.target as L.Marker).getLatLng()
            ctx.fairwayPath[i] = { lat: ll.lat, lng: ll.lng }
            ctx.setDirty(true)
            if (fairwayLine) {
              const livePts: [number, number][] = []
              if (teePos) livePts.push([teePos.lat, teePos.lng])
              ctx.fairwayPath.forEach((fp) => livePts.push([fp.lat, fp.lng]))
              if (greenPos) livePts.push([greenPos.lat, greenPos.lng])
              fairwayLine.setLatLngs(livePts)
            }
          })
          m.on('dragend', () => ctx.triggerRedraw())
          m.on('contextmenu', () => {
            ctx.fairwayPath.splice(i, 1)
            ctx.setFairwayPath([...ctx.fairwayPath])
            ctx.setDirty(true)
            ctx.triggerRedraw()
          })
        })

        // Last segment: last waypoint → green
        if (greenPos && fairwayPath.length > 0) {
          const last = fairwayPath[fairwayPath.length - 1]
          const segDist = Math.round(haversineYards(last.lat, last.lng, greenPos.lat, greenPos.lng))
          L.marker([(last.lat + greenPos.lat) / 2, (last.lng + greenPos.lng) / 2], {
            icon: L.divIcon({
              className: 'leaflet-seg-label',
              html: `<div style="color:#FFD700;font-size:10px;font-weight:700;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;">${segDist}y</div>`,
              iconSize: [0, 0], iconAnchor: [0, 6],
            }),
            interactive: false,
          }).addTo(lg)
        }
      }
    }

    // ── Fairway boundary polygons ──
    ctx.fairwayBoundaries.forEach((poly, polyIdx) => {
      if (poly.length >= 3) {
        const p = L.polygon(poly.map((pt) => [pt.lat, pt.lng] as [number, number]), {
          color: '#4CAF50', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.15, interactive: drawOpen,
        }).addTo(lg)
        p.on('contextmenu', () => {
          if (!drawOpen) return
          const next = [...ctx.fairwayBoundaries]
          next.splice(polyIdx, 1)
          ctx.setFairwayBoundaries(next)
          ctx.setDirty(true)
          ctx.triggerRedraw()
        })
      }
      if (drawOpen) {
        poly.forEach((pt, i) => {
          const m = L.marker([pt.lat, pt.lng], {
            draggable: true,
            icon: L.divIcon({
              className: 'leaflet-fw-bnd',
              html: '<div style="width:10px;height:10px;border-radius:50%;background:#4CAF50;border:2px solid #fff;margin:-5px 0 0 -5px;"></div>',
              iconSize: [0, 0],
            }),
          }).addTo(lg)
          m.on('drag', (e: L.LeafletEvent) => {
            const ll = (e.target as L.Marker).getLatLng()
            ctx.fairwayBoundaries[polyIdx][i] = { lat: ll.lat, lng: ll.lng }
            ctx.setDirty(true)
          })
          m.on('dragend', () => ctx.triggerRedraw())
          m.on('contextmenu', () => {
            const next = ctx.fairwayBoundaries.map((b) => [...b])
            next[polyIdx].splice(i, 1)
            if (next[polyIdx].length === 0) next.splice(polyIdx, 1)
            ctx.setFairwayBoundaries(next)
            ctx.setDirty(true)
            ctx.triggerRedraw()
          })
        })
      }
    })

    // ── In-progress fairway boundary ──
    if (ctx.currentFwBoundary.length >= 1) {
      const pts = ctx.currentFwBoundary.map((p) => [p.lat, p.lng] as [number, number])
      if (pts.length >= 3) {
        L.polygon(pts, { color: '#4CAF50', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.1, dashArray: '4,4', interactive: false }).addTo(lg)
      } else if (pts.length === 2) {
        L.polyline(pts, { color: '#4CAF50', weight: 2, dashArray: '4,4', interactive: false }).addTo(lg)
      }
      ctx.currentFwBoundary.forEach((p) => {
        L.circleMarker([p.lat, p.lng], { radius: 5, color: '#4CAF50', fillColor: '#4CAF50', fillOpacity: 1, interactive: false }).addTo(lg)
      })
    }

    // ── Tee markers ──
    for (const [name, pos] of Object.entries(ctx.teePositions)) {
      const isActive = name === activeTeeName
      const color = TEE_COLORS[name.split(' ')[0]] || '#999'
      const size = isActive ? 24 : 18
      const textColor = color === '#fff' ? '#333' : '#fff'
      const m = L.marker([pos.lat, pos.lng], {
        draggable: isActive && drawOpen,
        interactive: isActive && drawOpen,
        icon: L.divIcon({
          className: 'leaflet-edit-tee',
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:${textColor};opacity:${isActive ? 1 : 0.6};margin:-${size / 2}px 0 0 -${size / 2}px;">T</div>`,
          iconSize: [0, 0],
        }),
        zIndexOffset: isActive ? 1000 : 500,
      }).addTo(lg)
      if (isActive) {
        m.on('dragend', (e: L.LeafletEvent) => {
          const ll = (e.target as L.Marker).getLatLng()
          const newPos = { lat: ll.lat, lng: ll.lng }
          ctx.setTeePos(newPos)
          ctx.teePositions[activeTeeName] = newPos
          ctx.setDirty(true)
          ctx.triggerRedraw()
        })
      }
    }

    // ── Green/flag marker ──
    if (greenPos) {
      const flagSvg = '<svg width="20" height="24" viewBox="0 0 20 24"><line x1="4" y1="2" x2="4" y2="22" stroke="#fff" stroke-width="2"/><polygon points="5,2 18,7 5,12" fill="#ef5350"/><circle cx="4" cy="22" r="2.5" fill="#fff" stroke="#333"/></svg>'
      const m = L.marker([greenPos.lat, greenPos.lng], {
        draggable: drawOpen,
        interactive: drawOpen,
        icon: L.divIcon({
          className: 'leaflet-edit-flag',
          html: flagSvg,
          iconSize: [20, 24],
          iconAnchor: [4, 22],
        }),
        zIndexOffset: 900,
      }).addTo(lg)
      m.on('dragend', (e: L.LeafletEvent) => {
        const ll = (e.target as L.Marker).getLatLng()
        ctx.setGreenPos({ lat: ll.lat, lng: ll.lng })
        ctx.setDirty(true)
        ctx.triggerRedraw()
      })
    }

    // ── Green boundary ──
    if (ctx.greenBoundary.length >= 1) {
      const pts = ctx.greenBoundary.map((p) => [p.lat, p.lng] as [number, number])
      if (pts.length >= 3) {
        L.polygon(pts, { color: '#4CAF50', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.25, interactive: false }).addTo(lg)
      } else if (pts.length === 2) {
        L.polyline(pts, { color: '#4CAF50', weight: 2, dashArray: '4,4', interactive: false }).addTo(lg)
      }
      if (drawOpen) {
        ctx.greenBoundary.forEach((p, i) => {
          const m = L.marker([p.lat, p.lng], {
            draggable: true,
            icon: L.divIcon({
              className: 'leaflet-green-bnd',
              html: '<div style="width:8px;height:8px;border-radius:50%;background:#4CAF50;border:1px solid #fff;margin:-4px 0 0 -4px;"></div>',
              iconSize: [0, 0],
            }),
          }).addTo(lg)
          m.on('drag', (e: L.LeafletEvent) => {
            const ll = (e.target as L.Marker).getLatLng()
            ctx.greenBoundary[i] = { lat: ll.lat, lng: ll.lng }
            ctx.setDirty(true)
          })
          m.on('dragend', () => ctx.triggerRedraw())
          m.on('contextmenu', () => {
            const next = [...ctx.greenBoundary]
            next.splice(i, 1)
            ctx.setGreenBoundary(next)
            ctx.setDirty(true)
            ctx.triggerRedraw()
          })
        })
      }
    }

    // ── Hazards ──
    ctx.hazards.forEach((h, idx) => {
      if (h._deleted || h.boundary.length < 3) return
      const [fill, stroke] = HAZARD_COLORS[h.hazard_type] || ['#999', '#666']
      // L.polygon accepts [outerRing, holeRing1, ...] for polygon-with-holes.
      const ringToLeaflet = (ring: { lat: number; lng: number }[]) =>
        ring.map((p) => [p.lat, p.lng] as [number, number])
      const rings: [number, number][][] = [
        ringToLeaflet(h.boundary),
        ...(h.holes ?? []).filter((r) => r.length >= 3).map(ringToLeaflet),
      ]
      const poly = L.polygon(rings, {
        color: stroke, weight: 1.5, fillColor: fill, fillOpacity: 0.3, interactive: drawOpen,
      }).addTo(lg)
      if (h.name) poly.bindTooltip(h.name, { permanent: false })
      poly.on('contextmenu', () => {
        if (!drawOpen) return
        const next = [...ctx.hazards]
        if (next[idx].id) next[idx] = { ...next[idx], _deleted: true }
        else next.splice(idx, 1)
        ctx.setHazards(next)
        ctx.setDirty(true)
        ctx.triggerRedraw()
      })
    })

    // ── Current hazard being drawn ──
    if (ctx.currentHazard.length >= 1) {
      const hColor = HAZARD_COLORS[ctx.hazardType]?.[0] || '#ffa726'
      const pts = ctx.currentHazard.map((p) => [p.lat, p.lng] as [number, number])
      if (pts.length >= 3) {
        L.polygon(pts, { color: hColor, weight: 2, fillColor: hColor, fillOpacity: 0.15, dashArray: '4,4', interactive: false }).addTo(lg)
      } else if (pts.length === 2) {
        L.polyline(pts, { color: hColor, weight: 2, dashArray: '4,4', interactive: false }).addTo(lg)
      }
      ctx.currentHazard.forEach((p) => {
        L.circleMarker([p.lat, p.lng], { radius: 5, color: hColor, fillColor: hColor, fillOpacity: 1, interactive: false }).addTo(lg)
      })
    }

    // ── Unlinked OSM features (for manual assignment) ──
    if (ctx.showUnlinkedOsm && ctx.course?.osm_holes?.length) {
      const unlinked = getUnlinkedOsmHoles(ctx.course)
      const totalHoles = ctx.course.holes ?? 18
      const OSM_COLOR = '#FF7043'  // orange — visually distinct from tees/greens/hazards

      for (const oh of unlinked) {
        // Centerline waypoints (dashed)
        if (oh.waypoints) {
          try {
            const pts = (JSON.parse(oh.waypoints) as number[][]).map((p) => [p[0], p[1]] as [number, number])
            if (pts.length >= 2) {
              L.polyline(pts, { color: OSM_COLOR, weight: 2, dashArray: '3,6', opacity: 0.7, interactive: false }).addTo(lg)
            }
          } catch { /* ignore */ }
        }

        // Green boundary (dashed outline)
        if (oh.green_boundary) {
          try {
            const pts = (JSON.parse(oh.green_boundary) as number[][]).map((p) => [p[0], p[1]] as [number, number])
            if (pts.length >= 3) {
              L.polygon(pts, { color: OSM_COLOR, weight: 1.5, fillColor: OSM_COLOR, fillOpacity: 0.1, dashArray: '3,5', interactive: false }).addTo(lg)
            }
          } catch { /* ignore */ }
        }

        const buildPopupHtml = (isTee: boolean) => {
          const label = isTee ? 'Tee' : 'Green'
          const holeNumLabel = oh.hole_number ? ` ${oh.hole_number}` : ''
          const parLabel = oh.par ? ` · par ${oh.par}` : ''
          const options = Array.from({ length: totalHoles }, (_, i) => {
            const n = i + 1
            const selected = oh.hole_number === n ? ' selected' : ''
            return `<option value="${n}"${selected}>${n}</option>`
          }).join('')
          return `
            <div style="min-width:180px;font-size:13px;color:var(--text);">
              <div style="font-weight:600;margin-bottom:6px;color:var(--text);">OSM Hole${holeNumLabel} · ${label}${parLabel}</div>
              <label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-muted);">Assign to course hole</label>
              <div style="display:flex;gap:4px;">
                <select data-osm-assign-select style="flex:1;font-size:13px;padding:4px 6px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;outline:none;">${options}</select>
                <button data-osm-assign-btn style="font-size:12px;font-weight:600;padding:4px 10px;cursor:pointer;background:var(--accent);color:#fff;border:none;border-radius:4px;">Assign</button>
              </div>
            </div>
          `
        }

        const attachPopupHandler = (popup: L.Popup) => {
          const el = popup.getElement()
          if (!el) return
          const btn = el.querySelector('[data-osm-assign-btn]') as HTMLButtonElement | null
          const sel = el.querySelector('[data-osm-assign-select]') as HTMLSelectElement | null
          if (!btn || !sel) return
          btn.onclick = () => {
            const holeNum = Number(sel.value)
            if (!holeNum) return
            btn.disabled = true
            btn.textContent = '…'
            ctxRef.current.assignOsmHoleToHole(oh.id, holeNum, true)
              .then(() => map.closePopup(popup))
              .catch(() => { btn.disabled = false; btn.textContent = 'Assign' })
          }
        }

        // Tee marker
        if (oh.tee_lat != null && oh.tee_lng != null) {
          const teeMarker = L.marker([oh.tee_lat, oh.tee_lng], {
            icon: L.divIcon({
              className: 'leaflet-osm-tee',
              html: `<div style="width:20px;height:20px;border-radius:50%;background:${OSM_COLOR};border:2px dashed #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff;margin:-10px 0 0 -10px;opacity:0.85;">T</div>`,
              iconSize: [0, 0],
            }),
            zIndexOffset: 700,
          }).addTo(lg)
          teeMarker.bindTooltip(`OSM Tee${oh.hole_number ? ` (hole ${oh.hole_number})` : ''} — click to assign`)
          teeMarker.bindPopup(buildPopupHtml(true), { className: 'osm-assign-popup' })
          teeMarker.on('popupopen', (e) => attachPopupHandler((e as L.PopupEvent).popup))
        }

        // Green marker
        if (oh.green_lat != null && oh.green_lng != null) {
          const greenMarker = L.marker([oh.green_lat, oh.green_lng], {
            icon: L.divIcon({
              className: 'leaflet-osm-green',
              html: `<div style="width:18px;height:18px;border-radius:50%;background:${OSM_COLOR};border:2px dashed #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff;margin:-9px 0 0 -9px;opacity:0.85;">G</div>`,
              iconSize: [0, 0],
            }),
            zIndexOffset: 700,
          }).addTo(lg)
          greenMarker.bindTooltip(`OSM Green${oh.hole_number ? ` (hole ${oh.hole_number})` : ''} — click to assign`)
          greenMarker.bindPopup(buildPopupHtml(false), { className: 'osm-assign-popup' })
          greenMarker.on('popupopen', (e) => attachPopupHandler((e as L.PopupEvent).popup))
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.redrawKey, ctx.showUnlinkedOsm, map])

  // ── Map click handler for drawing tools ──
  // Uses ctxRef to always read latest state (avoids stale closures in Leaflet callbacks)
  useEffect(() => {
    const handleClick = (e: L.LeafletMouseEvent) => {
      const c = ctxRef.current
      if (!c.drawPanelOpen || !c.activeTool) return
      const { lat, lng } = e.latlng

      switch (c.activeTool) {
        case 'tee': {
          let newPos = { lat, lng }
          let snappedOsmId: number | null = null
          if (c.course) {
            const unlinked = getUnlinkedOsmHoles(c.course)
            let best: OSMHole | null = null
            let bestDist = OSM_SNAP_YARDS
            for (const oh of unlinked) {
              if (oh.tee_lat == null || oh.tee_lng == null) continue
              const d = haversineYards(lat, lng, oh.tee_lat, oh.tee_lng)
              if (d < bestDist) { best = oh; bestDist = d }
            }
            if (best && best.tee_lat != null && best.tee_lng != null) {
              newPos = { lat: best.tee_lat, lng: best.tee_lng }
              snappedOsmId = best.id
            }
          }
          c.setTeePos(newPos)
          const activeTee = c.course?.tees?.find((t) => t.id === c.teeId)
          if (activeTee) {
            c.teePositions[activeTee.tee_name] = newPos
          }
          if (snappedOsmId != null) {
            // Link without applying GPS server-side (we already set it locally);
            // preserves any other unsaved edits on this hole.
            c.assignOsmHoleToHole(snappedOsmId, c.currentHole, false)
          }
          break
        }
        case 'green': {
          let newPos = { lat, lng }
          let snappedOsmId: number | null = null
          if (c.course) {
            const unlinked = getUnlinkedOsmHoles(c.course)
            let best: OSMHole | null = null
            let bestDist = OSM_SNAP_YARDS
            for (const oh of unlinked) {
              if (oh.green_lat == null || oh.green_lng == null) continue
              const d = haversineYards(lat, lng, oh.green_lat, oh.green_lng)
              if (d < bestDist) { best = oh; bestDist = d }
            }
            if (best && best.green_lat != null && best.green_lng != null) {
              newPos = { lat: best.green_lat, lng: best.green_lng }
              snappedOsmId = best.id
            }
          }
          c.setGreenPos(newPos)
          if (snappedOsmId != null) {
            c.assignOsmHoleToHole(snappedOsmId, c.currentHole, false)
          }
          break
        }
        case 'fairway': {
          // Smart insertion at closest segment
          const path = c.fairwayPath
          if (path.length === 0) {
            c.setFairwayPath([{ lat, lng }])
          } else {
            const allPts: LatLng[] = []
            if (c.teePos) allPts.push(c.teePos)
            allPts.push(...path)
            if (c.greenPos) allPts.push(c.greenPos)

            let bestIdx = path.length
            let bestDist = Infinity
            for (let i = 0; i < allPts.length - 1; i++) {
              const d = pointToSegmentDist(lat, lng, allPts[i].lat, allPts[i].lng, allPts[i + 1].lat, allPts[i + 1].lng)
              if (d < bestDist) {
                bestDist = d
                bestIdx = c.teePos ? i : i + 1
              }
            }
            const newPath = [...path]
            const insertAt = Math.max(0, Math.min(bestIdx, newPath.length))
            newPath.splice(insertAt, 0, { lat, lng })
            c.setFairwayPath(newPath)
          }
          break
        }
        case 'fairway-boundary':
          c.setCurrentFwBoundary([...c.currentFwBoundary, { lat, lng }])
          break
        case 'green-boundary':
          c.setGreenBoundary([...c.greenBoundary, { lat, lng }])
          break
        case 'hazard':
          c.setCurrentHazard([...c.currentHazard, { lat, lng }])
          break
      }

      c.setDirty(true)
      c.triggerRedraw()
    }

    const handleDblClick = (e: L.LeafletMouseEvent) => {
      const c = ctxRef.current
      if (!c.drawPanelOpen) return
      L.DomEvent.stopPropagation(e)
      if (c.activeTool === 'fairway-boundary' && c.currentFwBoundary.length >= 3) {
        c.finishFwBoundary()
      }
      if (c.activeTool === 'hazard' && c.currentHazard.length >= 3) {
        c.finishHazard()
      }
    }

    map.on('click', handleClick)
    map.on('dblclick', handleDblClick)

    return () => {
      map.off('click', handleClick)
      map.off('dblclick', handleDblClick)
    }
  }, [map])

  return null
}
