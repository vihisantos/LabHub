import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import { icons } from '../../../lib/icons'
import type { PCFormData } from '../types'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function padNumber(n: number, digits: number): string {
  return String(n).padStart(digits, '0')
}

function generatePcNumber(prefix: string, separator: string, n: number, digits: number): string {
  return `${prefix}${separator}${padNumber(n, digits)}`
}

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface BulkConfig {
  // Identificação
  labName: string
  roomLocation: string
  // Numeração
  prefix: string
  separator: string
  startNumber: number
  quantity: number
  digits: number // zero-padding
  // Specs (compartilhadas)
  cpu: string
  ram: string
  storage: string
  os: string
  // Software
  softwareInstalled: string[]
  // Status inicial
  cleaningStatus: 'pending' | 'in_progress' | 'done'
  restorationStatus: 'pending' | 'in_progress' | 'done'
  // Observações
  observations: string
}

const defaultConfig: BulkConfig = {
  labName: '',
  roomLocation: '',
  prefix: 'PC',
  separator: '-',
  startNumber: 1,
  quantity: 10,
  digits: 2,
  cpu: '',
  ram: '',
  storage: '',
  os: '',
  softwareInstalled: [],
  cleaningStatus: 'pending',
  restorationStatus: 'pending',
  observations: '',
}

// ──────────────────────────────────────────────────────────────
// Preview component
// ──────────────────────────────────────────────────────────────

