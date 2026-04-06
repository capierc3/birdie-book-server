import styles from './FormControls.module.css'

interface FormGroupProps {
  label: string
  htmlFor?: string
  children: React.ReactNode
}

export function FormGroup({ label, htmlFor, children }: FormGroupProps) {
  return (
    <div className={styles.group}>
      <label className={styles.label} htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  )
}
