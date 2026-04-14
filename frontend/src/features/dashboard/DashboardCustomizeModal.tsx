import { Modal, Button } from '../../components'
import { WIDGET_REGISTRY, type WidgetCategory } from './widgetRegistry'
import styles from './DashboardCustomizeModal.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  visibleIds: string[]
  onToggle: (id: string) => void
  onReset: () => void
}

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  course: 'Course',
  range: 'Range',
  equipment: 'Equipment',
}

const CATEGORY_ORDER: WidgetCategory[] = ['course', 'range', 'equipment']

export function DashboardCustomizeModal({ isOpen, onClose, visibleIds, onToggle, onReset }: Props) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    widgets: WIDGET_REGISTRY.filter((w) => w.category === cat),
  })).filter((g) => g.widgets.length > 0)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customize Dashboard"
      subtitle="Choose which widgets to display"
      footer={
        <div className={styles.footerRow}>
          <Button variant="ghost" onClick={onReset}>
            Reset to Defaults
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      {grouped.map((g) => (
        <div key={g.category} className={styles.categorySection}>
          <div className={styles.categoryTitle}>{g.label}</div>
          {g.widgets.map((w) => {
            const isOn = visibleIds.includes(w.id)
            return (
              <div key={w.id} className={styles.widgetRow}>
                <div className={styles.widgetInfo}>
                  <div className={styles.widgetTitle}>{w.title}</div>
                  <div className={styles.widgetDesc}>{w.description}</div>
                </div>
                <button
                  className={styles.toggle}
                  data-on={String(isOn)}
                  onClick={() => onToggle(w.id)}
                  aria-label={`Toggle ${w.title}`}
                >
                  <div className={styles.toggleKnob} />
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </Modal>
  )
}
