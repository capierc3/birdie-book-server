import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Map } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import { MobileMapProvider, useMobileMap } from './MobileMapContext'
import { usePlaySession } from '../../../api'
import { computePersonalPars } from '../personalPar'
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
import { bearing as computeBearing, haversineYards, destPoint } from '../geoUtils'
import s from './MobileHoleViewer.module.css'
import ts from './tabs/tabs.module.css'
import 'maplibre-gl/dist/maplibre-gl.css'

const PERSPECTIVE_PITCH = 70

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
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
  { key: 'ruler', label: 'Ruler', needsClub: false },
  { key: 'carry', label: 'Carry?', needsClub: false },
  { key: 'recommend', label: 'Club Rec', needsClub: false },
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
  const { course, gps, teePos, greenPos, strategy, formValues, playMode, activeRangefinderTool, selectedClubType,
    currentHole, totalHoles, teeId, allRoundDetails, cameraMode, setMapBearing, setCameraMode } = ctx
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session')
  const { data: session } = usePlaySession(sessionId ? Number(sessionId) : undefined)
  const [activeTab, setActiveTab] = useState<MobileTab>(playMode ? 'gps' : 'caddie')
  const [rangefinderData, setRangefinderData] = useState<RangefinderData>({
    distToGreenCenter: null, distToGreenFront: null, distToGreenBack: null,
    nearbyHazards: [], clubRec: [], gpsActive: false,
  })
  const [toolResult, setToolResult] = useState<ToolResult | null>(null)
  const [clubPickerOpen, setClubPickerOpen] = useState(false)
  const followingRef = useRef(true)
  const mapRef = useRef<MapRef>(null)
  const prevHoleRef = useRef<number | null>(null)
  const prevCameraModeRef = useRef(cameraMode)

  // Personal par per hole, derived from session.score_goal + active tee's holes.
  // Empty when no goal is set.
  const personalPars = useMemo(() => {
    const goal = session?.score_goal
    if (!goal || !course?.tees?.length) return null
    const tee = course.tees.find(t => t.id === teeId) ?? course.tees[0]
    const holes = (tee.holes ?? [])
      .filter(h => h.par != null)
      .slice()
      .sort((a, b) => a.hole_number - b.hole_number)
      .slice(0, totalHoles)
      .map(h => ({
        hole_number: h.hole_number,
        par: h.par,
        handicap: h.handicap ?? null,
        yardage: h.yardage ?? null,
      }))
    if (holes.length === 0) return null
    return computePersonalPars(goal, holes).byHole
  }, [session?.score_goal, course, teeId, totalHoles])

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

  const initialCenter = useMemo<{ lng: number; lat: number }>(() => {
    if (course?.lat && course?.lng) return { lng: course.lng, lat: course.lat }
    return { lng: -83.5, lat: 42.7 }
  }, [course])

  // Resolve target center using the same fallback chain as legacy MapController.
  const resolvedCenter = useMemo<{ lng: number; lat: number } | null>(() => {
    if (!course) return null
    const tee = course.tees?.find(t => t.id === teeId) ?? course.tees?.[0]
    const hole = tee?.holes?.find(h => h.hole_number === currentHole)

    // 1. Play mode + live GPS wins so map follows the user
    if (playMode && gps.watching && gps.lat != null && gps.lng != null) {
      return { lng: gps.lng, lat: gps.lat }
    }
    // 2. Current hole's placed tee
    if (hole?.tee_lat && hole?.tee_lng) return { lng: hole.tee_lng, lat: hole.tee_lat }
    // 3. First shot from any round (historic data for this hole)
    for (const rd of allRoundDetails) {
      const rh = rd.holes?.find(h => h.hole_number === currentHole)
      const firstShot = rh?.shots?.find(sh => sh.shot_number === 1)
      if (firstShot?.start_lat && firstShot?.start_lng) {
        return { lng: firstShot.start_lng, lat: firstShot.start_lat }
      }
    }
    // 4. Previous hole's green — usually close to the next tee
    if (tee?.holes?.length) {
      const prevNum = currentHole > 1 ? currentHole - 1 : totalHoles
      const prevHole = tee.holes.find(h => h.hole_number === prevNum)
      if (prevHole?.flag_lat && prevHole?.flag_lng) {
        return { lng: prevHole.flag_lng, lat: prevHole.flag_lat }
      }
    }
    // 5. Course center
    if (course.lat && course.lng) return { lng: course.lng, lat: course.lat }
    return null
  }, [course, currentHole, totalHoles, teeId, allRoundDetails, playMode, gps.watching, gps.lat, gps.lng])

  // Tee-to-green framing for perspective mode: centers between tee and green
  // and picks a zoom that fits the hole with tee near bottom / green near top.
  // Empirical zoom curve tuned for ~70° pitch: 170yd ≈ 17.5, 350yd ≈ 16.5, 550yd ≈ 15.8.
  const holeFraming = useMemo<{ center: { lng: number; lat: number }; zoom: number } | null>(() => {
    if (!course) return null
    const tee = course.tees?.find(t => t.id === teeId) ?? course.tees?.[0]
    const hole = tee?.holes?.find(h => h.hole_number === currentHole)
    if (!hole?.flag_lat || !hole?.flag_lng) return null

    // Primary: real tee + green GPS.
    let originLat = hole.tee_lat ?? null
    let originLng = hole.tee_lng ?? null
    let distYards: number | null = null
    if (originLat != null && originLng != null) {
      distYards = haversineYards(originLat, originLng, hole.flag_lat, hole.flag_lng)
    } else if (hole.yardage && hole.yardage > 0) {
      // Fallback: no tee GPS. Approximate by walking back from the flag along
      // the prev-green → flag bearing (same heuristic as teeUpBearingDeg)
      // for `yardage` yards. Keeps framing reasonable when tee isn't placed.
      const prevNum = currentHole > 1 ? currentHole - 1 : totalHoles
      const prev = tee?.holes?.find(h => h.hole_number === prevNum)
      if (prev?.flag_lat != null && prev?.flag_lng != null) {
        const rad = computeBearing(prev.flag_lat, prev.flag_lng, hole.flag_lat, hole.flag_lng)
        const synth = destPoint(hole.flag_lat, hole.flag_lng, rad + Math.PI, hole.yardage)
        originLat = synth.lat
        originLng = synth.lng
        distYards = hole.yardage
      }
    }
    if (originLat == null || originLng == null || distYards == null) return null

    const D = Math.max(distYards, 80)
    // Empirical zoom curve for ~70° pitch: 170yd ≈ 18.8, 334yd ≈ 17.86, 500yd ≈ 17.26, 600yd ≈ 17.0.
    const zoom = Math.max(16.2, Math.min(19, 18.8 - Math.log2(D / 170)))
    return {
      center: {
        lat: (originLat + hole.flag_lat) / 2,
        lng: (originLng + hole.flag_lng) / 2,
      },
      zoom,
    }
  }, [course, currentHole, totalHoles, teeId])

  // Bearing from effective tee → green for the current hole; null if either
  // endpoint is missing. Used for perspective auto-orient.
  const teeUpBearingDeg = useMemo<number | null>(() => {
    if (!course) return null
    const tee = course.tees?.find(t => t.id === teeId) ?? course.tees?.[0]
    const hole = tee?.holes?.find(h => h.hole_number === currentHole)
    let originLat = hole?.tee_lat ?? null
    let originLng = hole?.tee_lng ?? null
    if (originLat == null || originLng == null) {
      // Fallback: previous hole green → tee→green bearing approximation
      const prevNum = currentHole > 1 ? currentHole - 1 : totalHoles
      const prev = tee?.holes?.find(h => h.hole_number === prevNum)
      if (prev?.flag_lat && prev?.flag_lng) {
        originLat = prev.flag_lat; originLng = prev.flag_lng
      }
    }
    if (originLat == null || originLng == null || hole?.flag_lat == null || hole?.flag_lng == null) return null
    const rad = computeBearing(originLat, originLng, hole.flag_lat, hole.flag_lng)
    return (rad * 180) / Math.PI
  }, [course, currentHole, totalHoles, teeId])

  // Auto-center + auto-orient: hole change always re-applies; GPS ticks only
  // when in following mode; camera mode flips snap immediately. Skips while
  // the user is actively dragging.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !resolvedCenter) return

    const holeChanged = prevHoleRef.current !== currentHole
    const cameraChanged = prevCameraModeRef.current !== cameraMode
    prevHoleRef.current = currentHole
    prevCameraModeRef.current = cameraMode
    if (holeChanged) followingRef.current = true
    if (!followingRef.current && !holeChanged && !cameraChanged) return

    const targetBearing = cameraMode === 'perspective' ? (teeUpBearingDeg ?? 0) : 0
    const targetPitch = cameraMode === 'perspective' && teeUpBearingDeg != null ? PERSPECTIVE_PITCH : 0
    const currentZoom = map.getZoom()
    const targetZoom = currentZoom < 15 ? 17 : currentZoom

    if (holeChanged || cameraChanged) {
      // Use tee-to-green framing when we have full hole geometry and aren't
      // actively GPS-following in play mode (then the user's position wins).
      const gpsFollowing = playMode && gps.watching && gps.lat != null && gps.lng != null
      const useFraming = holeFraming && !gpsFollowing
      map.flyTo({
        center: useFraming
          ? [holeFraming.center.lng, holeFraming.center.lat]
          : [resolvedCenter.lng, resolvedCenter.lat],
        zoom: useFraming ? holeFraming.zoom : targetZoom,
        bearing: targetBearing,
        pitch: targetPitch,
        duration: 500,
      })
    } else if (playMode && gps.watching) {
      // Drift correction only runs while actively GPS-following in play mode.
      // In review mode, running this would fight the framing flyTo — resolvedCenter
      // is the tee but framing targets the midpoint, so the drift check sees
      // >3m delta mid-animation and snaps the camera back with interpolated zoom.
      const cur = map.getCenter()
      const dx = (cur.lng - resolvedCenter.lng) * Math.cos(resolvedCenter.lat * Math.PI / 180)
      const dy = cur.lat - resolvedCenter.lat
      const distMeters = Math.sqrt(dx * dx + dy * dy) * 111320
      if (distMeters > 3) {
        map.easeTo({
          center: [resolvedCenter.lng, resolvedCenter.lat],
          zoom: targetZoom,
          duration: 0,
        })
      }
    }
  }, [resolvedCenter, currentHole, cameraMode, teeUpBearingDeg, holeFraming, playMode, gps.watching, gps.lat, gps.lng])

  // User drag turns off auto-follow until next hole change or center FAB tap
  const handleDragStart = useCallback(() => {
    followingRef.current = false
  }, [])

  // Push live bearing to context so WindIndicator can counter-rotate
  const handleMove = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    setMapBearing(map.getBearing())
  }, [setMapBearing])

  const handleMapClick = useCallback((evt: MapLayerMouseEvent) => {
    const c = ctx
    if (!c.editMode) return
    const { lat, lng } = evt.lngLat
    switch (c.editMode) {
      case 'tee':
        c.setTeePos({ lat, lng })
        c.setDirty(true)
        c.setEditMode(null)
        c.triggerRedraw()
        break
      case 'green':
        c.setGreenPos({ lat, lng })
        c.setDirty(true)
        c.setEditMode(null)
        c.triggerRedraw()
        break
      case 'fairway':
        c.setFairwayPath([...c.fairwayPath, { lat, lng }])
        c.setDirty(true)
        c.triggerRedraw()
        break
      case 'ball':
        c.setBallPos({ lat, lng })
        c.setEditMode(null)
        break
    }
  }, [ctx])

  const handleCenterOnMe = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    // Review mode centers on the placed ball (defaults to tee); play mode centers on live GPS.
    if (!playMode) {
      if (!ctx.ballPos) return
      followingRef.current = true
      map.flyTo({ center: [ctx.ballPos.lng, ctx.ballPos.lat], zoom: 18, duration: 500 })
      return
    }
    if (gps.lat == null || gps.lng == null) return
    followingRef.current = true
    map.flyTo({ center: [gps.lng, gps.lat], zoom: 18, duration: 500 })
    gps.refresh()
  }, [gps, playMode, ctx.ballPos])

  const handleToggleCamera = useCallback(() => {
    setCameraMode(cameraMode === 'top-down' ? 'perspective' : 'top-down')
  }, [cameraMode, setCameraMode])

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

  // Auto-select the recommended club when the recommendation actually changes.
  // Dep on the club string (not the array ref) so GPS ticks that produce an
  // identical recommendation don't stomp the user's manual pick.
  const topRecClub = rangefinderData.clubRec[0]?.club
  useEffect(() => {
    if (topRecClub) {
      ctx.setSelectedClubType(topRecClub)
    }
  }, [topRecClub])

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
    const ppar = personalPars?.get(currentHole)
    return (
      <>
        <div className={s.peekHoleLabel}>
          Hole {currentHole} · Par {par}
          {ppar != null && ppar !== Number(par) && <> · Goal {ppar}</>}
        </div>
        <div className={s.peekMainRow}>
          <div className={s.peekLeftCol}>
            <div className={s.peekDistGroup}>
              <div className={s.peekDistBlock}>
                <span className={s.peekDist}>{rangefinderData.distToGreenCenter}</span>
                <span className={s.peekDistLabel}>yds</span>
              </div>
              <div className={s.peekFrontBack}>
                <span>F {rangefinderData.distToGreenFront != null ? Math.round(rangefinderData.distToGreenFront) : '—'}</span>
                <span>B {rangefinderData.distToGreenBack != null ? Math.round(rangefinderData.distToGreenBack) : '—'}</span>
              </div>
            </div>
            {hazard && (
              <div className={s.peekHazardChip}>
                <span className={s.peekHazardDot} style={{ background: (HAZARD_COLORS[hazard.type] || ['#999'])[0] }} />
                <span className={s.peekHazardText}>
                  {HAZARD_LABELS[hazard.type] || hazard.type}{hazard.name ? ` (${hazard.name})` : ''}
                </span>
                <span className={s.peekHazardDist}>{hazard.distance}y</span>
              </div>
            )}
          </div>
          <div className={s.peekRightCol}>
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
            {rangefinderData.clubRec.length > 0 && (
              <div className={s.peekClubs}>
                {rangefinderData.clubRec.slice(0, 2).map(c => (
                  <span key={c.club} className={s.peekClubItem}>{c.club}</span>
                ))}
              </div>
            )}
          </div>
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
        <Map
          ref={mapRef}
          initialViewState={{ longitude: initialCenter.lng, latitude: initialCenter.lat, zoom: 16, bearing: 0, pitch: 0 }}
          mapStyle={SATELLITE_STYLE}
          maxPitch={85}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
          onDragStart={handleDragStart}
          onMove={handleMove}
          onClick={handleMapClick}
          cursor={ctx.editMode ? 'crosshair' : undefined}
        >
          <MobileMapOverlays />
          <MobileShotOverlays />
          <GpsRangefinder onData={setRangefinderData} />
          <MobileStrategyOverlays onToolResult={setToolResult} />
        </Map>
      </div>

      <HoleInfoBar />

      <WindIndicator />

      {/* Camera mode toggle — stacked above overlay toggle */}
      <button
        className={`${s.cameraToggle} ${cameraMode === 'top-down' ? s.cameraToggleOff : ''}`}
        onClick={handleToggleCamera}
        title={cameraMode === 'perspective' ? 'Switch to top-down view' : 'Switch to perspective view'}
      >
        {cameraMode === 'perspective' ? (
          // 3D perspective icon (tilted square)
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17 L12 21 L21 17 L21 7 L12 3 L3 7 Z" />
            <path d="M3 7 L12 11 L21 7" />
            <path d="M12 11 L12 21" />
          </svg>
        ) : (
          // Top-down compass-style icon
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <polygon points="12 6 15 14 12 12 9 14 12 6" fill="currentColor" />
          </svg>
        )}
      </button>

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

      {/* Center FAB — play: live GPS; review: placed ball */}
      {((playMode && gps.watching && gps.lat != null) || (!playMode && ctx.ballPos)) && (
        <div
          className={s.centerFab}
          onClick={handleCenterOnMe}
          title="Center on me"
          role="button"
          tabIndex={0}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </div>
      )}

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
