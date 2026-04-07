import { useState } from 'react'
import { Select, EmptyState, Card, CardHeader } from '../../components'
import { useSGSummary, useSGTrends, useSGByClub } from '../../api'
import { SG_LABELS } from '../../utils/chartTheme'
import { SGCategoryCards } from './SGCategoryCards'
import { SGTrendChart } from './SGTrendChart'
import { SGByClubChart } from './SGByClubChart'
import { SGRoundTable } from './SGRoundTable'
import styles from '../../styles/pages.module.css'

export function StrokesGainedPage() {
  const [baseline, setBaseline] = useState<'pga' | 'personal'>('pga')
  const { data: sgData, isLoading: sgLoading } = useSGSummary()
  const { data: trendData } = useSGTrends()
  const { data: clubData } = useSGByClub()

  if (sgLoading) return <div className={styles.loading}>Loading...</div>
  if (!sgData) return <EmptyState message="No strokes gained data" description="Import rounds with shot data to see SG analysis." />

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Strokes Gained</h1>
        <p className={styles.pageDesc}>
          {sgData.biggest_opportunity_pga && (
            <>Biggest opportunity: <strong>{SG_LABELS[sgData.biggest_opportunity_pga] ?? sgData.biggest_opportunity_pga}</strong></>
          )}
        </p>
      </div>

      <div className={styles.filterBar}>
        <Select
          value={baseline}
          onChange={(e) => setBaseline(e.target.value as 'pga' | 'personal')}
          style={{ width: 'auto' }}
        >
          <option value="pga">vs PGA Tour</option>
          <option value="personal">vs Personal</option>
        </Select>
      </div>

      <SGCategoryCards data={sgData} baseline={baseline} />

      <div className={styles.section}>
        {trendData && <SGTrendChart data={trendData} baseline={baseline} />}
      </div>

      <div className={styles.section}>
        {clubData && <SGByClubChart data={clubData} baseline={baseline} />}
      </div>

      <div className={styles.section}>
        <Card>
          <CardHeader title="Per-Round Breakdown" />
          <SGRoundTable rounds={sgData.per_round} baseline={baseline} />
        </Card>
      </div>
    </div>
  )
}
