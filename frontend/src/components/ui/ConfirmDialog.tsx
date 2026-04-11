import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { Modal, Button } from '../../components'

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  alert: (message: string, title?: string) => Promise<void>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions
    isAlert: boolean
  } | null>(null)

  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({ options, isAlert: false })
    })
  }, [])

  const alert = useCallback((message: string, title?: string): Promise<void> => {
    return new Promise((resolve) => {
      resolveRef.current = () => resolve()
      setState({ options: { message, title: title ?? 'Notice' }, isAlert: true })
    })
  }, [])

  const handleClose = useCallback((result: boolean) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setState(null)
  }, [])

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {state && (
        <Modal
          isOpen
          onClose={() => handleClose(false)}
          title={state.options.title ?? 'Confirm'}
          maxWidth={420}
          footer={
            state.isAlert ? (
              <Button onClick={() => handleClose(true)}>OK</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => handleClose(false)}>
                  {state.options.cancelLabel ?? 'Cancel'}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleClose(true)}
                >
                  {state.options.confirmLabel ?? 'OK'}
                </Button>
              </>
            )
          }
        >
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
            {state.options.message}
          </p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
