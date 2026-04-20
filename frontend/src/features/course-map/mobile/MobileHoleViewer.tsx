import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { MobileMapProvider, useMobileMap } from './MobileMapContext'
import { MobileMapOverlays } from './MobileMapOverlays'
import { MobileShotOverlays } from './MobileShotOverlays'
import { GpsRangefinder } from './GpsRangefinder'
import type { RangefinderData } from './GpsRangefinder'
import { MobileStrategyOverlays } from './MobileStrategyOverlays'
import type { ToolResult } from './MobileStrategyOverlays'
import { HoleInfoBar } from './HoleInfoBar'
import { WindIndicator } from './WindIndicator'
import { MobileBottomSheet } from './MobileBottomSheet'
import type { MobileTab, TabConfig } from './MobileBottomSheet'
import { RangefinderTab } from './tabs/RangefinderTab'
import { CaddieTab } from './tabs/CaddieTab'
import { ShotsTab } from './tabs/ShotsTab'
import { NotesTab, loadNote, saveNote } from './tabs/NotesTab'
import { ScorecardTab } from './tabs/ScorecardTab'
import { EditTab } from './tabs/EditTab'
import { HAZARD_COLORS, HAZARD_LABELS } from '../courseMapState'
import s from './MobileHoleViewer.module.css'
import ts from './tabs/tabs.module.css'
import 'leaflet/dist/leaflet.css'

/** Map auto-center (shared logic with desktop) */
function MapController({ followingRef }: { followingRef: React.MutableRefObject<boolean> }) {
  const map = useMap()
  const ctx = useMobileMap()
  const { course, currentHole, totalHoles, teeId, allRoundDetails, playMode, gps } = ctx
  const prevHoleRef = useRef(currentHole)

  // Force Leaflet to recalculate size after mount (fixes blank map in fixed containers)
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100)
    return () => clearTimeout(timer)
  }, [map])

  // User-initiated drag turns off follow; re-enable via center-on-me FAB or hole change
  useEffect(() => {
    const onDragStart = () => { followingRef.current = false }
    map.on('dragstart', onDragStart)
    return () => { map.off('dragstart', onDragStart) }
  }, [map, followingRef])

  useEffect(() => {
    if (!course) return
    const holeChanged = prevHoleRef.current !== currentHole
    prevHoleRef.current = currentHole
    if (holeChanged) followingRef.current = true
    if (!followingRef.current) return

    const tee = course.tees?.find(t => t.id === teeId) ?? course.tees?.[0]
    const hole = tee?.holes?.find(h => h.hole_number === currentHole)

    let lat: number | undefined, lng: number | undefined

    // 1. Play mode — live GPS wins so the map follows the user around the course
    if (playMode && gps.watching && gps.lat != null && gps.lng != null) {
      lat = gps.lat; lng = gps.lng
    }

    // 2. Current hole's placed tee
    if (!lat && hole?.tee_lat && hole?.tee_lng) {
      lat = hole.tee_lat; lng = hole.tee_lng
    }

    // 3. First shot from any round (historic data for this hole)
    if (!lat) {
      for (const rd of allRoundDetails) {
        const rh = rd.holes?.find(h => h.hole_number === currentHole)
        const firstShot = rh?.shots?.find(s => s.shot_number === 1)
        if (firstShot?.start_lat && firstShot?.start_lng) {
          lat = firstShot.start_lat; lng = firstShot.start_lng
          break
        }
      }
    }

    // 4. Previous hole's green — usually close to the next tee
    if (!lat && tee?.holes?.length) {
      const prevNum = currentHole > 1 ? currentHole - 1 : totalHoles
      const prevHole = tee.holes.find(h => h.hole_number === prevNum)
      if (prevHole?.flag_lat && prevHole?.flag_lng) {
        lat = prevHole.flag_lat; lng = prevHole.flag_lng
      }
    }

    // 5. Course center
    if (!lat && course.lat && course.lng) {
      lat = course.lat; lng = course.lng
    }

    if (lat && lng) {
      // Hole changes get an animated flyTo; GPS ticks get a jitter-proof
      // setView so the map smoothly follows without 0.5s wobble per fix.
      if (holeChanged) {
        map.flyTo([lat, lng], map.getZoom() < 15 ? 17 : map.getZoom(), { duration: 0.5 })
      } else {
        const distMeters = map.getCenter().distanceTo([lat, lng])
        if (distMeters > 3) {
          map.setView([lat, lng], map.getZoom() < 15 ? 17 : map.getZoom(), { animate: false })
        }
      }
    }
  }, [map, course, currentHole, totalHoles, teeId, allRoundDetails, playMode, gps.watching, gps.lat, gps.lng, followingRef])

  return null
}

