import { StatCard } from '../../components'
import type { SGSummary } from '../../api'
import { SG_CATEGORIES, SG_LABELS } from '../../utils/chartTheme'
import { formatSG, sgColor } from '../../utils/format'
import styles from '../../styles/pages.module.css'

interface Props {
  data: SGSummary
  baseline: 'pga' | 'personal'
}

export function SGCategoryCards({ data, baseline }: Props) {
  return (
    <div className={styles.statsRow}>
      {SG_CATEGORIES.map((cat) => {
        const d = data.overall[cat]
        if (!d) return null
        const val = baseline === 'pga' ? d.sg_pga_per_round : d.sg_personal_per_round
        return (
          <StatCard
            key={cat}
            label={SG_LABELS[cat]}
            value={formatSG(val)}
            valueColor={sgColor(val)}
            sub={`${d.shot_count} shots · ${d.round_count} rounds`}
          />
        )
      })}
    </div>
  )
}
