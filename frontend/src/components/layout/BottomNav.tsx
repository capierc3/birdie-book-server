import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Flag,
  BarChart3,
  Briefcase,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useGps } from '../../contexts/GpsContext'
import styles from './BottomNav.module.css'

const tabs = [
  { to: '/', icon: LayoutDashboard, label: 'Home', end: true },
  { to: '/play', icon: Flag, label: 'Play', end: false },
  { to: '/scoring', icon: BarChart3, label: 'Stats', end: false },
  { to: '/clubs', icon: Briefcase, label: 'Bag', end: false },
]

// Routes where bottom nav should be hidden (full-screen views)
const hiddenRoutes = [/^\/courses\/\d+\/map/]

interface BottomNavProps {
  onMorePress: () => void
  moreOpen: boolean
}

export function BottomNav({ onMorePress, moreOpen }: BottomNavProps) {
  const location = useLocation()
  const gps = useGps()

  const hidden = hiddenRoutes.some((r) => r.test(location.pathname))
  if (hidden) return null

  return (
    <nav className={styles.nav}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(styles.tab, isActive && styles.active)
          }
          onClick={tab.to === '/play' ? () => gps.refresh() : undefined}
        >
          <tab.icon size={22} />
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
      <button
        className={cn(styles.tab, styles.moreBtn, moreOpen && styles.active)}
        onClick={onMorePress}
      >
        <MoreHorizontal size={22} />
        <span className={styles.label}>More</span>
      </button>
    </nav>
  )
}
