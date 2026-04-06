import { cn } from '../../utils/cn'
import styles from './Badge.module.css'

interface BadgeProps {
  variant?: 'blue' | 'green' | 'yellow' | 'muted'
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'muted', children, className }: BadgeProps) {
  return (
    <span className={cn(styles.badge, styles[variant], className)}>
      {children}
    </span>
  )
}
