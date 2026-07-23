import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'
import { useRooms } from '../../chamados/hooks/useRooms'
import { icons } from '../../../lib/icons'

export function QRScan() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const cancelledRef = useRef(false)
  const [manualCode, setManualCode] = useState('')
  const [feedback, setFeedback] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { rooms } = useRooms()

  const navigateToRoom = useCallback((roomId: string) => {
    const room = rooms.find((r) => r.id === roomId)
    if (room) {
      setFeedback('success')
      controlsRef.current?.stop?.()
      setTimeout(() => navigate(`/chamados-publico/room/${room.id}`), 300)
    } else {
      setFeedback('error')
    }
  }, [rooms, navigate])

  useEffect(() => {
    const roomParam = searchParams.get('room')
    if (roomParam && rooms.length > 0) {
      navigateToRoom(roomParam)
    }
  }, [searchParams, rooms, navigateToRoom])

  function stopStream() {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((t) => t.stop())
      videoRef.current.srcObject = null
    }
  }

  const startCamera = useCallback(() => {
    if (!videoRef.current || cancelledRef.current) return
    stopStream()
    setFeedback('scanning')
    cancelledRef.current = false

    const reader = new BrowserQRCodeReader()
    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (cancelledRef.current) return
        if (result) {
          const text = result.getText() || ''
          if (text.startsWith('room:')) {
            navigateToRoom(text.replace('room:', ''))
          } else {
            navigateToRoom(text)
          }
        }
      })
      .then((ctrl) => {
        controlsRef.current = ctrl
      })
      .catch(() => {
        if (!cancelledRef.current) setFeedback('idle')
      })
  }, [navigateToRoom])

  useEffect(() => {
    cancelledRef.current = false
    startCamera()
    return () => {
      cancelledRef.current = true
      controlsRef.current?.stop?.()
      stopStream()
    }
  }, [startCamera])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim()) return
    navigateToRoom(manualCode.trim())
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-surface px-5 pt-8 pb-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-fg">Abrir Chamado</h1>
        <p className="mt-1 text-sm text-fg-muted">Escaneie o QR Code da sala</p>
      </div>

      <div className="relative mb-6 w-full max-w-sm overflow-hidden rounded-2xl bg-black shadow-lg">
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full object-cover"
          playsInline
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={`relative h-48 w-48 rounded-xl border-2 transition-all ${
            feedback === 'success' ? 'border-emerald-400' : feedback === 'error' ? 'border-red-400' : 'border-white/40'
          }`}>
            <div className="absolute left-0 top-0 h-6 w-6 rounded-tl-xl border-l-2 border-t-2 border-amber-400" />
            <div className="absolute right-0 top-0 h-6 w-6 rounded-tr-xl border-r-2 border-t-2 border-amber-400" />
            <div className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-xl border-b-2 border-l-2 border-amber-400" />
            <div className="absolute bottom-0 right-0 h-6 w-6 rounded-br-xl border-b-2 border-r-2 border-amber-400" />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-4">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium text-white backdrop-blur-sm transition-opacity ${
            feedback === 'scanning' ? 'bg-white/20 opacity-100' : 'opacity-0'
          }`}>
            Escaneando...
          </span>
        </div>

        {feedback === 'error' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-block rounded-full bg-red-500/80 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
              Sala não encontrada
            </span>
          </div>
        )}

        {feedback === 'success' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/80 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
              <icons.ui.check size={16} />
              Redirecionando...
            </div>
          </div>
        )}

        {feedback === 'idle' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-block rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
              Câmera desativada
            </span>
          </div>
        )}
      </div>

      {feedback === 'idle' && (
        <button
          type="button"
          onClick={startCamera}
          className="mb-6 flex items-center gap-2 rounded-xl bg-card px-5 py-3 text-sm font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-input"
        >
          <icons.ui.scanBarcode size={18} />
          Ativar Câmera
        </button>
      )}

      <div className="mb-4 flex w-full max-w-sm items-center gap-3">
        <span className="flex-1 border-t border-line" />
        <span className="text-xs font-medium text-fg-muted">ou digite o código da sala</span>
        <span className="flex-1 border-t border-line" />
      </div>

      <form onSubmit={handleManualSubmit} className="flex w-full max-w-sm gap-2">
        <input
          type="text"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Ex: Sala 101"
          className="flex-1 rounded-xl bg-input px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          type="submit"
          className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
        >
          Buscar
        </button>
      </form>

      {feedback === 'error' && (
        <p className="mt-3 text-xs text-red-400">Nenhuma sala encontrada com esse código</p>
      )}

      <div className="mt-6 w-full max-w-sm rounded-xl bg-card/50 p-3 text-center text-[11px] text-fg-dim leading-relaxed">
        Escaneie o QR Code da sala para ver os equipamentos disponíveis e abrir um chamado.
      </div>
    </div>
  )
}
