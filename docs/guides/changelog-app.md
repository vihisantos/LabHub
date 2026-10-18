# Guia de manutenção — Changelog da home

> Como adicionar, editar e marcar itens no changelog exibido na tela `/changelog` (anteriormente `/roadmap`).

## Onde fica

O componente está em `src/pages/Changelog.tsx`. Os dados são um array estático chamado `RELEASES`.

## Estrutura de dados

```typescript
interface ChangelogItem {
  id: string            // identificador único (kebab-case, sem espaços)
  type: 'bug' | 'melhoria'
  title: string         // título curto
  desc: string          // descrição resumida
  done: boolean         // true = entregue (✓), false = pendente (☐)
}

interface Release {
  version: string       // ex: 'v2.2.0' ou 'Em breve'
  date: string          // ex: '07 de setembro de 2026'
  title: string         // nome da atualização
  bugs: ChangelogItem[] // seção "Corrigido"
  melhorias: ChangelogItem[] // seção "Melhoria"
}
```

## Como adicionar uma nova atualização

1. Crie um novo objeto `Release` no array `RELEASES`, ordenado do mais novo para o mais antigo.
2. Use `version` e `date` para identificar a atualização.
3. Adicione itens em `bugs` (correções de bugs) e/ou `melhorias` (novas funcionalidades).
4. Cada item precisa de um `id` único no kebab-case.

Exemplo:

```typescript
{
  version: 'v2.3.0',
  date: '15 de outubro de 2026',
  title: 'Dashboard do Coordenador',
  bugs: [],
  melhorias: [
    {
      id: 'coord-dashboard',
      type: 'melhoria',
      title: 'Dashboard consolidado por unidades',
      desc: 'Visão geral de chamados, equipes e indicadores por unidade.',
      done: false,
    },
  ],
},
```

## Como marcar um item como entregue

Altere o campo `done` de `false` para `true`. O componente exibe automaticamente:

- ✓ (quadradinho preenchido em verde) para entregues
- ☐ (quadradinho vazio cinza) para pendentes
- Texto riscado para itens entregues

## Como adicionar um bug corrigido

Coloque o item na seção `bugs` da release correspondente, com `type: 'bug'`. Ele aparecerá na seção "Corrigido" com destaque em vermelho.

## Como adicionar uma melhoria

Coloque o item na seção `melhorias` da release correspondente, com `type: 'melhoria'`. Ele aparecerá na seção "Melhoria" com destaque em verde-esmeralda.

## Rota e links

- Rota: `/changelog` (a rota antiga `/roadmap` redireciona automaticamente)
- Links de navegação atualizados em: Launcher, HomeView, DashboardPage, GlobalPresenceIndicator e moduleVisibility
- O componente antigo `src/pages/Roadmap.tsx` foi excluído

## Estatísticas

O componente calcula automaticamente o percentual de progresso geral e por release, baseado nos campos `done` de todos os itens.

## Relacionados

- [CHANGELOG.md (raiz)](../CHANGELOG.md) — changelog técnico detalhado por versão
- [Roadmap RBAC 2.0, mascote e multiunidades](../platform/architecture/roadmap-rbac2.0-mascote-multiunidades.md) — roadmap de negócio futuro