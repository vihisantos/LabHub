import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CampusHero } from '../CampusBackdrop'

describe('CampusHero', () => {
  it('keeps artwork inside the hero and outside the form', () => {
    const { container, rerender } = render(
      <>
        <CampusHero campus="piracicaba"><h1>Abrir chamado</h1></CampusHero>
        <form aria-label="Chamado"><input aria-label="Sala" /></form>
      </>,
    )
    const image = container.querySelector('.campus-backdrop__image')
    expect(image?.closest('.campus-hero')).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Chamado' }).querySelector('img')).toBeNull()
    rerender(<CampusHero campus="mooca"><h1>Abrir chamado</h1></CampusHero>)
    expect(container.querySelector('.campus-backdrop__image')?.getAttribute('src')).not.toBe(image?.getAttribute('src'))
    rerender(<CampusHero><h1>Abrir chamado</h1></CampusHero>)
    expect(container.querySelector('.campus-backdrop')).toBeNull()
  })

  it('uses the larger success hero without removing its content', () => {
    const { container } = render(
      <CampusHero campus="sjc" variant="success"><h1>Chamado enviado!</h1></CampusHero>,
    )
    expect(container.querySelector('.campus-hero--success .campus-backdrop--success')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Chamado enviado!' })).toBeTruthy()
  })
})
