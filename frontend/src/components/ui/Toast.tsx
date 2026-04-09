import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import styles from './Toast.module.css'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
  exiting?: boolean
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 250)
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, message, type }])
      if (type !== 'error') {
        setTimeout(() => dismiss(id), 5000)
      }
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className={styles.container}>
        {toasts.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div
              key={t.id}
              className={cn(styles.toast, styles[t.type], t.exiting && styles.exiting)}
            >
              <Icon className={styles.icon} />
              <span className={styles.message}>{t.message}</span>
              <button className={styles.close} onClick={() => dismiss(t.id)}>
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
