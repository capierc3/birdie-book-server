import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Card } from '../../components'
import type { RangeShotResponse } from '../../api'
import { formatNum } from '../../utils/format'
import styles from './RangeDetailPage.module.css'

// ── Column definitions ──
interface ColMeta {
  key: string
  label: string
  format: 'num' | 'int' | 'deg' | 'signed' | 'num2' | null
  fixed?: boolean
  trackman?: boolean
}

const ALL_COLUMNS: ColMeta[] = [
  { key: 'shot_number', label: '#', format: null, fixed: true },
  { key: 'carry_yards', label: 'Carry', format: 'num' },
  { key: 'total_yards', label: 'Total', format: 'num' },
  { key: 'ball_speed_mph', label: 'Ball Spd', format: 'num' },
  { key: 'club_speed_mph', label: 'Club Spd', format: 'num' },
  { key: 'launch_angle_deg', label: 'Launch', format: 'deg' },
  { key: 'spin_rate_rpm', label: 'Spin', format: 'int' },
  { key: 'apex_yards', label: 'Apex', format: 'num' },
  { key: 'side_carry_yards', label: 'Side', format: 'signed' },
  { key: 'descent_angle_deg', label: 'Descent', format: 'deg' },
  { key: 'smash_factor', label: 'Smash', format: 'num2' },
  { key: 'attack_angle_deg', label: 'Attack', format: 'deg' },
  { key: 'club_path_deg', label: 'Club Path', format: 'deg' },
  { key: 'spin_axis_deg', label: 'Spin Axis', format: 'deg' },
  { key: 'face_angle_deg', label: 'Face Ang', format: 'deg', trackman: true },
  { key: 'face_to_path_deg', label: 'F2P', format: 'deg', trackman: true },
  { key: 'dynamic_loft_deg', label: 'Dyn Loft', format: 'deg', trackman: true },
  { key: 'spin_loft_deg', label: 'Spin Loft', format: 'deg', trackman: true },
  { key: 'swing_plane_deg', label: 'Swing Pl', format: 'deg', trackman: true },
  { key: 'swing_direction_deg', label: 'Swing Dir', format: 'deg', trackman: true },
  { key: 'dynamic_lie_deg', label: 'Dyn Lie', format: 'deg', trackman: true },
  { key: 'impact_offset_in', label: 'Imp Offset', format: 'num', trackman: true },
  { key: 'impact_height_in', label: 'Imp Height', format: 'num', trackman: true },
  { key: 'low_point_distance_in', label: 'Low Point', format: 'num', trackman: true },
  { key: 'curve_yards', label: 'Curve', format: 'num', trackman: true },
  { key: 'hang_time_sec', label: 'Hang Time', format: 'num', trackman: true },
  { key: 'side_total_yards', label: 'Side Tot', format: 'signed', trackman: true },
  { key: 'smash_index', label: 'Smash Idx', format: 'num2', trackman: true },
]

const COL_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]))
const DEFAULT_VISIBLE = [
  'shot_number', 'carry_yards', 'total_yards', 'ball_speed_mph', 'club_speed_mph',
  'launch_angle_deg', 'spin_rate_rpm', 'apex_yards', 'side_carry_yards', 'descent_angle_deg', 'smash_factor',
]
const LS_KEY = 'birdie_book_range_columns'

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

