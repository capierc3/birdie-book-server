import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileHeader } from './MobileHeader'
import { OfflineIndicator } from '../ui/OfflineIndicator'
import { cn } from '../../utils/cn'
import styles from './AppLayout.module.css'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <MobileHeader onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
      <div
        className={cn(styles.overlay, sidebarOpen && styles.open)}
        onClick={() => setSidebarOpen(false)}
      />
      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
      <OfflineIndicator />
    </>
  )
}
