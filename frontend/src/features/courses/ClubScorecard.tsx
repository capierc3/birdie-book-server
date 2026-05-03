import { useMemo, useState, useCallback } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { put } from '../../api'
import type { CourseDetail, CourseTee, CourseHole } from '../../api'
import { TEE_COLORS } from '../course-map/courseMapState'
import s from './ClubScorecard.module.css'

interface Props {
  course: CourseDetail
}

interface CellEdit {
  /** Composite key like "yardage-5-72" or "par-5" or "hcp-5-groupA" */
  key: string
  value: string
}

/** Pull a CSS color out of a tee name like "BLUE (W)" → blue. Falls back
 * to neutral gray when no known keyword matches. */
function teeColorFor(name: string): string {
  const upper = name.toUpperCase()
  for (const [keyword, color] of Object.entries(TEE_COLORS)) {
    if (upper.includes(keyword.toUpperCase())) return color
  }
  return '#666'
}

/** Heuristic: is this a women's / forward tee? Detects common conventions —
 * "(W)", " W", "WOMEN", "LADIES", "FORWARD". Used to split the scorecard
 * layout: men's rows above PAR, women's rows below. */
function isWomenTee(name: string): boolean {
  const upper = name.toUpperCase().trim()
  return /\(\s*W\s*\)/.test(upper)        // "RED (W)"
    || /\bW\b/.test(upper)                 // "RED W"
    || upper.includes('WOMEN')             // "WOMEN'S"
    || upper.includes('LADIES')            // "LADIES"
    || upper.includes('FORWARD')           // "FORWARD"
}

/** Pick a readable text color (black or white) for a given background. */
function readableTextColor(bg: string): string {
  // Strip any leading "#" and parse RGB. Treats short-form #fff as white.
  const hex = bg.replace('#', '')
  const expanded = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
  if (expanded.length !== 6) return '#fff'
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  // sRGB luminance
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 160 ? '#1a1a1a' : '#fff'
}

interface HcpGroup {
  /** Tees that share this exact handicap sequence. */
  tees: CourseTee[]
  /** Per-hole handicap values (length = totalHoles). null where data missing. */
  values: (number | null)[]
  /** Stable identifier — used as cell key prefix when editing. */
  key: string
}

/** Group tees by their handicap sequence. Tees with all-null hcp data fall
 * into either "__empty_m__" (men's tees) or "__empty_w__" (women's tees) so
 * the user can enter separate men's and women's handicap series in edit mode
 * even on a course where no handicap data exists yet. */
function groupTeesByHandicap(tees: CourseTee[], totalHoles: number): HcpGroup[] {
  const groups = new Map<string, HcpGroup>()
  for (const tee of tees) {
    const byHole = new Map(tee.holes.map(h => [h.hole_number, h.handicap ?? null]))
    const values: (number | null)[] = []
    for (let h = 1; h <= totalHoles; h++) values.push(byHole.get(h) ?? null)
    const isEmpty = values.every(v => v == null)
    let key: string
    if (isEmpty) {
      key = isWomenTee(tee.tee_name ?? '') ? '__empty_w__' : '__empty_m__'
    } else {
      key = values.map(v => v ?? 'x').join(',')
    }
    if (!groups.has(key)) groups.set(key, { tees: [], values, key })
    groups.get(key)!.tees.push(tee)
  }
  return [...groups.values()]
}

