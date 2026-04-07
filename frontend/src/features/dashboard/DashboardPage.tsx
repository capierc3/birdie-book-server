import { StatCard } from '../../components'
import { useRounds, useCourses, useSGSummary, useScoring, useHandicap } from '../../api'
import { formatNum } from '../../utils/format'
import { ScoringBreakdown } from './ScoringBreakdown'
import { SGSummaryCard } from './SGSummaryCard'
import { ScoringSummaryCard } from './ScoringSummaryCard'
import { RecentRounds } from './RecentRounds'
import { YourCourses } from './YourCourses'
import styles from '../../styles/pages.module.css'

export function DashboardPage() {
  const { data: rounds = [] } = useRounds()
  const { data: courses = [] } = useCourses()
  const { data: sgData } = useSGSummary()
  const { data: scoringData } = useScoring()
  const { data: handicapData } = useHandicap()

  const rounds18 = rounds.filter(
    (r) => r.holes_completed != null && r.holes_completed >= 14
  )
  const rounds9 = rounds.filter(
    (r) =>
      r.holes_completed != null &&
      r.holes_completed >= 7 &&
      r.holes_completed < 14
  )

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageDesc}>Your golf performance at a glance</p>
      </div>

      <div className={styles.statsRow}>
        <StatCard label="Total Rounds" value={rounds.length} />
        <StatCard label="Courses Played" value={courses.length} />
        <StatCard
          label="Handicap"
          value={handicapData?.handicap_index != null ? formatNum(handicapData.handicap_index, 1) : '--'}
        />
      </div>

      <div className={styles.grid2}>
        <ScoringBreakdown title="18-Hole Rounds" rounds={rounds18} />
        <ScoringBreakdown title="9-Hole Rounds" rounds={rounds9} />
      </div>

      <div className={styles.grid2}>
        {sgData && <SGSummaryCard data={sgData} />}
        {scoringData && <ScoringSummaryCard data={scoringData} />}
      </div>

      <div className={styles.grid2}>
        <RecentRounds rounds={rounds} />
        <YourCourses courses={courses} rounds={rounds} />
      </div>
    </div>
  )
}
