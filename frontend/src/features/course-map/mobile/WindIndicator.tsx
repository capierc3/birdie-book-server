import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePlaySession } from '../../../api'
import { useMobileMap } from './MobileMapContext'
import s from './WindIndicator.module.css'

export function WindIndicator() {
  const [searchParams] = useSearchParams()
  const sessionParam = searchParams.get('session')
  const sessionId = sessionParam ? Number(sessionParam) : undefined
  const { data } = usePlaySession(sessionId)
  const { mapBearing } = useMobileMap()

  const latest = useMemo(() => {
    const samples = data?.weather_samples
    if (!samples || samples.length === 0) return null
    // Samples come sorted ascending by sampled_at from the list endpoint, but
    // the detail endpoint doesn't guarantee order. Find the max sampled_at.
    return samples.reduce((a, b) =>
      new Date(a.sampled_at).getTime() > new Date(b.sampled_at).getTime() ? a : b,
    )
  }, [data])

  if (!sessionId || !latest) return null
  if (latest.wind_speed_mph == null) return null

  const dirDeg = latest.wind_dir_deg ?? 0
  // wind_dir_deg is the direction the wind comes FROM (meteorological). Our
  // SVG arrow points up at 0°, so the base rotation is dirDeg — arrow points
  // toward the source. Subtracting the live map bearing keeps that direction
  // geographically correct after the map rotates: when the map turns 90° CW,
  // "north" is now on screen-left, so a wind-from-N arrow must rotate 90° CCW
  // to keep pointing at the actual N. Without this, the indicator would lie.
  const arrowRotation = ((dirDeg - mapBearing) % 360 + 360) % 360

  const speed = Math.round(latest.wind_speed_mph)
  const gust = latest.wind_gust_mph != null ? Math.round(latest.wind_gust_mph) : null

  return (
    <div className={s.wrap} title={`Wind from ${latest.wind_dir_cardinal ?? `${dirDeg}°`}`}>
      <div className={s.arrowBox} style={{ transform: `rotate(${arrowRotation}deg)` }}>
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="3" x2="12" y2="21" />
          <polyline points="6 9 12 3 18 9" />
        </svg>
      </div>
      <div className={s.speed}>
        <span className={s.speedNum}>{speed}</span>
        <span className={s.speedUnit}>mph</span>
      </div>
      {gust != null && gust > speed && (
        <div className={s.gust}>G {gust}</div>
      )}
      {(latest.wind_dir_cardinal || latest.wind_dir_deg != null) && (
        <div className={s.cardinal}>
          {latest.wind_dir_cardinal ?? ''}
          {latest.wind_dir_deg != null && (
            <span className={s.cardinalDeg}>{Math.round(latest.wind_dir_deg)}°</span>
          )}
        </div>
      )}
    </div>
  )
}
