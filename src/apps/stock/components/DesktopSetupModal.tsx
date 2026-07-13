import { useState } from 'react'
import type { StockItemFormData } from '../types'
import { stockConditions } from '../types'
import { Modal } from '../../pcare/components/Modal'

interface DesktopSetupModalProps {
  open: boolean
  onClose: () => void
  onCreate: (items: StockItemFormData[]) => void
}

type SetupMode = 'full' | 'monitor' | 'mouse' | 'keyboard'

interface DesktopData {
  name: string
  serialNumber: string
  cpu: string
  ram: string
  storage: string
  osType: string
  osVersion: string
  osEdition: string
  osBuild: string
  room: string
  condition: string
  notes: string
  patrimonyAnhembi: string
  autologon: boolean
}

interface MonitorData {
  name: string
  serialNumber: string
  patrimonyAnhembi: string
  room: string
  condition: string
  notes: string
}

interface MouseData {
  name: string
  brand: string
  serialNumber: string
  assyPin: string
  sparesPin: string
  ct: string
  room: string
  condition: string
  notes: string
}

interface KeyboardData {
  name: string
  brand: string
  serialNumber: string
  hpPn: string
  spsPn: string
  ct: string
  room: string
  condition: string
  notes: string
}

export function DesktopSetupModal({ open, onClose, onCreate }: DesktopSetupModalProps) {
  const [mode, setMode] = useState<SetupMode | null>(null)
  const [step, setStep] = useState<'desktop' | 'monitor' | 'mouse' | 'keyboard' | 'confirm'>('desktop')
  const [desktop, setDesktop] = useState<DesktopData>({
    name: '',
    serialNumber: '',
    cpu: '',
    ram: '',
    storage: '',
    osType: 'windows10',
    osVersion: '22H2',
    osEdition: 'education',
    osBuild: '',
    room: '',
    condition: 'Bom',
    notes: '',
    patrimonyAnhembi: '',
    autologon: false,
  })
  const [monitor, setMonitor] = useState<MonitorData>({
    name: '',
    serialNumber: '',
    patrimonyAnhembi: '',
    room: '',
    condition: 'Bom',
    notes: '',
  })
  const [mouse, setMouse] = useState<MouseData>({
    name: '',
    brand: 'HP',
    serialNumber: '',
    assyPin: '',
    sparesPin: '',
    ct: '',
    room: '',
    condition: 'Bom',
    notes: '',
  })
  const [keyboard, setKeyboard] = useState<KeyboardData>({
    name: '',
    brand: 'HP',
    serialNumber: '',
    hpPn: '',
    spsPn: '',
    ct: '',
    room: '',
    condition: 'Bom',
    notes: '',
  })

  function updateDesktop(field: keyof DesktopData, value: string) {
    setDesktop(prev => ({ ...prev, [field]: value }))
  }

  function updateMonitor(field: keyof MonitorData, value: string) {
    setMonitor(prev => ({ ...prev, [field]: value }))
  }

  function updateMouse(field: keyof MouseData, value: string) {
    setMouse(prev => ({ ...prev, [field]: value }))
  }

  function updateKeyboard(field: keyof KeyboardData, value: string) {
    setKeyboard(prev => ({ ...prev, [field]: value }))
  }

  function getSteps(): ('desktop' | 'monitor' | 'mouse' | 'keyboard' | 'confirm')[] {
    if (mode === 'full') return ['desktop', 'monitor', 'mouse', 'keyboard', 'confirm']
    if (mode === 'monitor') return ['monitor', 'confirm']
    if (mode === 'mouse') return ['mouse', 'confirm']
    if (mode === 'keyboard') return ['keyboard', 'confirm']
    return ['desktop', 'monitor', 'mouse', 'keyboard', 'confirm']
  }

  const steps = getSteps()
  const stepIndex = steps.indexOf(step)

  function canProceed(): boolean {
    if (mode === 'full') {
      if (step === 'desktop') return !!desktop.name.trim()
      if (step === 'monitor') return !!monitor.name.trim()
      if (step === 'mouse') return !!mouse.name.trim()
      if (step === 'keyboard') return !!keyboard.name.trim()
    }
    if (mode === 'monitor') {
      if (step === 'monitor') return !!monitor.name.trim()
    }
    if (mode === 'mouse') {
      if (step === 'mouse') return !!mouse.name.trim()
    }
    if (mode === 'keyboard') {
      if (step === 'keyboard') return !!keyboard.name.trim()
    }
    return true
  }

  function goNext() {
    if (stepIndex < steps.length - 1 && canProceed()) {
      // Auto-preencher sala do desktop nos periféricos
      if (step === 'desktop' && mode === 'full') {
        if (!monitor.room) setMonitor(prev => ({ ...prev, room: desktop.room }))
        if (!mouse.room) setMouse(prev => ({ ...prev, room: desktop.room }))
        if (!keyboard.room) setKeyboard(prev => ({ ...prev, room: desktop.room }))
      }
      setStep(steps[stepIndex + 1])
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setStep(steps[stepIndex - 1])
    }
  }

  function handleSubmit() {
    const items: StockItemFormData[] = []

    // Desktop (apenas no modo completo)
    if (mode === 'full' && desktop.name.trim()) {
      items.push({
        name: desktop.name,
        section: 'maquinas',
        subcategory: 'Desktop',
        serialNumber: desktop.serialNumber,
        room: desktop.room,
        status: 'ativo',
        condition: desktop.condition,
        notes: `${desktop.cpu} | ${desktop.ram} | ${desktop.storage} | ${desktop.osType} ${desktop.osVersion} ${desktop.osEdition} Build ${desktop.osBuild} | Patrimônio AM: ${desktop.patrimonyAnhembi} | Autologon: ${desktop.autologon ? 'Sim' : 'Não'}${desktop.notes ? ` | ${desktop.notes}` : ''}`,
        cableType: '',
        cableLength: '',
        connectorType: '',
        outletCount: undefined,
        linkedPcId: undefined,
        linkedPcLabel: undefined,
      })
    }

    // Monitor
    if (monitor.name.trim()) {
      items.push({
        name: monitor.name,
        section: 'maquinas',
        subcategory: 'Monitor',
        serialNumber: monitor.serialNumber,
        room: monitor.room || desktop.room,
        status: 'ativo',
        condition: monitor.condition,
        notes: `Patrimônio AM: ${monitor.patrimonyAnhembi}${monitor.notes ? ` | ${monitor.notes}` : ''}`,
        cableType: '',
        cableLength: '',
        connectorType: '',
        outletCount: undefined,
        linkedPcId: undefined,
        linkedPcLabel: undefined,
      })
    }

    // Mouse
    if (mouse.name.trim()) {
      items.push({
        name: `${mouse.brand} ${mouse.name}`.trim(),
        section: 'perifericos',
        subcategory: 'Mouse',
        serialNumber: mouse.serialNumber,
        room: mouse.room || desktop.room,
        status: 'ativo',
        condition: mouse.condition,
        notes: `Marca: ${mouse.brand} | ASSY PIN: ${mouse.assyPin} | SPARES PIN: ${mouse.sparesPin} | CT: ${mouse.ct}${mouse.notes ? ` | ${mouse.notes}` : ''}`,
        cableType: '',
        cableLength: '',
        connectorType: '',
        outletCount: undefined,
        linkedPcId: undefined,
        linkedPcLabel: undefined,
      })
    }

    // Keyboard
    if (keyboard.name.trim()) {
      items.push({
        name: `${keyboard.brand} ${keyboard.name}`.trim(),
        section: 'perifericos',
        subcategory: 'Teclado',
        serialNumber: keyboard.serialNumber,
        room: keyboard.room || desktop.room,
        status: 'ativo',
        condition: keyboard.condition,
        notes: `Marca: ${keyboard.brand} | HP PN: ${keyboard.hpPn} | SPS PN: ${keyboard.spsPn} | CT: ${keyboard.ct}${keyboard.notes ? ` | ${keyboard.notes}` : ''}`,
        cableType: '',
        cableLength: '',
        connectorType: '',
        outletCount: undefined,
        linkedPcId: undefined,
        linkedPcLabel: undefined,
      })
    }

    if (items.length > 0) {
      onCreate(items)
    }
    handleClose()
  }

  function handleClose() {
    setMode(null)
    setStep('desktop')
    setDesktop({
      name: '',
      serialNumber: '',
      cpu: '',
      ram: '',
      storage: '',
      osType: 'windows10',
      osVersion: '22H2',
      osEdition: 'education',
      osBuild: '',
      room: '',
      condition: 'Bom',
      notes: '',
      patrimonyAnhembi: '',
      autologon: false,
    })
    setMonitor({
      name: '',
      serialNumber: '',
      patrimonyAnhembi: '',
      room: '',
      condition: 'Bom',
      notes: '',
    })
    setMouse({
      name: '',
      brand: 'HP',
      serialNumber: '',
      assyPin: '',
      sparesPin: '',
      ct: '',
      room: '',
      condition: 'Bom',
      notes: '',
    })
    setKeyboard({
      name: '',
      brand: 'HP',
      serialNumber: '',
      hpPn: '',
      spsPn: '',
      ct: '',
      room: '',
      condition: 'Bom',
      notes: '',
    })
    onClose()
  }

  function selectMode(selectedMode: SetupMode) {
    setMode(selectedMode)
    if (selectedMode === 'monitor') setStep('monitor')
    else if (selectedMode === 'mouse') setStep('mouse')
    else if (selectedMode === 'keyboard') setStep('keyboard')
    else setStep('desktop')
  }

  // Tela de seleção de modo
  if (!mode) {
    return (
      <Modal open={open} onClose={handleClose} title="Adicionar Desktop">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-fg-muted">Selecione o tipo de operação:</p>
          
          <button
            type="button"
            onClick={() => selectMode('full')}
            className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 p-4 text-left text-white transition-all hover:shadow-lg btn-interactive"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
              <span className="text-lg">🖥️</span>
            </div>
            <div>
              <p className="font-semibold">Desktop Completo</p>
              <p className="text-[11px] opacity-80">Adicionar Desktop + Monitor + Mouse + Teclado</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => selectMode('monitor')}
            className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 p-4 text-left text-white transition-all hover:shadow-lg btn-interactive"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
              <span className="text-lg">🖥️</span>
            </div>
            <div>
              <p className="font-semibold">Trocar Monitor</p>
              <p className="text-[11px] opacity-80">Substituir apenas o monitor</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => selectMode('mouse')}
            className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 p-4 text-left text-white transition-all hover:shadow-lg btn-interactive"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
              <span className="text-lg">🖱️</span>
            </div>
            <div>
              <p className="font-semibold">Trocar Mouse</p>
              <p className="text-[11px] opacity-80">Substituir apenas o mouse</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => selectMode('keyboard')}
            className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-left text-white transition-all hover:shadow-lg btn-interactive"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
              <span className="text-lg">⌨️</span>
            </div>
            <div>
              <p className="font-semibold">Trocar Teclado</p>
              <p className="text-[11px] opacity-80">Substituir apenas o teclado</p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="mt-2 rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
          >
            Cancelar
          </button>
        </div>
      </Modal>
    )
  }

  // Tela do formulário
  return (
    <Modal open={open} onClose={handleClose} title={
      mode === 'full' ? `Desktop Completo (${stepIndex + 1}/${steps.length})` :
      mode === 'monitor' ? 'Trocar Monitor' :
      mode === 'mouse' ? 'Trocar Mouse' :
      'Trocar Teclado'
    }>
      <div className="flex flex-col gap-4">
        {/* Progress bar (apenas no modo completo) */}
        {mode === 'full' && (
          <div className="flex gap-1">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? 'bg-emerald-500' : 'bg-input'
                }`}
              />
            ))}
          </div>
        )}

        {/* Step labels */}
        <div className="flex justify-between text-[10px] text-fg-muted">
          {mode === 'full' && (
            <>
              <span className={step === 'desktop' ? 'text-emerald-500 font-medium' : ''}>
                Desktop {desktop.name ? '✓' : '*'}
              </span>
              <span className={step === 'monitor' ? 'text-emerald-500 font-medium' : ''}>
                Monitor {monitor.name ? '✓' : '*'}
              </span>
              <span className={step === 'mouse' ? 'text-emerald-500 font-medium' : ''}>
                Mouse {mouse.name ? '✓' : '*'}
              </span>
              <span className={step === 'keyboard' ? 'text-emerald-500 font-medium' : ''}>
                Teclado {keyboard.name ? '✓' : '*'}
              </span>
              <span className={step === 'confirm' ? 'text-emerald-500 font-medium' : ''}>Confirmar</span>
            </>
          )}
          {mode === 'monitor' && (
            <>
              <span className={step === 'monitor' ? 'text-emerald-500 font-medium' : ''}>
                Monitor {monitor.name ? '✓' : '*'}
              </span>
              <span className={step === 'confirm' ? 'text-emerald-500 font-medium' : ''}>Confirmar</span>
            </>
          )}
          {mode === 'mouse' && (
            <>
              <span className={step === 'mouse' ? 'text-emerald-500 font-medium' : ''}>
                Mouse {mouse.name ? '✓' : '*'}
              </span>
              <span className={step === 'confirm' ? 'text-emerald-500 font-medium' : ''}>Confirmar</span>
            </>
          )}
          {mode === 'keyboard' && (
            <>
              <span className={step === 'keyboard' ? 'text-emerald-500 font-medium' : ''}>
                Teclado {keyboard.name ? '✓' : '*'}
              </span>
              <span className={step === 'confirm' ? 'text-emerald-500 font-medium' : ''}>Confirmar</span>
            </>
          )}
        </div>

        {/* Desktop step */}
        {step === 'desktop' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Informações do Desktop</p>
              <span className="text-[10px] text-amber-500 font-medium">* Obrigatório</span>
            </div>
            
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Nome *</label>
              <input
                type="text"
                value={desktop.name}
                onChange={(e) => updateDesktop('name', e.target.value)}
                placeholder="Ex: Desktop HP ProDesk 400 G7"
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nº Série / Patrimônio</label>
                <input
                  type="text"
                  value={desktop.serialNumber}
                  onChange={(e) => updateDesktop('serialNumber', e.target.value)}
                  placeholder="Ex: PAT-001"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Patrimônio Anhembi Morumbi</label>
                <input
                  type="text"
                  value={desktop.patrimonyAnhembi}
                  onChange={(e) => updateDesktop('patrimonyAnhembi', e.target.value)}
                  placeholder="Ex: 138469"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">CPU</label>
                <input
                  type="text"
                  value={desktop.cpu}
                  onChange={(e) => updateDesktop('cpu', e.target.value)}
                  placeholder="Ex: Intel Core i7-7700"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">RAM</label>
                <input
                  type="text"
                  value={desktop.ram}
                  onChange={(e) => updateDesktop('ram', e.target.value)}
                  placeholder="Ex: 8GB"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Armazenamento</label>
                <input
                  type="text"
                  value={desktop.storage}
                  onChange={(e) => updateDesktop('storage', e.target.value)}
                  placeholder="Ex: SSD 480GB"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sistema Operacional</label>
                <select
                  value={desktop.osType}
                  onChange={(e) => updateDesktop('osType', e.target.value)}
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="windows10">Windows 10</option>
                  <option value="windows11">Windows 11</option>
                  <option value="linux">Linux</option>
                  <option value="macos">macOS</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Versão</label>
                <input
                  type="text"
                  value={desktop.osVersion}
                  onChange={(e) => updateDesktop('osVersion', e.target.value)}
                  placeholder="Ex: 22H2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Edição</label>
                <select
                  value={desktop.osEdition}
                  onChange={(e) => updateDesktop('osEdition', e.target.value)}
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="enterprise">Enterprise</option>
                  <option value="education">Education</option>
                  <option value="pro_education">Pro Education</option>
                  <option value="pro">Pro</option>
                  <option value="home">Home</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Build</label>
              <input
                type="text"
                value={desktop.osBuild}
                onChange={(e) => updateDesktop('osBuild', e.target.value)}
                placeholder="Ex: 19045.6456"
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
                <input
                  type="text"
                  value={desktop.room}
                  onChange={(e) => updateDesktop('room', e.target.value)}
                  placeholder="Ex: Lab Info 2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Condição</label>
                <select
                  value={desktop.condition}
                  onChange={(e) => updateDesktop('condition', e.target.value)}
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                >
                  {stockConditions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Observações</label>
              <input
                type="text"
                value={desktop.notes}
                onChange={(e) => updateDesktop('notes', e.target.value)}
                placeholder="Informações adicionais..."
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/20 p-3">
              <input
                type="checkbox"
                id="autologon"
                checked={desktop.autologon}
                onChange={(e) => updateDesktop('autologon', e.target.checked)}
                className="h-4 w-4 rounded border-line text-cyan-600 focus:ring-cyan-500/30"
              />
              <label htmlFor="autologon" className="cursor-pointer">
                <p className="text-sm font-medium text-fg">Autologon configurado</p>
                <p className="text-[11px] text-fg-dim">Login automático habilitado neste desktop</p>
              </label>
            </div>
          </div>
        )}

        {/* Monitor step */}
        {step === 'monitor' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Informações do Monitor</p>
              <span className="text-[10px] text-amber-500 font-medium">* Obrigatório</span>
            </div>
            
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Nome *</label>
              <input
                type="text"
                value={monitor.name}
                onChange={(e) => updateMonitor('name', e.target.value)}
                placeholder="Ex: HP 19M37D-B V198bz G2"
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nº Série</label>
                <input
                  type="text"
                  value={monitor.serialNumber}
                  onChange={(e) => updateMonitor('serialNumber', e.target.value)}
                  placeholder="Ex: BRG7390CMT"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Patrimônio Anhembi Morumbi</label>
                <input
                  type="text"
                  value={monitor.patrimonyAnhembi}
                  onChange={(e) => updateMonitor('patrimonyAnhembi', e.target.value)}
                  placeholder="Ex: 138579"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
                <input
                  type="text"
                  value={monitor.room}
                  onChange={(e) => updateMonitor('room', e.target.value)}
                  placeholder="Ex: Lab Info 2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Condição</label>
                <select
                  value={monitor.condition}
                  onChange={(e) => updateMonitor('condition', e.target.value)}
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                >
                  {stockConditions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Observações</label>
              <input
                type="text"
                value={monitor.notes}
                onChange={(e) => updateMonitor('notes', e.target.value)}
                placeholder="Informações adicionais..."
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>
        )}

        {/* Mouse step */}
        {step === 'mouse' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Informações do Mouse</p>
              <span className="text-[10px] text-amber-500 font-medium">* Obrigatório</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Marca</label>
                <input
                  type="text"
                  value={mouse.brand}
                  onChange={(e) => updateMouse('brand', e.target.value)}
                  placeholder="Ex: HP"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nome *</label>
                <input
                  type="text"
                  value={mouse.name}
                  onChange={(e) => updateMouse('name', e.target.value)}
                  placeholder="Ex: Mouse USB"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nº Série</label>
                <input
                  type="text"
                  value={mouse.serialNumber}
                  onChange={(e) => updateMouse('serialNumber', e.target.value)}
                  placeholder="Ex: SN-123"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
                <input
                  type="text"
                  value={mouse.room}
                  onChange={(e) => updateMouse('room', e.target.value)}
                  placeholder="Ex: Lab Info 2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">ASSY PIN</label>
                <input
                  type="text"
                  value={mouse.assyPin}
                  onChange={(e) => updateMouse('assyPin', e.target.value)}
                  placeholder="Ex: 672654-001"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">SPARES PIN</label>
                <input
                  type="text"
                  value={mouse.sparesPin}
                  onChange={(e) => updateMouse('sparesPin', e.target.value)}
                  placeholder="Ex: 674318-001"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">CT</label>
                <input
                  type="text"
                  value={mouse.ct}
                  onChange={(e) => updateMouse('ct', e.target.value)}
                  placeholder="Ex: FCMHL0EW28076V"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Condição</label>
                <select
                  value={mouse.condition}
                  onChange={(e) => updateMouse('condition', e.target.value)}
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                >
                  {stockConditions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Observações</label>
                <input
                  type="text"
                  value={mouse.notes}
                  onChange={(e) => updateMouse('notes', e.target.value)}
                  placeholder="Ex: Mouse perfeito, sem defeitos"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>
          </div>
        )}

        {/* Keyboard step */}
        {step === 'keyboard' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Informações do Teclado</p>
              <span className="text-[10px] text-amber-500 font-medium">* Obrigatório</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Marca</label>
                <input
                  type="text"
                  value={keyboard.brand}
                  onChange={(e) => updateKeyboard('brand', e.target.value)}
                  placeholder="Ex: HP"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nome *</label>
                <input
                  type="text"
                  value={keyboard.name}
                  onChange={(e) => updateKeyboard('name', e.target.value)}
                  placeholder="Ex: Teclado USB"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nº Série</label>
                <input
                  type="text"
                  value={keyboard.serialNumber}
                  onChange={(e) => updateKeyboard('serialNumber', e.target.value)}
                  placeholder="Ex: SN-456"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
                <input
                  type="text"
                  value={keyboard.room}
                  onChange={(e) => updateKeyboard('room', e.target.value)}
                  placeholder="Ex: Lab Info 2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">HP PN</label>
                <input
                  type="text"
                  value={keyboard.hpPn}
                  onChange={(e) => updateKeyboard('hpPn', e.target.value)}
                  placeholder="Ex: 803181-201 BRZL"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">SPS PN</label>
                <input
                  type="text"
                  value={keyboard.spsPn}
                  onChange={(e) => updateKeyboard('spsPn', e.target.value)}
                  placeholder="Ex: 803823-001"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">CT</label>
                <input
                  type="text"
                  value={keyboard.ct}
                  onChange={(e) => updateKeyboard('ct', e.target.value)}
                  placeholder="Ex: BEXJQ0B5Y833QR"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Condição</label>
                <select
                  value={keyboard.condition}
                  onChange={(e) => updateKeyboard('condition', e.target.value)}
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                >
                  {stockConditions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Observações</label>
                <input
                  type="text"
                  value={keyboard.notes}
                  onChange={(e) => updateKeyboard('notes', e.target.value)}
                  placeholder="Ex: Somente com uma perninha, mas funcionando"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>
          </div>
        )}

        {/* Confirm step */}
        {step === 'confirm' && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Resumo dos Itens</p>
            
            {mode === 'full' && desktop.name && (
              <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/20 p-3">
                <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">Desktop</p>
                <p className="text-sm text-fg">{desktop.name}</p>
                <p className="text-[11px] text-fg-dim">
                  {desktop.cpu} | {desktop.ram} | {desktop.storage} | {desktop.osType} {desktop.osVersion} {desktop.osEdition} Build {desktop.osBuild}
                </p>
                {desktop.patrimonyAnhembi && (
                  <p className="text-[11px] text-fg-dim">Patrimônio AM: {desktop.patrimonyAnhembi}</p>
                )}
                <p className="text-[11px] text-fg-dim">
                  Autologon: {desktop.autologon ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Sim ✓</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">Não</span>
                  )}
                </p>
              </div>
            )}

            {monitor.name && (
              <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3">
                <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">Monitor</p>
                <p className="text-sm text-fg">{monitor.name}</p>
                {monitor.serialNumber && <p className="text-[11px] text-fg-dim">Série: {monitor.serialNumber}</p>}
                {monitor.patrimonyAnhembi && <p className="text-[11px] text-fg-dim">Patrimônio AM: {monitor.patrimonyAnhembi}</p>}
              </div>
            )}

            {mouse.name && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Mouse</p>
                <p className="text-sm text-fg">{mouse.brand} {mouse.name}</p>
                {(mouse.assyPin || mouse.sparesPin || mouse.ct) && (
                  <p className="text-[11px] text-fg-dim">
                    {mouse.assyPin && `ASSY PIN: ${mouse.assyPin}`}
                    {mouse.sparesPin && ` | SPARES PIN: ${mouse.sparesPin}`}
                    {mouse.ct && ` | CT: ${mouse.ct}`}
                  </p>
                )}
                {mouse.condition && <p className="text-[11px] text-fg-dim">Condição: {mouse.condition}</p>}
                {mouse.notes && <p className="text-[11px] text-fg-dim">Obs: {mouse.notes}</p>}
              </div>
            )}

            {keyboard.name && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Teclado</p>
                <p className="text-sm text-fg">{keyboard.brand} {keyboard.name}</p>
                {(keyboard.hpPn || keyboard.spsPn || keyboard.ct) && (
                  <p className="text-[11px] text-fg-dim">
                    {keyboard.hpPn && `HP PN: ${keyboard.hpPn}`}
                    {keyboard.spsPn && ` | SPS PN: ${keyboard.spsPn}`}
                    {keyboard.ct && ` | CT: ${keyboard.ct}`}
                  </p>
                )}
                {keyboard.condition && <p className="text-[11px] text-fg-dim">Condição: {keyboard.condition}</p>}
                {keyboard.notes && <p className="text-[11px] text-fg-dim">Obs: {keyboard.notes}</p>}
              </div>
            )}

            <p className="text-[11px] text-fg-muted">
              {[
                mode === 'full' && desktop.name && 'Desktop',
                monitor.name && 'Monitor',
                mouse.name && 'Mouse',
                keyboard.name && 'Teclado',
              ].filter(Boolean).length} item(s) serão criados
            </p>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-2 pt-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
            >
              Voltar
            </button>
          )}
          
          {stepIndex < steps.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed()}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive disabled:opacity-50"
            >
              {step === 'desktop' && !desktop.name.trim() ? 'Preencha o nome do Desktop' : 
               step === 'monitor' && !monitor.name.trim() ? 'Preencha o nome do Monitor' :
               step === 'mouse' && !mouse.name.trim() ? 'Preencha o nome do Mouse' :
               step === 'keyboard' && !keyboard.name.trim() ? 'Preencha o nome do Teclado' :
               'Próximo'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canProceed()}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 py-2.5 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50 btn-interactive"
            >
              {!canProceed()
                ? 'Preencha os campos obrigatórios'
                : `Criar ${[
                    mode === 'full' && desktop.name && 'Desktop',
                    monitor.name && 'Monitor',
                    mouse.name && 'Mouse',
                    keyboard.name && 'Teclado',
                  ].filter(Boolean).length} Itens`}
            </button>
          )}
          
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}