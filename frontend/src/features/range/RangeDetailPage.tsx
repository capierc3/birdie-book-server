import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Select, EmptyState, FloatingPanel } from '../../components'
import { useRangeShots } from '../../api'
import type { RangeShotResponse } from '../../api'
import { formatDateTime } from '../../utils/format'
import { ClubToggles } from './ClubToggles'
import { DispersionChart } from './DispersionChart'
import { TrajectoryChart } from './TrajectoryChart'
import { ClubShotSection } from './ClubShotSection'
import { ShotDetailPanel } from './ShotDetailPanel'
import { CompareStats } from './CompareStats'
import styles from '../../styles/pages.module.css'
import rangeStyles from './RangeDetailPage.module.css'

// Bag order: Driver first → Lob Wedge → Putter → Unknown last
function clubBagOrder(clubType: string): number {
  const t = clubType.toLowerCase()
  if (t === 'driver') return 100
  if (t.includes('wood')) { const n = parseInt(t) || 3; return 200 + n }
  if (t.includes('hybrid')) { const n = parseInt(t) || 3; return 300 + n }
  if (t.includes('iron')) { const n = parseInt(t) || 5; return 400 + n }
  if (t.includes('pitching')) return 500
  if (t.includes('gap')) return 510
  if (t.includes('sand')) return 520
  if (t.includes('lob')) return 530
  if (t.includes('wedge')) return 540
  if (t.includes('putter') || t === 'putter') return 600
  if (t === 'unknown') return 700
  return 550
}

