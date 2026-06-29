import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

interface KioskContextValue {
  kioskMode: boolean
  enterKiosk: () => void
  exitKiosk: () => void
}

const KioskContext = createContext<KioskContextValue>({ kioskMode: false, enterKiosk: () => {}, exitKiosk: () => {} })

const STORAGE_KEY = 'labhub_kiosk_mode'

export function KioskProvider({ children }: { children: ReactNode }) {
  const [kioskMode, setKioskMode] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')

  const enterKiosk = useCallback(() => {
    setKioskMode(true)
    localStorage.setItem(STORAGE_KEY, 'true')
    try { document.documentElement.requestFullscreen() } catch { /* browser may block */ }
  }, [])

  const exitKiosk = useCallback(() => {
    setKioskMode(false)
    localStorage.removeItem(STORAGE_KEY)
    try { if (document.fullscreenElement) document.exitFullscreen() } catch { /* ignore */ }
  }, [])

  /* exit on Escape keypress */
  useEffect(() => {
    if (!kioskMode) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') exitKiosk()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [kioskMode, exitKiosk])

  /* exit when fullscreen naturally exits */
  useEffect(() => {
    if (!kioskMode) return
    function onFSChange() {
      if (!document.fullscreenElement) exitKiosk()
    }
    document.addEventListener('fullscreenchange', onFSChange)
    return () => document.removeEventListener('fullscreenchange', onFSChange)
  }, [kioskMode, exitKiosk])

  return (
    <KioskContext.Provider value={{ kioskMode, enterKiosk, exitKiosk }}>
      {children}
    </KioskContext.Provider>
  )
}

export function useKioskMode() {
  return useContext(KioskContext)
}

export function KioskExitPill() {
  const { exitKiosk } = useKioskMode()
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleTap() {
    setShow(true)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setShow(false), 4000)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div className="fixed right-4 top-4 z-[100] flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
      {show ? (
        <button
          type="button"
          onClick={exitKiosk}
          className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur-md transition-all active:scale-95"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          Sair do modo quiosque
        </button>
      ) : (
        <button
          type="button"
          onClick={handleTap}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/20 text-white/60 opacity-50 transition-all hover:opacity-100"
          aria-label="Mostrar opções do modo quiosque"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6"/></svg>
        </button>
      )}
    </div>
  )
}
