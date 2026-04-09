import { CircleDot } from 'lucide-react'
import styles from './MobileHeader.module.css'

export function MobileHeader() {
  return (
    <header className={styles.header}>
      <CircleDot size={22} className={styles.brandIcon} />
      <span className={styles.brand}>Birdie Book</span>
    </header>
  )
}
