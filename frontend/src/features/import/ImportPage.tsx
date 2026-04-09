import { useState } from 'react'
import { cn } from '../../utils/cn'
import { GarminJsonImport } from './GarminJsonImport'
import { FitFileImport } from './FitFileImport'
import { TrackmanImport } from './TrackmanImport'
import { RapsodoImport } from './RapsodoImport'
import styles from './ImportPage.module.css'

type Tab = 'garmin' | 'fit' | 'trackman' | 'rapsodo'

const TABS: { id: Tab; label: string; sub: string; recommended?: boolean }[] = [
  { id: 'garmin', label: 'Garmin Export', sub: 'JSON \u00b7 Bulk', recommended: true },
  { id: 'fit', label: 'FIT File', sub: '.fit \u00b7 Single Round' },
  { id: 'trackman', label: 'Trackman', sub: 'URL \u00b7 Range' },
  { id: 'rapsodo', label: 'Rapsodo', sub: 'CSV \u00b7 Range' },
]

const TAB_COMPONENTS: Record<Tab, React.FC> = {
  garmin: GarminJsonImport,
  fit: FitFileImport,
  trackman: TrackmanImport,
  rapsodo: RapsodoImport,
}

export function ImportPage() {
  const [activeTab, setActiveTab] = useState<Tab>('garmin')
  const ActiveComponent = TAB_COMPONENTS[activeTab]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Import Data</h1>
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={cn(styles.tab, activeTab === tab.id && styles.active)}
            onClick={() => setActiveTab(tab.id)}
          >
            <div className={styles.tabLabel}>
              {tab.label}
              {tab.recommended && <span className={styles.recommended} />}
            </div>
            <div className={styles.tabSub}>{tab.sub}</div>
          </button>
        ))}
      </div>

      <div className={styles.content}>
        <ActiveComponent />
      </div>
    </div>
  )
}
