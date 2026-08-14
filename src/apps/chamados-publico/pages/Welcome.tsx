import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { icons } from '../../../lib/icons'

export function Welcome() {
  const navigate = useNavigate()
  const [roomName, setRoomName] = useState('')

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!roomName.trim()) return
    navigate(`/chamados-publico/new?room=${encodeURIComponent(roomName.trim())}`)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-surface px-5 pt-14 pb-10">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
        <icons.nav.parts size={26} className="text-emerald-500" />
      </div>
      <h1 className="text-2xl font-bold text-fg">Abrir Chamado</h1>
      <p className="mt-2 max-w-xs text-center text-sm leading-relaxed text-fg-muted">
        Encontrou um problema com algum equipamento da escola? Registre aqui e a equipe de TI resolve para você.
      </p>

      <button
        type="button"
        onClick={() => navigate('/chamados-publico/scan')}
        className="mt-8 flex w-full max-w-sm items-center gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)] transition-all hover:bg-input"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
          <icons.ui.scanBarcode size={20} className="text-emerald-500" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-fg">Escanear QR Code da sala</p>
          <p className="text-xs text-fg-muted">Aponte a câmera para o QR fixado na sala</p>
        </div>
        <icons.ui.chevronRight size={18} className="ml-auto text-fg-dim" />
      </button>

      <div className="my-6 flex w-full max-w-sm items-center gap-3">
        <span className="flex-1 border-t border-line" />
        <span className="text-xs font-medium text-fg-muted">ou</span>
        <span className="flex-1 border-t border-line" />
      </div>

      <form onSubmit={handleManualSubmit} className="flex w-full max-w-sm gap-2">
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Digite o nome da sala"
          className="flex-1 rounded-xl bg-input px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={!roomName.trim()}
          className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continuar
        </button>
      </form>

      <button
        type="button"
        onClick={() => navigate('/chamados-publico/track')}
        className="mt-4 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:bg-input"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
          <icons.ui.circleCheck size={20} className="text-emerald-500" />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-fg">Acompanhar chamado</p>
          <p className="text-xs text-fg-muted">Veja o status e avalie o atendimento</p>
        </div>
        <icons.ui.chevronRight size={18} className="ml-auto text-fg-dim" />
      </button>

      <p className="mt-8 max-w-sm text-center text-[11px] leading-relaxed text-fg-dim">
        O QR Code da sala também pode ser impresso pelo painel de chamados do TI.
      </p>
    </div>
  )
}
