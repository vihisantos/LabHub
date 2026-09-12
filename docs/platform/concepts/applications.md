# Aplicações

> O que são aplicações e como a plataforma se organiza em torno delas?

## O que é

Uma **aplicação** é uma unidade funcional independente dentro do LabHub. Cada aplicação tem rotas, serviços, componentes, tema e forma de acesso a dados próprios. No código, a lista de aplicações é declarada em `src/appRegistry.ts` e o código de cada uma fica em `src/apps/<aplicacao>/`.

## Por que

A modularidade permite:

- Desenvolvimento e evolução independentes
- Disponibilidade seletiva por workspace
- Separação clara de responsabilidades
- Menor bundle inicial, com carregamento sob demanda (*lazy loading*)

## Aplicações atuais

| Aplicação | Propósito | Acesso a dados |
|-----------|-----------|----------------|
| **Chamados** | Chamados técnicos e ordens de serviço | API Flask (`/api/chamados`) |
| **PC Care** | Inventário, limpeza e manutenção de computadores | localStorage + engine de sync |
| **Estoque** | Materiais e suprimentos | localStorage + engine de sync |
| **ReservaLab** | Reservas de laboratório e de tablets | Planilha (leitura) + Supabase (tablets) |
| **TV** | Murais digitais (eventos, vídeos, música, avisos) | Supabase direto, sem sync local |

Fazem parte da plataforma, e não dos aplicativos: **Dashboard**, **Administração** e o **Registro Global de Ativos** (capacidade de `core/assets`). Música é um recurso interno do TV, não uma aplicação separada.

## Estrutura de uma aplicação

Cada aplicação segue a mesma convenção:

```text
src/apps/<aplicacao>/
├── index.tsx          # Definição de rotas
├── layouts/           # Layout com navegação
├── pages/             # Páginas
├── components/        # Componentes da aplicação
├── hooks/             # Hooks próprios
├── services/          # Camada de acesso a dados
├── types/             # Tipos TypeScript
├── utils/             # Funções utilitárias
└── api/               # (ReservaLab e TV) Backend Python
```

## Regras de isolamento

- Aplicações **não importam** código de outras aplicações
- Dependências compartilhadas ficam em `core/` ou `lib/`
- Cada aplicação pode ser habilitada ou desabilitada por workspace
- O Chamados foi a primeira aplicação a implementar isolamento completo

## Relacionados

- [Criar uma nova aplicação](../../guides/adding-application.md)
- [Workspaces](workspaces.md) — como as aplicações são escopadas
- [Visão geral do sistema](system-overview.md)
- [ADRs](../decisions/README.md) — decisões sobre modularidade e isolamento
