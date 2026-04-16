import { useState, useEffect, useCallback, useRef } from 'react'

export interface GpsState {
  lat: number | null
  lng: number | null
  accuracy: number | null
  heading: number | null
  timestamp: number | null
  error: string | null
  watching: boolean
}

const INITIAL: GpsState = {
  lat: null, lng: null, accuracy: null, heading: null,
  timestamp: null, error: null, watching: false,
}

export function useGpsPosition() {
  const [state, setState] = useState<GpsState>(INITIAL)
  const watchIdRef = useRef<number | null>(null)
  const lastUpdateRef = useRef(0)

  const startWatching = useCallback(() => {
    if (watchIdRef.current !== null) return
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, error: 'Geolocation not supported' }))
      return
    }

    setState(prev => ({ ...prev, watching: true, error: null }))
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        // Throttle to ~1Hz
        if (now - lastUpdateRef.current < 900) return
        lastUpdateRef.current = now
        setState({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
          error: null,
          watching: true,
        })
      },
      (err) => {
        setState(prev => ({
          ...prev,
          error: err.code === 1 ? 'Location permission denied'
            : err.code === 2 ? 'Position unavailable'
            : 'Location timeout',
        }))
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    )
  }, [])

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setState(prev => ({ ...prev, watching: false }))
  }, [])

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return { ...state, startWatching, stopWatching }
}
