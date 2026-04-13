import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, StatCard, Button, EmptyState } from '../../components'
import { useClubDetail, useClubs } from '../../api'
import type { ClubShot, ClubDetail } from '../../api'
import { ClubEditModal } from './ClubEditModal'
import { ShotEditModal } from './ShotEditModal'
import { formatNum, formatDate } from '../../utils/format'
import styles from '../../styles/pages.module.css'

// ── Source badges ──
const SOURCE_COLORS: Record<string, { label: string; color: string }> = {
  garmin: { label: 'G', color: '#4caf50' },
  rapsodo: { label: 'R', color: '#f59e0b' },
  trackman: { label: 'T', color: '#3b82f6' },
  manual: { label: 'M', color: '#8b8f98' },
}

// ── Column definitions ──
interface ColMeta {
  key: string
  label: string
  format: 'num' | 'int' | 'deg' | 'signed' | 'num2' | null
  fixed?: boolean
}

const ALL_COLUMNS: ColMeta[] = [
  { key: 'row_num', label: '#', format: null, fixed: true },
  { key: 'date', label: 'Date', format: null },
  { key: 'source', label: 'Source', format: null },
  { key: 'carry_yards', label: 'Carry', format: 'num' },
  { key: 'total_yards', label: 'Total', format: 'num' },
  { key: 'distance_yards', label: 'GPS Dist', format: 'num' },
  { key: 'ball_speed_mph', label: 'Ball Spd', format: 'num' },
  { key: 'club_speed_mph', label: 'Club Spd', format: 'num' },
  { key: 'spin_rate_rpm', label: 'Spin', format: 'int' },
  { key: 'launch_angle_deg', label: 'Launch', format: 'deg' },
  { key: 'apex_yards', label: 'Apex', format: 'num' },
  { key: 'side_carry_yards', label: 'Side', format: 'signed' },
  { key: 'smash_factor', label: 'Smash', format: 'num2' },
  { key: 'attack_angle_deg', label: 'Attack', format: 'deg' },
  { key: 'club_path_deg', label: 'Club Path', format: 'deg' },
  { key: 'descent_angle_deg', label: 'Descent', format: 'deg' },
  { key: 'face_angle_deg', label: 'Face Ang', format: 'deg' },
  { key: 'face_to_path_deg', label: 'F2P', format: 'deg' },
  { key: 'dynamic_loft_deg', label: 'Dyn Loft', format: 'deg' },
  { key: 'spin_loft_deg', label: 'Spin Loft', format: 'deg' },
  { key: 'swing_plane_deg', label: 'Swing Pl', format: 'deg' },
  { key: 'swing_direction_deg', label: 'Swing Dir', format: 'deg' },
  { key: 'dynamic_lie_deg', label: 'Dyn Lie', format: 'deg' },
  { key: 'impact_offset_in', label: 'Imp Offset', format: 'num' },
  { key: 'impact_height_in', label: 'Imp Height', format: 'num' },
  { key: 'low_point_distance_in', label: 'Low Point', format: 'num' },
  { key: 'curve_yards', label: 'Curve', format: 'num' },
  { key: 'hang_time_sec', label: 'Hang Time', format: 'num' },
  { key: 'side_total_yards', label: 'Side Tot', format: 'signed' },
  { key: 'shot_type', label: 'Type', format: null },
  { key: 'pin_distance_yards', label: 'Pin Dist', format: 'num' },
  { key: 'fairway_side_yards', label: 'FW Side', format: 'signed' },
  { key: 'sg_pga', label: 'SG PGA', format: 'signed' },
  { key: 'sg_personal', label: 'SG Pers', format: 'signed' },
]

const COL_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]))
const DEFAULT_VISIBLE = ['row_num', 'date', 'source', 'carry_yards', 'total_yards', 'distance_yards', 'ball_speed_mph', 'spin_rate_rpm']
const LS_KEY = 'birdie_book_club_detail_columns'

