# Ativos

> O que é um ativo no LabHub e como ele é rastreado?

## O que é

Um **ativo** é um bem físico de TI (computador, monitor, impressora) rastreado no Registro Global de Ativos. Cada ativo pertence a um workspace e possui atributos como número de patrimônio, número de série, tipo de equipamento, fabricante e modelo.

## Por que existe

Antes do Registro Global de Ativos, os dados de ativos ficavam espalhados entre o PC Care (computadores) e o Estoque (periféricos), sem visão unificada. O registro passou a oferecer uma fonte única de verdade para todos os bens físicos dos campi.

## Como funciona

### Registro Global (`public.assets`)

O registro vive no Supabase com RLS completo:

- Cada ativo tem um `asset_tag` único por workspace
- Ciclo de status: `draft` → `active` → `maintenance` → `retired`
- Extensão por metadados JSONB para dados específicos de aplicação
- Escopo por workspace via políticas de RLS

### Relação com as aplicações

- **PC Care** continua gerenciando dados detalhados de computadores (especificações, configuração, peças) em sua própria coleção
- **Estoque** gerencia materiais e periféricos em sua própria coleção
- **Registro Global** oferece a visão unificada sobre ambos

As coleções coexistem: são coleções, tipos e schemas distintos.

### Fluxo de dados

```text
Usuário cria ou atualiza um ativo
    ↓
src/core/patrimonio/ (Supabase direto, RLS)
    ↓
public.assets / patrimonio_locations / patrimonio_responsibles / asset_movements
    ↓
Filtro por RLS (patrimonio.view / asset.create / asset.edit / asset.move)
```

> Atualizado no PR-2 (#289): o caminho antigo via `core/assets/global-repository.ts`
> + IndexedDB foi removido; a custódia muda por `asset_movements`. Ver
> [`docs/patrimonio/data-layer.md`](../../patrimonio/data-layer.md).

## Segurança

- **RLS** — verifica membership ativa do usuário no workspace (função `user_belongs_to_workspace()`, migration 049), com bypass para super admin. A função lê `memberships` (não mais `profiles.workspace_ids`).
- **Sincronização** — usa o cliente autenticado (JWT do usuário), não `service_role`
- **Defesa em profundidade** — `workspaceStore.filter()` no frontend é a segunda barreira

## Relacionados

- [Arquitetura: Registro global de ativos](../architecture/asset-registry.md)
- [Camada de dados](../architecture/data-layer.md)
- [Referência do banco](../../reference/database.md)
