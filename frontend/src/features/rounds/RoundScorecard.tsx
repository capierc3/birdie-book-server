import type { RoundHole } from '../../api'
import styles from './RoundScorecard.module.css'

interface Props {
  holes: RoundHole[]
  parMap: Record<number, number>
  avgMap?: Record<number, number>
}

function scoreClass(strokes: number | null | undefined, par: number | undefined) {
  if (strokes == null || par == null) return ''
  const diff = strokes - par
  if (diff <= -2) return styles.eagle
  if (diff === -1) return styles.birdie
  if (diff === 1) return styles.bogey
  if (diff >= 2) return styles.double
  return ''
}

function HalfScorecard({ holes, parMap, avgMap, startHole, label }: {
  holes: RoundHole[]
  parMap: Record<number, number>
  avgMap?: Record<number, number>
  startHole: number
  label: string
}) {
  const nums = Array.from({ length: 9 }, (_, i) => startHole + i)
  const holeMap = new Map(holes.map((h) => [h.hole_number, h]))
  const hasPar = nums.some((n) => parMap[n] != null)

  const totalPar = nums.reduce((s, n) => s + (parMap[n] ?? 0), 0)
  const totalStrokes = nums.reduce((s, n) => s + (holeMap.get(n)?.strokes ?? 0), 0)
  const totalPutts = nums.reduce((s, n) => s + (holeMap.get(n)?.putts ?? 0), 0)

  // Check if any data exists for this half
  const hasData = nums.some((n) => holeMap.has(n))
  if (!hasData) return null

  return (
    <div className={styles.wrap}>
      <table className={styles.scorecard}>
        <thead>
          <tr>
            <th className={styles.rowLabel}>Hole</th>
            {nums.map((n) => (
              <th key={n} className={styles.holeNum}>{n}</th>
            ))}
            <th className={styles.totalCol}>{label}</th>
          </tr>
        </thead>
        <tbody>
          {hasPar && (
            <tr>
              <td className={styles.rowLabel}>Par</td>
              {nums.map((n) => (
                <td key={n}>{parMap[n] ?? ''}</td>
              ))}
              <td className={styles.totalCol}>{totalPar || ''}</td>
            </tr>
          )}
          <tr>
            <td className={styles.rowLabel}>{avgMap ? 'Best' : 'Score'}</td>
            {nums.map((n) => {
              const h = holeMap.get(n)
              return (
                <td key={n} className={scoreClass(h?.strokes, parMap[n])}>
                  {h?.strokes ?? ''}
                </td>
              )
            })}
            <td className={styles.totalCol}>{totalStrokes || ''}</td>
          </tr>
          {avgMap && (
            <tr>
              <td className={styles.rowLabel}>Avg</td>
              {nums.map((n) => {
                const avg = avgMap[n]
                return (
                  <td key={n} className={styles.dim}>
                    {avg != null ? avg.toFixed(1) : ''}
                  </td>
                )
              })}
              <td className={`${styles.totalCol} ${styles.dim}`}>
                {nums.some((n) => avgMap[n] != null)
                  ? nums.reduce((s, n) => s + (avgMap[n] ?? 0), 0).toFixed(1)
                  : ''}
              </td>
            </tr>
          )}
          {hasPar && (
            <tr>
              <td className={styles.rowLabel}>+/−</td>
              {nums.map((n) => {
                const h = holeMap.get(n)
                const par = parMap[n]
                if (!h?.strokes || !par) return <td key={n}></td>
                const diff = h.strokes - par
                return (
                  <td key={n} className={scoreClass(h.strokes, par)}>
                    {diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
                  </td>
                )
              })}
              <td className={styles.totalCol}>
                {totalStrokes && totalPar
                  ? totalStrokes - totalPar === 0
                    ? 'E'
                    : totalStrokes - totalPar > 0
                      ? `+${totalStrokes - totalPar}`
                      : totalStrokes - totalPar
                  : ''}
              </td>
            </tr>
          )}
          <tr>
            <td className={styles.rowLabel}>Putts</td>
            {nums.map((n) => (
              <td key={n}>{holeMap.get(n)?.putts ?? ''}</td>
            ))}
            <td className={styles.totalCol}>{totalPutts || ''}</td>
          </tr>
          <tr>
            <td className={styles.rowLabel}>FW</td>
            {nums.map((n) => {
              const fw = holeMap.get(n)?.fairway
              if (!fw) return <td key={n} className={styles.dim}>—</td>
              if (fw === 'HIT') return <td key={n} className={styles.fwHit}>✓</td>
              if (fw === 'LEFT') return <td key={n} className={styles.fwMiss}>←</td>
              if (fw === 'RIGHT') return <td key={n} className={styles.fwMiss}>→</td>
              return <td key={n}>{fw}</td>
            })}
            <td className={styles.totalCol}></td>
          </tr>
          <tr>
            <td className={styles.rowLabel}>GIR</td>
            {nums.map((n) => {
              const gir = holeMap.get(n)?.gir
              if (gir == null) return <td key={n} className={styles.dim}>—</td>
              return <td key={n} className={gir ? styles.girHit : styles.girMiss}>
                {gir ? '●' : '○'}
              </td>
            })}
            <td className={styles.totalCol}></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function RoundScorecard({ holes, parMap, avgMap }: Props) {
  return (
    <div>
      <HalfScorecard holes={holes} parMap={parMap} avgMap={avgMap} startHole={1} label="OUT" />
      <HalfScorecard holes={holes} parMap={parMap} avgMap={avgMap} startHole={10} label="IN" />
    </div>
  )
}
