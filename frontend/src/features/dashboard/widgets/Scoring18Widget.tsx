import { useRounds } from '../../../api'
import { ScoringBreakdown } from '../ScoringBreakdown'

export function Scoring18Widget() {
  const { data: rounds = [] } = useRounds()
  const rounds18 = rounds.filter(
    (r) => r.holes_completed != null && r.holes_completed >= 14,
  )
  return <ScoringBreakdown title="18-Hole Rounds" rounds={rounds18} />
}