export function RangeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Session selection — route param or 'all'
  const initialSession = id && id !== 'analytics' ? id : 'all'
  const [selectedSession, setSelectedSession] = useState(initialSession)
  const [compareSessionId, setCompareSessionId] = useState<string | null>(null)

  // Fetch shots for primary session
  const { data, isLoading } = useRangeShots(selectedSession)
  // Fetch compare session shots
  const { data: compareData } = useRangeShots(compareSessionId ?? '__none__')

  // Filtering
  const [enabledClubs, setEnabledClubs] = useState<Set<string>>(new Set())
  const [clubsInitialized, setClubsInitialized] = useState(false)
  const [viewMode, setViewMode] = useState<'total' | 'carry'>('total')

  // Shot detail panel state
  const [primaryShotId, setPrimaryShotId] = useState<string | null>(null)
  const [compareShotId, setCompareShotId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [highlightedShotIds, setHighlightedShotIds] = useState<Set<string>>(new Set())

  // Initialize enabled clubs when data loads — sorted in bag order
  const allClubs = useMemo(() => {
    const clubs = data?.clubs ?? []
    return [...clubs].sort((a, b) => clubBagOrder(a) - clubBagOrder(b))
  }, [data])
  if (data && !clubsInitialized && allClubs.length > 0) {
    setEnabledClubs(new Set(allClubs))
    setClubsInitialized(true)
  }

  // Build club color map from shots
  const clubColors = useMemo(() => {
    const map = new Map<string, string>()
    if (!data) return map
    for (const s of data.shots) {
      const name = s.club_name ?? s.club_type_raw
      if (!map.has(name) && s.club_color) map.set(name, s.club_color)
    }
    return map
  }, [data])

  // Filter shots by enabled clubs
  const filteredShots = useMemo(() => {
    if (!data) return []
    if (enabledClubs.size === 0) return []
    return data.shots.filter((s) => enabledClubs.has(s.club_name ?? s.club_type_raw))
  }, [data, enabledClubs])

  const filteredCompareShots = useMemo(() => {
    if (!compareData) return []
    if (enabledClubs.size === 0) return []
    return compareData.shots.filter((s) => enabledClubs.has(s.club_name ?? s.club_type_raw))
  }, [compareData, enabledClubs])

  // Group shots by club for sections
  const clubGroups = useMemo(() => {
    const groups = new Map<string, RangeShotResponse[]>()
    for (const s of filteredShots) {
      const name = s.club_name ?? s.club_type_raw
      if (!groups.has(name)) groups.set(name, [])
      groups.get(name)!.push(s)
    }
    return Array.from(groups.entries())
      .sort((a, b) => clubBagOrder(a[0]) - clubBagOrder(b[0]))
  }, [filteredShots])

  // Find shot objects by ID
  const allShots = useMemo(() => {
    const map = new Map<string, RangeShotResponse>()
    if (data) for (const s of data.shots) map.set(s.id, s)
    if (compareData) for (const s of compareData.shots) map.set(s.id, s)
    return map
  }, [data, compareData])

  const primaryShot = primaryShotId ? allShots.get(primaryShotId) ?? null : null
  const compareShot = compareShotId ? allShots.get(compareShotId) ?? null : null

  // Merge sessions from both data sources for date lookups
  const allSessions = useMemo(() => {
    const map = new Map<number, string>()
    if (data) for (const s of data.sessions) map.set(s.id, s.session_date)
    if (compareData) for (const s of compareData.sessions) map.set(s.id, s.session_date)
    return map
  }, [data, compareData])

  const primarySessionDate = primaryShot?.session_id != null
    ? allSessions.get(primaryShot.session_id) ?? null
    : null

  const compareSessionDate = compareShot?.session_id != null
    ? allSessions.get(compareShot.session_id) ?? null
    : null

  // Toggle handlers
  const handleToggleClub = useCallback((club: string) => {
    setEnabledClubs((prev) => {
      const next = new Set(prev)
      if (next.has(club)) next.delete(club)
      else next.add(club)
      return next
    })
  }, [])

  const handleToggleAll = useCallback(() => {
    const allOn = allClubs.every((c) => enabledClubs.has(c))
    if (allOn) {
      setEnabledClubs(new Set())
    } else {
      setEnabledClubs(new Set(allClubs))
    }
  }, [allClubs, enabledClubs])

  const handleShotClick = useCallback((shotId: string) => {
    if (compareMode && primaryShotId) {
      // In compare mode, select as compare shot
      if (shotId === primaryShotId) return
      if (shotId === compareShotId) {
        setCompareShotId(null)
        setHighlightedShotIds(new Set([primaryShotId]))
      } else {
        setCompareShotId(shotId)
        setHighlightedShotIds(new Set([primaryShotId, shotId]))
      }
    } else {
      // Normal mode
      if (shotId === primaryShotId) {
        setPrimaryShotId(null)
        setCompareShotId(null)
        setCompareMode(false)
        setHighlightedShotIds(new Set())
      } else {
        setPrimaryShotId(shotId)
        setHighlightedShotIds(new Set([shotId]))
      }
    }
  }, [compareMode, primaryShotId, compareShotId])

  const handleToggleCompare = useCallback(() => {
    if (compareMode) {
      setCompareMode(false)
      setCompareShotId(null)
      if (primaryShotId) setHighlightedShotIds(new Set([primaryShotId]))
    } else {
      setCompareMode(true)
    }
  }, [compareMode, primaryShotId])

  const handleSwapShots = useCallback(() => {
    if (primaryShotId && compareShotId) {
      setPrimaryShotId(compareShotId)
      setCompareShotId(primaryShotId)
    }
  }, [primaryShotId, compareShotId])

  const handleClosePanel = useCallback(() => {
    setPrimaryShotId(null)
    setCompareShotId(null)
    setCompareMode(false)
    setHighlightedShotIds(new Set())
  }, [])

  const handleSessionChange = useCallback((value: string) => {
    setSelectedSession(value)
    // Reset state
    setPrimaryShotId(null)
    setCompareShotId(null)
    setCompareMode(false)
    setHighlightedShotIds(new Set())
    setClubsInitialized(false)
  }, [])

  const handleCompareSessionChange = useCallback((value: string) => {
    if (value === '') {
      setCompareSessionId(null)
    } else {
      setCompareSessionId(value)
    }
  }, [])

  // Session label helper
  const getSessionLabel = (sessionId: string | number) => {
    const s = data?.sessions.find((sess) => String(sess.id) === String(sessionId))
    if (!s) return String(sessionId)
    return s.title ?? formatDateTime(s.session_date)
  }

  if (isLoading) return <div className={styles.loading}>Loading...</div>
  if (!data) return <EmptyState message="No data found" />

  return (
    <div>
      {/* Back nav */}
      <div style={{ marginBottom: 16 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/range/sessions')}>&larr; Sessions</Button>
      </div>

      {/* Controls bar */}
      <div className={rangeStyles.controlsBar}>
        <Select
          value={selectedSession}
          onChange={(e) => handleSessionChange(e.target.value)}
          style={{ width: 'auto', minWidth: 180 }}
        >
          <option value="all">All Time</option>
          {data.sessions.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {formatDateTime(s.session_date)}{s.title ? ` \u2014 ${s.title}` : ''} ({s.shot_count} shots)
            </option>
          ))}
        </Select>

        <Select
          value={compareSessionId ?? ''}
          onChange={(e) => handleCompareSessionChange(e.target.value)}
          style={{ width: 'auto', minWidth: 180 }}
        >
          <option value="">Compare...</option>
          {data.sessions
            .filter((s) => String(s.id) !== selectedSession)
            .map((s) => (
              <option key={s.id} value={String(s.id)}>
                {formatDateTime(s.session_date)}{s.title ? ` \u2014 ${s.title}` : ''} ({s.shot_count} shots)
              </option>
            ))}
        </Select>
      </div>

      {/* Club toggles */}
      <ClubToggles
        clubs={allClubs}
        enabledClubs={enabledClubs}
        clubColors={clubColors}
        onToggle={handleToggleClub}
        onToggleAll={handleToggleAll}
      />

      {/* Charts row */}
      <div className={styles.grid2}>
        <DispersionChart
          shots={filteredShots}
          compareShots={filteredCompareShots}
          viewMode={viewMode}
          highlightedShotIds={highlightedShotIds}
          onShotClick={handleShotClick}
          onViewModeChange={setViewMode}
        />
        <TrajectoryChart
          shots={filteredShots}
          compareShots={filteredCompareShots}
          highlightedShotIds={highlightedShotIds}
        />
      </div>

      {/* Compare stats (session-level) */}
      {compareSessionId && filteredCompareShots.length > 0 && (
        <div className={styles.section}>
          <CompareStats
            primaryShots={filteredShots}
            compareShots={filteredCompareShots}
            primaryLabel={selectedSession === 'all' ? 'All Time' : getSessionLabel(selectedSession)}
            compareLabel={getSessionLabel(compareSessionId)}
          />
        </div>
      )}

      {/* Per-club shot tables */}
      <div className={styles.section}>
        {clubGroups.map(([club, shots]) => (
          <div key={club} className={rangeStyles.clubSectionWrap}>
            <ClubShotSection
              clubName={club}
              clubColor={clubColors.get(club) ?? '#888'}
              shots={shots}
              primaryShotId={primaryShotId}
              compareShotId={compareShotId}
              onShotClick={handleShotClick}
            />
          </div>
        ))}
      </div>

      {/* Floating shot detail panel */}
      {primaryShot && (
        <FloatingPanel
          title={
            compareShot
              ? 'Comparing Shots'
              : `Shot ${primaryShot.shot_number} \u2014 ${primaryShot.club_name ?? primaryShot.club_type_raw}`
          }
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleCompare}
                title={compareMode ? 'Exit compare' : 'Compare shots'}
                style={compareMode ? { color: 'var(--accent)' } : undefined}
              >
                &#8644;
              </Button>
              {compareShot && (
                <Button variant="ghost" size="sm" onClick={handleSwapShots} title="Swap shots">
                  &#8645;
                </Button>
              )}
            </>
          }
          onClose={handleClosePanel}
          width={420}
        >
          <ShotDetailPanel
            primaryShot={primaryShot}
            compareShot={compareShot}
            sessionDate={primarySessionDate}
            compareSessionDate={compareSessionDate}
          />
        </FloatingPanel>
      )}
    </div>
  )
}
