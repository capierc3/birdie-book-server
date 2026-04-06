import { useState, useEffect, useCallback } from 'react'
import { useOnlineStatus } from './useOnlineStatus'
import { getPendingCount, replayMutations } from '../lib/offlineQueue'

export function useOfflineSync() {
  const { isOnline } = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  const refreshCount = useCallback(async () => {
    const count = await getPendingCount()
    setPendingCount(count)
  }, [])

  // Replay mutations when coming back online
  useEffect(() => {
    if (!isOnline) return

    let cancelled = false

    async function sync() {
      const count = await getPendingCount()
      if (count === 0) return

      setIsSyncing(true)
      await replayMutations()

      if (!cancelled) {
        setIsSyncing(false)
        await refreshCount()
      }
    }

    sync()

    return () => {
      cancelled = true
    }
  }, [isOnline, refreshCount])

  // Poll pending count periodically when offline
  useEffect(() => {
    refreshCount()
    // Refresh when mutations might have been queued
    const interval = setInterval(refreshCount, 3000)
    return () => clearInterval(interval)
  }, [refreshCount])

  return { isOnline, pendingCount, isSyncing }
}
