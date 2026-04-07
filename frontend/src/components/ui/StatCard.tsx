import { cn } from '../../utils/cn'
import styles from './StatCard.module.css'

interface StatCardProps {
  label: string
  value: string | number
  unit?: string
  sub?: string
  valueColor?: string
  className?: string
  onClick?: () => void
}

export function StatCard({ label, value, unit, sub, valueColor, className, onClick }: StatCardProps) {
  return (
    <div
      className={cn(styles.card, className)}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className={styles.label}>{label}</div>
      <div className={styles.value} style={valueColor ? { color: valueColor } : undefined}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  )
}
