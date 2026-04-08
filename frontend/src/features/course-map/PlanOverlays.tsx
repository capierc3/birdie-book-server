import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
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
 * PlanOverlays: Renders planned shots on the map when the planning panel is open.
 * Shows dashed shot lines, numbered badges, aim markers, and dispersion cones.
 */
export function PlanOverlays({ visible, planId }: { visible: boolean; planId: number | null }) {
  const map = useMap()
  const ctx = useCourseMap()
  const { currentHole, teePos, greenPos, strategy } = ctx
  const layerRef = useRef<L.LayerGroup>(L.layerGroup())
  const planRef = useRef<Plan | null>(null)
  const lastPlanIdRef = useRef<number | null>(null)

  // Manage layer group
  useEffect(() => {
    const lg = layerRef.current
    if (visible && !map.hasLayer(lg)) lg.addTo(map)
    if (!visible) {
      lg.clearLayers()
      if (map.hasLayer(lg)) map.removeLayer(lg)
    }
    return () => {
      lg.clearLayers()
      if (map.hasLayer(lg)) map.removeLayer(lg)
    }
  }, [map, visible])

  // Load plan data when planId changes
  useEffect(() => {
    if (!planId || !visible) { planRef.current = null; return }
    if (planId === lastPlanIdRef.current && planRef.current) return
    lastPlanIdRef.current = planId
    get<Plan>(`/plans/${planId}`).then((p) => { planRef.current = p; drawShots() }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, visible])

  // Get club data from strategy
  const getClubData = (clubType: string) => {
    const c = strategy?.player?.clubs?.find((cl) => cl.club_type === clubType)
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

  const drawShots = () => {
    const lg = layerRef.current
    lg.clearLayers()
    const plan = planRef.current
    if (!plan || !visible) return

    const planHole = (plan.holes || []).find((h) => h.hole_number === currentHole)
    const shots = (planHole?.shots || []).sort((a, b) => a.shot_number - b.shot_number)

    shots.forEach((ps, idx) => {
      const origin = idx === 0 ? teePos : (shots[idx - 1].aim_lat ? { lat: shots[idx - 1].aim_lat!, lng: shots[idx - 1].aim_lng! } : null)
      if (!origin || !ps.aim_lat || !ps.aim_lng) return
      const cd = ps.club ? getClubData(ps.club) : null
      const color = cd?.color || getClubColor(ps.club)

      // Dashed line from origin to aim
      L.polyline([[origin.lat, origin.lng], [ps.aim_lat, ps.aim_lng]], {
        color, weight: 3, dashArray: '8,6', opacity: 0.9,
      }).addTo(lg)

      // Numbered badge at origin
      L.marker([origin.lat, origin.lng], {
        icon: L.divIcon({
          className: 'leaflet-shot-number',
          html: `<div style="background:${color};color:#000;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px dashed #fff;">${idx + 1}</div>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        }),
      }).addTo(lg)

      // Aim marker
      L.circleMarker([ps.aim_lat, ps.aim_lng], {
        radius: 6, color: '#fff', fillColor: color, fillOpacity: 0.9, weight: 2,
      }).bindTooltip(ps.club || '?', { permanent: false }).addTo(lg)

      // Dispersion cone
      if (cd && cd.avg > 0) {
        const b = bearing(origin.lat, origin.lng, ps.aim_lat, ps.aim_lng)
        const spreadInner = Math.atan2(cd.lateralStd, cd.avg)
        const spreadOuter = Math.atan2(cd.lateralStd * 2, cd.avg)
        const steps = 20

        // Outer cone (±2σ, p90)
        const outerPts: [number, number][] = [[origin.lat, origin.lng]]
        for (let i = 0; i <= steps; i++) {
          const angle = b - spreadOuter + (i / steps) * spreadOuter * 2
          const pt = destPoint(origin.lat, origin.lng, angle, cd.p90)
          outerPts.push([pt.lat, pt.lng])
        }
        L.polygon(outerPts, { color, fillColor: color, fillOpacity: 0.08, weight: 1, opacity: 0.3, interactive: false }).addTo(lg)

        // Inner cone (±1σ, avg)
        const innerPts: [number, number][] = [[origin.lat, origin.lng]]
        for (let i = 0; i <= steps; i++) {
          const angle = b - spreadInner + (i / steps) * spreadInner * 2
          const pt = destPoint(origin.lat, origin.lng, angle, cd.avg)
          innerPts.push([pt.lat, pt.lng])
        }
        L.polygon(innerPts, { color, fillColor: color, fillOpacity: 0.15, weight: 1, opacity: 0.3, interactive: false }).addTo(lg)
      }
    })

    // Line from last shot to green
    if (shots.length > 0 && greenPos) {
      const last = shots[shots.length - 1]
      if (last.aim_lat && last.aim_lng) {
        L.polyline([[last.aim_lat, last.aim_lng], [greenPos.lat, greenPos.lng]], {
          color: '#4caf50', weight: 2, dashArray: '4,4', opacity: 0.5,
        }).addTo(lg)
      }
    }
  }

  // Redraw when hole changes or plan data updates
  useEffect(() => {
    if (visible && planRef.current) {
      // Re-fetch plan to get latest shots after add/delete
      if (planId) {
        get<Plan>(`/plans/${planId}`).then((p) => { planRef.current = p; drawShots() }).catch(() => {})
      }
    } else {
      layerRef.current.clearLayers()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, currentHole, planId, ctx.redrawKey])

  return null
}
