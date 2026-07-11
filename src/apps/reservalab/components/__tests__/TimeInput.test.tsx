import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimeInput } from '../TimeInput'

describe('TimeInput', () => {
  it('renderiza label e placeholder', () => {
    render(<TimeInput label="Horário" value="" onChange={() => {}} />)
    expect(screen.getByText('Horário')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('00h00')).toBeInTheDocument()
  })

  it('chama onChange com valor formatado (4 dígitos)', () => {
    const onChange = vi.fn()
    render(<TimeInput label="Início" value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('00h00')

    fireEvent.change(input, { target: { value: '1430' } })
    expect(onChange).toHaveBeenCalledWith('14h30')
  })

  it('chama onChange com valor parcial (menos de 3 dígitos)', () => {
    const onChange = vi.fn()
    render(<TimeInput label="Fim" value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('00h00')

    fireEvent.change(input, { target: { value: '7' } })
    expect(onChange).toHaveBeenCalledWith('7')
  })

  it('formata no blur quando tem 4 dígitos', () => {
    const onChange = vi.fn()
    render(<TimeInput label="Teste" value="0800" onChange={onChange} />)
    const input = screen.getByPlaceholderText('00h00')

    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('08h00')
  })

  it('não permite mais de 4 dígitos', () => {
    const onChange = vi.fn()
    render(<TimeInput label="Teste" value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('00h00')

    fireEvent.change(input, { target: { value: '12345' } })
    // onChange não deve ser chamado com 5 dígitos
    expect(onChange).not.toHaveBeenCalled()
  })

  it('remove caracteres não numéricos', () => {
    const onChange = vi.fn()
    render(<TimeInput label="Teste" value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('00h00')

    fireEvent.change(input, { target: { value: '14:30' } })
    expect(onChange).toHaveBeenCalledWith('14h30')
  })
})
