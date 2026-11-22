/**
 * Tela de ativação via pendrive autorizado — LabHub TV.
 *
 * Implementação única: usa exclusivamente os comandos Tauri já registrados.
 * Nenhuma credencial, token ou segredo é exibido ou registrado em log.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, Usb } from 'lucide-react'
import {
  activateWithUsb,
  findUsbWithKey,
  listUsbDrives,
  validateUsbAuth,
} from '../usbAuthApi'

export type UsbAuthReason = 'first-run' | 'invalid' | 'expired' | 'corrupt' | 'reactivation'

interface UsbAuthScreenProps {
  onComplete: () => void | Promise<void>
  /** Uso apenas para diagnóstico do host; a tela permanece interativa. */
  onError?: (message: string) => void
  reason?: UsbAuthReason
}

type Status = 'searching' | 'found' | 'validating' | 'activating' | 'success' | 'error'

const POLL_INTERVAL_MS = 5000

const REASON_TEXT: Record<UsbAuthReason, string> = {
  'first-run': 'Este computador ainda não foi ativado.',
  invalid: 'A autorização local é inválida e precisa ser renovada.',
  expired: 'A autorização deste dispositivo expirou.',
  corrupt: 'A configuração local estava inválida e precisa ser recriada.',
  reactivation: 'A reconfiguração foi solicitada. Ative novamente este dispositivo.',
}

export function UsbAuthScreen({ onComplete, onError, reason = 'first-run' }: UsbAuthScreenProps) {
  const [status, setStatus] = useState<Status>('searching')
  const [message, setMessage] = useState(REASON_TEXT[reason])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [foundDrive, setFoundDrive] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [finalizePending, setFinalizePending] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)
  const busyRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onCompleteRef.current = onComplete
    onErrorRef.current = onError
  }, [onComplete, onError])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const reportError = useCallback((text: string) => {
    setStatus('error')
    setMessage(text)
    setErrorMessage(text)
    // Apenas diagnóstico: o host não deve trocar a tela interativa.
    onErrorRef.current?.(text)
  }, [])

  const finalize = useCallback(async () => {
    try {
      await onCompleteRef.current()
      setStatus('success')
      setMessage('Ativação concluída. Abrindo o LabHub TV...')
      setFinalizePending(false)
    } catch {
      reportError('A ativação foi gravada, mas a configuração local falhou. Tente novamente.')
      setFinalizePending(true)
    }
  }, [reportError])

  const checkUsb = useCallback(async () => {
    if (completedRef.current || busyRef.current) return
    busyRef.current = true
    setIsChecking(true)
    setErrorMessage(null)
    setFoundDrive(null)
    setStatus('searching')
    setMessage('Procurando pendrive autorizado...')

    try {
      const drives = await listUsbDrives()
      if (drives.length === 0) {
        setMessage('Nenhum pendrive encontrado. Conecte o pendrive autorizado e verifique novamente.')
        return
      }

      const keyDrive = await findUsbWithKey()
      if (!keyDrive) {
        setMessage('Um pendrive foi detectado, mas não contém a credencial autorizada.')
        return
      }

      setFoundDrive(keyDrive)
      setStatus('validating')
      setMessage('Validando a credencial do hardware...')

      const validation = await validateUsbAuth(keyDrive)
      if (!validation.success) {
        reportError(validation.error || 'Credencial inválida. Use apenas o pendrive autorizado.')
        return
      }

      setStatus('activating')
      setMessage('Gravando a ativação neste dispositivo...')

      const activation = await activateWithUsb(keyDrive)
      if (!activation.success) {
        reportError(activation.error || 'Não foi possível ativar este dispositivo.')
        return
      }

      completedRef.current = true
      stopPolling()
      setStatus('success')
      setMessage('Ativação concluída. Abrindo o LabHub TV...')
      await finalize()
    } catch {
      reportError('Falha temporária ao consultar o pendrive. Verifique a conexão e tente novamente.')
    } finally {
      busyRef.current = false
      setIsChecking(false)
    }
  }, [finalize, reportError, stopPolling])

  useEffect(() => {
    void checkUsb()
    intervalRef.current = setInterval(() => void checkUsb(), POLL_INTERVAL_MS)
    return stopPolling
  }, [checkUsb, stopPolling])

  const busy = isChecking || status === 'validating' || status === 'activating'

  const handleVerify = () => {
    if (finalizePending) {
      setStatus('activating')
      setMessage('Retomando a configuração local...')
      setFinalizePending(false)
      void finalize()
      return
    }
    void checkUsb()
  }

  return (
    <div data-testid="usb-activation-screen" style={screenStyle}>
      <div style={glowTopStyle} aria-hidden="true" />
      <div style={glowBottomStyle} aria-hidden="true" />

      <header style={headerStyle}>
        <img src="/logo.png" alt="" style={logoStyle} />
        <div>
          <div style={brandStyle}>LabHub TV</div>
          <div style={signatureStyle}>by Vihisantos</div>
        </div>
      </header>

      <main style={mainStyle}>
        <section style={cardStyle}>
          <div style={iconStyle}>
            <Usb size={42} strokeWidth={1.6} color="#4CC3FF" aria-hidden="true" />
          </div>

          <p style={eyebrowStyle}>ATIVAÇÃO DE DISPOSITIVO</p>
          <h1 style={titleStyle}>Ative seu LabHub TV</h1>
          <p style={reasonStyle}>{REASON_TEXT[reason]}</p>
          <p style={instructionsStyle}>
            Conecte o pendrive autorizado e clique em Verificar pendrive. A validação é
            criptográfica e não exige login nem código alternativo.
          </p>

          <div data-testid="usb-status" style={statusStyle}>
            <StatusIcon status={status} />
            <span>{message}</span>
          </div>

          {foundDrive && (
            <div data-testid="usb-found-drive" style={driveStyle}>
              Pendrive autorizado detectado: {foundDrive}\
            </div>
          )}

          {errorMessage && (
            <div role="alert" style={errorStyle}>
              <AlertTriangle size={18} color="#FCA5A5" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleVerify}
            disabled={busy || status === 'success'}
            style={{
              ...buttonStyle,
              opacity: busy || status === 'success' ? 0.6 : 1,
              cursor: busy || status === 'success' ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Verificando...' : finalizePending ? 'Tentar novamente' : 'Verificar pendrive'}
          </button>
        </section>
      </main>

      <footer style={footerStyle}>LabHub TV · Ambiente institucional · by Vihisantos</footer>
    </div>
  )
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'success') return <CheckCircle2 size={20} color="#6EE7B7" aria-hidden="true" />
  if (status === 'error') return <AlertTriangle size={20} color="#FCA5A5" aria-hidden="true" />
  if (status === 'searching' || status === 'validating' || status === 'activating' || status === 'found') {
    return <LoaderCircle size={20} color="#4CC3FF" style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
  }
  return <Usb size={20} color="#94A3B8" aria-hidden="true" />
}

const screenStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 20,
  background: '#0B1220',
  color: '#F4F7FB',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const glowTopStyle: CSSProperties = {
  position: 'absolute',
  top: '-22%',
  right: '-12%',
  width: '55vw',
  height: '55vw',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(76,195,255,0.11) 0%, rgba(76,195,255,0) 68%)',
  pointerEvents: 'none',
}

