import { useState } from 'react'
import { Settings } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { WIDGET_REGISTRY } from './widgetRegistry'
import { useDashboardPrefs } from './useDashboardPrefs'
import { DashboardCustomizeModal } from './DashboardCustomizeModal'
import { SortableWidget } from './SortableWidget'
import styles from '../../styles/pages.module.css'

export function DashboardPage() {
  const { prefs, toggleWidget, reorderWidgets, resetToDefaults } = useDashboardPrefs()
  const [showCustomize, setShowCustomize] = useState(false)

  // Build a lookup for fast access
  const widgetMap = new Map(WIDGET_REGISTRY.map((w) => [w.id, w]))

  // Visible widgets in user-defined order
  const visibleOrdered = prefs.widgetOrder
    .filter((id) => prefs.visibleWidgets.includes(id))
    .map((id) => widgetMap.get(id)!)
    .filter(Boolean)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = prefs.widgetOrder.indexOf(active.id as string)
    const newIndex = prefs.widgetOrder.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    reorderWidgets(arrayMove(prefs.widgetOrder, oldIndex, newIndex))
  }

  return (
    <div>
      <div className={styles.pageHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageDesc}>Your golf performance at a glance</p>
        </div>
        <button
          onClick={() => setShowCustomize(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 8,
            color: 'var(--text-muted)',
            borderRadius: 'var(--radius-sm)',
            transition: 'color var(--transition)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          title="Customize dashboard"
        >
          <Settings size={18} />
        </button>
      </div>

      {visibleOrdered.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleOrdered.map((w) => w.id)}
            strategy={rectSortingStrategy}
          >
            <div className={styles.dashboardGrid}>
              {visibleOrdered.map((w) => (
                <SortableWidget key={w.id} widget={w} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <p>No widgets selected.</p>
          <p style={{ fontSize: '0.88rem', marginTop: 8 }}>
            Click the <Settings size={14} style={{ verticalAlign: 'middle' }} /> icon above to customize your dashboard.
          </p>
        </div>
      )}

      <DashboardCustomizeModal
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        visibleIds={prefs.visibleWidgets}
        onToggle={toggleWidget}
        onReset={resetToDefaults}
      />
    </div>
  )
}
