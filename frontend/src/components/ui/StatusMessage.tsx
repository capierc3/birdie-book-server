import { cn } from '../../utils/cn'
import styles from './StatusMessage.module.css'

interface StatusMessageProps {
  variant: 'success' | 'error' | 'progress'
  children: React.ReactNode
  className?: string
}

export function StatusMessage({ variant, children, className }: StatusMessageProps) {
  return (
    <div className={cn(styles.status, styles[variant], className)}>
      {children}
    </div>
  )
}
