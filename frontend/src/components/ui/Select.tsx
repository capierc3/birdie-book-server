import { forwardRef } from 'react'
import { cn } from '../../utils/cn'
import styles from './FormControls.module.css'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(styles.select, className)}
        {...props}
      >
        {children}
      </select>
    )
  }
)

Select.displayName = 'Select'
