import { WifiOff, RefreshCw } from 'lucide-react'
import { useOfflineSync } from '../../hooks/useOfflineMutation'
import { cn } from '../../utils/cn'
import styles from './OfflineIndicator.module.css'

export function OfflineIndicator() {
  const { isOnline, pendingCount, isSyncing } = useOfflineSync()

  const showBar = !isOnline || isSyncing
  const barClass = isSyncing ? styles.syncing : styles.offline

  return (
    <div className={cn(styles.bar, barClass, !showBar && styles.hidden)}>
      {isSyncing ? (
        <>
          <RefreshCw className={cn(styles.icon, styles.spinning)} size={16} />
          <span>Syncing changes...</span>
        </>
      ) : (
        <>
          <WifiOff className={styles.icon} size={16} />
          <span>
            Offline
            {pendingCount > 0 && ` \u2014 ${pendingCount} change${pendingCount !== 1 ? 's' : ''} pending`}
          </span>
        </>
      )}
    </div>
  )
}
