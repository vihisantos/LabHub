import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BatchCreateModal } from '../BatchCreateModal'

describe('BatchCreateModal', () => {
  // O setup global ativa fake timers; userEvent precisa de timers reais.
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('onCreated recebe o count deduplicado quando há séries repetidas', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    const reload = vi.fn()
    const onCreated = vi.fn()
    const onClose = vi.fn()

    render(
      <BatchCreateModal
        open
        onClose={onClose}
        create={create}
        reload={reload}
        onCreated={onCreated}
      />,
    )

    // 3 patrimônios, mas PAT-001 aparece 2x → createMany dedupe para 2
    await user.type(
      screen.getByPlaceholderText(/Cole os patrimônios/),
      'PAT-001\nPAT-001\nPAT-002',
    )
    await user.type(screen.getByPlaceholderText('Ex: Dell Optiplex 7090'), 'Dell Optiplex 7090')

    await user.click(screen.getByRole('button', { name: 'Criar 3 itens' }))

    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledWith(2)
    expect(create).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('onCreated recebe o total quando não há duplicatas', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    const onCreated = vi.fn()
    const onClose = vi.fn()

    render(<BatchCreateModal open onClose={onClose} create={create} onCreated={onCreated} />)

    await user.type(screen.getByPlaceholderText(/Cole os patrimônios/), 'PAT-001\nPAT-002')
    await user.type(screen.getByPlaceholderText('Ex: Dell Optiplex 7090'), 'Dell Optiplex')

    await user.click(screen.getByRole('button', { name: 'Criar 2 itens' }))

    expect(onCreated).toHaveBeenCalledWith(2)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('sem patrimônios o botão fica desabilitado e nada é criado', async () => {
    const user = userEvent.setup()
    const create = vi.fn()
    const onCreated = vi.fn()
    const onClose = vi.fn()

    render(<BatchCreateModal open onClose={onClose} create={create} onCreated={onCreated} />)

    await user.type(screen.getByPlaceholderText('Ex: Dell Optiplex 7090'), 'Dell Optiplex')

    const submit = screen.getByRole('button', { name: 'Criar Lote' })
    expect(submit).toBeDisabled()

    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
