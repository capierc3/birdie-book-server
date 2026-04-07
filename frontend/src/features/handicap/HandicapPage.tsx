import { useNavigate } from 'react-router-dom'
import { StatCard, DataTable, Card, CardHeader, EmptyState } from '../../components'
import type { Column } from '../../components'
import { useHandicap } from '../../api'
import type { HandicapDifferential } from '../../api'
import { formatNum, formatDate } from '../../utils/format'
import { HandicapTrendChart } from './HandicapTrendChart'
import { HandicapProjections } from './HandicapProjections'
import styles from '../../styles/pages.module.css'

const USED_ROW_STYLE: React.CSSProperties = { background: 'rgba(34, 197, 94, 0.06)' }

export function HandicapPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useHandicap()

  if (isLoading) return <div className={styles.loading}>Loading...</div>
  if (!data) return <EmptyState message="No handicap data" description="Import rounds with course rating and slope to calculate your handicap." />

  const columns: Column<HandicapDifferential>[] = [
    { key: 'date', header: 'Date', sortable: true, render: (r) => formatDate(r.date) },
    {
      key: 'course_name', header: 'Course', sortable: true,
      render: (r) => r.is_combined ? `${r.course_name} (9+9)` : r.course_name,
    },
    { key: 'score', header: 'Score', align: 'center', sortable: true },
    { key: 'rating', header: 'Rating', align: 'center', render: (r) => formatNum(r.rating, 1) },
    { key: 'slope', header: 'Slope', align: 'center' },
    {
      key: 'differential', header: 'Diff', align: 'center', sortable: true,
      render: (r) => (
        <span style={{ fontWeight: 600 }}>
          {formatNum(r.differential, 1)}
        </span>
      ),
    },
    {
      key: 'used', header: 'Used', align: 'center',
      render: (r) => r.used ? <span style={{ color: '#22c55e', fontWeight: 700 }}>*</span> : null,
    },
  ]

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Handicap</h1>
      </div>

      <div className={styles.statsRow}>
        <StatCard
          label="Current Index"
          value={data.handicap_index != null ? formatNum(data.handicap_index, 1) : '--'}
        />
        <StatCard
          label="Low Index"
          value={data.low_index != null ? formatNum(data.low_index, 1) : '--'}
        />
        <StatCard label="Differentials Used" value={data.differentials_used} />
        <StatCard label="Rounds Available" value={data.differentials_available} />
      </div>

      <div className={styles.section}>
        <HandicapTrendChart data={data} />
      </div>

      <div className={styles.section}>
        <HandicapProjections data={data} />
      </div>

      <div className={styles.section}>
        <Card>
          <CardHeader title="Scoring Differentials" />
          <DataTable
            columns={columns}
            data={[...data.differentials].reverse()}
            keyExtractor={(r) => `${r.round_ids.join('-')}-${r.date}`}
            onRowClick={(r) => {
              if (r.round_ids.length === 1) navigate(`/rounds/${r.round_ids[0]}`)
            }}
            rowStyle={(r) => r.used ? USED_ROW_STYLE : undefined}
            emptyMessage="No differentials yet. Need at least 3 rounds."
          />
        </Card>
      </div>
    </div>
  )
}
