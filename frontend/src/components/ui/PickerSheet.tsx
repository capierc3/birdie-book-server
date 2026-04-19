import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'
import styles from './PickerSheet.module.css'

export interface PickerOption {
  value: string
  label: string
  detail?: string
}

interface PickerSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  options: PickerOption[]
  selectedValue: string | null
  onSelect: (value: string) => void
  footer?: React.ReactNode
}

export function PickerSheet({
  isOpen,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
  footer,
}: PickerSheetProps) {
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.list}>
          {options.map(opt => (
            <button
              key={opt.value}
              className={cn(styles.item, selectedValue === opt.value && styles.itemSelected)}
              onClick={() => { onSelect(opt.value); onClose() }}
            >
              <span className={styles.itemName}>{opt.label}</span>
              {opt.detail && <span className={styles.itemDist}>{opt.detail}</span>}
            </button>
          ))}
        </div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* Trigger button to open the picker */
interface PickerTriggerProps {
  value: string | null
  displayLabel?: string
  placeholder?: string
  onClick: () => void
}

export function PickerTrigger({ value, displayLabel, placeholder = 'Select...', onClick }: PickerTriggerProps) {
  return (
    <button type="button" className={styles.trigger} onClick={onClick}>
      {value ? (
        <span>{displayLabel || value}</span>
      ) : (
        <span className={styles.triggerPlaceholder}>{placeholder}</span>
      )}
      <ChevronDown size={16} className={styles.triggerChevron} />
    </button>
  )
}
