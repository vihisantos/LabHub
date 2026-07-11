import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'error'
  message: string
  action?: { label: string; onClick: () => void }
  duration: number
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (type: Toast['type'], message: string, opts?: { action?: Toast['action']; duration?: number }) => string
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue>({ toasts: [], addToast: () => '', removeToast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const addToast = useCallback(
    (type: Toast['type'], message: string, opts?: { action?: Toast['action']; duration?: number }) => {
      const id = crypto.randomUUID()
      const duration = opts?.duration ?? (type === 'error' ? 0 : 3000)
      const toast: Toast = { id, type, message, action: opts?.action, duration }

      setToasts((prev) => [...prev, toast])

      if (duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration)
        timersRef.current.set(id, timer)
      }

      return id
    },
    [removeToast],
  )

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useToast() {
  return useContext(ToastContext)
}
