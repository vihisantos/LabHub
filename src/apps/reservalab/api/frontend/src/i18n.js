import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  'pt-BR': {
    translation: {
      common: {
        appName: 'ReservasLab',
        dashboard: 'Dashboard',
        reservas: 'Reservas',
        atualizar: 'Atualizar',
        telaCheia: 'Tela Cheia',
        sairTelaCheia: 'Sair Tela Cheia',
        online: 'Online',
        offline: 'Offline',
        carregando: 'Carregando...',
        fechar: 'Fechar',
        buscar: 'Buscar',
        filtrar: 'Filtrar',
        todos: 'Todos',
        hoje: 'Hoje',
        semana: 'Esta Semana',
        lab01: 'Lab 01',
        lab02: 'Lab 02',
        faq: 'FAQ',
        tablets: 'Tablets'
      },
      nav: {
        subtitle: 'Sistema de reservas atualizado ao vivo'
      },
      reservas: {
        title: 'Gestão inteligente de laboratórios',
        subtitle: 'Consulte a disponibilidade em tempo real e verifique os agendamentos. Filtre por período ou visualize toda a grade da semana.',
        semReservas: 'Nenhuma reserva encontrada',
        horarios: 'Horários',
        responsavel: 'Responsável',
        alunos: 'Alunos',
        observacao: 'Observação',
        occupied: 'Ocupado',
        agora: 'AGORA',
        encerrada: 'Encerrada',
        disciplina: 'Disciplina',
        reservatorios: 'Reservatórios',
        reservasDoDia: 'Reservas do dia para este laboratório',
        proximos7dias: 'Próximos 7 Dias',
        labs01e02: 'Labs 01 + 02',
        professores: 'Professor'
      },
      dashboard: {
        title: 'Visão Geral',
        subtitle: 'Métricas em tempo real',
        reservasHoje: 'Reservas Hoje',
        totalSemana: 'Total da Semana',
        alunosProgramados: 'Alunos Programados',
        taxaOcupacao: 'Taxa de Ocupação',
        reservasPorDia: 'Reservas por Dia',
        reservasPorDiaSubtitle: 'Próxima semana',
        distribuicaoHorario: 'Distribuição por Horário',
        distribuicaoHorarioSubtitle: 'Horários mais solicitados',
        horarioPico: 'Horário Pico',
        horarioPicoDesc: 'O período das {{peakHour}} é o mais movimentado com {{maxOcupacao}}% das reservas. Considere alocações adicionais para esse horário.',
        lab01: 'Lab 01',
        lab02: 'Lab 02'
      },
      dias: {
        dom: 'Dom',
        seg: 'Seg',
        ter: 'Ter',
        qua: 'Qua',
        qui: 'Qui',
        sex: 'Sex',
        sab: 'Sáb'
      }
    }
  },
  'en-US': {
    translation: {
      common: {
        appName: 'ReservasLab',
        dashboard: 'Dashboard',
        reservas: 'Reservations',
        atualizar: 'Refresh',
        telaCheia: 'Fullscreen',
        sairTelaCheia: 'Exit Fullscreen',
        online: 'Online',
        offline: 'Offline',
        carregando: 'Loading...',
        fechar: 'Close',
        buscar: 'Search',
        filtrar: 'Filter',
        todos: 'All',
        hoje: 'Today',
        semana: 'This Week',
        lab01: 'Lab 01',
        lab02: 'Lab 02',
        faq: 'FAQ',
        tablets: 'Tablets'
      },
      nav: {
        subtitle: 'Live reservation system'
      },
      reservas: {
        title: 'Smart Laboratory Management',
        subtitle: 'Check real-time availability and view schedules. Filter by period or view the full week schedule.',
        semReservas: 'No reservations found',
        horarios: 'Time Slots',
        responsavel: 'Responsible',
        alunos: 'Students',
        observacao: 'Observation',
        occupied: 'Occupied',
        agora: 'NOW',
        encerrada: 'Ended',
        disciplina: 'Subject',
        reservatorios: 'Reservations',
        reservasDoDia: 'Today\'s reservations for this lab',
        proximos7dias: 'Next 7 Days',
        labs01e02: 'Labs 01 + 02',
        teachers: 'Teacher'
      },
      dashboard: {
        title: 'Overview',
        subtitle: 'Real-time metrics',
        reservasHoje: 'Reservations Today',
        totalSemana: 'Total This Week',
        alunosProgramados: 'Students Scheduled',
        taxaOcupacao: 'Occupancy Rate',
        reservasPorDia: 'Reservations by Day',
        reservasPorDiaSubtitle: 'Next week',
        distribuicaoHorario: 'Time Distribution',
        distribuicaoHorarioSubtitle: 'Most requested times',
        horarioPico: 'Peak Time',
        horarioPicoDesc: 'The period from {{peakHour}} is the busiest with {{maxOcupacao}}% of reservations. Consider additional allocations for this time slot.',
        lab01: 'Lab 01',
        lab02: 'Lab 02'
      },
      dias: {
        dom: 'Sun',
        seg: 'Mon',
        ter: 'Tue',
        qua: 'Wed',
        qui: 'Thu',
        sex: 'Fri',
        sab: 'Sat'
      }
    }
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    interpolation: {
      escapeValue: false
    }
  })

export default i18n