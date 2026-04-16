import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useMobileMap } from './MobileMapContext'
import { TEE_COLORS, HAZARD_COLORS } from '../courseMapState'
import { haversineYards } from '../geoUtils'

/**
 * MobileMapOverlays: Read-only version of MapOverlays.
 * Renders tee markers, fairway, green, hazards — no editing interactions.
 * When editMode is set, renders a tap target for placement.
 */
export function MobileMapOverlays() {
  const map = useMap()
  const ctx = useMobileMap()
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const layerGroupRef = useRef<L.LayerGroup>(L.layerGroup())

  useEffect(() => {
    const lg = layerGroupRef.current
    if (!map.hasLayer(lg)) lg.addTo(map)
    return () => {
      lg.clearLayers()
      if (map.hasLayer(lg)) map.removeLayer(lg)
    }
  }, [map])

  // Redraw on key change
  useEffect(() => {
    const lg = layerGroupRef.current
    lg.clearLayers()

    const { teePos, greenPos, fairwayPath, teePositions, fairwayBoundaries, greenBoundary, hazards, course, teeId, showOverlays, editMode } = ctx
    const activeTee = course?.tees?.find(t => t.id === teeId)
    const activeTeeName = activeTee?.tee_name ?? ''
    // When overlays are hidden, only show tee marker, green/flag, and hazards (no lines/boundaries)
    const showLines = showOverlays || !!editMode

    // ── Fairway centerline ──
    const hasFairwayData = fairwayPath.length >= 1 || (teePos && greenPos)
    if (showLines && hasFairwayData) {
      const pts: [number, number][] = []
      if (teePos) pts.push([teePos.lat, teePos.lng])
      fairwayPath.forEach(p => pts.push([p.lat, p.lng]))
      if (greenPos) pts.push([greenPos.lat, greenPos.lng])

      if (pts.length >= 2) {
        L.polyline(pts, { color: '#FFD700', weight: 2, dashArray: '6,4', interactive: false }).addTo(lg)

        // Segment distance labels
        for (let i = 1; i < pts.length; i++) {
          const d = Math.round(haversineYards(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]))
          const midLat = (pts[i-1][0] + pts[i][0]) / 2
          const midLng = (pts[i-1][1] + pts[i][1]) / 2
          L.marker([midLat, midLng], {
            icon: L.divIcon({
              className: 'leaflet-seg-label',
              html: `<div style="color:#FFD700;font-size:10px;font-weight:700;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap;">${d}y</div>`,
              iconSize: [0, 0], iconAnchor: [0, 6],
            }),
            interactive: false,
          }).addTo(lg)
        }
      }
    }

    // ── Fairway boundaries ──
    if (showLines) {
      for (const poly of fairwayBoundaries) {
        if (poly.length >= 3) {
          L.polygon(poly.map(p => [p.lat, p.lng] as [number, number]), {
            color: '#4CAF50', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.15, interactive: false,
          }).addTo(lg)
        }
      }
    }

    // ── Tee markers ──
    for (const [name, pos] of Object.entries(teePositions)) {
      const isActive = name === activeTeeName
      const color = TEE_COLORS[name.split(' ')[0]] || '#999'
      const size = isActive ? 24 : 18
      const textColor = color === '#fff' ? '#333' : '#fff'
      L.marker([pos.lat, pos.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'leaflet-edit-tee',
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:${textColor};opacity:${isActive ? 1 : 0.6};margin:-${size/2}px 0 0 -${size/2}px;">T</div>`,
          iconSize: [0, 0],
        }),
        zIndexOffset: isActive ? 1000 : 500,
      }).addTo(lg)
    }

    // ── Green/flag marker ──
    if (greenPos) {
      const flagSvg = '<svg width="20" height="24" viewBox="0 0 20 24"><line x1="4" y1="2" x2="4" y2="22" stroke="#fff" stroke-width="2"/><polygon points="5,2 18,7 5,12" fill="#ef5350"/><circle cx="4" cy="22" r="2.5" fill="#fff" stroke="#333"/></svg>'
      L.marker([greenPos.lat, greenPos.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'leaflet-edit-flag',
          html: flagSvg,
          iconSize: [20, 24],
          iconAnchor: [4, 22],
        }),
        zIndexOffset: 900,
      }).addTo(lg)
    }

    // ── Green boundary ──
    if (showLines && greenBoundary.length >= 3) {
      L.polygon(greenBoundary.map(p => [p.lat, p.lng] as [number, number]), {
        color: '#4CAF50', weight: 2, fillColor: '#4CAF50', fillOpacity: 0.25, interactive: false,
      }).addTo(lg)
    }

    // ── Hazards ──
    for (const h of hazards) {
      if (h._deleted || h.boundary.length < 3) continue
      const [fill, stroke] = HAZARD_COLORS[h.hazard_type] || ['#999', '#666']
      const poly = L.polygon(h.boundary.map(p => [p.lat, p.lng] as [number, number]), {
        color: stroke, weight: 1.5, fillColor: fill, fillOpacity: 0.3, interactive: false,
      }).addTo(lg)
      if (h.name) poly.bindTooltip(h.name, { permanent: false })
    }
  }, [ctx.redrawKey, ctx.showOverlays, map])

  // ── Edit mode: map click handler ──
  useEffect(() => {
    const handleClick = (e: L.LeafletMouseEvent) => {
      const c = ctxRef.current
      if (!c.editMode) return
      const { lat, lng } = e.latlng

      switch (c.editMode) {
        case 'tee': {
          const newPos = { lat, lng }
          c.setTeePos(newPos)
          c.setDirty(true)
          c.triggerRedraw()
          break
        }
        case 'green':
          c.setGreenPos({ lat, lng })
          c.setDirty(true)
          c.triggerRedraw()
          break
        case 'fairway':
          c.setFairwayPath([...c.fairwayPath, { lat, lng }])
          c.setDirty(true)
          c.triggerRedraw()
          break
      }
    }

    map.on('click', handleClick)
    return () => { map.off('click', handleClick) }
  }, [map])

  return null
}
