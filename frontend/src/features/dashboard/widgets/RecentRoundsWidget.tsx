import { useRounds } from '../../../api'
import { RecentRounds } from '../RecentRounds'

export function RecentRoundsWidget() {
  const { data: rounds = [] } = useRounds()
  return <RecentRounds rounds={rounds} />
}
