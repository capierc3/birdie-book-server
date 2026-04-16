import { useState, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { MobileMapProvider, useMobileMap } from './MobileMapContext'
import { MobileMapOverlays } from './MobileMapOverlays'
import { MobileShotOverlays } from './MobileShotOverlays'
import { GpsRangefinder } from './GpsRangefinder'
import type { RangefinderData } from './GpsRangefinder'
import { HoleInfoBar } from './HoleInfoBar'
import { MobileHoleNav } from './MobileHoleNav'
import { MobileBottomSheet } from './MobileBottomSheet'
import type { MobileTab } from './MobileBottomSheet'
import { RangefinderTab } from './tabs/RangefinderTab'
import { CaddieTab } from './tabs/CaddieTab'
import { ShotsTab } from './tabs/ShotsTab'
import { NotesTab } from './tabs/NotesTab'
import { EditTab } from './tabs/EditTab'
import { HAZARD_COLORS, HAZARD_LABELS } from '../courseMapState'
import s from './MobileHoleViewer.module.css'
import 'leaflet/dist/leaflet.css'

/** Map auto-center (shared logic with desktop) */
function MapController() {
  const map = useMap()
  const ctx = useMobileMap()
  const { course, currentHole, teeId, allRoundDetails } = ctx

  // Force Leaflet to recalculate size after mount (fixes blank map in fixed containers)
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(timer)
  }, [map])

  useEffect(() => {
    if (!course) return
    const tee = course.tees?.find(t => t.id === teeId) ?? course.tees?.[0]
    const hole = tee?.holes?.find(h => h.hole_number === currentHole)

    let lat: number | undefined, lng: number | undefined

    if (hole?.tee_lat && hole?.tee_lng) {
      lat = hole.tee_lat; lng = hole.tee_lng
    } else {
      for (const rd of allRoundDetails) {
        const rh = rd.holes?.find(h => h.hole_number === currentHole)
        const firstShot = rh?.shots?.find(s => s.shot_number === 1)
        if (firstShot?.start_lat && firstShot?.start_lng) {
          lat = firstShot.start_lat; lng = firstShot.start_lng
          break
        }
      }
    }

    if (!lat && course.lat && course.lng) {
      lat = course.lat; lng = course.lng
    }

    if (lat && lng) {
      map.flyTo([lat, lng], map.getZoom() < 15 ? 17 : map.getZoom(), { duration: 0.5 })
    }
  }, [map, course, currentHole, teeId, allRoundDetails])

  return null
}

/** Center on GPS FAB — renders a portal-style button that controls the map */
function CenterOnMeButton() {
  const map = useMap()
  const { gps } = useMobileMap()

  if (!gps.watching || gps.lat == null) return null

  // Render into a Leaflet control container so it's inside the map but positioned as overlay
  return (
    <div
      className={s.centerFab}
      onClick={() => map.flyTo([gps.lat!, gps.lng!], 18, { duration: 0.5 })}
      title="Center on me"
      role="button"
      tabIndex={0}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </svg>
    </div>
  )
}

function MobileHoleViewerInner() {
  const ctx = useMobileMap()
  const { course, gps, greenPos, strategy, formValues } = ctx
  const [activeTab, setActiveTab] = useState<MobileTab>('gps')
  const [rangefinderData, setRangefinderData] = useState<RangefinderData>({
    distToGreenCenter: null, distToGreenFront: null, distToGreenBack: null,
    nearbyHazards: [], clubRec: [], gpsActive: false,
  })

  const mapCenter = useMemo<[number, number]>(() => {
    if (course?.lat && course?.lng) return [course.lat, course.lng]
    return [42.7, -83.5]
  }, [course])

  // Peek content: compact rangefinder summary
  const peekContent = useMemo(() => {
    const { currentHole } = ctx
    const par = formValues.par || '—'

    if (!gps.watching) {
      return (
        <div className={s.peekRow}>
          <span className={s.peekLabel}>GPS Off</span>
          <button className={s.peekGpsBtn} onClick={e => { e.stopPropagation(); gps.startWatching() }}>
            Enable
          </button>
        </div>
      )
    }

    if (rangefinderData.distToGreenCenter != null) {
      const hazard = rangefinderData.nearbyHazards[0]
      return (
        <>
          <div className={s.peekGrid}>
            <div className={s.peekDistBlock}>
              <span className={s.peekDist}>{rangefinderData.distToGreenCenter}</span>
              <span className={s.peekDistLabel}>yds</span>
            </div>
            <div className={s.peekMid}>
              <div className={s.peekFrontBack}>
                <span>F: {rangefinderData.distToGreenFront ?? '—'}</span>
                <span>B: {rangefinderData.distToGreenBack ?? '—'}</span>
              </div>
              <div className={s.peekHoleInfo}>
                Hole {currentHole} · Par {par}
              </div>
            </div>
            {rangefinderData.clubRec.length > 0 && (
              <div className={s.peekClubs}>
                {rangefinderData.clubRec.slice(0, 2).map(c => (
                  <span key={c.club} className={s.peekClubItem}>{c.club}</span>
                ))}
              </div>
            )}
          </div>
          {hazard && (
            <div className={s.peekHazardRow}>
              <span className={s.peekHazardDot} style={{ background: (HAZARD_COLORS[hazard.type] || ['#999'])[0] }} />
              <span className={s.peekHazardText}>
                {HAZARD_LABELS[hazard.type] || hazard.type}{hazard.name ? ` (${hazard.name})` : ''}
              </span>
              <span className={s.peekHazardDist}>{hazard.distance}y</span>
            </div>
          )}
        </>
      )
    }

    if (rangefinderData.gpsActive) {
      return (
        <div className={s.peekRow}>
          <span className={s.peekLabel}>GPS active — add green position in Edit tab</span>
        </div>
      )
    }

    return (
      <div className={s.peekRow}>
        <span className={s.peekLabel}>Acquiring GPS...</span>
      </div>
    )
  }, [gps.watching, gps.lat, rangefinderData, ctx.currentHole, formValues.par])

  return (
    <div className={s.layout}>
      <div className={s.mapContainer}>
        <MapContainer center={mapCenter} zoom={16} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
          <MapController />
          <MobileMapOverlays />
          <MobileShotOverlays />
          <GpsRangefinder onData={setRangefinderData} />
          <CenterOnMeButton />
        </MapContainer>
      </div>

      <HoleInfoBar />
      <MobileHoleNav />

      {/* Overlay toggle */}
      <button
        className={`${s.overlayToggle} ${!ctx.showOverlays ? s.overlayToggleOff : ''}`}
        onClick={() => ctx.setShowOverlays(!ctx.showOverlays)}
        title={ctx.showOverlays ? 'Hide course lines' : 'Show course lines'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
          <line x1="12" y1="22" x2="12" y2="15.5" />
          <polyline points="22 8.5 12 15.5 2 8.5" />
        </svg>
      </button>

      <MobileBottomSheet peekContent={peekContent} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'gps' && <RangefinderTab data={rangefinderData} />}
        {activeTab === 'caddie' && <CaddieTab />}
        {activeTab === 'shots' && <ShotsTab />}
        {activeTab === 'notes' && <NotesTab />}
        {activeTab === 'edit' && <EditTab />}
      </MobileBottomSheet>
    </div>
  )
}

export function MobileHoleViewer() {
  return (
    <MobileMapProvider>
      <MobileHoleViewerInner />
    </MobileMapProvider>
  )
}
