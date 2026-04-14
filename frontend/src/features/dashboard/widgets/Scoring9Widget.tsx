import { useRounds } from '../../../api'
import { ScoringBreakdown } from '../ScoringBreakdown'

export function Scoring9Widget() {
  const { data: rounds = [] } = useRounds()
  const rounds9 = rounds.filter(
    (r) =>
      r.holes_completed != null &&
      r.holes_completed >= 7 &&
      r.holes_completed < 14,
  )
  return <ScoringBreakdown title="9-Hole Rounds" rounds={rounds9} />
}
