import { NavLink } from 'react-router-dom'
import {
  TrendingUp,
  Trophy,
  Target,
  Map,
  Dumbbell,
  Upload,
  Settings,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import styles from './MoreMenu.module.css'

const moreItems = [
  { to: '/strokes-gained', icon: TrendingUp, label: 'Strokes Gained' },
  { to: '/handicap', icon: Trophy, label: 'Handicap' },
  { to: '/range', icon: Target, label: 'Range' },
  { to: '/courses', icon: Map, label: 'Courses' },
  { to: '/practice', icon: Dumbbell, label: 'Practice' },
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

interface MoreMenuProps {
  isOpen: boolean
  onClose: () => void
}

export function MoreMenu({ isOpen, onClose }: MoreMenuProps) {
  if (!isOpen) return null

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={cn(styles.menu, isOpen && styles.open)}>
        <div className={styles.handle} />
        <nav className={styles.nav}>
          {moreItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(styles.item, isActive && styles.active)
              }
              onClick={onClose}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  )
}
