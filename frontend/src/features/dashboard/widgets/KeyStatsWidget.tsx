import { useScoring } from '../../../api'
import { ScoringSummaryCard } from '../ScoringSummaryCard'

export function KeyStatsWidget() {
  const { data: scoringData } = useScoring()
  if (!scoringData) return null
  return <ScoringSummaryCard data={scoringData} />
}
