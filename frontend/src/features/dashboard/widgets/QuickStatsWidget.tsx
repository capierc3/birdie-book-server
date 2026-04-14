import { StatCard } from '../../../components'
import { useRounds, useCourses, useHandicap } from '../../../api'
import { formatNum } from '../../../utils/format'
import styles from '../../../styles/pages.module.css'

export function QuickStatsWidget() {
  const { data: rounds = [] } = useRounds()
  const { data: courses = [] } = useCourses()
  const { data: handicapData } = useHandicap()

  return (
    <div className={styles.statsRow}>
      <StatCard label="Total Rounds" value={rounds.length} />
      <StatCard label="Courses Played" value={courses.length} />
      <StatCard
        label="Handicap"
        value={handicapData?.handicap_index != null ? formatNum(handicapData.handicap_index, 1) : '--'}
      />
    </div>
  )
}
