import { cn } from '../../utils/cn'
import styles from './ProgressBar.module.css'

interface ProgressBarProps {
  value: number
  className?: string
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={cn(styles.wrap, className)}>
      <div className={styles.fill} style={{ width: `${clamped}%` }} />
    </div>
  )
}
