import { useState } from 'react'
import { BottomSheet, SheetHeader } from '../../../platform/ui/BottomSheet'
import { icons } from '../../../lib/icons'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

const WIFI_STEPS = [
  {
    title: 'Conecte-se ao Wi-Fi',
    text: 'Abra as configurações do celular, toque em Wi-Fi e selecione a rede da escola.',
  },
  {
    title: 'Aguarde o portal abrir',
    text: 'Ao conectar, o navegador abre a página de login da rede automaticamente.',
  },
  {
    title: 'Escolha seu perfil',
    text: 'Selecione Colaborador/Professor, Aluno ou Visitante.',
  },
  {
    title: 'Faça login',
    text: 'Entre com seu usuário e senha institucional e aceite os termos, se pedir.',
  },
  {
    title: 'Volte ao app',
    text: 'Pronto! A conexão volta sozinha — continue abrindo o chamado.',
  },
]

export function OfflineBanner() {
  const { online } = useOnlineStatus()
  const [manualOpen, setManualOpen] = useState(false)

  if (online) return null

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-red-500/30 bg-red-500/15 px-4 py-2.5">
        <icons.ui.wifiOff size={16} className="shrink-0 text-red-500" />
        <p className="min-w-0 flex-1 text-xs leading-snug text-red-700 dark:text-red-300">
          Sem conexão com a internet — conecte-se ao Wi-Fi da escola para enviar o chamado.
        </p>
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-500/25 dark:text-red-300"
        >
          <icons.ui.wifi size={14} />
          Como conectar
        </button>
      </div>

      <BottomSheet open={manualOpen} onClose={() => setManualOpen(false)}>
        <SheetHeader title="Conectar ao Wi-Fi" subtitle="Rede com login (portal)" onClose={() => setManualOpen(false)} />
        <div className="overflow-y-auto px-5 pb-8">
          <ol className="space-y-4">
            {WIFI_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-fg">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <icons.ui.alertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              Sem internet o chamado não é enviado. Conecte-se ao Wi-Fi e tente abrir novamente.
            </p>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
