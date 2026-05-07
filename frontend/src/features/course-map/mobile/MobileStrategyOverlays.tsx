import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { Source, Layer, Marker, useMap } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, Polygon, LineString, Point, Position } from 'geojson'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import { useMobileMap } from './MobileMapContext'
import { haversineYards, destPoint, bearing } from '../geoUtils'
import { getClubStats, rankClubs, computeCarryProbabilities, getTeeStrategy, determineShotContext } from '../caddieCalc'
import type { ClubStats, RankedClub, CarryResult } from '../caddieCalc'

export interface ToolResult {
  type: 'ruler' | 'carry' | 'recommend' | 'cone' | 'landing'
  distance?: number
  carryResults?: CarryResult[]
  clubResults?: RankedClub[]
}

interface Props {
  onToolResult: (result: ToolResult | null) => void
}

const ARC_STEPS = 24
const CONE_STEPS = 20

function tapToolColor(tool: 'ruler' | 'carry' | 'recommend'): string {
  return tool === 'carry' ? '#f44336' : tool === 'recommend' ? '#2196F3' : '#FF5722'
}

/**
 * MobileStrategyOverlays — Stage 20d/e MapLibre version.
 *
 * Renders cone, landing-zone arcs, and tap-target overlays (ruler, carry,
 * recommend) as GeoJSON sources + layers. Pure calc helpers (rankClubs,
 * computeCarryProbabilities, getClubStats) are unchanged.
 */