/** Center on GPS FAB — renders a portal-style button that controls the map */
function CenterOnMeButton({ followingRef }: { followingRef: React.MutableRefObject<boolean> }) {
  const map = useMap()
  const { gps } = useMobileMap()

  if (!gps.watching || gps.lat == null) return null

  const handleClick = () => {
    followingRef.current = true
    map.flyTo([gps.lat!, gps.lng!], 18, { duration: 0.5 })
    gps.refresh()
  }

  // Render into a Leaflet control container so it's inside the map but positioned as overlay
  return (
    <div
      className={s.centerFab}
      onClick={handleClick}
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

const BAG_ORDER: Record<string, number> = {
  Driver: 1,
  '2 Wood': 10, '3 Wood': 11, '4 Wood': 12, '5 Wood': 13, '7 Wood': 14, '9 Wood': 15,
  '2 Hybrid': 20, '3 Hybrid': 21, '4 Hybrid': 22, '5 Hybrid': 23, '6 Hybrid': 24,
  '1 Iron': 30, '2 Iron': 31, '3 Iron': 32, '4 Iron': 33, '5 Iron': 34,
  '6 Iron': 35, '7 Iron': 36, '8 Iron': 37, '9 Iron': 38,
  'Pitching Wedge': 40, 'Gap Wedge': 41, 'Sand Wedge': 42, 'Lob Wedge': 43,
  Putter: 50, Unknown: 99,
}

type RangefinderTool = 'none' | 'cone' | 'landing' | 'carry' | 'recommend' | 'ruler'

const PEEK_TOOLS: { key: RangefinderTool; label: string; needsClub: boolean }[] = [
  { key: 'cone', label: 'Dispersion', needsClub: true },
  { key: 'landing', label: 'Landing', needsClub: true },
  { key: 'carry', label: 'Carry?', needsClub: false },
  { key: 'recommend', label: 'Club Rec', needsClub: false },
  { key: 'ruler', label: 'Ruler', needsClub: false },
]

const PLAY_TABS: TabConfig[] = [
  { key: 'gps', label: 'Rangefinder' },
  { key: 'caddie', label: 'Caddie' },
  { key: 'notes', label: 'Scorecard' },
  { key: 'edit', label: 'Edit' },
]

const REVIEW_TABS: TabConfig[] = [
  { key: 'gps', label: 'Map Tools' },
  { key: 'caddie', label: 'Caddie' },
  { key: 'shots', label: 'Shots' },
  { key: 'notes', label: 'Scorecard' },
  { key: 'edit', label: 'Edit' },
]

function MobileHoleViewerInner() {
  const ctx = useMobileMap()
  const { course, gps, teePos, greenPos, strategy, formValues, playMode, activeRangefinderTool, selectedClubType } = ctx
  const [activeTab, setActiveTab] = useState<MobileTab>(playMode ? 'gps' : 'caddie')
  const [rangefinderData, setRangefinderData] = useState<RangefinderData>({
    distToGreenCenter: null, distToGreenFront: null, distToGreenBack: null,
    nearbyHazards: [], clubRec: [], gpsActive: false,
  })
  const [toolResult, setToolResult] = useState<ToolResult | null>(null)
  const [clubPickerOpen, setClubPickerOpen] = useState(false)
  const followingRef = useRef(true)

  // Peek score state — syncs with localStorage (same store as NotesTab)
  const [peekScore, setPeekScore] = useState<number | null>(() => loadNote(ctx.courseId, ctx.currentHole).score)

  useEffect(() => {
    setPeekScore(loadNote(ctx.courseId, ctx.currentHole).score)
  }, [ctx.courseId, ctx.currentHole])

  const handlePeekScoreChange = useCallback((delta: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const par = parseInt(formValues.par) || 4
    setPeekScore(prev => {
      const next = Math.max(1, (prev ?? par) + delta)
      const note = loadNote(ctx.courseId, ctx.currentHole)
      saveNote(ctx.courseId, ctx.currentHole, { ...note, score: next })
      return next
    })
  }, [ctx.courseId, ctx.currentHole, formValues.par])

  const handleEndHole = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // Score is already saved to localStorage via handlePeekScoreChange
    ctx.nextHole()
  }, [ctx])

  const mapCenter = useMemo<[number, number]>(() => {
    if (course?.lat && course?.lng) return [course.lat, course.lng]
    return [42.7, -83.5]
  }, [course])

  // Play-mode GPS heartbeat: force a fresh fix every 5s so moving from cart to
  // ball is reflected without waiting for the watcher to fire. Pauses when the
  // tab isn't visible to save battery.
  const gpsSample = gps.sample
  useEffect(() => {
    if (!playMode) return
    const tick = () => {
      if (document.visibilityState === 'visible') gpsSample()
    }
    tick()
    const id = window.setInterval(tick, 5000)
    return () => window.clearInterval(id)
  }, [playMode, gpsSample])

  // Auto-select the recommended club when club rec changes
  useEffect(() => {
    if (rangefinderData.clubRec.length > 0) {
      ctx.setSelectedClubType(rangefinderData.clubRec[0].club)
    }
  }, [rangefinderData.clubRec])

  const handlePeekToolToggle = useCallback((tool: RangefinderTool, e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeRangefinderTool === tool) {
      ctx.setActiveRangefinderTool('none')
    } else {
      ctx.setActiveRangefinderTool(tool)
      const def = PEEK_TOOLS.find(t => t.key === tool)
      const clubs = strategy?.player?.clubs || []
      if (def?.needsClub && !selectedClubType && clubs.length > 0) {
        ctx.setSelectedClubType(clubs[0].club_type)
      }
    }
  }, [activeRangefinderTool, selectedClubType, strategy, ctx])

  const handlePlaceBall = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    ctx.setEditMode(ctx.editMode === 'ball' ? null : 'ball')
  }, [ctx])

  const handlePlaceTee = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    ctx.setEditMode(ctx.editMode === 'tee' ? null : 'tee')
  }, [ctx])

  const handlePlaceGreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    ctx.setEditMode(ctx.editMode === 'green' ? null : 'green')
  }, [ctx])

  const handleResetBall = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    ctx.setBallPos(ctx.teePos)
    ctx.setEditMode(null)
  }, [ctx])

  // Shared rangefinder peek content (distance, tools, club picker)
  const rangefinderPeek = (showScore: boolean) => {
    const { currentHole } = ctx
    const par = formValues.par || '—'
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
              <span>F: {rangefinderData.distToGreenFront != null ? Math.round(rangefinderData.distToGreenFront) : '—'}</span>
              <span>B: {rangefinderData.distToGreenBack != null ? Math.round(rangefinderData.distToGreenBack) : '—'}</span>
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
        <div className={s.peekTools}>
          {PEEK_TOOLS.map(tool => (
            <button
              key={tool.key}
              className={`${ts.toolBtn} ${activeRangefinderTool === tool.key ? ts.toolBtnActive : ''}`}
              onClick={e => handlePeekToolToggle(tool.key, e)}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <div className={s.peekQuickRow}>
          <div className={s.peekQuickLeft}>
            {(strategy?.player?.clubs?.length ?? 0) > 0 && (
              <div className={s.clubPicker} onClick={e => e.stopPropagation()}>
                <button
                  className={s.clubPickerToggle}
                  onClick={() => setClubPickerOpen(prev => !prev)}
                >
                  <span>{selectedClubType || 'Club'}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points={clubPickerOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
                  </svg>
                </button>
                {clubPickerOpen && (
                  <div className={s.clubPickerDropdown}>
                    {[...strategy!.player!.clubs!].filter(c => c.club_type !== 'Unknown').sort((a, b) => (BAG_ORDER[a.club_type] ?? 60) - (BAG_ORDER[b.club_type] ?? 60)).map(c => (
                      <button
                        key={c.club_type}
                        className={`${s.clubPickerOption} ${selectedClubType === c.club_type ? s.clubPickerOptionActive : ''}`}
                        onClick={() => { ctx.setSelectedClubType(c.club_type); setClubPickerOpen(false) }}
                      >
                        <span>{c.club_type}</span>
                        <span className={s.clubPickerYards}>{Math.round(c.avg_yards)}y</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {showScore ? (
            <div className={s.peekScoreGroup}>
              <button className={s.peekScoreBtn} onClick={e => handlePeekScoreChange(-1, e)}>−</button>
              <span className={s.peekScoreDisplay}>{peekScore ?? '—'}</span>
              <button className={s.peekScoreBtn} onClick={e => handlePeekScoreChange(+1, e)}>+</button>
              <button className={s.peekEndHoleBtn} onClick={handleEndHole} title="End hole">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="13 17 18 12 13 7" />
                  <line x1="6" y1="7" x2="6" y2="17" />
                </svg>
              </button>
            </div>
          ) : (
            <div className={s.peekBallGroup}>
              <button
                className={`${s.peekGpsBtn} ${ctx.editMode === 'ball' ? ts.toolBtnActive : ''}`}
                onClick={handlePlaceBall}
              >
                {ctx.editMode === 'ball' ? 'Tap Map' : 'Place Ball'}
              </button>
              <button className={s.peekGpsBtn} onClick={handleResetBall} title="Reset to tee">
                Reset
              </button>
            </div>
          )}
        </div>
      </>
    )
  }

  // Peek shown when the hole is missing tee or green — lets the user place them
  // without digging into the Edit tab. Dirty state is saved on hole nav.
  const placementPeek = () => {
    const editingTee = ctx.editMode === 'tee'
    const editingGreen = ctx.editMode === 'green'
    return (
      <>
        <div className={s.peekRow}>
          <span className={s.peekLabel}>
            Hole {ctx.currentHole} · Par {formValues.par || '—'} — set tee & green to unlock tools
          </span>
        </div>
        <div className={s.peekTools}>
          <button
            className={`${ts.toolBtn} ${editingTee ? ts.toolBtnActive : ''}`}
            onClick={handlePlaceTee}
          >
            {editingTee ? 'Tap Map' : teePos ? 'Tee ✓' : 'Place Tee'}
          </button>
          <button
            className={`${ts.toolBtn} ${editingGreen ? ts.toolBtnActive : ''}`}
            onClick={handlePlaceGreen}
          >
            {editingGreen ? 'Tap Map' : greenPos ? 'Green ✓' : 'Place Green'}
          </button>
          {ctx.dirty && (
            <button
              className={ts.toolBtn}
              onClick={e => { e.stopPropagation(); ctx.saveHole() }}
            >
              Save
            </button>
          )}
        </div>
      </>
    )
  }

  // Peek content: compact rangefinder summary
  const peekContent = useMemo(() => {
    // ── Review mode: use ballPos-based rangefinder data, no GPS needed ──
    if (!playMode) {
      if (rangefinderData.distToGreenCenter != null) {
        return rangefinderPeek(false)
      }
      // No green position set
      return (
        <div className={s.peekRow}>
          <span className={s.peekLabel}>Hole {ctx.currentHole} · Par {formValues.par || '—'} · {formValues.yardage || '—'} yds</span>
        </div>
      )
    }

    // ── Play mode: GPS-driven ──
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

    // Hole has no saved geometry yet — let the user place tee/green from here.
    if (!teePos || !greenPos) {
      return placementPeek()
    }

    if (rangefinderData.distToGreenCenter != null) {
      return rangefinderPeek(true)
    }

    return (
      <div className={s.peekRow}>
        <span className={s.peekLabel}>Acquiring GPS...</span>
      </div>
    )
  }, [playMode, gps.watching, gps.lat, rangefinderData, ctx.currentHole, ctx.editMode, ctx.ballPos, ctx.dirty, teePos, greenPos, formValues.par, formValues.yardage, activeRangefinderTool, handlePeekToolToggle, selectedClubType, strategy, peekScore, handlePeekScoreChange, handleEndHole, clubPickerOpen, handlePlaceBall, handleResetBall, handlePlaceTee, handlePlaceGreen])

  return (
    <div className={s.layout}>
      <div className={s.mapContainer}>
        <MapContainer center={mapCenter} zoom={16} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false}>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
          <MapController followingRef={followingRef} />
          <MobileMapOverlays />
          <MobileShotOverlays />
          <GpsRangefinder onData={setRangefinderData} />
          <MobileStrategyOverlays onToolResult={setToolResult} />
          <CenterOnMeButton followingRef={followingRef} />
        </MapContainer>
      </div>

      <HoleInfoBar />

      <WindIndicator />

      {/* Overlay toggle — stacked near the GPS FAB */}
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

      <MobileBottomSheet peekContent={peekContent} activeTab={activeTab} onTabChange={setActiveTab} tabs={playMode ? PLAY_TABS : REVIEW_TABS}>
        {activeTab === 'gps' && <RangefinderTab data={rangefinderData} toolResult={toolResult} />}
        {activeTab === 'caddie' && <CaddieTab />}
        {activeTab === 'shots' && !playMode && <ShotsTab />}
        {activeTab === 'notes' && (playMode ? <NotesTab /> : <ScorecardTab />)}
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
