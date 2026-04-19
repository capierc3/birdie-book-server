import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, MapPin, Plus, Check, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useGolfClubs, useNearbyPlaces, usePlacesSearch } from '../../api'
import type { PlaceCandidate } from '../../api'
import { useGps } from '../../contexts/GpsContext'
import { haversineYards } from '../course-map/geoUtils'
import { NewCourseWizard } from './NewCourseWizard'
import s from './ClubSearchPicker.module.css'

interface ClubSearchPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (golfClubId: number) => void
  selectedClubId?: number | null
  title?: string
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export function ClubSearchPicker({
  isOpen,
  onClose,
  onSelect,
  selectedClubId,
  title = 'Select Golf Club',
}: ClubSearchPickerProps) {
  const { data: clubs } = useGolfClubs()
  const gps = useGps()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [wizardCandidate, setWizardCandidate] = useState<PlaceCandidate | null>(null)

  const nearby = useNearbyPlaces(gps.lat, gps.lng)
  const placesSearch = usePlacesSearch(debouncedQuery, gps.lat, gps.lng)

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose])

  // Reset query when reopened
  useEffect(() => {
    if (isOpen) setQuery('')
  }, [isOpen])

  const savedWithDistance = useMemo(() => {
    if (!clubs) return []
    const hasGps = gps.lat != null && gps.lng != null
    return clubs.map(c => {
      const distanceMiles = (hasGps && c.lat != null && c.lng != null)
        ? haversineYards(gps.lat!, gps.lng!, c.lat, c.lng) / 1760
        : null
      return { club: c, distanceMiles }
    }).sort((a, b) => {
      if (a.distanceMiles != null && b.distanceMiles != null) return a.distanceMiles - b.distanceMiles
      if (a.distanceMiles != null) return -1
      if (b.distanceMiles != null) return 1
      return (a.club.name || '').localeCompare(b.club.name || '')
    })
  }, [clubs, gps.lat, gps.lng])

  const filteredSaved = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return savedWithDistance
    return savedWithDistance.filter(({ club }) =>
      (club.name || '').toLowerCase().includes(q) ||
      (club.address || '').toLowerCase().includes(q),
    )
  }, [savedWithDistance, query])

  const candidates: PlaceCandidate[] = useMemo(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed.length >= 3) {
      return placesSearch.data?.candidates ?? []
    }
    return nearby.data?.candidates ?? []
  }, [debouncedQuery, placesSearch.data, nearby.data])

  const candidatesLoading =
    (debouncedQuery.trim().length >= 3 && placesSearch.isFetching) ||
    (debouncedQuery.trim().length < 3 && nearby.isFetching && !nearby.data)

  const handleSavedClick = (clubId: number) => {
    onSelect(clubId)
    onClose()
  }

  const handleAddClick = (candidate: PlaceCandidate) => {
    setWizardCandidate(candidate)
  }

  const handleWizardComplete = (golfClubId: number) => {
    setWizardCandidate(null)
    onSelect(golfClubId)
    onClose()
  }

  const handleWizardCancel = () => {
    setWizardCandidate(null)
  }

  if (!isOpen) return null

  const sheet = (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <h3 className={s.title}>{title}</h3>
          <button className={s.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={s.searchWrap}>
          <Search size={16} className={s.searchIcon} />
          <input
            type="text"
            className={s.searchInput}
            placeholder="Search golf clubs…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className={s.list}>
          {filteredSaved.length > 0 && (
            <>
              <div className={s.sectionLabel}>Your clubs</div>
              {filteredSaved.map(({ club, distanceMiles }) => (
                <button
                  key={club.id}
                  className={`${s.item} ${selectedClubId === club.id ? s.itemSelected : ''}`}
                  onClick={() => handleSavedClick(club.id)}
                >
                  <span className={s.itemLeft}>
                    <span className={`${s.itemIcon} ${s.itemIconSaved}`}>
                      <Check size={16} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <div className={s.itemName}>{club.name}</div>
                      {club.address && <div className={s.itemSub}>{club.address}</div>}
                    </span>
                  </span>
                  {distanceMiles != null && (
                    <span className={s.itemDist}>{distanceMiles.toFixed(1)} mi</span>
                  )}
                </button>
              ))}
            </>
          )}

          {(candidates.length > 0 || candidatesLoading) && (
            <div className={s.sectionLabel}>
              {debouncedQuery.trim().length >= 3 ? 'Search results' : 'Nearby'}
            </div>
          )}

          {candidatesLoading && candidates.length === 0 && (
            <div className={s.loadingMsg}>Searching…</div>
          )}

          {candidates.map(c => (
            <button
              key={c.place_id}
              className={s.item}
              onClick={() => handleAddClick(c)}
            >
              <span className={s.itemLeft}>
                <span className={`${s.itemIcon} ${s.itemIconAdd}`}>
                  <Plus size={16} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <div className={s.itemName}>{c.name}</div>
                  {c.address && <div className={s.itemSub}>{c.address}</div>}
                </span>
              </span>
              {c.distance_miles != null && (
                <span className={s.itemDist}>{c.distance_miles.toFixed(1)} mi</span>
              )}
            </button>
          ))}

          {!candidatesLoading && filteredSaved.length === 0 && candidates.length === 0 && (
            <div className={s.emptyMsg}>
              {query.trim()
                ? `No matches for "${query.trim()}". Try a different name.`
                : 'No clubs yet. Type to search, or enable GPS to find nearby courses.'}
            </div>
          )}
        </div>

        <div className={s.footer}>
          <GpsStatusRow />
        </div>
      </div>
    </div>
  )

  return createPortal(
    <>
      {sheet}
      {wizardCandidate && (
        <NewCourseWizard
          isOpen={true}
          candidate={wizardCandidate}
          onComplete={handleWizardComplete}
          onCancel={handleWizardCancel}
        />
      )}
    </>,
    document.body,
  )
}

function GpsStatusRow() {
  const gps = useGps()
  const hasFix = gps.lat != null && gps.lng != null
  const isError = !!gps.error

  let icon: React.ReactNode
  let text: string
  if (isError) {
    icon = <AlertTriangle size={14} />
    text = gps.error || 'Location unavailable'
  } else if (hasFix) {
    icon = <MapPin size={14} />
    const acc = gps.accuracy != null ? ` (±${Math.round(gps.accuracy)}m)` : ''
    text = `Sorted by distance${acc}`
  } else {
    icon = <Loader2 size={14} className={s.spin} />
    text = 'Acquiring location…'
  }

  return (
    <div className={`${s.gpsStatus} ${isError ? s.gpsStatusError : ''}`}>
      <span className={s.gpsStatusText}>
        {icon}
        <span>{text}</span>
      </span>
      <button
        type="button"
        className={s.gpsRefreshBtn}
        onClick={() => gps.refresh()}
        title="Refresh location"
      >
        <RefreshCw size={12} />
        {isError ? 'Retry' : 'Refresh'}
      </button>
    </div>
  )
}
