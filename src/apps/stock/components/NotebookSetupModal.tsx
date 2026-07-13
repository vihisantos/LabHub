import { useState } from 'react'
import type { StockItemFormData } from '../types'
import { stockConditions } from '../types'
import { Modal } from '../../pcare/components/Modal'

interface NotebookSetupModalProps {
  open: boolean
  onClose: () => void
  onCreate: (items: StockItemFormData[]) => void
}

type SetupMode = 'full' | 'monitor' | 'mouse' | 'keyboard'

interface NotebookData {
  name: string
  brand: string
  model: string
  serialNumber: string
  cpu: string
  ram: string
  storage: string
  osType: string
  osVersion: string
  osEdition: string
  osBuild: string
  room: string
  bay: string
  lockedInBay: boolean
  padlockPassword: string
  hasMouse: boolean
  mouseMissing: boolean
  batteryStatus: string
  visualDamage: string
  condition: string
  notes: string
  patrimonyAnhembi: string
  autologon: boolean
}

interface ChargerData {
  name: string
  brand: string
  serialNumber: string
  power: string
  room: string
  condition: string
  notes: string
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

export function NotebookSetupModal({ open, onClose, onCreate }: NotebookSetupModalProps) {
  const [mode, setMode] = useState<SetupMode | null>(null)
  const [step, setStep] = useState<'notebook' | 'charger' | 'monitor' | 'mouse' | 'keyboard' | 'confirm'>('notebook')
  const [notebook, setNotebook] = useState<NotebookData>({
    name: '',
    brand: 'HP',
    model: '',
    serialNumber: '',
    cpu: '',
    ram: '',
    storage: '',
    osType: 'windows10',
    osVersion: '22H2',
    osEdition: 'pro_education',
    osBuild: '',
    room: '',
    bay: '',
    lockedInBay: false,
    padlockPassword: '',
    hasMouse: true,
    mouseMissing: false,
    batteryStatus: 'ok',
    visualDamage: '',
    condition: 'Bom',
    notes: '',
    patrimonyAnhembi: '',
    autologon: false,
  })
  const [charger, setCharger] = useState<ChargerData>({
    name: '',
    brand: 'HP',
    serialNumber: '',
    power: '',
    room: '',
    condition: 'Bom',
    notes: '',
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

  function updateNotebook(field: keyof NotebookData, value: string | boolean) {
    setNotebook(prev => ({ ...prev, [field]: value }))
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

  function updateCharger(field: keyof ChargerData, value: string) {
    setCharger(prev => ({ ...prev, [field]: value }))
  }

  function getSteps(): ('notebook' | 'charger' | 'monitor' | 'mouse' | 'keyboard' | 'confirm')[] {
    if (mode === 'full') return ['notebook', 'charger', 'monitor', 'mouse', 'keyboard', 'confirm']
    if (mode === 'monitor') return ['monitor', 'confirm']
    if (mode === 'mouse') return ['mouse', 'confirm']
    if (mode === 'keyboard') return ['keyboard', 'confirm']
    return ['notebook', 'charger', 'monitor', 'mouse', 'keyboard', 'confirm']
  }

  const steps = getSteps()
  const stepIndex = steps.indexOf(step)

  function canProceed(): boolean {
    if (mode === 'full') {
      if (step === 'notebook') return !!notebook.name.trim()
      if (step === 'charger') return !!charger.name.trim()
      if (step === 'monitor') return true // Monitor é opcional para notebook
      if (step === 'mouse') return true // Mouse é opcional para notebook
      if (step === 'keyboard') return true // Teclado é opcional para notebook
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
      // Auto-preencher sala do notebook nos periféricos
      if (step === 'notebook' && mode === 'full') {
        if (!monitor.room) setMonitor(prev => ({ ...prev, room: notebook.room }))
        if (!mouse.room) setMouse(prev => ({ ...prev, room: notebook.room }))
        if (!keyboard.room) setKeyboard(prev => ({ ...prev, room: notebook.room }))
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

    // Notebook
    if (mode === 'full' && notebook.name.trim()) {
      const mouseStatus = notebook.hasMouse ? (notebook.mouseMissing ? 'Faltando' : 'Presente') : 'Sem mouse'
      items.push({
        name: `${notebook.brand} ${notebook.model}`.trim() || notebook.name,
        section: 'maquinas',
        subcategory: 'Notebook',
        serialNumber: notebook.serialNumber,
        room: notebook.room,
        status: 'ativo',
        condition: notebook.condition,
        notes: `${notebook.brand} ${notebook.model} | ${notebook.cpu} | ${notebook.ram} | ${notebook.storage} | ${notebook.osType} ${notebook.osVersion} ${notebook.osEdition} Build ${notebook.osBuild} | Patrimônio AM: ${notebook.patrimonyAnhembi} | Baia: ${notebook.bay} | Trancado: ${notebook.lockedInBay ? 'Sim' : 'Não'}${notebook.padlockPassword ? ` | Senha Cadeado: ${notebook.padlockPassword}` : ''} | Mouse: ${mouseStatus} | Bateria: ${notebook.batteryStatus} | Autologon: ${notebook.autologon ? 'Sim' : 'Não'}${notebook.visualDamage ? ` | Avarias: ${notebook.visualDamage}` : ''}${notebook.notes ? ` | ${notebook.notes}` : ''}`,
        cableType: '',
        cableLength: '',
        connectorType: '',
        outletCount: undefined,
        linkedPcId: undefined,
        linkedPcLabel: undefined,
      })
    }

    // Carregador
    if (mode === 'full' && charger.name.trim()) {
      items.push({
        name: `${charger.brand} ${charger.name}`.trim(),
        section: 'equipamentos',
        subcategory: 'Carregador',
        serialNumber: charger.serialNumber,
        room: charger.room || notebook.room,
        status: 'ativo',
        condition: charger.condition,
        notes: `Marca: ${charger.brand} | Potência: ${charger.power}${charger.notes ? ` | ${charger.notes}` : ''}`,
        cableType: '',
        cableLength: '',
        connectorType: '',
        outletCount: undefined,
        linkedPcId: undefined,
        linkedPcLabel: undefined,
      })
    }

    // Monitor (opcional para notebook)
    if (monitor.name.trim()) {
      items.push({
        name: monitor.name,
        section: 'maquinas',
        subcategory: 'Monitor',
        serialNumber: monitor.serialNumber,
        room: monitor.room || notebook.room,
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

    // Mouse (opcional para notebook)
    if (mouse.name.trim()) {
      items.push({
        name: `${mouse.brand} ${mouse.name}`.trim(),
        section: 'perifericos',
        subcategory: 'Mouse',
        serialNumber: mouse.serialNumber,
        room: mouse.room || notebook.room,
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

    // Keyboard (opcional para notebook)
    if (keyboard.name.trim()) {
      items.push({
        name: `${keyboard.brand} ${keyboard.name}`.trim(),
        section: 'perifericos',
        subcategory: 'Teclado',
        serialNumber: keyboard.serialNumber,
        room: keyboard.room || notebook.room,
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
    setStep('notebook')
    setNotebook({
      name: '',
      brand: 'HP',
      model: '',
      serialNumber: '',
      cpu: '',
      ram: '',
      storage: '',
      osType: 'windows10',
      osVersion: '22H2',
      osEdition: 'pro_education',
      osBuild: '',
      room: '',
      bay: '',
      lockedInBay: false,
      padlockPassword: '',
      hasMouse: true,
      mouseMissing: false,
      batteryStatus: 'ok',
      visualDamage: '',
      condition: 'Bom',
      notes: '',
      patrimonyAnhembi: '',
      autologon: false,
    })
    setCharger({
      name: '',
      brand: 'HP',
      serialNumber: '',
      power: '',
      room: '',
      condition: 'Bom',
      notes: '',
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
    else setStep('notebook')
  }

  // Tela de seleção de modo
  if (!mode) {
    return (
      <Modal open={open} onClose={handleClose} title="Adicionar Notebook">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-fg-muted">Selecione o tipo de operação:</p>
          
          <button
            type="button"
            onClick={() => selectMode('full')}
            className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 p-4 text-left text-white transition-all hover:shadow-lg btn-interactive"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
              <span className="text-lg">💻</span>
            </div>
            <div>
              <p className="font-semibold">Notebook Completo</p>
              <p className="text-[11px] opacity-80">Adicionar Notebook + Monitor + Mouse + Teclado</p>
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
      mode === 'full' ? `Notebook Completo (${stepIndex + 1}/${steps.length})` :
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
              <span className={step === 'notebook' ? 'text-emerald-500 font-medium' : ''}>
                Notebook {notebook.name ? '✓' : '*'}
              </span>
              <span className={step === 'charger' ? 'text-emerald-500 font-medium' : ''}>
                Carregador {charger.name ? '✓' : '*'}
              </span>
              <span className={step === 'monitor' ? 'text-emerald-500 font-medium' : ''}>
                Monitor {monitor.name ? '✓' : ''}
              </span>
              <span className={step === 'mouse' ? 'text-emerald-500 font-medium' : ''}>
                Mouse {mouse.name ? '✓' : ''}
              </span>
              <span className={step === 'keyboard' ? 'text-emerald-500 font-medium' : ''}>
                Teclado {keyboard.name ? '✓' : ''}
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

        {/* Notebook step */}
        {step === 'notebook' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Informações do Notebook</p>
              <span className="text-[10px] text-amber-500 font-medium">* Obrigatório</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Marca</label>
                <input
                  type="text"
                  value={notebook.brand}
                  onChange={(e) => updateNotebook('brand', e.target.value)}
                  placeholder="Ex: HP"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Modelo *</label>
                <input
                  type="text"
                  value={notebook.model}
                  onChange={(e) => updateNotebook('model', e.target.value)}
                  placeholder="Ex: HP ProBook 440 G3"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Nome *</label>
              <input
                type="text"
                value={notebook.name}
                onChange={(e) => updateNotebook('name', e.target.value)}
                placeholder="Ex: Notebook HP ProBook 440 G3"
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nº Série / Patrimônio</label>
                <input
                  type="text"
                  value={notebook.serialNumber}
                  onChange={(e) => updateNotebook('serialNumber', e.target.value)}
                  placeholder="Ex: PAT-001"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Patrimônio Anhembi Morumbi</label>
                <input
                  type="text"
                  value={notebook.patrimonyAnhembi}
                  onChange={(e) => updateNotebook('patrimonyAnhembi', e.target.value)}
                  placeholder="Ex: 138356"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">CPU</label>
                <input
                  type="text"
                  value={notebook.cpu}
                  onChange={(e) => updateNotebook('cpu', e.target.value)}
                  placeholder="Ex: Intel Core i5-6200"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">RAM</label>
                <input
                  type="text"
                  value={notebook.ram}
                  onChange={(e) => updateNotebook('ram', e.target.value)}
                  placeholder="Ex: 4GB"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Armazenamento</label>
                <input
                  type="text"
                  value={notebook.storage}
                  onChange={(e) => updateNotebook('storage', e.target.value)}
                  placeholder="Ex: SSD 240GB"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sistema Operacional</label>
                <select
                  value={notebook.osType}
                  onChange={(e) => updateNotebook('osType', e.target.value)}
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
                  value={notebook.osVersion}
                  onChange={(e) => updateNotebook('osVersion', e.target.value)}
                  placeholder="Ex: 22H2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Edição</label>
                <select
                  value={notebook.osEdition}
                  onChange={(e) => updateNotebook('osEdition', e.target.value)}
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
                value={notebook.osBuild}
                onChange={(e) => updateNotebook('osBuild', e.target.value)}
                placeholder="Ex: 19045.6456"
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
                <input
                  type="text"
                  value={notebook.room}
                  onChange={(e) => updateNotebook('room', e.target.value)}
                  placeholder="Ex: Lab Info 2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Baia</label>
                <input
                  type="text"
                  value={notebook.bay}
                  onChange={(e) => updateNotebook('bay', e.target.value)}
                  placeholder="Ex: Baia 1"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Condição</label>
              <select
                value={notebook.condition}
                onChange={(e) => updateNotebook('condition', e.target.value)}
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
                value={notebook.notes}
                onChange={(e) => updateNotebook('notes', e.target.value)}
                placeholder="Informações adicionais..."
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/20 p-3">
              <input
                type="checkbox"
                id="autologon"
                checked={notebook.autologon}
                onChange={(e) => updateNotebook('autologon', e.target.checked)}
                className="h-4 w-4 rounded border-line text-cyan-600 focus:ring-cyan-500/30"
              />
              <label htmlFor="autologon" className="cursor-pointer">
                <p className="text-sm font-medium text-fg">Autologon configurado</p>
                <p className="text-[11px] text-fg-dim">Login automático habilitado neste notebook</p>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3">
                <input
                  type="checkbox"
                  id="lockedInBay"
                  checked={notebook.lockedInBay}
                  onChange={(e) => updateNotebook('lockedInBay', e.target.checked)}
                  className="h-4 w-4 rounded border-line text-violet-600 focus:ring-violet-500/30"
                />
                <label htmlFor="lockedInBay" className="cursor-pointer">
                  <p className="text-sm font-medium text-fg">Trancado na baia</p>
                  <p className="text-[11px] text-fg-dim">Cadeado instalado</p>
                </label>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3">
                <input
                  type="checkbox"
                  id="hasMouse"
                  checked={notebook.hasMouse}
                  onChange={(e) => updateNotebook('hasMouse', e.target.checked)}
                  className="h-4 w-4 rounded border-line text-emerald-600 focus:ring-emerald-500/30"
                />
                <label htmlFor="hasMouse" className="cursor-pointer">
                  <p className="text-sm font-medium text-fg">Possui mouse</p>
                  <p className="text-[11px] text-fg-dim">Mouse acompanha o notebook</p>
                </label>
              </div>
            </div>

            {notebook.lockedInBay && (
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Senha do Cadeado</label>
                <input
                  type="text"
                  value={notebook.padlockPassword}
                  onChange={(e) => updateNotebook('padlockPassword', e.target.value)}
                  placeholder="Ex: 1234"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
            )}

            {notebook.hasMouse && (
              <div className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3">
                <input
                  type="checkbox"
                  id="mouseMissing"
                  checked={notebook.mouseMissing}
                  onChange={(e) => updateNotebook('mouseMissing', e.target.checked)}
                  className="h-4 w-4 rounded border-line text-amber-600 focus:ring-amber-500/30"
                />
                <label htmlFor="mouseMissing" className="cursor-pointer">
                  <p className="text-sm font-medium text-fg">Mouse faltando</p>
                  <p className="text-[11px] text-fg-dim">O mouse está ausente nesta baia</p>
                </label>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Status da Bateria</label>
              <select
                value={notebook.batteryStatus}
                onChange={(e) => updateNotebook('batteryStatus', e.target.value)}
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="ok">OK - Funcionando</option>
                <option value="ruim">Ruim - Não segura carga</option>
                <option value="sem">Sem bateria</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Avarias Visuais</label>
              <input
                type="text"
                value={notebook.visualDamage}
                onChange={(e) => updateNotebook('visualDamage', e.target.value)}
                placeholder="Ex: Riscos na tampa, amassado no canto..."
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>
        )}

        {/* Charger step */}
        {step === 'charger' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Informações do Carregador</p>
              <span className="text-[10px] text-amber-500 font-medium">* Obrigatório</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Marca</label>
                <input
                  type="text"
                  value={charger.brand}
                  onChange={(e) => updateCharger('brand', e.target.value)}
                  placeholder="Ex: HP"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nome *</label>
                <input
                  type="text"
                  value={charger.name}
                  onChange={(e) => updateCharger('name', e.target.value)}
                  placeholder="Ex: Carregador HP 65W"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nº Série</label>
                <input
                  type="text"
                  value={charger.serialNumber}
                  onChange={(e) => updateCharger('serialNumber', e.target.value)}
                  placeholder="Ex: SN-789"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Potência</label>
                <input
                  type="text"
                  value={charger.power}
                  onChange={(e) => updateCharger('power', e.target.value)}
                  placeholder="Ex: 65W"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
                <input
                  type="text"
                  value={charger.room}
                  onChange={(e) => updateCharger('room', e.target.value)}
                  placeholder="Ex: Lab Info 2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Condição</label>
                <select
                  value={charger.condition}
                  onChange={(e) => updateCharger('condition', e.target.value)}
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
                value={charger.notes}
                onChange={(e) => updateCharger('notes', e.target.value)}
                placeholder="Informações adicionais..."
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>
        )}

        {/* Monitor step */}
        {step === 'monitor' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Informações do Monitor</p>
              <span className="text-[10px] text-fg-muted">Opcional para notebook</span>
            </div>
            
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Nome</label>
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
              <span className="text-[10px] text-fg-muted">Opcional para notebook</span>
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
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nome</label>
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
              <span className="text-[10px] text-fg-muted">Opcional para notebook</span>
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
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nome</label>
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
            
            {mode === 'full' && notebook.name && (
              <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/20 p-3">
                <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">Notebook</p>
                <p className="text-sm text-fg">{notebook.brand} {notebook.model}</p>
                <p className="text-[11px] text-fg-dim">
                  {notebook.cpu} | {notebook.ram} | {notebook.storage} | {notebook.osType} {notebook.osVersion} {notebook.osEdition} Build {notebook.osBuild}
                </p>
                {notebook.patrimonyAnhembi && (
                  <p className="text-[11px] text-fg-dim">Patrimônio AM: {notebook.patrimonyAnhembi}</p>
                )}
                {notebook.bay && (
                  <p className="text-[11px] text-fg-dim">Baia: {notebook.bay}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${notebook.lockedInBay ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {notebook.lockedInBay ? '🔒 Trancado' : '🔓 Sem cadeado'}
                    {notebook.lockedInBay && notebook.padlockPassword && (
                      <span className="ml-1 font-mono">({notebook.padlockPassword})</span>
                    )}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${notebook.hasMouse && !notebook.mouseMissing ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    🖱️ {notebook.hasMouse ? (notebook.mouseMissing ? 'Mouse faltando' : 'Mouse OK') : 'Sem mouse'}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${notebook.batteryStatus === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : notebook.batteryStatus === 'ruim' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    🔋 {notebook.batteryStatus === 'ok' ? 'Bateria OK' : notebook.batteryStatus === 'ruim' ? 'Bateria ruim' : 'Sem bateria'}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${notebook.autologon ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'}`}>
                    {notebook.autologon ? '✓ Autologon' : '✗ Sem autologon'}
                  </span>
                  {notebook.visualDamage && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      ⚠️ {notebook.visualDamage}
                    </span>
                  )}
                </div>
              </div>
            )}

            {charger.name && (
              <div className="rounded-xl bg-orange-50 dark:bg-orange-950/20 p-3">
                <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">Carregador</p>
                <p className="text-sm text-fg">{charger.brand} {charger.name}</p>
                {charger.power && <p className="text-[11px] text-fg-dim">Potência: {charger.power}</p>}
                {charger.serialNumber && <p className="text-[11px] text-fg-dim">Série: {charger.serialNumber}</p>}
                {charger.condition && <p className="text-[11px] text-fg-dim">Condição: {charger.condition}</p>}
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
                mode === 'full' && notebook.name && 'Notebook',
                charger.name && 'Carregador',
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
              {step === 'notebook' && !notebook.name.trim() ? 'Preencha o nome do Notebook' : 
               step === 'charger' && !charger.name.trim() ? 'Preencha o nome do Carregador' :
               step === 'monitor' && !monitor.name.trim() ? 'Preencha o nome do Monitor' :
               step === 'mouse' && !mouse.name.trim() ? 'Preencha o nome do Mouse' :
               step === 'keyboard' && !keyboard.name.trim() ? 'Preencha o nome do Teclado' :
               'Próximo'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canProceed() || (mode === 'full' && !charger.name.trim())}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 py-2.5 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50 btn-interactive"
            >
              {!canProceed()
                ? 'Preencha os campos obrigatórios'
                : `Criar ${[
                    mode === 'full' && notebook.name && 'Notebook',
                    charger.name && 'Carregador',
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