const glowBottomStyle: CSSProperties = {
  position: 'absolute',
  bottom: '-30%',
  left: '-14%',
  width: '60vw',
  height: '60vw',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(30,64,175,0.16) 0%, rgba(30,64,175,0) 70%)',
  pointerEvents: 'none',
}

const headerStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: '0.85rem',
  padding: '1.4rem clamp(1.2rem, 4vw, 3rem)',
  borderBottom: '1px solid rgba(148,163,184,0.12)',
}

const logoStyle: CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 14,
  objectFit: 'cover',
  border: '1px solid rgba(76,195,255,0.35)',
}

const brandStyle: CSSProperties = { fontSize: '1.05rem', fontWeight: 750, letterSpacing: '-0.02em' }
const signatureStyle: CSSProperties = { marginTop: 2, fontSize: '0.72rem', color: '#7DD3FC', letterSpacing: '0.08em' }

const mainStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
}

const cardStyle: CSSProperties = {
  width: 'min(100%, 560px)',
  padding: 'clamp(1.5rem, 4vw, 2.75rem)',
  borderRadius: 24,
  background: 'linear-gradient(180deg, rgba(17,31,54,0.96) 0%, rgba(11,18,32,0.98) 100%)',
  border: '1px solid rgba(76,195,255,0.18)',
  boxShadow: '0 28px 80px rgba(0,0,0,0.45)',
  textAlign: 'center',
}

const iconStyle: CSSProperties = {
  width: 84,
  height: 84,
  margin: '0 auto 1.4rem',
  display: 'grid',
  placeItems: 'center',
  borderRadius: 22,
  background: 'rgba(76,195,255,0.08)',
  border: '1px solid rgba(76,195,255,0.22)',
}

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: '#4CC3FF',
  fontSize: '0.7rem',
  fontWeight: 800,
  letterSpacing: '0.2em',
}

const titleStyle: CSSProperties = {
  margin: '0.75rem 0 0.7rem',
  fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
  fontWeight: 780,
  letterSpacing: '-0.04em',
}

const reasonStyle: CSSProperties = { margin: 0, color: '#E2E8F0', fontSize: '1rem', lineHeight: 1.6 }
const instructionsStyle: CSSProperties = { margin: '0.7rem 0 1.5rem', color: '#94A3B8', fontSize: '0.88rem', lineHeight: 1.6 }

const statusStyle: CSSProperties = {
  minHeight: 52,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.7rem',
  padding: '0.7rem 1rem',
  borderRadius: 14,
  background: 'rgba(148,163,184,0.07)',
  border: '1px solid rgba(148,163,184,0.12)',
  color: '#CBD5E1',
  fontSize: '0.88rem',
  textAlign: 'left',
}

const driveStyle: CSSProperties = {
  marginTop: '0.8rem',
  padding: '0.55rem 0.9rem',
  borderRadius: 999,
  display: 'inline-block',
  background: 'rgba(76,195,255,0.09)',
  border: '1px solid rgba(76,195,255,0.2)',
  color: '#7DD3FC',
  fontSize: '0.8rem',
}

const errorStyle: CSSProperties = {
  marginTop: '0.9rem',
  padding: '0.7rem 0.9rem',
  borderRadius: 12,
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.6rem',
  textAlign: 'left',
  background: 'rgba(248,113,113,0.08)',
  border: '1px solid rgba(248,113,113,0.22)',
  color: '#FECACA',
  fontSize: '0.84rem',
  lineHeight: 1.5,
}

const buttonStyle: CSSProperties = {
  marginTop: '1.5rem',
  width: '100%',
  minHeight: 52,
  borderRadius: 14,
  border: 0,
  background: 'linear-gradient(90deg, #1E6FA8, #4CC3FF)',
  color: '#071426',
  fontSize: '0.95rem',
  fontWeight: 750,
  transition: 'filter 160ms ease',
}

const footerStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  padding: '1rem',
  textAlign: 'center',
  color: '#64748B',
  fontSize: '0.72rem',
  borderTop: '1px solid rgba(148,163,184,0.1)',
}

export default UsbAuthScreen
