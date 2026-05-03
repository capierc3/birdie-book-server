/**
 * Personal Par — allocate a target round score across holes by handicap index.
 *
 * "I want to shoot 99" on a par-72 course = 27 strokes over par to spend.
 * Distribute by hole handicap (1 = hardest, 18 = easiest) one stroke at a
 * time, looping until the budget is exhausted. Hardest holes get the
 * extra strokes first.
 *
 * Pure function — no React / DOM. Used by mobile play surfaces and (later)
 * the desktop planning mode.
 */

export interface HoleForPpar {
  hole_number: number
  par: number
  /** 1-18 difficulty ranking (1 = hardest). When unset, the function falls
   * back to yardage desc, then par desc, then hole_number asc — far better
   * than naive hole-number order which would always front-load strokes. */
  handicap?: number | null
  /** Used as a fallback signal for difficulty when handicap is missing. */
  yardage?: number | null
}

export type AllocationSource = 'handicap' | 'yardage' | 'par' | 'hole_order'

export interface PersonalParResult {
  /** Map: hole_number -> personal par */
  byHole: Map<number, number>
  /** Total course par across the holes provided */
  totalPar: number
  /** target - totalPar. Negative when the goal is under par. */
  budget: number
  /** True when budget could not be fully distributed (shouldn't happen for
   * realistic budgets but flagged for completeness). */
  budgetExceeded: boolean
  /** What signal drove the allocation order. UI may surface this when the
   * data quality is degraded ("allocated by yardage — no handicap set"). */
  allocationSource: AllocationSource
}

/**
 * Compute personal par per hole given a target round score.
 *
 * @param targetScore  e.g. 99 to break 100
 * @param holes        the holes to allocate across (typically holes_played-many)
 * @returns            per-hole personal par + breakdown
 */
export function computePersonalPars(
  targetScore: number,
  holes: HoleForPpar[],
): PersonalParResult {
  const byHole = new Map<number, number>()
  for (const h of holes) byHole.set(h.hole_number, h.par)

  const totalPar = holes.reduce((sum, h) => sum + h.par, 0)
  const budget = targetScore - totalPar

  // Pick the strongest difficulty signal we have. Naive hole-number order
  // would always front-load strokes onto the front 9 — misleading enough to
  // be worth surfacing.
  const hasHandicap = holes.some(h => h.handicap != null)
  const hasYardage = holes.some(h => h.yardage != null && h.yardage > 0)
  const allocationSource: AllocationSource = hasHandicap
    ? 'handicap'
    : hasYardage
      ? 'yardage'
      : 'par'

  // Goal is at-or-under par — personal par = par for every hole.
  if (budget <= 0) {
    return { byHole, totalPar, budget, budgetExceeded: false, allocationSource }
  }

  // Build a sort key that picks "hardest" first using whichever signal we
  // have. Always include hole_number as a final tiebreaker so the order is
  // deterministic.
  const ordered = [...holes].sort((a, b) => {
    if (hasHandicap) {
      const diff = (a.handicap ?? Number.POSITIVE_INFINITY) - (b.handicap ?? Number.POSITIVE_INFINITY)
      if (diff !== 0) return diff
    }
    if (hasYardage) {
      const diff = (b.yardage ?? -Infinity) - (a.yardage ?? -Infinity)
      if (diff !== 0) return diff
    }
    // Par desc — par 5s tend to be harder than par 3s when no other signal.
    const parDiff = b.par - a.par
    if (parDiff !== 0) return parDiff
    return a.hole_number - b.hole_number
  })

  let remaining = budget
  // Hard cap on passes — protects against pathological inputs (empty array,
  // absurdly large budgets) without a true `while (true)` loop.
  const maxPasses = 100
  let pass = 0
  while (remaining > 0 && pass < maxPasses) {
    for (const h of ordered) {
      if (remaining <= 0) break
      byHole.set(h.hole_number, (byHole.get(h.hole_number) ?? h.par) + 1)
      remaining--
    }
    pass++
  }

  return {
    byHole,
    totalPar,
    budget,
    budgetExceeded: remaining > 0,
    allocationSource: hasHandicap ? 'handicap' : hasYardage ? 'yardage' : remaining === 0 ? 'par' : 'hole_order',
  }
}

export interface PersonalParRow {
  hole_number: number
  par: number
  ppar: number
  delta: number
}

/**
 * Render-friendly helper: returns the per-hole result as a sorted array
 * of {hole, par, ppar, delta}, plus the allocationSource so the UI can
 * show "allocated by yardage" hints when handicap data is missing.
 */
export function describePersonalPars(
  targetScore: number,
  holes: HoleForPpar[],
): { rows: PersonalParRow[]; allocationSource: AllocationSource } {
  const result = computePersonalPars(targetScore, holes)
  const rows = [...holes]
    .sort((a, b) => a.hole_number - b.hole_number)
    .map(h => {
      const ppar = result.byHole.get(h.hole_number) ?? h.par
      return { hole_number: h.hole_number, par: h.par, ppar, delta: ppar - h.par }
    })
  return { rows, allocationSource: result.allocationSource }
}