export function ClubScorecard({ course }: Props) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())

  const totalHoles = course.holes ?? 18
  const holeNumbers = useMemo(
    () => Array.from({ length: totalHoles }, (_, i) => i + 1),
    [totalHoles],
  )

  // Pick the "primary" tee for the shared PAR row. Use the longest tee that
  // has par data; fall back to the first.
  const primaryTee = useMemo<CourseTee | null>(() => {
    if (!course.tees.length) return null
    const withPar = course.tees.filter(t => t.holes.some(h => h.par != null))
    const sorted = (withPar.length ? withPar : course.tees).slice()
      .sort((a, b) => (b.total_yards ?? 0) - (a.total_yards ?? 0))
    return sorted[0] ?? null
  }, [course.tees])

  const parByHole = useMemo(() => {
    const m = new Map<number, number>()
    if (primaryTee) {
      for (const h of primaryTee.holes) if (h.par != null) m.set(h.hole_number, h.par)
    }
    return m
  }, [primaryTee])

  const hcpGroups = useMemo(() => groupTeesByHandicap(course.tees, totalHoles), [course.tees, totalHoles])

  // Split tees by gender convention. PAR row sits between the two halves so
  // the layout reads like a real scorecard.
  const { mensTees, womensTees } = useMemo(() => {
    const sorted = course.tees.slice().sort((a, b) => (b.total_yards ?? 0) - (a.total_yards ?? 0))
    const mens: CourseTee[] = []
    const womens: CourseTee[] = []
    for (const tee of sorted) {
      if (isWomenTee(tee.tee_name ?? '')) womens.push(tee)
      else mens.push(tee)
    }
    return { mensTees: mens, womensTees: womens }
  }, [course.tees])

  // Classify each handicap group by which side(s) of PAR it belongs on.
  // A group is "men's" iff every tee in it is a men's tee, "women's" iff
  // every tee is a women's tee, "mixed" if both, "unset" for the all-null
  // placeholder group.
  const classifyGroup = useCallback((group: HcpGroup): 'mens' | 'womens' | 'mixed' => {
    // Empty groups are pre-split by gender in groupTeesByHandicap, so they
    // already flow into the right side here.
    if (group.key === '__empty_m__') return 'mens'
    if (group.key === '__empty_w__') return 'womens'
    const womensCount = group.tees.filter(t => isWomenTee(t.tee_name ?? '')).length
    if (womensCount === 0) return 'mens'
    if (womensCount === group.tees.length) return 'womens'
    return 'mixed'
  }, [])

  // Hide all-empty groups in read-only mode — only relevant when editing.
  const isEmptyGroup = (g: HcpGroup) => g.key === '__empty_m__' || g.key === '__empty_w__'

  const mensHcpGroups = useMemo(
    () => hcpGroups.filter(g => {
      if (!editing && isEmptyGroup(g)) return false
      const c = classifyGroup(g)
      return c === 'mens' || c === 'mixed'  // mixed displayed on the men's side too
    }),
    [hcpGroups, classifyGroup, editing],
  )
  const womensHcpGroups = useMemo(
    () => hcpGroups.filter(g => {
      if (!editing && isEmptyGroup(g)) return false
      return classifyGroup(g) === 'womens'
    }),
    [hcpGroups, classifyGroup, editing],
  )

  // Sum helper — pass a getter that returns yardage for a hole.
  const subtotal = useCallback((tee: CourseTee, from: number, to: number): number | null => {
    let sum = 0
    let any = false
    for (let h = from; h <= to; h++) {
      const hole = tee.holes.find(x => x.hole_number === h)
      if (hole?.yardage != null) {
        sum += hole.yardage
        any = true
      }
    }
    return any ? sum : null
  }, [])

  const parSubtotal = useCallback((from: number, to: number): number | null => {
    let sum = 0
    let any = false
    for (let h = from; h <= to; h++) {
      const v = parByHole.get(h)
      if (v != null) { sum += v; any = true }
    }
    return any ? sum : null
  }, [parByHole])

  // Only split into OUT / IN when the round has both nines.
  const half = totalHoles >= 18 ? 9 : totalHoles
  const showSplit = totalHoles >= 18

  // ─── Edit helpers ───────────────────────────────────────────────────────

  const cellValue = (key: string, fallback: string): string =>
    edits[key] ?? fallback

  const setCell = (key: string, value: string) => {
    // Strip everything that isn't a digit so the user can't paste in
    // garbage and our parseInt() in flushEdits is always safe.
    const digits = value.replace(/\D/g, '')
    setEdits(prev => ({ ...prev, [key]: digits }))
  }

  const persistHole = useCallback(async (
    courseId: number, hole: CourseHole, body: Partial<{ par: number; yardage: number; handicap: number }>,
  ) => {
    await put(`/courses/${courseId}/holes/${hole.id}`, body)
  }, [])

  const flushEdits = useCallback(async () => {
    if (Object.keys(edits).length === 0) {
      setEditing(false)
      return
    }
    const keys = Object.keys(edits)
    setSavingKeys(new Set(keys))

    // Group writes by hole-record. For PAR (course-shared) and HCP (group-shared),
    // each edit fans out to multiple CourseHole rows.
    const writes: Promise<void>[] = []

    for (const key of keys) {
      const raw = edits[key].trim()
      const parsed = raw === '' ? null : parseInt(raw, 10)
      if (raw !== '' && Number.isNaN(parsed)) continue

      if (key.startsWith('par:')) {
        const holeNum = Number(key.slice(4))
        if (parsed == null) continue
        for (const tee of course.tees) {
          const hole = tee.holes.find(h => h.hole_number === holeNum)
          if (hole) writes.push(persistHole(course.id, hole, { par: parsed }))
        }
      } else if (key.startsWith('yds:')) {
        const [, teeIdStr, holeStr] = key.split(':')
        const teeId = Number(teeIdStr); const holeNum = Number(holeStr)
        if (parsed == null) continue
        const tee = course.tees.find(t => t.id === teeId)
        const hole = tee?.holes.find(h => h.hole_number === holeNum)
        if (hole) writes.push(persistHole(course.id, hole, { yardage: parsed }))
      } else if (key.startsWith('hcp:')) {
        const [, groupKey, holeStr] = key.split(':')
        const holeNum = Number(holeStr)
        if (parsed == null) continue
        const group = hcpGroups.find(g => g.key === groupKey)
        if (!group) continue
        for (const tee of group.tees) {
          const hole = tee.holes.find(h => h.hole_number === holeNum)
          if (hole) writes.push(persistHole(course.id, hole, { handicap: parsed }))
        }
      }
    }

    try {
      await Promise.all(writes)
      // Refresh the club's course data so the scorecard re-renders with the
      // new values. The Club page invalidates on its own on mutation but we
      // hit the raw `put` endpoint here.
      qc.invalidateQueries({ queryKey: ['courses'] })
      setEdits({})
      setEditing(false)
    } catch (e) {
      console.error('Scorecard save failed:', e)
    } finally {
      setSavingKeys(new Set())
    }
  }, [edits, course, hcpGroups, persistHole, qc])

  const cancelEdits = () => {
    setEdits({})
    setEditing(false)
  }

  // ─── Render helpers ─────────────────────────────────────────────────────

  const renderHeaderCells = () => (
    <>
      {holeNumbers.slice(0, half).map(h => (
        <th key={`h-${h}`} className={s.holeHeader}>{h}</th>
      ))}
      {showSplit && <th className={s.subtotalHeader}>OUT</th>}
      {totalHoles > half && holeNumbers.slice(half).map(h => (
        <th key={`h-${h}`} className={s.holeHeader}>{h}</th>
      ))}
      {showSplit && totalHoles > half && <th className={s.subtotalHeader}>IN</th>}
      <th className={s.subtotalHeader}>TOT</th>
    </>
  )

  const renderEditableCell = (key: string, currentValue: number | null, maxLen = 3) => {
    if (!editing) return currentValue ?? '—'
    return (
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={maxLen}
        className={s.cellInput}
        value={cellValue(key, currentValue?.toString() ?? '')}
        onChange={e => setCell(key, e.target.value)}
        onFocus={e => e.target.select()}
        disabled={savingKeys.has(key)}
      />
    )
  }

  const renderTeeRow = (tee: CourseTee) => {
    const teeColor = teeColorFor(tee.tee_name ?? '')
    const textColor = readableTextColor(teeColor)
    const out = subtotal(tee, 1, half)
    const inSub = totalHoles > half ? subtotal(tee, half + 1, totalHoles) : null
    const total = (out ?? 0) + (inSub ?? 0) || tee.total_yards
    return (
      <tr key={`tee-${tee.id}`} style={{ background: teeColor, color: textColor }}>
        <th className={s.rowLabel} style={{ background: teeColor, color: textColor }}>
          {(tee.tee_name ?? '—').toUpperCase()}
        </th>
        {holeNumbers.slice(0, half).map(h => {
          const hole = tee.holes.find(x => x.hole_number === h)
          return (
            <td key={`y-${tee.id}-${h}`} className={s.dataCell}>
              {renderEditableCell(`yds:${tee.id}:${h}`, hole?.yardage ?? null, 3)}
            </td>
          )
        })}
        {showSplit && <td className={s.subtotalCell}>{out?.toLocaleString() ?? '—'}</td>}
        {totalHoles > half && holeNumbers.slice(half).map(h => {
          const hole = tee.holes.find(x => x.hole_number === h)
          return (
            <td key={`y-${tee.id}-${h}`} className={s.dataCell}>
              {renderEditableCell(`yds:${tee.id}:${h}`, hole?.yardage ?? null, 3)}
            </td>
          )
        })}
        {showSplit && totalHoles > half && <td className={s.subtotalCell}>{inSub?.toLocaleString() ?? '—'}</td>}
        <td className={s.subtotalCell}>{total?.toLocaleString() ?? '—'}</td>
      </tr>
    )
  }

  const renderHcpRow = (group: HcpGroup, label: string) => {
    return (
      <tr key={`hcp-${group.key}`} className={s.hcpRow}>
        <th className={s.rowLabel}>{label}</th>
        {holeNumbers.slice(0, half).map(h => (
          <td key={`hcp-${group.key}-${h}`} className={s.dataCell}>
            {renderEditableCell(`hcp:${group.key}:${h}`, group.values[h - 1], 2)}
          </td>
        ))}
        {showSplit && <td className={s.subtotalCell}>—</td>}
        {totalHoles > half && holeNumbers.slice(half).map(h => (
          <td key={`hcp-${group.key}-${h}`} className={s.dataCell}>
            {renderEditableCell(`hcp:${group.key}:${h}`, group.values[h - 1], 2)}
          </td>
        ))}
        {showSplit && totalHoles > half && <td className={s.subtotalCell}>—</td>}
        <td className={s.subtotalCell}>—</td>
      </tr>
    )
  }

  // Single HCP row per side → "HANDICAP" (the row's position above/below PAR
  // already conveys gender). Multiple HCP rows per side → list the tee names
  // so the user can tell which row belongs to which tee group.
  const hcpRowLabel = (group: HcpGroup): string => {
    const side = classifyGroup(group)
    const sameSidePopulated = hcpGroups
      .filter(g => !isEmptyGroup(g) && classifyGroup(g) === side)
      .length
    if (sameSidePopulated <= 1) return 'HANDICAP'
    return group.tees.map(t => (t.tee_name ?? '?').toUpperCase()).join(' / ')
  }

  // ─── Component layout ───────────────────────────────────────────────────

  return (
    <div className={s.scorecard}>
      <div className={s.toolbar}>
        <span className={s.toolbarTitle}>Scorecard</span>
        {editing ? (
          <>
            <button className={s.iconBtn} onClick={flushEdits} title="Save changes" aria-label="Save">
              <Check size={16} />
            </button>
            <button className={s.iconBtn} onClick={cancelEdits} title="Cancel" aria-label="Cancel">
              <X size={16} />
            </button>
          </>
        ) : (
          <button className={s.iconBtn} onClick={() => setEditing(true)} title="Edit scorecard" aria-label="Edit scorecard">
            <Pencil size={16} />
          </button>
        )}
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.cornerHeader}>HOLE</th>
              {renderHeaderCells()}
            </tr>
          </thead>
          <tbody>
            {/* Men's tee yardages */}
            {mensTees.map(renderTeeRow)}

            {/* Men's HCP — hugs PAR from above */}
            {mensHcpGroups.map(g => renderHcpRow(g, hcpRowLabel(g)))}

            {/* PAR — sandwiched between the two HCP rows */}
            <tr className={s.parRow}>
              <th className={s.rowLabel}>PAR</th>
              {holeNumbers.slice(0, half).map(h => (
                <td key={`par-${h}`} className={s.dataCell}>
                  {renderEditableCell(`par:${h}`, parByHole.get(h) ?? null, 1)}
                </td>
              ))}
              {showSplit && <td className={s.subtotalCell}>{parSubtotal(1, half)?.toString() ?? '—'}</td>}
              {totalHoles > half && holeNumbers.slice(half).map(h => (
                <td key={`par-${h}`} className={s.dataCell}>
                  {renderEditableCell(`par:${h}`, parByHole.get(h) ?? null, 1)}
                </td>
              ))}
              {showSplit && totalHoles > half && <td className={s.subtotalCell}>{parSubtotal(half + 1, totalHoles)?.toString() ?? '—'}</td>}
              <td className={s.subtotalCell}>{course.par ?? '—'}</td>
            </tr>

            {/* Women's HCP — hugs PAR from below */}
            {womensHcpGroups.map(g => renderHcpRow(g, hcpRowLabel(g)))}

            {/* Women's tee yardages */}
            {womensTees.map(renderTeeRow)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
