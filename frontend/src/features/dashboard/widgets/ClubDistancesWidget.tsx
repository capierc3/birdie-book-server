import { useClubs } from '../../../api'
import { ClubBoxPlot } from '../../clubs/ClubBoxPlot'

export function ClubDistancesWidget() {
  const { data: clubs = [] } = useClubs()
  if (clubs.length === 0) return null
  return <ClubBoxPlot clubs={clubs} dataSource="combined" compareWindow="" compareLabel="" />
}
