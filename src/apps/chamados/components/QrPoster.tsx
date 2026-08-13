import { icons } from '../../../lib/icons'

const STEPS = [
  { n: '1', title: 'Escaneie o QR Code', desc: 'Aponte a câmera do celular' },
  { n: '2', title: 'Escolha o campus e a sala', desc: 'Identifique onde você está' },
  { n: '3', title: 'Descreva o problema', desc: 'Quanto mais detalhes, mais rápido o TI resolve' },
]

export function QrPoster({ qrDataUrl, url }: { qrDataUrl: string; url: string }) {
  return (
    <div
      className="qr-poster flex w-full flex-col overflow-hidden bg-white text-slate-900"
      style={{ aspectRatio: '210 / 297' }}
    >
      <div className="bg-gradient-to-r from-emerald-500 to-green-600 px-6 pt-5 pb-4 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <icons.ui.qrCode size={16} className="text-white" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-100">
            Chamados · TI
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight">Abrir Chamado</h1>
        <p className="mt-0.5 text-sm font-medium text-emerald-100">
          Problema com um equipamento da escola?
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8">
        <div className="w-[46%] min-w-[96px] max-w-[230px] rounded-2xl border-4 border-slate-900 bg-white p-3 shadow-sm">
          <img src={qrDataUrl} alt="QR Code de chamados" className="block h-auto w-full" />
        </div>
        <p className="text-center text-sm font-semibold text-slate-700">
          Aponte a câmera do celular para o QR Code
        </p>
      </div>

      <div className="space-y-2 px-8">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-sm font-bold text-white">
              {step.n}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-slate-800">{step.title}</p>
              <p className="text-[11px] leading-tight text-slate-500">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-slate-200 px-6 py-3.5">
        <p className="break-all text-center text-[11px] font-medium text-slate-500">{url}</p>
        <p className="mt-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-emerald-600">
          Chamados · Equipe de TI
        </p>
      </div>
    </div>
  )
}
