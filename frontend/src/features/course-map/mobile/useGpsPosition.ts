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

    // Stage 1: fast, low-accuracy fix. Accepts cached positions up to 60s old
    // and uses WiFi/cell triangulation — usually resolves in 1-2s.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState(prev => prev.lat != null ? prev : {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
          error: null,
          watching: true,
        })
      },
      () => { /* ignore — real errors come from the watcher below */ },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 5000 },
    )

    // Stage 2: continuous high-accuracy watch for live updates.
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
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }, [])

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setState(prev => ({ ...prev, watching: false }))
  }, [])

  const refresh = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    lastUpdateRef.current = 0
    setState(prev => ({ ...prev, error: null, watching: false }))
    // Re-start on next tick so startWatching sees cleared refs
    setTimeout(() => startWatching(), 0)
  }, [startWatching])

  // One-shot fresh position sample. Doesn't tear down the watcher — used for
  // scoped heartbeat polling (e.g. from the in-play map viewer).
  const sample = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState(prev => ({
          ...prev,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
          error: null,
        }))
      },
      () => { /* keep last known — watcher surfaces persistent errors */ },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    )
  }, [])

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return { ...state, startWatching, stopWatching, refresh, sample }
}