// ── Formatters ──
function fmtCell(shot: RangeShotResponse, col: ColMeta): string {
  const val = (shot as unknown as Record<string, unknown>)[col.key]
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

// ── Props ──
interface Props {
  clubName: string
  clubColor: string
  shots: RangeShotResponse[]
  primaryShotId: string | null
  compareShotId: string | null
  onShotClick: (shotId: string) => void
}

export function ClubShotSection({ clubName, clubColor, shots, primaryShotId, compareShotId, onShotClick }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(loadColumnConfig)
  const [editColumnsMode, setEditColumnsMode] = useState(false)
  const [addColDropdownOpen, setAddColDropdownOpen] = useState(false)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)
  const addColRef = useRef<HTMLTableCellElement>(null)

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
    if (editColumnsMode) return
    if (sortKey === key) {
      if (sortDir === 'desc') setSortDir('asc')
      else if (sortDir === 'asc') { setSortKey(null); setSortDir(null) }
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }, [sortKey, sortDir, editColumnsMode])

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

  const activeCols = visibleColumns.map((k) => COL_MAP.get(k)).filter((c): c is ColMeta => c != null)
  const hiddenCols = ALL_COLUMNS.filter((c) => !c.fixed && !visibleColumns.includes(c.key))

  const sortedShots = useMemo(() => {
    if (!sortKey || !sortDir) return shots
    const dir = sortDir === 'desc' ? -1 : 1
    return [...shots].sort((a, b) => {
      const va = ((a as unknown as Record<string, unknown>)[sortKey] as number) ?? -Infinity
      const vb = ((b as unknown as Record<string, unknown>)[sortKey] as number) ?? -Infinity
      return (va - vb) * dir
    })
  }, [shots, sortKey, sortDir])

  // Summary rows
  const summaryData = useMemo(() => {
    const avgRow: Record<string, string> = {}
    const sdRow: Record<string, string> = {}
    for (const col of activeCols) {
      if (col.format == null) continue
      const vals = shots.map((s) => (s as unknown as Record<string, unknown>)[col.key] as number | null | undefined)
      avgRow[col.key] = fmtSummary(calcAvg(vals), col)
      sdRow[col.key] = fmtSummary(calcStdDev(vals), col)
    }
    return { avgRow, sdRow }
  }, [shots, activeCols])

  const handleRowClick = (shotId: string) => {
    onShotClick(shotId)
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 10px', textAlign: 'center',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem',
    textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
    position: 'relative',
  }

  return (
    <Card>
      <div
        className={styles.clubSectionHeader}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={styles.clubDot} style={{ background: clubColor }} />
        <span className={styles.clubSectionName}>{clubName}</span>
        <span className={styles.clubSectionCount}>{shots.length} shots</span>
        <span className={styles.clubSectionChevron}>{collapsed ? '\u25B6' : '\u25BC'}</span>
        <button
          className={styles.editColsBtn}
          onClick={(e) => { e.stopPropagation(); setEditColumnsMode(!editColumnsMode) }}
          title="Edit columns"
        >
          &#9998;
        </button>
      </div>
      {!collapsed && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                {activeCols.map((col, idx) => (
                  <th
                    key={col.key}
                    style={{ ...thStyle, cursor: editColumnsMode ? 'grab' : (col.format ? 'pointer' : 'default') }}
                    draggable={editColumnsMode && !col.fixed}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(idx)}
                    onClick={() => !editColumnsMode && col.format && handleSort(col.key)}
                  >
                    {col.label}
                    {!editColumnsMode && sortKey === col.key && (
                      <span style={{ marginLeft: 4 }}>{sortDir === 'desc' ? '\u25BC' : '\u25B2'}</span>
                    )}
                    {editColumnsMode && !col.fixed && (
                      <span
                        style={{ position: 'absolute', right: 2, top: 2, cursor: 'pointer', color: 'var(--danger, #ef4444)', fontSize: '0.7rem' }}
                        onClick={(e) => { e.stopPropagation(); removeColumn(col.key) }}
                      >
                        \u00d7
                      </span>
                    )}
                  </th>
                ))}
                {editColumnsMode && (
                  <th ref={addColRef} style={{ ...thStyle, cursor: 'pointer', position: 'relative' }}>
                    <span onClick={() => setAddColDropdownOpen(!addColDropdownOpen)}>+</span>
                    {addColDropdownOpen && (
                      <div className={styles.addColDropdown}>
                        {hiddenCols.map((c) => (
                          <div
                            key={c.key}
                            className={styles.addColItem}
                            onClick={() => addColumn(c.key)}
                          >
                            {c.label}{c.trackman ? ' (TM)' : ''}
                          </div>
                        ))}
                        {hiddenCols.length === 0 && (
                          <div className={styles.addColItem} style={{ color: 'var(--text-muted)' }}>All columns visible</div>
                        )}
                      </div>
                    )}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {/* Average row */}
              <tr style={{ fontWeight: 600, background: 'var(--bg)' }}>
                {activeCols.map((col) => (
                  <td key={col.key} style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                    {col.key === 'shot_number' ? 'Avg' : (summaryData.avgRow[col.key] ?? '')}
                  </td>
                ))}
                {editColumnsMode && <td />}
              </tr>
              {/* StdDev row */}
              <tr style={{ color: 'var(--text-muted)', fontSize: '0.78rem', background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {activeCols.map((col) => (
                  <td key={col.key} style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>
                    {col.key === 'shot_number' ? 'StdDev' : (summaryData.sdRow[col.key] ?? '')}
                  </td>
                ))}
                {editColumnsMode && <td />}
              </tr>
              {sortedShots.map((shot) => {
                const isPrimary = shot.id === primaryShotId
                const isCompare = shot.id === compareShotId
                const isDimmed = (primaryShotId || compareShotId) && !isPrimary && !isCompare
                return (
                  <tr
                    key={shot.id}
                    className={`${styles.shotRow} ${isPrimary ? styles.shotHighlighted : ''} ${isCompare ? styles.shotCompare : ''} ${isDimmed ? styles.shotDimmed : ''}`}
                    onClick={() => handleRowClick(shot.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {activeCols.map((col) => (
                      <td key={col.key} style={{ padding: '6px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        {fmtCell(shot, col)}
                      </td>
                    ))}
                    {editColumnsMode && <td />}
                  </tr>
                )
              })}
              {/* end of shot rows */}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
