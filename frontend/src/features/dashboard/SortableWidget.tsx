import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { WidgetDefinition } from './widgetRegistry'
import styles from './SortableWidget.module.css'

interface Props {
  widget: WidgetDefinition
}

export function SortableWidget({ widget }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isFullWidth = widget.size === 'stat-row' || widget.size === 'full'
  const Comp = widget.component

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.wrapper} ${isFullWidth ? styles.wrapperFull : ''} ${isDragging ? styles.dragging : ''}`}
    >
      <button
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${widget.title}`}
      >
        <GripVertical size={16} />
      </button>
      <Comp />
    </div>
  )
}
