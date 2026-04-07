import { Card, CardHeader } from '../../components'
import type { RoundHole } from '../../api'

interface Props {
  holes: RoundHole[]
  parMap: Record<number, number>
}

interface Highlight {
  icon: string
  text: string
  color?: string
}

export function RoundHighlights({ holes, parMap }: Props) {
  const highlights: Highlight[] = []

  const scored = holes.filter((h) => h.strokes && parMap[h.hole_number])

  if (scored.length === 0) return null

  // Best and worst holes
  let bestDiff = Infinity, worstDiff = -Infinity
  let bestHole = 0, worstHole = 0
  for (const h of scored) {
    const diff = h.strokes! - parMap[h.hole_number]
    if (diff < bestDiff) { bestDiff = diff; bestHole = h.hole_number }
    if (diff > worstDiff) { worstDiff = diff; worstHole = h.hole_number }
  }
  if (bestDiff < 0) {
    highlights.push({
      icon: '🏆',
      text: `Best hole: #${bestHole} (${bestDiff > 0 ? '+' : ''}${bestDiff})`,
      color: 'var(--birdie)',
    })
  }
  if (worstDiff > 1) {
    highlights.push({
      icon: '⚠',
      text: `Toughest: #${worstHole} (+${worstDiff})`,
      color: 'var(--bogey)',
    })
  }

  // Birdies or better
  const birdies = scored.filter((h) => h.strokes! - parMap[h.hole_number] <= -1)
  if (birdies.length > 0) {
    highlights.push({
      icon: '🐦',
      text: `${birdies.length} birdie${birdies.length > 1 ? 's' : ''} or better`,
      color: 'var(--birdie)',
    })
  }

  // Putting
  const onePutts = holes.filter((h) => h.putts === 1).length
  const threePutts = holes.filter((h) => h.putts != null && h.putts >= 3).length
  if (onePutts > 0) {
    highlights.push({ icon: '🎯', text: `${onePutts} one-putt${onePutts > 1 ? 's' : ''}` })
  }
  if (threePutts > 0) {
    highlights.push({
      icon: '😬',
      text: `${threePutts} three-putt${threePutts > 1 ? 's' : ''}`,
      color: 'var(--danger)',
    })
  }

  // Fairway accuracy
  const fwHoles = holes.filter((h) => h.fairway != null)
  if (fwHoles.length >= 6) {
    const hits = fwHoles.filter((h) => h.fairway === 'HIT').length
    const pct = Math.round((hits / fwHoles.length) * 100)
    highlights.push({ icon: '🎯', text: `Fairways: ${hits}/${fwHoles.length} (${pct}%)` })
  }

  if (highlights.length === 0) return null

  return (
    <Card>
      <CardHeader title="Round Highlights" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {highlights.map((h, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: '0.88rem',
              color: h.color ?? 'var(--text)',
            }}
          >
            <span>{h.icon}</span>
            <span>{h.text}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