function loadColumnConfig(): string[] {
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      const keys: string[] = JSON.parse(saved)
      if (keys.every((k) => COL_MAP.has(k))) return keys
    }
  } catch { /* ignore */ }
  return [...DEFAULT_VISIBLE]
}

function saveColumnConfig(cols: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(cols))
}

// ── Source filter types ──
type SourceFilter = 'all' | 'garmin' | 'rapsodo' | 'trackman'

function filterShots(shots: ClubShot[], filter: SourceFilter): ClubShot[] {
  if (filter === 'all') return shots
  return shots.filter((s) => s.source === filter)
}

// ── Stats helpers ──
function calcAvg(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

function calcStdDev(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null)
  if (valid.length < 2) return null
  const m = valid.reduce((a, b) => a + b, 0) / valid.length
  return Math.sqrt(valid.reduce((s, v) => s + (v - m) ** 2, 0) / (valid.length - 1))
}

// ── Formatters ──
function fmtVal(v: number | null | undefined, decimals = 1): string {
  return v != null ? formatNum(v, decimals) : '\u2014'
}

function fmtDeg(v: number | null | undefined): string {
  return v != null ? `${formatNum(v, 1)}\u00b0` : '\u2014'
}

function fmtSigned(v: number | null | undefined): string {
  if (v == null) return '\u2014'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${formatNum(v, 1)}`
}

function fmtCell(shot: ClubShot, col: ColMeta): string {
  const val = (shot as Record<string, unknown>)[col.key]
  if (val == null) return '\u2014'
  switch (col.format) {
    case 'num': return formatNum(val as number, 1)
    case 'num2': return formatNum(val as number, 2)
    case 'int': return Math.round(val as number).toString()
    case 'deg': return `${formatNum(val as number, 1)}\u00b0`
    case 'signed': { const n = val as number; return `${n >= 0 ? '+' : ''}${formatNum(n, 1)}` }
    default: return String(val)
  }
}

function fmtSummary(val: number | null, col: ColMeta): string {
  if (val == null) return '\u2014'
  switch (col.format) {
    case 'num': return formatNum(val, 1)
    case 'num2': return formatNum(val, 2)
    case 'int': return Math.round(val).toString()
    case 'deg': return `${formatNum(val, 1)}\u00b0`
    case 'signed': return `${val >= 0 ? '+' : ''}${formatNum(val, 1)}`
    default: return ''
  }
}

// ── Shot detail panel sections ──
function CourseDetailPanel({ shot }: { shot: ClubShot }) {
  const lieTransition = shot.start_lie && shot.end_lie
    ? `${shot.start_lie} \u2192 ${shot.end_lie}`
    : shot.start_lie || '\u2014'
  const fwHit = shot.fairway_side === 'CENTER' ? '\u2713 Hit'
    : shot.fairway_side === 'L' ? '\u2190 Left'
    : shot.fairway_side === 'R' ? '\u2192 Right' : '\u2014'
  const sgFmt = (v: number | null | undefined) => v != null ? (v >= 0 ? '+' : '') + formatNum(v, 2) : '\u2014'

  const sections = [
    { title: 'Info', fields: [['Type', shot.shot_type || '\u2014'], ['Lie', lieTransition], ['Hole', shot.hole_number ?? '\u2014']] },
    { title: 'Distance', fields: [['GPS Distance', fmtVal(shot.distance_yards) + ' yds'], ['Useful Dist', fmtVal(shot.fairway_progress_yards) + ' yds'], ['Pin Remaining', fmtVal(shot.pin_distance_yards) + ' yds']] },
    { title: 'Accuracy', fields: [['Side from FW', fmtSigned(shot.fairway_side_yards) + ' yds'], ['Fairway', fwHit], ['Green Prox', fmtVal(shot.green_distance_yards) + ' yds'], ['On Green', shot.on_green != null ? (shot.on_green ? 'Yes' : 'No') : '\u2014']] },
    { title: 'Hazards', fields: [['Nearest', shot.nearest_hazard_name || shot.nearest_hazard_type || '\u2014'], ['Distance', fmtVal(shot.nearest_hazard_yards) + ' yds']] },
    { title: 'Strokes Gained', fields: [['SG vs PGA', sgFmt(shot.sg_pga)], ['SG vs Personal', sgFmt(shot.sg_personal)]] },
  ]
  return <DetailSections sections={sections} />
}

function RangeDetailPanel({ shot }: { shot: ClubShot }) {
  const sections = [
    { title: 'Flight', fields: [['Carry', fmtVal(shot.carry_yards)], ['Total', fmtVal(shot.total_yards)], ['Side', fmtSigned(shot.side_carry_yards)], ['Side Tot', fmtSigned(shot.side_total_yards)], ['Apex', fmtVal(shot.apex_yards)], ['Curve', fmtVal(shot.curve_yards)], ['Hang Time', shot.hang_time_sec != null ? formatNum(shot.hang_time_sec, 1) + 's' : '\u2014'], ['Descent', fmtDeg(shot.descent_angle_deg)]] },
    { title: 'Club & Swing', fields: [['Club Spd', fmtVal(shot.club_speed_mph)], ['Ball Spd', fmtVal(shot.ball_speed_mph)], ['Smash', fmtVal(shot.smash_factor, 2)], ['Attack', fmtDeg(shot.attack_angle_deg)], ['Club Path', fmtDeg(shot.club_path_deg)], ['Face Ang', fmtDeg(shot.face_angle_deg)], ['F2P', fmtDeg(shot.face_to_path_deg)], ['Dyn Loft', fmtDeg(shot.dynamic_loft_deg)], ['Spin Loft', fmtDeg(shot.spin_loft_deg)], ['Swing Pl', fmtDeg(shot.swing_plane_deg)], ['Swing Dir', fmtDeg(shot.swing_direction_deg)], ['Dyn Lie', fmtDeg(shot.dynamic_lie_deg)]] },
    { title: 'Impact', fields: [['Offset', fmtVal(shot.impact_offset_in)], ['Height', fmtVal(shot.impact_height_in)], ['Low Point', fmtVal(shot.low_point_distance_in)]] },
    { title: 'Spin', fields: [['Rate', shot.spin_rate_rpm != null ? Math.round(shot.spin_rate_rpm).toString() : '\u2014'], ['Axis', fmtDeg(shot.spin_axis_deg)], ['Launch', fmtDeg(shot.launch_angle_deg)], ['Launch Dir', fmtDeg(shot.launch_direction_deg)]] },
  ]
  return <DetailSections sections={sections} />
}

function DetailSections({ sections }: { sections: { title: string; fields: (string | number)[][] }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '12px 0' }}>
      {sections.map((sec) => (
        <div key={sec.title} style={{ minWidth: 140 }}>
          <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>{sec.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: '0.8rem' }}>
            {sec.fields.map(([label, val]) => (
              <Fragment key={String(label)}>
                <span style={{ color: 'var(--text-dim)' }}>{String(label)}</span>
                <span>{String(val)}</span>
              </Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──
export function ClubDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const clubId = id ? parseInt(id, 10) : undefined
  const { data, isLoading } = useClubDetail(clubId)
  const { data: allClubs = [] } = useClubs()

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)
  const [editingShot, setEditingShot] = useState<ClubShot | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(loadColumnConfig)
  const [editColumnsMode, setEditColumnsMode] = useState(false)
  const [addColDropdownOpen, setAddColDropdownOpen] = useState(false)
  const addColRef = useRef<HTMLThElement>(null)

  // Close add-column dropdown on outside click
  useEffect(() => {
    if (!addColDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (addColRef.current && !addColRef.current.contains(e.target as Node)) {
        setAddColDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [addColDropdownOpen])

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'desc') setSortDir('asc')
      else if (sortDir === 'asc') { setSortKey(null); setSortDir(null) }
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }, [sortKey, sortDir])

  const removeColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = prev.filter((k) => k !== key)
      saveColumnConfig(next)
      return next
    })
  }, [])

  const addColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      if (prev.includes(key)) return prev
      const next = [...prev, key]
      saveColumnConfig(next)
      return next
    })
    setAddColDropdownOpen(false)
  }, [])

  // Drag-and-drop state
  const dragIdx = useRef<number | null>(null)

  const handleDragStart = useCallback((idx: number) => {
    dragIdx.current = idx
  }, [])

  const handleDrop = useCallback((toIdx: number) => {
    const fromIdx = dragIdx.current
    if (fromIdx == null || fromIdx === toIdx) return
    setVisibleColumns((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      saveColumnConfig(next)
      return next
    })
    dragIdx.current = null
  }, [])

  const club = data?.club
  const allShots = data?.shots ?? []
  const sourceCounts = data?.source_counts ?? { course: 0, range: 0, trackman: 0 }
  const s = club?.stats
  const badge = SOURCE_COLORS[club?.source ?? 'manual'] ?? SOURCE_COLORS.manual

  // Distance stats based on source filter
  const distStats = (() => {
    if (!s) return null
    if (sourceFilter === 'garmin') {
      return { avg: s.avg_yards, median: s.median_yards, max: s.max_yards, std: s.std_dev, p10: s.p10, p90: s.p90, count: s.sample_count }
    }
    if (sourceFilter === 'rapsodo' || sourceFilter === 'trackman') {
      return { avg: s.range_avg_yards, median: s.range_median_yards, max: s.range_max_yards, std: s.range_std_dev, p10: s.range_p10, p90: s.range_p90, count: s.range_sample_count }
    }
    return { avg: s.combined_avg_yards, median: s.combined_median_yards, max: s.combined_max_yards, std: s.combined_std_dev, p10: s.combined_p10, p90: s.combined_p90, count: s.combined_sample_count }
  })()

  const filteredShots = filterShots(allShots, sourceFilter)

  const sortedShots = useMemo(() => {
    if (!sortKey || !sortDir) return filteredShots
    const dir = sortDir === 'desc' ? -1 : 1
    return [...filteredShots].sort((a, b) => {
      if (sortKey === 'date') {
        const va = a.date ?? ''
        const vb = b.date ?? ''
        return va < vb ? -dir : va > vb ? dir : 0
      }
      const va = ((a as Record<string, unknown>)[sortKey] as number) ?? -Infinity
      const vb = ((b as Record<string, unknown>)[sortKey] as number) ?? -Infinity
      return (va - vb) * dir
    })
  }, [filteredShots, sortKey, sortDir])

  if (isLoading) return <div className={styles.loading}>Loading...</div>
  if (!data || !club) return <EmptyState message="Club not found" />

  // Club specs
  const specs: string[] = []
  if (club.loft_deg != null) specs.push(`Loft: ${club.loft_deg}\u00b0`)
  if (club.lie_deg != null) specs.push(`Lie: ${club.lie_deg}\u00b0`)
  if (club.flex) specs.push(`Flex: ${club.flex}`)
  if (club.shaft_length_in != null) specs.push(`Shaft: ${club.shaft_length_in}"`)

  const hasLaunchData = data.avg_ball_speed != null || data.avg_club_speed != null || data.avg_spin_rate != null
  const totalShots = (sourceCounts.garmin || 0) + (sourceCounts.rapsodo || 0) + (sourceCounts.trackman || 0)

  const toggles: { key: SourceFilter; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'All', count: totalShots, color: 'var(--accent)' },
    ...(sourceCounts.garmin > 0 ? [{ key: 'garmin' as SourceFilter, label: 'Garmin', count: sourceCounts.garmin, color: '#4CAF50' }] : []),
    ...(sourceCounts.rapsodo > 0 ? [{ key: 'rapsodo' as SourceFilter, label: 'Rapsodo', count: sourceCounts.rapsodo, color: '#2196F3' }] : []),
    ...(sourceCounts.trackman > 0 ? [{ key: 'trackman' as SourceFilter, label: 'Trackman', count: sourceCounts.trackman, color: '#FF9800' }] : []),
  ]

  // Resolve visible column metadata
  const activeCols = visibleColumns.map((k) => COL_MAP.get(k)).filter((c): c is ColMeta => c != null)
  const hiddenCols = ALL_COLUMNS.filter((c) => !c.fixed && !visibleColumns.includes(c.key))

  // Compute summary rows for active numeric columns
  const summaryKeys = activeCols.filter((c) => c.format != null).map((c) => c.key)
  const avgRow: Record<string, string> = {}
  const sdRow: Record<string, string> = {}
  for (const key of summaryKeys) {
    const col = COL_MAP.get(key)!
    const vals = filteredShots.map((s) => (s as Record<string, unknown>)[key] as number | null | undefined)
    avgRow[key] = fmtSummary(calcAvg(vals), col)
    sdRow[key] = fmtSummary(calcStdDev(vals), col)
  }

  const srcLabels: Record<string, string> = { garmin: 'Garmin', rapsodo: 'Rapsodo', trackman: 'TM' }
  const srcColors: Record<string, string> = { garmin: '#4CAF50', rapsodo: '#2196F3', trackman: '#FF9800' }

  const thStyle = (sortable?: boolean): React.CSSProperties => ({
    padding: '8px 10px', textAlign: 'center',
    borderBottom: '1px solid var(--border)',
    cursor: sortable ? 'pointer' : 'default',
    color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem',
    textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
    position: 'relative',
  })

  return (
    <div>
      {/* Back nav */}
      <div style={{ marginBottom: 16 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/clubs')}>&larr; My Bag</Button>
      </div>

      {/* Header Card */}
      <Card>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: '50%',
            fontSize: '0.85rem', fontWeight: 700,
            background: club.color ?? badge.color, color: '#111',
          }}>
            {badge.label}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: '1.3rem' }}>
                {club.club_type}
                {club.name && <span style={{ color: 'var(--accent)', fontWeight: 'normal' }}> "{club.name}"</span>}
                {club.model && <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '1rem' }}> {club.model}</span>}
              </h1>
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} title="Edit club">&#9998;</Button>
            </div>
            {specs.length > 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 4 }}>
                {specs.join(' \u00b7 ')}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Distance Stats Card */}
      {distStats && (
        <Card className={styles.section}>
          <CardHeader title="Distance Stats" />
          <div className={styles.statsRow}>
            <StatCard label="Avg" value={fmtVal(distStats.avg)} unit=" yds" />
            <StatCard label="Median" value={fmtVal(distStats.median)} unit=" yds" />
            <StatCard label="Max" value={fmtVal(distStats.max)} unit=" yds" />
            <StatCard label="Spread" value={distStats.std != null ? `\u00b1${formatNum(distStats.std, 1)}` : '\u2014'} />
            <StatCard label="P10\u2013P90" value={distStats.p10 != null && distStats.p90 != null ? `${formatNum(distStats.p10, 0)}\u2013${formatNum(distStats.p90, 0)} yds` : '\u2014'} />
            <StatCard label="Shots" value={distStats.count ?? '\u2014'} />
          </div>
        </Card>
      )}

      {/* Launch Monitor Stats Card */}
      {hasLaunchData && (
        <Card className={styles.section}>
          <CardHeader title="Launch Monitor Averages" />
          <div className={styles.statsRow}>
            <StatCard label="Ball Speed" value={fmtVal(data.avg_ball_speed)} unit=" mph" />
            <StatCard label="Club Speed" value={fmtVal(data.avg_club_speed)} unit=" mph" />
            <StatCard label="Smash Factor" value={fmtVal(data.avg_smash_factor, 2)} />
            <StatCard label="Launch Angle" value={data.avg_launch_angle != null ? fmtDeg(data.avg_launch_angle) : '\u2014'} />
            <StatCard label="Attack Angle" value={data.avg_attack_angle != null ? fmtDeg(data.avg_attack_angle) : '\u2014'} />
            <StatCard label="Spin Rate" value={data.avg_spin_rate != null ? `${Math.round(data.avg_spin_rate)} rpm` : '\u2014'} />
            <StatCard label="Club Path" value={data.avg_club_path != null ? fmtDeg(data.avg_club_path) : '\u2014'} />
          </div>
        </Card>
      )}

      {/* Shots Card */}
      <Card className={styles.section}>
        <CardHeader title={`All Shots (${filteredShots.length})`} action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {toggles.map((t) => (
              <button
                key={t.key}
                onClick={() => setSourceFilter(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                  border: sourceFilter === t.key ? `1px solid ${t.color}` : '1px solid var(--border)',
                  background: sourceFilter === t.key ? `${t.color}20` : 'transparent',
                  color: sourceFilter === t.key ? t.color : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                {t.label} ({t.count})
              </button>
            ))}
            <button
              onClick={() => setEditColumnsMode((p) => !p)}
              title="Edit columns"
              style={{
                background: editColumnsMode ? 'var(--accent)' : 'transparent',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                color: editColumnsMode ? '#111' : 'var(--text-muted)',
                cursor: 'pointer', padding: '4px 8px', fontSize: '0.82rem',
              }}
            >
              &#9998;
            </button>
          </div>
        } />

        {filteredShots.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No shots found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  {activeCols.map((col, ci) => (
                    <th
                      key={col.key}
                      onClick={!editColumnsMode && col.format != null ? () => handleSort(col.key) : undefined}
                      draggable={editColumnsMode && !col.fixed}
                      onDragStart={editColumnsMode ? () => handleDragStart(ci) : undefined}
                      onDragOver={editColumnsMode ? (e) => e.preventDefault() : undefined}
                      onDrop={editColumnsMode ? () => handleDrop(ci) : undefined}
                      style={{
                        ...thStyle(!editColumnsMode && col.format != null),
                        textAlign: col.key === 'row_num' || col.key === 'date' || col.key === 'source' || col.key === 'shot_type' ? 'left' : 'center',
                        cursor: editColumnsMode && !col.fixed ? 'grab' : undefined,
                      }}
                    >
                      {col.label}
                      {!editColumnsMode && sortKey === col.key && (sortDir === 'desc' ? ' \u25BC' : ' \u25B2')}
                      {editColumnsMode && !col.fixed && (
                        <span
                          onClick={(e) => { e.stopPropagation(); removeColumn(col.key) }}
                          style={{
                            marginLeft: 4, cursor: 'pointer', color: 'var(--red, #ef5350)',
                            fontWeight: 700, fontSize: '0.9rem',
                          }}
                        >
                          &times;
                        </span>
                      )}
                    </th>
                  ))}
                  {/* Gear / Add column header */}
                  <th ref={addColRef} style={{ ...thStyle(), width: 36, position: 'relative' }}>
                    {editColumnsMode ? (
                      <>
                        <span
                          onClick={() => setAddColDropdownOpen((p) => !p)}
                          style={{
                            cursor: 'pointer', color: 'var(--accent)',
                            fontWeight: 700, fontSize: '1.1rem',
                          }}
                        >
                          +
                        </span>
                        {addColDropdownOpen && hiddenCols.length > 0 && (
                          <div style={{
                            position: 'absolute', top: '100%', right: 0, zIndex: 50,
                            background: 'var(--bg-card, #1e2128)', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                            maxHeight: 300, overflowY: 'auto', minWidth: 140,
                          }}>
                            {hiddenCols.map((hc) => (
                              <div
                                key={hc.key}
                                onClick={() => addColumn(hc.key)}
                                style={{
                                  padding: '6px 12px', cursor: 'pointer', fontSize: '0.82rem',
                                  color: 'var(--text)', whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--bg-elevated, #2a2d35)' }}
                                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent' }}
                              >
                                {hc.label}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : null}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Summary: Avg row */}
                <tr style={{ background: 'var(--bg-elevated, #1a1d24)', fontWeight: 600 }}>
                  {activeCols.map((col) => (
                    <td key={col.key} style={{ padding: '6px 10px', textAlign: col.format ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>
                      {col.key === 'row_num' ? <strong>Avg</strong> : col.format == null ? '' : avgRow[col.key] ?? ''}
                    </td>
                  ))}
                  <td style={{ borderBottom: '1px solid var(--border)' }} />
                </tr>
                {/* Summary: StdDev row */}
                <tr style={{ background: 'var(--bg-elevated, #1a1d24)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {activeCols.map((col) => (
                    <td key={col.key} style={{ padding: '6px 10px', textAlign: col.format ? 'center' : 'left', borderBottom: '2px solid var(--border)' }}>
                      {col.key === 'row_num' ? <strong>StdDev</strong> : col.format == null ? '' : sdRow[col.key] ?? ''}
                    </td>
                  ))}
                  <td style={{ borderBottom: '2px solid var(--border)' }} />
                </tr>
                {/* Shot rows */}
                {sortedShots.map((shot, i) => {
                  const isExpanded = expandedShotId === shot.id
                  return (
                    <Fragment key={shot.id}>
                      <tr
                        onClick={() => setExpandedShotId(isExpanded ? null : shot.id)}
                        style={{ cursor: 'pointer', background: isExpanded ? 'var(--bg-elevated, #1a1d24)' : undefined }}
                      >
                        {activeCols.map((col) => (
                          <td key={col.key} style={{ padding: '8px 10px', textAlign: col.format ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>
                            {col.key === 'row_num' ? i + 1 :
                             col.key === 'date' ? (shot.date ? formatDate(shot.date) : '\u2014') :
                             col.key === 'source' ? (
                              <span style={{
                                display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                                fontSize: '0.7rem', fontWeight: 600,
                                background: srcColors[shot.source] ?? '#888', color: '#fff',
                              }}>
                                {srcLabels[shot.source] ?? shot.source}
                              </span>
                            ) : col.key === 'shot_type' ? (shot.shot_type || '\u2014') : fmtCell(shot, col)}
                          </td>
                        ))}
                        {/* Gear icon */}
                        <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingShot(shot) }}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: 'var(--text-dim)', fontSize: '0.9rem', padding: '2px 6px',
                            }}
                            title="Edit shot"
                          >
                            &#9881;
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={activeCols.length + 1} style={{ padding: '8px 16px', background: 'var(--bg-elevated, #1a1d24)', borderBottom: '2px solid var(--border)' }}>
                            {shot.source === 'garmin' ? <CourseDetailPanel shot={shot} /> : <RangeDetailPanel shot={shot} />}
                            <div style={{ textAlign: 'right', marginTop: 4, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                              {shot.source === 'garmin' && shot.round_id && (
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/rounds/${shot.round_id}`) }}>
                                  View Round
                                </Button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingShot(shot) }}
                                style={{
                                  background: 'transparent', border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                  color: 'var(--text-muted)', fontSize: '0.8rem', padding: '4px 8px',
                                }}
                                title="Edit shot"
                              >
                                &#9881;
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ClubEditModal isOpen={editOpen} onClose={() => setEditOpen(false)} club={club} />
      <ShotEditModal
        isOpen={editingShot !== null}
        onClose={() => setEditingShot(null)}
        shot={editingShot}
        currentClubId={club.id}
        allClubs={allClubs}
      />
    </div>
  )
}
