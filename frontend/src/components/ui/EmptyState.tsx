import { cn } from '../../utils/cn'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon?: React.ReactNode
  message: string
  description?: string
  className?: string
}

export function EmptyState({ icon, message, description, className }: EmptyStateProps) {
  return (
    <div className={cn(styles.empty, className)}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={styles.message}>{message}</div>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  )
}
