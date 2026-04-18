import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Trophy,
  BarChart3,
  Briefcase,
  Target,
  ListOrdered,
  Map,
  Dumbbell,
  Upload,
  Settings,
  ExternalLink,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import styles from './Sidebar.module.css'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/strokes-gained', icon: TrendingUp, label: 'Strokes Gained' },
  { to: '/handicap', icon: Trophy, label: 'Handicap' },
  { to: '/scoring', icon: BarChart3, label: 'Stats' },
  { to: '/clubs', icon: Briefcase, label: 'My Bag' },
  { to: '/range', icon: Target, label: 'Range' },
  { to: '/rounds', icon: ListOrdered, label: 'Rounds' },
  { to: '/courses', icon: Map, label: 'Courses' },
  { to: '/practice', icon: Dumbbell, label: 'Practice' },
  { to: '/import', icon: Upload, label: 'Import' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <aside className={cn(styles.sidebar, isOpen && styles.open)}>
      <div className={styles.brand}>
        <img src="/logo-icon.png" alt="Birdie Book" className={styles.brandIcon} />
        <span className={styles.brandText}>Birdie Book</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(styles.navItem, isActive && styles.active)
            }
            onClick={onClose}
          >
            <item.icon className={styles.navIcon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className={styles.divider} />

        <a href="/" className={styles.navItem}>
          <ExternalLink className={styles.navIcon} size={20} />
          <span>Legacy App</span>
        </a>
      </nav>

      <div className={styles.footer}>
        <div className={styles.version}>v0.2.0</div>
      </div>
    </aside>
  )
}
