import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Stars } from '../Stars'

const labelFor = (n: number) => `label[for="${(screen.getByLabelText(n === 1 ? '1 estrela' : `${n} estrelas`) as HTMLInputElement).id}"]`

const filledStars = () =>
  Array.from(
    document.querySelectorAll<HTMLLabelElement>('.stars-rating__label[data-filled="true"]'),
  ).map((label) => (document.getElementById(label.htmlFor) as HTMLInputElement | null)?.value)

describe('Stars', () => {
  it('renderiza 5 radios com acessibilidade', () => {
    render(<Stars value={0} />)
    for (let n = 1; n <= 5; n++) {
      const radio = screen.getByLabelText(n === 1 ? '1 estrela' : `${n} estrelas`)
      expect(radio).toBeInTheDocument()
      expect(radio).toHaveAttribute('type', 'radio')
    }
  })

  it('associa cada radio ao seu label', () => {
    render(<Stars value={0} onChange={() => {}} />)
    for (let n = 1; n <= 5; n++) {
      const radio = screen.getByLabelText(n === 1 ? '1 estrela' : `${n} estrelas`) as HTMLInputElement
      expect(document.querySelector(labelFor(n))).toBeInTheDocument()
      expect(radio.value).toBe(String(n))
    }
  })

  it('preenche as estrelas até o valor informado', () => {
    render(<Stars value={3} />)
    expect(filledStars()).toEqual(['1', '2', '3'])
    expect(screen.getByLabelText('3 estrelas')).toBeChecked()
  })

  it('marca apenas a estrela selecionada como ativa (animação yippee)', () => {
    function Harness() {
      const [value, setValue] = useState(0)
      return <Stars value={value} onChange={setValue} />
    }
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('4 estrelas'))

    expect(filledStars()).toEqual(['1', '2', '3', '4'])
    expect(document.querySelectorAll('.stars-rating__label[data-active="true"]')).toHaveLength(1)
    expect(document.querySelector(labelFor(4))).toHaveAttribute('data-active', 'true')
    expect(document.querySelector(labelFor(5))).toHaveAttribute('data-filled', 'false')
  })

  it('representa 4 como 4 estrelas, não como 2', () => {
    render(<Stars value={4} />)
    expect(filledStars()).toEqual(['1', '2', '3', '4'])
    expect(screen.getByLabelText('5 estrelas')).not.toBeChecked()
  })

  it('dispara onChange com o valor de 1 a 5 ao clicar no radio', () => {
    const onChange = vi.fn()
    for (let n = 1; n <= 5; n++) {
      const { unmount } = render(<Stars value={0} onChange={onChange} />)
      fireEvent.click(screen.getByLabelText(n === 1 ? '1 estrela' : `${n} estrelas`))
      expect(onChange).toHaveBeenLastCalledWith(n)
      unmount()
      onChange.mockClear()
    }
  })

  it('dispara onChange ao clicar no label', () => {
    const onChange = vi.fn()
    render(<Stars value={0} onChange={onChange} />)
    fireEvent.click(document.querySelector(labelFor(3)) as HTMLElement)
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('destaca a faixa 1..N no hover', () => {
    render(<Stars value={0} onChange={() => {}} />)
    // O input é quem fica sob o ponteiro (ele cobre a estrela), então é ele que
    // recebe o mouseover do navegador.
    fireEvent.mouseOver(screen.getByLabelText('4 estrelas'))

    expect(document.querySelectorAll('.stars-rating__label[data-hover="true"]')).toHaveLength(4)
    expect(document.querySelector(labelFor(4))).toHaveAttribute('data-hover', 'true')
    expect(document.querySelector(labelFor(5))).toHaveAttribute('data-hover', 'false')

    fireEvent.mouseOut(screen.getByLabelText('4 estrelas'))
    expect(document.querySelectorAll('.stars-rating__label[data-hover="true"]')).toHaveLength(0)
  })

  it('não destaca no hover quando é somente leitura', () => {
    render(<Stars value={3} />)
    fireEvent.mouseOver(screen.getByLabelText('5 estrelas'))
    expect(document.querySelectorAll('.stars-rating__label[data-hover="true"]')).toHaveLength(0)
  })

  it('desabilita sem onChange', () => {
    render(<Stars value={2} />)
    expect(screen.getByLabelText('1 estrela')).toBeDisabled()
  })

  it('desabilita explicitamente', () => {
    render(<Stars value={2} onChange={() => {}} disabled />)
    expect(screen.getByLabelText('3 estrelas')).toBeDisabled()
  })

  it('mantém o valor visível no modo somente leitura', () => {
    render(<Stars value={4} />)
    expect(filledStars()).toEqual(['1', '2', '3', '4'])
    expect(screen.getByText('Avaliação: 4 de 5 estrelas')).toBeInTheDocument()
  })

  it('isola o grupo de radios entre duas instâncias na mesma tela', () => {
    render(
      <>
        <Stars value={2} onChange={() => {}} />
        <Stars value={3} onChange={() => {}} />
      </>,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(10)
    expect(new Set(radios.map((r) => r.getAttribute('name'))).size).toBe(2)
    expect(new Set(radios.map((r) => r.id)).size).toBe(10)
  })

  it('mantém um único starPath e o tamanho pedido', () => {
    const { container } = render(<Stars value={1} size={28} />)
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(5)
    for (const path of Array.from(paths)) {
      expect(path.getAttribute('pathLength')).toBe('360')
    }
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('width')).toBe('28')
  })
})
