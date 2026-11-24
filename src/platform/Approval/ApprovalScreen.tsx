import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Layers3, LockKeyhole, LogOut, ShieldCheck, Sparkles, XCircle } from 'lucide-react'

export interface ApprovalWaitingPageProps {
  status?: 'loading' | 'waiting' | 'approved' | 'rejected' | 'blocked'
  secondsLeft?: number
  totalSeconds?: number
  onEnter?: () => void
  onRetry?: () => void
  onSignOut?: () => void
  email?: string
  requiresLogin?: boolean
}

const steps = ['Conta criada', 'Análise de acesso', 'Acesso liberado'] as const
const trust = [
  { icon: LockKeyhole, label: 'Conta protegida' },
  { icon: ShieldCheck, label: 'Seus dados são privados' },
  { icon: Layers3, label: 'Acesso por workspace' },
]

/** Shared, presentational approval screen. No timers, network calls or auth decisions. */
export function ApprovalScreen({
  status = 'waiting', secondsLeft = 60, totalSeconds = 60,
  onEnter, onRetry, onSignOut, email, requiresLogin = false,
}: ApprovalWaitingPageProps) {
  const approved = status === 'approved'
  const blocked = status === 'blocked'
  const rejected = status === 'rejected' || blocked
  const loading = status === 'loading'
  const waiting = status === 'waiting'
  const mascotState = approved ? 'celebration' : rejected ? 'error' : loading ? 'loading' : 'waiting'
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(100, (totalSeconds - secondsLeft) / totalSeconds * 100)) : 0
  const primary = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500'
  const secondary = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-5 py-3 text-sm font-semibold text-fg transition-colors hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500'

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface px-4 py-6 sm:px-8 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-36 -top-48 h-[440px] w-[440px] rounded-full bg-gradient-to-br from-blue-600/35 via-blue-400/20 to-cyan-400/5 blur-3xl" />
        <div className="absolute -bottom-48 -right-36 h-[520px] w-[520px] rounded-full bg-gradient-to-tl from-indigo-500/35 via-cyan-400/20 to-blue-500/5 blur-3xl" />
        <div className="absolute -left-48 -top-64 hidden h-[620px] w-[620px] rotate-[-20deg] rounded-[42%] border border-blue-400/25 bg-gradient-to-br from-blue-600/20 to-cyan-400/5 sm:block" />
        <div className="absolute -bottom-72 -right-36 hidden h-[630px] w-[630px] rotate-[-28deg] rounded-[42%] border border-cyan-400/30 bg-gradient-to-tl from-blue-500/20 to-cyan-300/5 sm:block" />
        <div className="absolute left-[8%] top-[30%] hidden h-12 w-12 rotate-12 rounded-xl border border-blue-300/40 bg-blue-400/5 sm:block" />
        <div className="absolute right-[8%] top-[23%] hidden h-24 w-24 opacity-30 sm:block" style={{ backgroundImage: 'radial-gradient(#60a5fa 1.5px, transparent 1.5px)', backgroundSize: '16px 16px' }} />
      </div>

      <header className="mb-5 flex items-center gap-2.5 sm:mb-7">
        <img src="/logo-192.png" alt="" width={36} height={36} className="rounded-xl" />
        <span className="text-2xl font-extrabold tracking-tight text-fg">Lab<span className="text-blue-600 dark:text-blue-400">Hub</span></span>
      </header>

      <section aria-labelledby="approval-title" className="w-full max-w-[780px] rounded-[28px] border border-line bg-card/95 px-5 pb-6 pt-3 text-center shadow-[0_24px_80px_-30px_rgba(37,99,235,0.30)] backdrop-blur-sm sm:rounded-[36px] sm:px-10 sm:pb-8 sm:pt-4">
        <div className="relative mx-auto flex h-[220px] w-full max-w-[410px] items-end justify-center overflow-hidden sm:h-[270px]" aria-hidden="true">
          <div className="absolute bottom-3 left-1/2 h-[175px] w-[175px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-300 shadow-xl shadow-blue-500/20 sm:h-[220px] sm:w-[220px]" />
          <div className="absolute bottom-9 left-1/2 h-[62px] w-[82%] -translate-x-1/2 rotate-[-10deg] rounded-[50%] border border-cyan-300/70 bg-cyan-400/10 blur-[0.3px]" />
          <div className="absolute left-[7%] top-[27%] grid h-12 w-12 -rotate-12 place-items-center rounded-2xl border border-blue-200/60 bg-blue-600 text-white shadow-lg shadow-blue-500/25 sm:h-16 sm:w-16">
            <ShieldCheck className="h-7 w-7 sm:h-9 sm:w-9" />
          </div>
          <div className="absolute right-[5%] top-[38%] flex w-20 rotate-12 flex-col gap-2 rounded-xl border border-line bg-card p-2.5 shadow-lg sm:w-28 sm:p-3">
            <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 shrink-0 text-blue-500" /><span className="h-1.5 flex-1 rounded bg-blue-400/45" /></div>
            <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-blue-400/25" /><span className="h-1.5 flex-1 rounded bg-blue-400/20" /></div>
            <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-blue-400/25" /><span className="h-1.5 flex-1 rounded bg-blue-400/20" /></div>
          </div>
          <Sparkles className="absolute left-[18%] top-[8%] h-6 w-6 text-cyan-500" />
          <Sparkles className="absolute right-[17%] top-[12%] h-5 w-5 text-blue-400" />
          <img src="/approval/labhub-character.svg" alt="" data-mascot-state={mascotState} width={1360} height={1741} className="relative z-10 h-full w-auto max-w-[70%] object-contain object-bottom drop-shadow-xl" />
          <div className="absolute bottom-0 left-1/2 z-20 h-3 w-[66%] -translate-x-1/2 rounded-[50%] bg-blue-500/10 blur-md" />
        </div>

        <div aria-live="polite" aria-atomic="true" className="mx-auto mt-3 max-w-[560px]">
          <h1 id="approval-title" className="text-[clamp(1.65rem,5vw,2.65rem)] font-extrabold leading-tight tracking-tight text-fg">
            {waiting ? 'Aprovação Pendente' : approved ? 'Conta Aprovada!' : blocked ? 'Conta Bloqueada' : rejected ? 'Conta Negada' : 'Verificando acesso'}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-fg-muted sm:text-base">
            {waiting ? (requiresLogin ? 'Sua conta foi criada com sucesso. Após a liberação de um administrador, volte ao login para entrar com sua senha.' : 'Sua conta foi criada com sucesso e aguarda a liberação de um administrador. Assim que for aprovada, você poderá entrar no LabHub.') : approved ? 'Bem-vindo ao LabHub! Estamos preparando seu ambiente.' : blocked ? 'Seu acesso está bloqueado. Entre em contato com o administrador.' : rejected ? 'A solicitação de acesso não foi aprovada. Entre em contato com o administrador para saber mais.' : 'Só um instante, estamos preparando sua página de acesso.'}
          </p>
          {waiting && email && <p className="mt-2 break-all text-xs text-fg-muted">Email: <span className="font-medium text-fg">{email}</span></p>}

          <div role="status" className={`mx-auto mt-5 inline-flex items-center justify-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-semibold ${approved ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : rejected ? 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400' : 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300'}`}>
            {approved ? <CheckCircle2 size={19} /> : rejected ? <XCircle size={19} /> : <span className="relative flex h-5 w-5 items-center justify-center"><span className="absolute inset-0 rounded-full border-2 border-current opacity-30 motion-safe:animate-ping" /><span className="h-2.5 w-2.5 rounded-full bg-current" /></span>}
            {waiting ? 'Aguardando aprovação' : approved ? 'Acesso liberado' : rejected ? 'Acesso não liberado' : 'Verificando autenticação...'}
          </div>
        </div>

        {waiting && (
          <>
            <ol aria-label="Etapas de aprovação" className="mx-auto mt-5 grid max-w-[470px] grid-cols-3 gap-1 text-[11px] sm:text-xs">
              {steps.map((step, i) => (
                <li key={step} aria-current={i === 1 ? 'step' : undefined} className="relative flex min-w-0 flex-col items-center gap-2">
                  {i > 0 && <span aria-hidden="true" className="absolute right-1/2 top-[14px] z-0 h-px w-full bg-line" />}
                  <span className={`relative z-10 grid h-7 w-7 place-items-center rounded-full border ${i === 0 ? 'border-emerald-500/30 bg-emerald-600 text-white' : i === 1 ? 'border-blue-500 bg-blue-600 text-white' : 'border-line bg-card text-fg-muted'}`}>{i === 0 ? <Check size={15} /> : i === 1 ? <Clock3 size={15} /> : <LockKeyhole size={13} />}</span>
                  <span className={i === 1 ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-fg-muted'}>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-2xl border border-line bg-blue-500/[0.04] px-3 py-3">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-fg-muted">Sua conta é protegida</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:divide-x sm:divide-line">
                {trust.map(({icon: Icon, label}) => <div key={label} className="flex items-center justify-center gap-2 px-1 text-xs font-medium text-fg"><Icon size={19} className="shrink-0 text-blue-600 dark:text-blue-400" /><span>{label}</span></div>)}
              </div>
            </div>
          </>
        )}

        {approved && (
          <div className="mx-auto mt-6 max-w-md text-left">
            <div className="mb-2 flex justify-between text-xs text-fg-muted"><span>Preparando seu ambiente...</span><span className="font-mono text-emerald-600">{secondsLeft}s</span></div>
            <div role="progressbar" aria-label="Preparando seu ambiente" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-2 overflow-hidden rounded-full bg-emerald-500/15"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 motion-safe:transition-all" style={{width: progress + '%'}} /></div>
          </div>
        )}

        {((waiting && (onRetry || onSignOut)) || (approved && onEnter) || (rejected && (onRetry || onSignOut))) && (
          <div className={`mx-auto mt-6 grid max-w-[560px] grid-cols-1 gap-3 ${waiting && onRetry && onSignOut ? 'sm:grid-cols-2' : ''}`}>
            {waiting && onRetry && <button type="button" className={primary} onClick={onRetry}><ArrowLeft size={18} />Voltar para Login</button>}
            {(waiting || rejected) && onSignOut && <button type="button" className={secondary} onClick={onSignOut}><LogOut size={18} />Sair da conta</button>}
            {approved && onEnter && <button type="button" className={primary} onClick={onEnter}>Entrar no LabHub<ArrowRight size={18} /></button>}
            {rejected && onRetry && <button type="button" className={secondary} onClick={onRetry}><ArrowLeft size={18} />Tentar novamente</button>}
          </div>
        )}
      </section>
      <footer className="mt-5 text-center text-[11px] text-fg-muted">LabHub · Conta segura e privada</footer>
    </main>
  )
}
