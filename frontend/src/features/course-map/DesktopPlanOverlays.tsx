import { useEffect, useMemo, useRef, useState } from 'react'
import { Source, Layer, Marker } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, LineString, Polygon, Position } from 'geojson'
import { useCourseMap } from './courseMapState'
import { getClubColor } from './clubColors'
import { bearing, destPoint } from './geoUtils'
import { get } from '../../api'

interface Plan {
  id: number
  name: string
  holes?: { hole_number: number; shots?: { shot_number: number; club?: string | null; aim_lat?: number | null; aim_lng?: number | null }[] }[]
}

/**
 * DesktopPlanOverlays — MapLibre version (Stage 20f).
 *
 * Renders planned shots: dashed connector lines, numbered start badges, aim
 * markers, and dispersion cones. Live cursor-following aiming (PlanAimOverlay)
 * is editing — it returns in 20g.
 */
export function DesktopPlanOverlays({ visible, planId }: { visible: boolean; planId: number | null }) {
  const ctx = useCourseMap()
  const { currentHole, teePos, greenPos, strategy, redrawKey } = ctx
  const [plan, setPlan] = useState<Plan | null>(null)
  const lastPlanIdRef = useRef<number | null>(null)

  // Load plan data when planId changes (or redrawKey bumps after edits)
  useEffect(() => {
    if (!planId || !visible) {
      setPlan(null)
      lastPlanIdRef.current = null
      return
    }
    let cancelled = false
    get<Plan>(`/plans/${planId}`)
      .then(p => { if (!cancelled) { setPlan(p); lastPlanIdRef.current = planId } })
      .catch(() => {})
    return () => { cancelled = true }
  }, [planId, visible, redrawKey])

  const planShots = useMemo(() => {
    if (!plan || !visible) return []
    const planHole = (plan.holes || []).find(h => h.hole_number === currentHole)
    return (planHole?.shots || []).slice().sort((a, b) => a.shot_number - b.shot_number)
  }, [plan, currentHole, visible])

  const getClubData = (clubType: string) => {
    const c = strategy?.player?.clubs?.find(cl => cl.club_type === clubType)
    if (!c) return null
    const lat = strategy?.player?.lateral_dispersion?.[clubType]
    return {
      color: c.color || getClubColor(clubType),
      avg: c.avg_yards,
      std: c.std_dev || c.avg_yards * 0.08,
      p10: c.p10 || c.avg_yards * 0.88,
      p90: c.p90 || c.avg_yards * 1.12,
      lateralStd: Math.min(lat?.lateral_std_dev || ((c.std_dev || 0) * 0.15) || 8, c.avg_yards * 0.12),
    }
  }

  // Pre-compute one entry per planned shot with origin, color, club data, etc.
  const shotData = useMemo(() => {
    return planShots.map((ps, idx) => {
      const prev = idx === 0 ? null : planShots[idx - 1]
      const origin = idx === 0
        ? teePos
        : (prev?.aim_lat ? { lat: prev.aim_lat!, lng: prev.aim_lng! } : null)
      if (!origin || ps.aim_lat == null || ps.aim_lng == null) return null
      const cd = ps.club ? getClubData(ps.club) : null
      const color = cd?.color || getClubColor(ps.club ?? null)
      return { idx, ps, origin, aim: { lat: ps.aim_lat, lng: ps.aim_lng }, cd, color }
    }).filter((s): s is NonNullable<typeof s> => s !== null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planShots, teePos, strategy])

  // Dashed shot lines (origin → aim) + final aim → green tail
  const linesFC = useMemo<FeatureCollection>(() => {
    if (!visible) return { type: 'FeatureCollection', features: [] }
    const features: Feature<LineString>[] = shotData.map(s => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [s.origin.lng, s.origin.lat],
          [s.aim.lng, s.aim.lat],
        ],
      },
      properties: { color: s.color, kind: 'shot' },
    }))
    if (shotData.length > 0 && greenPos) {
      const last = shotData[shotData.length - 1]
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [last.aim.lng, last.aim.lat],
            [greenPos.lng, greenPos.lat],
          ],
        },
        properties: { color: '#4caf50', kind: 'tail' },
      })
    }
    return { type: 'FeatureCollection', features }
  }, [shotData, greenPos, visible])

  // Outer + inner dispersion cones
  const conesFC = useMemo<FeatureCollection>(() => {
    if (!visible) return { type: 'FeatureCollection', features: [] }
    const features: Feature<Polygon>[] = []
    const steps = 20

    for (const s of shotData) {
      if (!s.cd || s.cd.avg <= 0) continue
      const b = bearing(s.origin.lat, s.origin.lng, s.aim.lat, s.aim.lng)
      const spreadInner = Math.atan2(s.cd.lateralStd, s.cd.avg)
      const spreadOuter = Math.atan2(s.cd.lateralStd * 2, s.cd.avg)

      // Outer cone (±2σ, p90)
      const outer: Position[] = [[s.origin.lng, s.origin.lat]]
      for (let i = 0; i <= steps; i++) {
        const angle = b - spreadOuter + (i / steps) * spreadOuter * 2
        const pt = destPoint(s.origin.lat, s.origin.lng, angle, s.cd.p90)
        outer.push([pt.lng, pt.lat])
      }
      outer.push([s.origin.lng, s.origin.lat])
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [outer] },
        properties: { color: s.color, kind: 'outer' },
      })

      // Inner cone (±1σ, avg)
      const inner: Position[] = [[s.origin.lng, s.origin.lat]]
      for (let i = 0; i <= steps; i++) {
        const angle = b - spreadInner + (i / steps) * spreadInner * 2
        const pt = destPoint(s.origin.lat, s.origin.lng, angle, s.cd.avg)
        inner.push([pt.lng, pt.lat])
      }
      inner.push([s.origin.lng, s.origin.lat])
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [inner] },
        properties: { color: s.color, kind: 'inner' },
      })
    }
    return { type: 'FeatureCollection', features }
  }, [shotData, visible])

  if (!visible) return null

  return (
    <>
      <Source id="d-plan-cones" type="geojson" data={conesFC}>
        {/* Outer cone (lighter) */}
        <Layer
          id="d-plan-cones-outer-fill"
          type="fill"
          filter={['==', ['get', 'kind'], 'outer']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.08 }}
        />
        <Layer
          id="d-plan-cones-outer-line"
          type="line"
          filter={['==', ['get', 'kind'], 'outer']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.3 }}
        />
        {/* Inner cone (denser) */}
        <Layer
          id="d-plan-cones-inner-fill"
          type="fill"
          filter={['==', ['get', 'kind'], 'inner']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 }}
        />
        <Layer
          id="d-plan-cones-inner-line"
          type="line"
          filter={['==', ['get', 'kind'], 'inner']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.3 }}
        />
      </Source>

      <Source id="d-plan-lines" type="geojson" data={linesFC}>
        <Layer
          id="d-plan-lines-shot"
          type="line"
          filter={['==', ['get', 'kind'], 'shot']}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 3,
            'line-opacity': 0.9,
            'line-dasharray': [3, 2],
          }}
        />
        <Layer
          id="d-plan-lines-tail"
          type="line"
          filter={['==', ['get', 'kind'], 'tail']}
          paint={{
            'line-color': '#4caf50',
            'line-width': 2,
            'line-opacity': 0.5,
            'line-dasharray': [2, 2],
          }}
        />
      </Source>

      {/* Numbered badges at each shot origin */}
      {shotData.map(s => (
        <Marker
          key={`badge-${s.idx}`}
          longitude={s.origin.lng}
          latitude={s.origin.lat}
          anchor="center"
        >
          <div
            style={{
              background: s.color, color: '#000',
              width: 22, height: 22, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 'bold',
              border: '2px dashed #fff',
              pointerEvents: 'none',
            }}
          >{s.idx + 1}</div>
        </Marker>
      ))}

      {/* Aim markers */}
      {shotData.map(s => (
        <Marker
          key={`aim-${s.idx}`}
          longitude={s.aim.lng}
          latitude={s.aim.lat}
          anchor="center"
        >
          <div
            title={s.ps.club || '?'}
            style={{
              width: 12, height: 12, borderRadius: '50%',
              background: s.color, border: '2px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            }}
          />
        </Marker>
      ))}
    </>
  )
}
