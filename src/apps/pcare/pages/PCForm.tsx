import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import type { PCFormData } from '../types'

const initialForm: PCFormData = {
  labName: '',
  pcNumber: '',
  assetTag: '',
  roomLocation: '',
  specs: { cpu: '', ram: '', storage: '', os: '' },
  cleaningStatus: 'pending',
  restorationStatus: 'pending',
  softwareInstalled: [],
  partsReplaced: [],
  observations: '',
}

export function PCForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { pcs, create, update } = usePCs()
  const isEditing = !!id

  const [form, setForm] = useState<PCFormData>(initialForm)
  const [softwareInput, setSoftwareInput] = useState('')

  useEffect(() => {
    if (isEditing) {
      const pc = pcs.find((p) => p.id === id)
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
    }
  }, [id, isEditing, pcs])

  function updateField(field: keyof PCFormData, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateSpec(field: keyof PCFormData['specs'], value: string) {
    setForm((prev) => ({
      ...prev,
      specs: { ...prev.specs, [field]: value },
    }))
  }

  function addSoftware() {
    const name = softwareInput.trim()
    if (name && !form.softwareInstalled.includes(name)) {
      updateField('softwareInstalled', [...form.softwareInstalled, name])
      setSoftwareInput('')
    }
  }

  function removeSoftware(name: string) {
    updateField(
      'softwareInstalled',
      form.softwareInstalled.filter((s) => s !== name),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEditing) {
      update(id!, form)
    } else {
      create(form)
    }
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
            className="rounded-lg p-1 text-slate-400 hover:text-slate-200"
          >
            ←
          </button>
        <h2 className="text-xl font-semibold">
          {isEditing ? 'Editar PC' : 'Novo Computador'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Identificação</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Laboratório</label>
              <input
                type="text"
                value={form.labName}
                onChange={(e) => updateField('labName', e.target.value)}
                placeholder="LAB-01"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">N do PC</label>
              <input
                type="text"
                value={form.pcNumber}
                onChange={(e) => updateField('pcNumber', e.target.value)}
                placeholder="PC-12"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
                required
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-slate-500">Etiqueta Patrimonial</label>
            <input
              type="text"
              value={form.assetTag}
              onChange={(e) => updateField('assetTag', e.target.value)}
              placeholder="Ex: 123456"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
            />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-slate-500">Localização</label>
            <input
              type="text"
              value={form.roomLocation}
              onChange={(e) => updateField('roomLocation', e.target.value)}
              placeholder="Bloco A, Sala 203"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Especificações</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">CPU</label>
              <input
                type="text"
                value={form.specs.cpu}
                onChange={(e) => updateSpec('cpu', e.target.value)}
                placeholder="Intel i5-10400"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">RAM</label>
              <input
                type="text"
                value={form.specs.ram}
                onChange={(e) => updateSpec('ram', e.target.value)}
                placeholder="8GB DDR4"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Armazenamento</label>
              <input
                type="text"
                value={form.specs.storage}
                onChange={(e) => updateSpec('storage', e.target.value)}
                placeholder="SSD 240GB"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Sistema</label>
              <input
                type="text"
                value={form.specs.os}
                onChange={(e) => updateSpec('os', e.target.value)}
                placeholder="Windows 11"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Limpeza</label>
              <select
                value={form.cleaningStatus}
                onChange={(e) => updateField('cleaningStatus', e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              >
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluído</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Restauração</label>
              <select
                value={form.restorationStatus}
                onChange={(e) => updateField('restorationStatus', e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
              >
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluído</option>
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Software Instalado</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={softwareInput}
              onChange={(e) => setSoftwareInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSoftware())}
              placeholder="Digite o nome do software..."
              className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition-colors focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={addSoftware}
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
            >
              Adicionar
            </button>
          </div>
          {form.softwareInstalled.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {form.softwareInstalled.map((sw) => (
                <span
                  key={sw}
                  className="flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-200"
                >
                  {sw}
                  <button
                    type="button"
                    onClick={() => removeSoftware(sw)}
                    className="text-slate-400 hover:text-red-400"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Observações</h3>
          <textarea
            value={form.observations}
            onChange={(e) => updateField('observations', e.target.value)}
            placeholder="Anotações sobre o estado do PC..."
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition-colors focus:border-cyan-500"
          />
        </section>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
          >
            {isEditing ? 'Salvar' : 'Criar PC'}
          </button>
        </div>
      </form>
    </div>
  )
}
