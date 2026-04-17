import styles from './MobileHeader.module.css'

export function MobileHeader() {
  return (
    <header className={styles.header}>
      <img src="/app/logo-icon.png" alt="Birdie Book" width={22} height={22} className={styles.brandIcon} />
      <span className={styles.brand}>Birdie Book</span>
    </header>
  )
}
