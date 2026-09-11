import { describe, it, expect } from 'vitest'
import { buildWeeklyData } from '../weeklyData'
import type { LaboratorioReserva, WeekDayData } from '../../types'

function lab(data: string, horario = '07h30'): LaboratorioReserva {
  return {
    horario,
    responsavel: 'Prof. A',
    observacao: 'Matemática',
    reserva_feita_por: 'Maria',
    alunos: 20,
    labs: ['LAB01'],
    lab: 'LAB01',
    data,
  }
}

describe('buildWeeklyData', () => {
  it('ordena os dias por data crescente (16/09, 18/09, 17/09 → 16, 17, 18)', () => {
    const out = buildWeeklyData([lab('16/09/2026'), lab('18/09/2026'), lab('17/09/2026')], [])
    expect(out.map((d) => d.date)).toEqual(['16/09/2026', '17/09/2026', '18/09/2026'])
  })

  it('limita a 30 dias', () => {
    const reservas = Array.from({ length: 35 }, (_, i) => lab(`${String(i + 1).padStart(2, '0')}/09/2026`))
    expect(buildWeeklyData(reservas, [])).toHaveLength(30)
  })

  it('mescla reservas de lab e tablet no mesmo dia', () => {
    const tabletWeek: WeekDayData[] = [{
      date: '17/09/2026',
      dayName: 'Qui',
      reservations: [{
        tipo: 'tablet',
        lab: 'Sala 1',
        time: '08:00 - 10:00',
        subject: 'Aula',
        professor: 'Prof. B',
        reservaFeitaPor: 'João',
        observacao: '',
      }],
    }]
    const out = buildWeeklyData([lab('17/09/2026')], tabletWeek)
    expect(out).toHaveLength(1)
    expect(out[0].reservations).toHaveLength(2)
    expect(out[0].reservations.map((r) => r.tipo).sort()).toEqual(['lab', 'tablet'])
  })

  it('propaga o "reservado por" da reserva de lab', () => {
    const out = buildWeeklyData([lab('16/09/2026')], [])
    expect(out[0].reservations[0].reservaFeitaPor).toBe('Maria')
  })
})
