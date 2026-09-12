# Visão geral do sistema

> O que é o LabHub e por que ele existe?

O LabHub é um *Progressive Web App* (PWA) modular para gestão de laboratórios de informática em campi universitários. Ele reúne inventário de computadores, controle de estoque, reservas de laboratório, chamados de suporte e murais digitais em uma única plataforma.

## O problema

Equipes de TI de laboratórios universitários trabalham com ferramentas fragmentadas: planilhas para reservas, checklists em papel, sistemas separados para estoque e para chamados. O resultado é dado espalhado, coordenação manual e pouca visibilidade da operação.

## O que o LabHub faz

- **Rastreia ativos físicos** — computadores, periféricos e itens de estoque em vários campi
- **Gerencia reservas** — agendamento de laboratórios, empréstimo de tablets e visão de calendário
- **Trata solicitações de suporte** — abertura pública de chamados, controle de SLA e atribuição de técnicos
- **Exibe informação** — murais digitais com eventos, vídeos, músicas e avisos
- **Funciona offline** — operação completa sem internet, sincronizando quando houver conexão

## Princípios de arquitetura

1. **Modular** — cada aplicação é independente, com rotas, serviços e tema próprios
2. **Offline-first** — o `localStorage` é a fonte de verdade; o Supabase sincroniza em segundo plano
3. **Isolado por workspace** — todo dado é isolado por campus/unidade
4. **Progressivo** — instalável como PWA, funciona em celular, tablet e desktop
5. **Multi-tenant** — um usuário pode pertencer a vários workspaces

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Dados (local) | localStorage com `createLocalService()` |
| Dados (remoto) | Supabase PostgreSQL com RLS |
| Backend | Flask (Python) em Vercel Serverless |
| Realtime | Supabase Realtime (WebSocket) |
| Notificações | Web Push (VAPID) com Upstash Redis |
| Qualidade | Vitest, Testing Library, oxlint |
| Deploy | Vercel (automático em push para `main`) |

## Relacionados

- [Arquitetura do sistema](../architecture/system.md) — como a plataforma funciona por dentro
- [Workspaces](workspaces.md) — modelo de multi-tenancy
- [Aplicações](applications.md) — como a plataforma se organiza em aplicações
- [Offline-first](offline-first.md) — estratégia local-first
