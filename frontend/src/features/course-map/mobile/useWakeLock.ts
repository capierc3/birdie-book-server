import { useEffect } from 'react'

interface WakeLockSentinel {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> }
}

/**
 * Holds a Screen Wake Lock while `enabled` is true. The browser auto-releases
 * the lock when the tab is hidden, so we re-acquire on `visibilitychange` when
 * the document becomes visible again. No-ops on unsupported browsers.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const nav = navigator as Navigator & WakeLockNavigator
    if (!nav.wakeLock) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      try {
        const s = await nav.wakeLock!.request('screen')
        if (cancelled) { s.release().catch(() => {}); return }
        sentinel = s
      } catch {
        // Permission denied or transient failure — try again on next visibility flip.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
        acquire()
      }
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel && !sentinel.released) sentinel.release().catch(() => {})
      sentinel = null
    }
  }, [enabled])
}
