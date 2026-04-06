import { forwardRef } from 'react'
import { cn } from '../../utils/cn'
import styles from './FormControls.module.css'

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(styles.input, className)}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
