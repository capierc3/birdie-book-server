import { Menu } from 'lucide-react'
import styles from './MobileHeader.module.css'

interface MobileHeaderProps {
  onMenuToggle: () => void
}

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  return (
    <header className={styles.header}>
      <button className={styles.menuBtn} onClick={onMenuToggle}>
        <Menu size={24} />
      </button>
      <span className={styles.brand}>Birdie Book</span>
    </header>
  )
}
