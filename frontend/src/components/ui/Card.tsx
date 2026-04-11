import { cn } from '../../utils/cn'
import styles from './Card.module.css'

interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return <div className={cn(styles.card, className)}>{children}</div>
}

interface CardHeaderProps {
  title: string
  action?: React.ReactNode
  onTitleClick?: () => void
}

export function CardHeader({ title, action, onTitleClick }: CardHeaderProps) {
  return (
    <div className={styles.header}>
      {onTitleClick ? (
        <h2 className={cn(styles.title, styles.titleClickable)} onClick={onTitleClick}>{title}</h2>
      ) : (
        <h2 className={styles.title}>{title}</h2>
      )}
      {action}
    </div>
  )
}