function Preview({ config }: { config: BulkConfig }) {
  const count = Math.min(config.quantity, 5)
  const examples: string[] = []
  for (let i = 0; i < count; i++) {
    examples.push(generatePcNumber(config.prefix, config.separator, config.startNumber + i, config.digits))
  }
  const hasMore = config.quantity > 5

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <p className="mb-2 text-xs font-semibold text-cyan-400 uppercase tracking-wider">
        Pré-visualização — {config.quantity} PC{config.quantity !== 1 ? 's' : ''} serão criados
      </p>
      <div className="flex flex-wrap gap-1.5">
        {examples.map((name) => (
          <span key={name} className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-xs font-mono text-cyan-300">
            {name}
          </span>
        ))}
        {hasMore && (
          <span className="rounded-md bg-input px-2 py-0.5 text-xs text-fg-muted font-mono">
            +{config.quantity - 5} mais...
          </span>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Step indicators
// ──────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === current
              ? 'w-6 bg-cyan-400'
              : i < current
                ? 'w-1.5 bg-cyan-600'
                : 'w-1.5 bg-line'
          }`}
        />
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Field helper
// ──────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-fg-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-fg-muted">{hint}</p>}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500 placeholder:text-fg-muted'
const selectCls =
  'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500'

// ──────────────────────────────────────────────────────────────
// Steps
// ──────────────────────────────────────────────────────────────

function Step1({ config, onChange }: { config: BulkConfig; onChange: (patch: Partial<BulkConfig>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-fg">Identificação</h3>
        <p className="text-xs text-fg-muted mt-0.5">Em qual laboratório e sala estão esses PCs?</p>
      </div>

      <Field label="Laboratório *">
        <input
          type="text"
          value={config.labName}
          onChange={(e) => onChange({ labName: e.target.value })}
          placeholder="Ex: LAB-01, Informática A"
          className={inputCls}
          required
          autoFocus
        />
      </Field>

      <Field label="Localização *">
        <input
          type="text"
          value={config.roomLocation}
          onChange={(e) => onChange({ roomLocation: e.target.value })}
          placeholder="Ex: Bloco A, Sala 203"
          className={inputCls}
          required
        />
      </Field>
    </div>
  )
}

function Step2({ config, onChange }: { config: BulkConfig; onChange: (patch: Partial<BulkConfig>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-fg">Numeração Sequencial</h3>
        <p className="text-xs text-fg-muted mt-0.5">Configure como os PCs serão nomeados automaticamente.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Prefixo" hint="Texto antes do número">
          <input
            type="text"
            value={config.prefix}
            onChange={(e) => onChange({ prefix: e.target.value })}
            placeholder="PC"
            className={inputCls}
            maxLength={10}
          />
        </Field>
        <Field label="Separador">
          <select
            value={config.separator}
            onChange={(e) => onChange({ separator: e.target.value })}
            className={selectCls}
          >
            <option value="-">Hífen ( PC-01 )</option>
            <option value="_">Underline ( PC_01 )</option>
            <option value="">Sem separador ( PC01 )</option>
            <option value=" ">Espaço ( PC 01 )</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Número inicial" hint="Primeiro número da sequência">
          <input
            type="number"
            min={1}
            max={9999}
            value={config.startNumber}
            onChange={(e) => onChange({ startNumber: Math.max(1, Number(e.target.value)) })}
            className={inputCls}
          />
        </Field>
        <Field label="Dígitos (zeros)" hint="Ex: 2 → PC-01, PC-02">
          <select
            value={config.digits}
            onChange={(e) => onChange({ digits: Number(e.target.value) })}
            className={selectCls}
          >
            <option value={1}>1 dígito ( PC-1 )</option>
            <option value={2}>2 dígitos ( PC-01 )</option>
            <option value={3}>3 dígitos ( PC-001 )</option>
            <option value={4}>4 dígitos ( PC-0001 )</option>
          </select>
        </Field>
      </div>

      <Field label="Quantidade de PCs" hint="Máximo de 100 por vez">
        <input
          type="number"
          min={1}
          max={100}
          value={config.quantity}
          onChange={(e) => onChange({ quantity: Math.min(100, Math.max(1, Number(e.target.value))) })}
          className={inputCls}
        />
      </Field>

      <Preview config={config} />
    </div>
  )
}

function Step3({ config, onChange }: { config: BulkConfig; onChange: (patch: Partial<BulkConfig>) => void }) {
  const [softwareInput, setSoftwareInput] = useState('')

  function addSoftware() {
    const name = softwareInput.trim()
    if (name && !config.softwareInstalled.includes(name)) {
      onChange({ softwareInstalled: [...config.softwareInstalled, name] })
      setSoftwareInput('')
    }
  }

  function removeSoftware(name: string) {
    onChange({ softwareInstalled: config.softwareInstalled.filter((s) => s !== name) })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-fg">Especificações</h3>
        <p className="text-xs text-fg-muted mt-0.5">Configuração de hardware compartilhada por todos os PCs.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="CPU">
          <input
            type="text"
            value={config.cpu}
            onChange={(e) => onChange({ cpu: e.target.value })}
            placeholder="Intel i5-10400"
            className={inputCls}
          />
        </Field>
        <Field label="RAM">
          <input
            type="text"
            value={config.ram}
            onChange={(e) => onChange({ ram: e.target.value })}
            placeholder="8GB DDR4"
            className={inputCls}
          />
        </Field>
        <Field label="Armazenamento">
          <input
            type="text"
            value={config.storage}
            onChange={(e) => onChange({ storage: e.target.value })}
            placeholder="SSD 240GB"
            className={inputCls}
          />
        </Field>
        <Field label="Sistema Operacional">
          <input
            type="text"
            value={config.os}
            onChange={(e) => onChange({ os: e.target.value })}
            placeholder="Windows 11"
            className={inputCls}
          />
        </Field>
      </div>

      <div>
        <label className="mb-1 block text-xs text-fg-muted">Software instalado</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={softwareInput}
            onChange={(e) => setSoftwareInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSoftware())}
            placeholder="Ex: Microsoft Office 2021"
            className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={addSoftware}
            className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
          >
            +
          </button>
        </div>
        {config.softwareInstalled.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {config.softwareInstalled.map((sw) => (
              <span key={sw} className="flex items-center gap-1 rounded-md bg-input px-2 py-1 text-xs text-fg">
                {sw}
                <button
                  type="button"
                  onClick={() => removeSoftware(sw)}
                  className="text-fg-dim hover:text-red-400"
                  aria-label={`Remover ${sw}`}
                >
                  <icons.ui.close size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Step4({ config, onChange }: { config: BulkConfig; onChange: (patch: Partial<BulkConfig>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-fg">Status e Observações</h3>
        <p className="text-xs text-fg-muted mt-0.5">Status inicial e anotações para todos os PCs.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status de Limpeza">
          <select
            value={config.cleaningStatus}
            onChange={(e) => onChange({ cleaningStatus: e.target.value as BulkConfig['cleaningStatus'] })}
            className={selectCls}
          >
            <option value="pending">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="done">Concluído</option>
          </select>
        </Field>
        <Field label="Status de Restauração">
          <select
            value={config.restorationStatus}
            onChange={(e) => onChange({ restorationStatus: e.target.value as BulkConfig['restorationStatus'] })}
            className={selectCls}
          >
            <option value="pending">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="done">Concluído</option>
          </select>
        </Field>
      </div>

      <Field label="Observações">
        <textarea
          value={config.observations}
          onChange={(e) => onChange({ observations: e.target.value })}
          placeholder="Anotações sobre o lote (opcional)..."
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-cyan-500"
        />
      </Field>

      {/* Resumo final */}
      <div className="rounded-xl border border-line bg-card/50 p-4 space-y-2">
        <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Resumo do lote</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <span className="text-fg-muted">Laboratório</span>
          <span className="text-fg font-medium">{config.labName || '—'}</span>
          <span className="text-fg-muted">Localização</span>
          <span className="text-fg font-medium">{config.roomLocation || '—'}</span>
          <span className="text-fg-muted">Quantidade</span>
          <span className="text-fg font-medium">{config.quantity} PCs</span>
          <span className="text-fg-muted">Numeração</span>
          <span className="text-fg font-mono font-medium">
            {generatePcNumber(config.prefix, config.separator, config.startNumber, config.digits)}
            {' → '}
            {generatePcNumber(config.prefix, config.separator, config.startNumber + config.quantity - 1, config.digits)}
          </span>
          {config.cpu && (
            <>
              <span className="text-fg-muted">CPU</span>
              <span className="text-fg font-medium">{config.cpu}</span>
            </>
          )}
          {config.ram && (
            <>
              <span className="text-fg-muted">RAM</span>
              <span className="text-fg font-medium">{config.ram}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Success screen
// ──────────────────────────────────────────────────────────────

function SuccessScreen({ count, onGoToList, onCreateMore }: { count: number; onGoToList: () => void; onCreateMore: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
        <icons.ui.partyPopper size={40} className="text-emerald-400" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-fg">{count} PCs criados!</h3>
        <p className="mt-1 text-sm text-fg-muted">Todos foram adicionados ao inventário com sucesso.</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onGoToList}
          className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2.5 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          Ver lista de PCs
        </button>
        <button
          type="button"
          onClick={onCreateMore}
          className="w-full rounded-lg border border-line py-2.5 text-sm text-fg-dim transition-colors hover:bg-input"
        >
          Cadastrar mais um lote
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Main wizard
// ──────────────────────────────────────────────────────────────

const STEPS = ['Identificação', 'Numeração', 'Especificações', 'Confirmar']
const TOTAL_STEPS = STEPS.length

export function BulkPCWizard() {
  const navigate = useNavigate()
  const { create } = usePCs()

  const [step, setStep] = useState(0)
  const [config, setConfig] = useState<BulkConfig>(defaultConfig)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<number | null>(null)

  function patchConfig(patch: Partial<BulkConfig>) {
    setConfig((prev) => ({ ...prev, ...patch }))
  }

  const isStepValid = useMemo(() => {
    if (step === 0) return config.labName.trim() !== '' && config.roomLocation.trim() !== ''
    if (step === 1) return config.quantity >= 1 && config.prefix.trim() !== ''
    return true
  }, [step, config])

  function handleNext() {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1)
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1)
    else navigate('/pcare/pcs')
  }

  async function handleCreate() {
    setCreating(true)
    let count = 0
    for (let i = 0; i < config.quantity; i++) {
      const pcNumber = generatePcNumber(config.prefix, config.separator, config.startNumber + i, config.digits)
      const data: PCFormData = {
        labName: config.labName,
        pcNumber,
        assetTag: '',
        roomLocation: config.roomLocation,
        specs: {
          cpu: config.cpu,
          ram: config.ram,
          storage: config.storage,
          os: config.os,
        },
        cleaningStatus: config.cleaningStatus,
        restorationStatus: config.restorationStatus,
        softwareInstalled: [...config.softwareInstalled],
        partsReplaced: [],
        observations: config.observations,
      }
      create(data)
      count++
    }
    setCreating(false)
    setCreated(count)
  }

  if (created !== null) {
    return (
      <div>
        <SuccessScreen
          count={created}
          onGoToList={() => navigate('/pcare/pcs')}
          onCreateMore={() => {
            setCreated(null)
            setStep(0)
            setConfig(defaultConfig)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-lg p-1 text-fg-dim hover:text-fg"
          aria-label="Voltar"
        >
          <icons.ui.back size={20} />
        </button>
        <div>
          <h2 className="text-xl font-semibold">Cadastro em Massa</h2>
          <p className="text-xs text-fg-muted">
            Passo {step + 1} de {TOTAL_STEPS} — {STEPS[step]}
          </p>
        </div>
      </div>

      {/* Progress */}
      <StepDots current={step} total={TOTAL_STEPS} />

      {/* Step content */}
      <div className="rounded-xl border border-line bg-card/50 p-4">
        {step === 0 && <Step1 config={config} onChange={patchConfig} />}
        {step === 1 && <Step2 config={config} onChange={patchConfig} />}
        {step === 2 && <Step3 config={config} onChange={patchConfig} />}
        {step === 3 && <Step4 config={config} onChange={patchConfig} />}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex-1 rounded-lg border border-line py-2.5 text-sm text-fg-dim transition-colors hover:bg-input"
        >
          {step === 0 ? 'Cancelar' : 'Voltar'}
        </button>

        {step < TOTAL_STEPS - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={!isStepValid}
            className="flex-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2.5 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Próximo
          </button>
        ) : (
          <button
            type="button"
            id="bulk-create-confirm"
            onClick={handleCreate}
            disabled={creating}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2.5 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md disabled:opacity-50"
          >
            {creating ? (
              <>
                <icons.ui.refresh size={14} className="animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <icons.ui.plusCircle size={14} />
                Criar {config.quantity} PC{config.quantity !== 1 ? 's' : ''}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
