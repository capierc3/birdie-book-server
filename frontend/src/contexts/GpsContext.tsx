import { createContext, useContext, useEffect, useRef, ReactNode } from 'react'
import { useGpsPosition } from '../features/course-map/mobile/useGpsPosition'
import { useToast } from '../components'

type GpsValue = ReturnType<typeof useGpsPosition>

const GpsContext = createContext<GpsValue | null>(null)

export function GpsProvider({ children }: { children: ReactNode }) {
  const gps = useGpsPosition()
  const { toast } = useToast()

  const searchingToastShownRef = useRef(false)
  const foundToastShownRef = useRef(false)
  const lastErrorRef = useRef<string | null>(null)

  // Start watching on mount; warn "searching" if no fix in 1.5s
  useEffect(() => {
    gps.startWatching()
    const t = setTimeout(() => {
      if (!foundToastShownRef.current && !lastErrorRef.current) {
        searchingToastShownRef.current = true
        toast('Searching for GPS…', 'info')
      }
    }, 1500)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // First successful fix
  useEffect(() => {
    if (gps.lat != null && gps.lng != null && !foundToastShownRef.current) {
      foundToastShownRef.current = true
      toast('GPS location found', 'success')
    }
  }, [gps.lat, gps.lng, toast])

  // Error transitions
  useEffect(() => {
    if (gps.error && gps.error !== lastErrorRef.current) {
      lastErrorRef.current = gps.error
      const msg = gps.error === 'Location permission denied'
        ? 'Location blocked — check browser permissions'
        : `${gps.error} — check location permissions`
      toast(msg, 'error')
    } else if (!gps.error && lastErrorRef.current) {
      lastErrorRef.current = null
    }
  }, [gps.error, toast])

  return <GpsContext.Provider value={gps}>{children}</GpsContext.Provider>
}

export function useGps() {
  const ctx = useContext(GpsContext)
  if (!ctx) throw new Error('useGps must be used within GpsProvider')
  return ctx
}
