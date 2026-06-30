import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import { icons } from '../../../lib/icons'
import type { PC } from '../types'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../lib/components/ui'

type PCEditData = Omit<PC, 'id' | 'createdAt' | 'updatedAt' | 'lastIntervention' | 'photos'>

export function PCForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { pcs, update } = usePCs()

  const pc = pcs.find((p) => p.id === id)
  const [form, setForm] = useState<PCEditData | null>(null)
  const [softwareInput, setSoftwareInput] = useState('')

  useEffect(() => {
    if (pc) {
      setForm({
        labName: pc.labName,
        pcNumber: pc.pcNumber,
        assetTag: pc.assetTag,
        roomLocation: pc.roomLocation,
        specs: { ...pc.specs },
        cleaningStatus: pc.cleaningStatus,
        restorationStatus: pc.restorationStatus,
        softwareInstalled: [...pc.softwareInstalled],
        partsReplaced: [...pc.partsReplaced],
        observations: pc.observations,
      })
    }
  }, [pc])

  if (!pc) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <icons.ui.search size={32} className="text-fg-muted" />
        <p className="text-sm text-fg-muted">PC não encontrado</p>
        <button type="button" onClick={() => navigate('/pcare/pcs')} className="text-sm text-cyan-600 dark:text-cyan-400">Voltar</button>
      </div>
    )
  }

  if (!form) return null

  function updateField(field: keyof PCEditData, value: any) {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev)
  }

  function updateSpec(field: keyof PCEditData['specs'], value: string) {
    setForm((prev) => prev ? {
      ...prev,
      specs: { ...prev.specs, [field]: value },
    } : prev)
  }

  function addSoftware() {
    const name = softwareInput.trim()
    if (name && form && !form.softwareInstalled.includes(name)) {
      updateField('softwareInstalled', [...form.softwareInstalled, name])
      setSoftwareInput('')
    }
  }

  function removeSoftware(name: string) {
    updateField(
      'softwareInstalled',
      form!.softwareInstalled.filter((s) => s !== name),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    update(id!, form!)
    navigate('/pcare/pcs')
  }

  function handleBack() {
    navigate('/pcare/pcs')
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleBack}
            className="rounded-lg p-1 text-fg-dim hover:text-fg"
            aria-label="Voltar"
          >
            <icons.ui.back size={20} />
          </button>
        <h2 className="text-xl font-semibold">Editar PC</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Identificação</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Laboratório</label>
              <input
                type="text"
                value={form.labName}
                onChange={(e) => updateField('labName', e.target.value)}
                placeholder="LAB-01"
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">N do PC</label>
              <input
                type="text"
                value={form.pcNumber}
                onChange={(e) => updateField('pcNumber', e.target.value)}
                placeholder="PC-12"
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
                required
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-fg-muted">Etiqueta Patrimonial</label>
            <input
              type="text"
              value={form.assetTag}
              onChange={(e) => updateField('assetTag', e.target.value)}
              placeholder="Ex: 123456"
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
            />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-fg-muted">Localização</label>
            <input
              type="text"
              value={form.roomLocation}
              onChange={(e) => updateField('roomLocation', e.target.value)}
              placeholder="Bloco A, Sala 203"
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
            />
          </div>
        </section>

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Especificações</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-fg-muted">CPU</label>
              <input
                type="text"
                value={form.specs.cpu}
                onChange={(e) => updateSpec('cpu', e.target.value)}
                placeholder="Intel i5-10400"
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">RAM</label>
              <input
                type="text"
                value={form.specs.ram}
                onChange={(e) => updateSpec('ram', e.target.value)}
                placeholder="8GB DDR4"
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Armazenamento</label>
              <input
                type="text"
                value={form.specs.storage}
                onChange={(e) => updateSpec('storage', e.target.value)}
                placeholder="SSD 240GB"
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Sistema</label>
              <input
                type="text"
                value={form.specs.os}
                onChange={(e) => updateSpec('os', e.target.value)}
                placeholder="Windows 11"
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Status</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Limpeza</label>
              <Select value={form.cleaningStatus} onValueChange={(v) => updateField('cleaningStatus', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="done">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Restauração</label>
              <Select value={form.restorationStatus} onValueChange={(v) => updateField('restorationStatus', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="done">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Software Instalado</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={softwareInput}
              onChange={(e) => setSoftwareInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSoftware())}
              placeholder="Digite o nome do software..."
              className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={addSoftware}
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
            >
              Adicionar
            </button>
          </div>
          {form.softwareInstalled.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {form.softwareInstalled.map((sw) => (
                <span
                  key={sw}
                  className="flex items-center gap-1 rounded-md bg-input px-2 py-1 text-xs text-fg"
                >
                  {sw}
                  <button
                    type="button"
                    onClick={() => removeSoftware(sw)}
                    className="text-fg-dim hover:text-red-600 dark:hover:text-red-400"
                    aria-label={`Remover ${sw}`}
                  >
                    <icons.ui.close size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Observações</h3>
          <textarea
            value={form.observations}
            onChange={(e) => updateField('observations', e.target.value)}
            placeholder="Anotações sobre o estado do PC..."
            rows={3}
            className="w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-cyan-500"
          />
        </section>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex-1 rounded-lg border border-line py-2 text-sm text-fg-dim transition-colors hover:bg-input"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
