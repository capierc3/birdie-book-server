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
}

export function CardHeader({ title, action }: CardHeaderProps) {
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {action}
    </div>
  )
}