export function MobileStrategyOverlays({ onToolResult }: Props) {
  const ctx = useMobileMap()
  const { current: defaultMap } = useMap()
  const map = defaultMap?.getMap()
  const onToolResultRef = useRef(onToolResult)
  onToolResultRef.current = onToolResult

  const [tapTarget, setTapTarget] = useState<{ lat: number; lng: number; distance: number } | null>(null)

  const getSelectedClub = useCallback((): ClubStats | null => {
    const c = ctx
    const clubType = c.selectedClubType
    if (!clubType) return null
    const player = c.strategy?.player
    const club = player?.clubs?.find(cl => cl.club_type === clubType)
    if (!club) return null
    return getClubStats(club, player?.lateral_dispersion?.[clubType], player?.miss_tendencies?.[clubType])
  }, [ctx])

  const tool = ctx.activeRangefinderTool

  // Reset tap target & emitted tool result when tool changes
  useEffect(() => {
    setTapTarget(null)
    if (tool === 'none') onToolResultRef.current(null)
  }, [tool])

  const originLL = useMemo<{ lat: number; lng: number } | null>(() => {
    const c = ctx
    const lat = c.playMode ? c.gps.lat : (c.ballPos?.lat ?? c.gps.lat ?? null)
    const lng = c.playMode ? c.gps.lng : (c.ballPos?.lng ?? c.gps.lng ?? null)
    if (lat == null || lng == null) return null
    return { lat, lng }
  }, [ctx])

  // ── Cone (origin → tap > fairway-aware tee strategy > green) ────────────
  const coneShapes = useMemo(() => {
    if (tool !== 'cone' || !originLL || !ctx.greenPos) return null
    const club = getSelectedClub()
    if (!club) return null

    // Aim priority: explicit tap overrides everything; otherwise tee shots
    // route through getTeeStrategy (handles doglegs); else aim straight at green.
    let aimBear: number
    if (tapTarget) {
      aimBear = bearing(originLL.lat, originLL.lng, tapTarget.lat, tapTarget.lng)
    } else {
      const distToGreen = haversineYards(originLL.lat, originLL.lng, ctx.greenPos.lat, ctx.greenPos.lng)
      const distFromTee = ctx.teePos
        ? haversineYards(originLL.lat, originLL.lng, ctx.teePos.lat, ctx.teePos.lng)
        : undefined
      const context = determineShotContext(distToGreen, true, distFromTee)
      const clubs = ctx.strategy?.player?.clubs || []
      let aimPoint = ctx.greenPos
      if (context === 'tee' && clubs.length > 0) {
        const par = parseInt(ctx.formValues.par || '4', 10) || 4
        const yardage = parseInt(ctx.formValues.yardage || '0', 10) || distToGreen
        const teeStrategy = getTeeStrategy(par, yardage, originLL, ctx.greenPos, ctx.fairwayPath, ctx.hazards, clubs)
        aimPoint = teeStrategy.aimPoint
      }
      aimBear = bearing(originLL.lat, originLL.lng, aimPoint.lat, aimPoint.lng)
    }
    const spreadInner = Math.atan2(club.lateralStd, club.avg)
    const spreadOuter = Math.atan2(club.lateralStd * 2, club.avg)
    const biasAngle = ((club.missRight - club.missLeft) / 100) * spreadOuter * 0.5
    const coneBearing = aimBear + biasAngle

    const buildRing = (spread: number, dist: number): Position[] => {
      const ring: Position[] = [[originLL.lng, originLL.lat]]
      for (let i = 0; i <= CONE_STEPS; i++) {
        const angle = coneBearing - spread + (i / CONE_STEPS) * spread * 2
        const pt = destPoint(originLL.lat, originLL.lng, angle, dist)
        ring.push([pt.lng, pt.lat])
      }
      ring.push([originLL.lng, originLL.lat])
      return ring
    }

    // Aim line ends at the tap point when overridden; otherwise extends `club.avg`
    // along the aim bearing for a sensible default length.
    const aimEnd = tapTarget
      ? { lat: tapTarget.lat, lng: tapTarget.lng }
      : destPoint(originLL.lat, originLL.lng, aimBear, club.avg)

    const outer: Feature<Polygon> = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [buildRing(spreadOuter, club.p90)] },
      properties: { color: club.color, opacity: 0.22, kind: 'outer' },
    }
    const inner: Feature<Polygon> = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [buildRing(spreadInner, club.avg)] },
      properties: { color: club.color, opacity: 0.42, kind: 'inner' },
    }
    const aimLine: Feature<LineString> = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[originLL.lng, originLL.lat], [aimEnd.lng, aimEnd.lat]] },
      properties: {},
    }
    const originPoint: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [originLL.lng, originLL.lat] },
      properties: { color: club.color },
    }

    return {
      polys: { type: 'FeatureCollection', features: [outer, inner] } as FeatureCollection,
      aim: { type: 'FeatureCollection', features: [aimLine] } as FeatureCollection,
      origin: { type: 'FeatureCollection', features: [originPoint] } as FeatureCollection,
      label: { lat: originLL.lat, lng: originLL.lng, color: club.color, text: `${club.type} ${Math.round(club.avg)}y` },
    }
  }, [tool, originLL, ctx.greenPos, ctx.teePos, ctx.fairwayPath, ctx.hazards, ctx.strategy, ctx.formValues.par, ctx.formValues.yardage, tapTarget, getSelectedClub])

  // ── Landing-zone arcs (auto: from origin) ───────────────────────────────
  const landingShapes = useMemo(() => {
    if (tool !== 'landing' || !originLL) return null
    const club = getSelectedClub()
    if (!club) return null

    const aimBear = ctx.greenPos
      ? bearing(originLL.lat, originLL.lng, ctx.greenPos.lat, ctx.greenPos.lng)
      : 0

    const arcRing = (dist: number): Position[] => {
      const pts: Position[] = []
      for (let i = 0; i <= ARC_STEPS; i++) {
        const angle = aimBear - Math.PI / 2 + (i / ARC_STEPS) * Math.PI
        const p = destPoint(originLL.lat, originLL.lng, angle, dist)
        pts.push([p.lng, p.lat])
      }
      return pts
    }
    const arcLine = (dist: number): Feature<LineString> => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: arcRing(dist) },
      properties: { color: club.color },
    })

    // Outer band (p10 → p90) as a polygon (outer arc + reversed inner arc)
    const outerArc = arcRing(club.p90)
    const innerArcRev = [...arcRing(club.p10)].reverse()
    const outerBand: Feature<Polygon> = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...outerArc, ...innerArcRev, outerArc[0]]] },
      properties: { color: club.color, opacity: 0.25, kind: 'outer' },
    }

    const innerNear = arcRing(Math.max(club.avg - club.std * 0.5, club.p10))
    const innerFarRev = [...arcRing(club.avg + club.std * 0.5)].reverse()
    const innerBand: Feature<Polygon> = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...innerFarRev, ...innerNear, innerFarRev[0]]] },
      properties: { color: club.color, opacity: 0.45, kind: 'inner' },
    }

    const originPoint: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [originLL.lng, originLL.lat] },
      properties: { color: club.color },
    }

    return {
      polys: { type: 'FeatureCollection', features: [outerBand, innerBand] } as FeatureCollection,
      avgArc: { type: 'FeatureCollection', features: [arcLine(club.avg)] } as FeatureCollection,
      sideArcs: { type: 'FeatureCollection', features: [arcLine(club.p10), arcLine(club.p90)] } as FeatureCollection,
      origin: { type: 'FeatureCollection', features: [originPoint] } as FeatureCollection,
      label: { lat: originLL.lat, lng: originLL.lng, color: club.color, text: `${club.type} ${Math.round(club.p10)}-${Math.round(club.p90)}y` },
    }
  }, [tool, originLL, ctx.greenPos, getSelectedClub])

  // ── Ruler / carry / recommend: tap target overlay ───────────────────────
  const tapShapes = useMemo(() => {
    if (!tapTarget || (tool !== 'ruler' && tool !== 'carry' && tool !== 'recommend')) return null
    const c = ctx
    const fromLat = c.playMode ? (c.gps.lat ?? c.teePos?.lat) : (c.ballPos?.lat ?? c.teePos?.lat)
    const fromLng = c.playMode ? (c.gps.lng ?? c.teePos?.lng) : (c.ballPos?.lng ?? c.teePos?.lng)
    if (fromLat == null || fromLng == null) return null

    const color = tapToolColor(tool)
    const line: Feature<LineString> = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[fromLng, fromLat], [tapTarget.lng, tapTarget.lat]] },
      properties: {},
    }
    const target: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [tapTarget.lng, tapTarget.lat] },
      properties: {},
    }

    // Top club for carry / recommend — shown as a chip under the player dot.
    let topClub: { text: string; color: string } | null = null
    const clubs = c.strategy?.player?.clubs || []
    if (clubs.length > 0) {
      if (tool === 'recommend') {
        const ranked = rankClubs(clubs, tapTarget.distance, { count: 1 })
        const top = ranked[0]
        if (top) {
          const clubColor = clubs.find(cl => cl.club_type === top.type)?.color || '#fff'
          topClub = { text: `${top.type} · ${Math.round(top.matchPct)}% fit`, color: clubColor }
        }
      } else if (tool === 'carry') {
        const carries = computeCarryProbabilities(clubs, tapTarget.distance, { maxResults: 1 })
        const top = carries[0]
        if (top) {
          const clubColor = clubs.find(cl => cl.club_type === top.type)?.color || '#fff'
          topClub = { text: `${top.type} · ${Math.round(top.pct)}% carry`, color: clubColor }
        }
      }
    }

    return {
      line: { type: 'FeatureCollection', features: [line] } as FeatureCollection,
      target: { type: 'FeatureCollection', features: [target] } as FeatureCollection,
      color,
      label: { lat: tapTarget.lat, lng: tapTarget.lng, distance: tapTarget.distance },
      playerLabel: topClub ? { lat: fromLat, lng: fromLng, ...topClub } : null,
    }
  }, [tapTarget, tool, ctx])

  // ── Emit tool results when shapes change ────────────────────────────────
  useEffect(() => {
    if (tool === 'cone' && coneShapes) {
      onToolResultRef.current({ type: 'cone' })
    } else if (tool === 'landing' && landingShapes) {
      onToolResultRef.current({ type: 'landing' })
    }
  }, [tool, coneShapes, landingShapes])

  // ── Map tap handler for ruler / carry / recommend / cone ───────────────
  useEffect(() => {
    if (!map) return
    if (tool !== 'ruler' && tool !== 'carry' && tool !== 'recommend' && tool !== 'cone') return

    const onClick = (e: MapLayerMouseEvent) => {
      const c = ctx
      if (c.editMode) return
      const fromLat = c.playMode ? (c.gps.lat ?? c.teePos?.lat) : (c.ballPos?.lat ?? c.teePos?.lat)
      const fromLng = c.playMode ? (c.gps.lng ?? c.teePos?.lng) : (c.ballPos?.lng ?? c.teePos?.lng)
      if (fromLat == null || fromLng == null) return

      const distance = Math.round(haversineYards(fromLat, fromLng, e.lngLat.lat, e.lngLat.lng))
      setTapTarget({ lat: e.lngLat.lat, lng: e.lngLat.lng, distance })

      if (tool === 'ruler') {
        onToolResultRef.current({ type: 'ruler', distance })
      } else if (tool === 'carry') {
        const clubs = c.strategy?.player?.clubs || []
        onToolResultRef.current({ type: 'carry', distance, carryResults: computeCarryProbabilities(clubs, distance) })
      } else if (tool === 'recommend') {
        const clubs = c.strategy?.player?.clubs || []
        onToolResultRef.current({ type: 'recommend', distance, clubResults: rankClubs(clubs, distance, { count: 5 }) })
      }
      // Cone: tap just sets aim — coneShapes re-derives the bearing/aim line.
    }

    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [map, tool, ctx])

  // Don't render anything when tool is off
  if (tool === 'none') return null

  return (
    <>
      {coneShapes && (
        <>
          <Source id="m-cone-polys" type="geojson" data={coneShapes.polys}>
            <Layer
              id="m-cone-polys-fill"
              type="fill"
              paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] }}
            />
            {/* Glow halo behind the outline */}
            <Layer
              id="m-cone-polys-glow"
              type="line"
              paint={{ 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.25, 'line-blur': 4 }}
            />
            <Layer
              id="m-cone-polys-line"
              type="line"
              paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.9 }}
            />
            {/* 3D volumetric fill on the inner cone — only visible when pitched */}
            <Layer
              id="m-cone-extrude"
              type="fill-extrusion"
              filter={['==', ['get', 'kind'], 'inner']}
              paint={{
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-opacity': 0.35,
                'fill-extrusion-height': 2.5,
                'fill-extrusion-base': 0,
              }}
            />
          </Source>
          <Source id="m-cone-aim" type="geojson" data={coneShapes.aim}>
            <Layer
              id="m-cone-aim-line"
              type="line"
              paint={{ 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [4, 2.5], 'line-opacity': 0.85 }}
            />
          </Source>
          <Source id="m-cone-origin" type="geojson" data={coneShapes.origin}>
            <Layer
              id="m-cone-origin-halo"
              type="circle"
              paint={{ 'circle-color': ['get', 'color'], 'circle-radius': 12, 'circle-opacity': 0.25, 'circle-blur': 0.6 }}
            />
            <Layer
              id="m-cone-origin-circle"
              type="circle"
              paint={{
                'circle-color': ['get', 'color'],
                'circle-radius': 5,
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
              }}
            />
          </Source>
          <Marker longitude={coneShapes.label.lng} latitude={coneShapes.label.lat} anchor="top" offset={[0, 14]}>
            <div style={{
              display: 'inline-block', background: 'rgba(0,0,0,0.85)', color: coneShapes.label.color,
              padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              border: `1px solid ${coneShapes.label.color}`,
            }}>{coneShapes.label.text}</div>
          </Marker>
        </>
      )}

      {landingShapes && (
        <>
          <Source id="m-land-polys" type="geojson" data={landingShapes.polys}>
            <Layer
              id="m-land-polys-fill"
              type="fill"
              paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] }}
            />
            {/* Glow halo behind the outline */}
            <Layer
              id="m-land-polys-glow"
              type="line"
              paint={{ 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.3, 'line-blur': 4 }}
            />
            <Layer
              id="m-land-polys-line"
              type="line"
              paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.9 }}
            />
            {/* 3D volumetric fill on the inner band — only visible when pitched */}
            <Layer
              id="m-land-extrude"
              type="fill-extrusion"
              filter={['==', ['get', 'kind'], 'inner']}
              paint={{
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-opacity': 0.4,
                'fill-extrusion-height': 2.5,
                'fill-extrusion-base': 0,
              }}
            />
          </Source>
          <Source id="m-land-avg" type="geojson" data={landingShapes.avgArc}>
            <Layer
              id="m-land-avg-line"
              type="line"
              paint={{ 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [3, 2], 'line-opacity': 0.95 }}
            />
          </Source>
          <Source id="m-land-side" type="geojson" data={landingShapes.sideArcs}>
            <Layer
              id="m-land-side-line"
              type="line"
              paint={{ 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.6 }}
            />
          </Source>
          <Source id="m-land-origin" type="geojson" data={landingShapes.origin}>
            <Layer
              id="m-land-origin-halo"
              type="circle"
              paint={{ 'circle-color': ['get', 'color'], 'circle-radius': 12, 'circle-opacity': 0.25, 'circle-blur': 0.6 }}
            />
            <Layer
              id="m-land-origin-circle"
              type="circle"
              paint={{
                'circle-color': ['get', 'color'],
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
                'circle-radius': 5,
              }}
            />
          </Source>
          <Marker longitude={landingShapes.label.lng} latitude={landingShapes.label.lat} anchor="top" offset={[0, 14]}>
            <div style={{
              display: 'inline-block', background: 'rgba(0,0,0,0.85)', color: landingShapes.label.color,
              padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              border: `1px solid ${landingShapes.label.color}`,
            }}>{landingShapes.label.text}</div>
          </Marker>
        </>
      )}

      {tapShapes && (
        <>
          <Source id="m-tap-line" type="geojson" data={tapShapes.line}>
            <Layer
              id="m-tap-line-line"
              type="line"
              paint={{ 'line-color': tapShapes.color, 'line-width': 2, 'line-dasharray': [2, 2] }}
            />
          </Source>
          <Source id="m-tap-target" type="geojson" data={tapShapes.target}>
            <Layer
              id="m-tap-target-circle"
              type="circle"
              paint={{
                'circle-color': tapShapes.color,
                'circle-stroke-color': tapShapes.color,
                'circle-stroke-width': 2,
                'circle-radius': 6,
                'circle-opacity': 0.5,
              }}
            />
          </Source>
          <Marker longitude={tapShapes.label.lng} latitude={tapShapes.label.lat} anchor="bottom" offset={[0, -10]}>
            <div style={{
              display: 'inline-block', background: 'rgba(0,0,0,0.8)', color: '#fff',
              padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>{tapShapes.label.distance}y</div>
          </Marker>
          {tapShapes.playerLabel && (
            <Marker longitude={tapShapes.playerLabel.lng} latitude={tapShapes.playerLabel.lat} anchor="top" offset={[0, 14]}>
              <div style={{
                display: 'inline-block', background: 'rgba(0,0,0,0.85)', color: tapShapes.playerLabel.color,
                padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                border: `1px solid ${tapShapes.playerLabel.color}`,
              }}>{tapShapes.playerLabel.text}</div>
            </Marker>
          )}
        </>
      )}
    </>
  )
}
