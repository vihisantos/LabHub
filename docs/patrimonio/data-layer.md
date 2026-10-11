# Patrimônio — camada de dados (`src/core/patrimonio/`)

Issue #289 · PR-2. Este módulo é a **fronteira de dados** do Patrimônio
institucional de TI com o Supabase. Não contém UI, não é importado por telas
ainda, e **não** participa do motor de sincronização local-first (`src/lib/sync.ts`).
O motivo está em [Por que fora do sync](#por-que-fora-do-sync).

## Escopo

- Tipos que espelham **exatamente** o schema real (migrations `024`, `091`–`096`).
- Repositórios de leitura/escrita para locais, responsáveis, ativos e movimentos.
- Validação de entrada e tradução de erros do PostgREST.
- Escopo por unidade (workspace) e delegação da **autorização** à RLS/RBAC do banco.

Fora de escopo (PRs futuros): telas, integração PC Care ↔ Patrimônio, importação
em massa, integração com o motor de sync.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `types.ts` | Enums reais (status, condição, tipo de movimento), linhas e entradas; guards. |
| `errors.ts` | `PatrimonioError`, códigos estáveis e tradução de códigos do Postgres. |
| `client.ts` | `requireDb()`, `activeWorkspaceId()` (fail-closed), leitura de campos sem `any`. |
| `mappers.ts` | `unknown → tipo`, protegendo a borda contra drift de schema. |
| `locations.ts` | `patrimonio_locations` (091). |
| `responsibles.ts` | `patrimonio_responsibles` (092). |
| `assets.ts` | `public.assets` (024 + 093) — apenas campos **frios**. |
| `movements.ts` | `asset_movements` (094) — **único** caminho de mutação de custódia. |
| `index.ts` | Barrel. |

## Mapa do schema (o que o banco garante)

- `public.assets` (024 + 093): campos **frios** (nome, tipo, tombo, série,
  fabricante, modelo, notas, metadata) e campos de **custódia**
  (`location_id`, `responsible_id`, `status`). `condition` (estado físico:
  `novo|bom|regular|danificado|inservivel`) é **fria** e independente do status.
- `patrimonio_locations` (091) e `patrimonio_responsibles` (092): escopados por
  `workspace_id`. Responsável é institucional — `matricula`, `email` e
  `profile_id` são **todos opcionais**; um responsável sem conta LabHub é válido.
- `asset_movements` (094): **append-only**. Sem policy/grant de UPDATE/DELETE
  (nem super admin). Tipos: `criacao`, `transferencia`, `responsavel`,
  `emprestimo`, `devolucao`, `manutencao`, `baixa`, `inventario`, `correcao`.

### Custódia muda só por movimento

O banco bloqueia UPDATE direto de `location_id`/`responsible_id`/`status`
(trigger `patrimonio_assets_guard`, `pg_trigger_depth() <= 1`). A única via é
`INSERT` em `asset_movements`; a trigger `patrimonio_apply_movement`
(BEFORE INSERT) aplica o efeito no ativo **na mesma transação**, com lock
(`SELECT … FOR UPDATE`), validação de unidade e regras de estado.

Por isso `assetsRepository` só escreve campos frios e `movementsRepository`
expõe **apenas** `register`. **Não existe** um `updateAsset + registerMovement`
no cliente: isso seria duas escritas independentes, não atômicas, e colidiria
com a guarda do banco. A atomicidade é da transação do banco, não da camada.

Campos de autoria/proveniência (`performed_by`, `performed_by_nome`, `source`,
`import_batch_id`) são preenchidos pela trigger a partir da sessão — o cliente
nunca os envia, e um `criacao` enviado pelo cliente é rejeitado.

## Uso

```ts
import {
  assetsRepository,
  locationsRepository,
  responsiblesRepository,
  movementsRepository,
  PatrimonioError,
} from '@/core/patrimonio' // ou caminho relativo a partir de src/

// Criar um ativo (campos frios; status nasce 'draft')
const asset = await assetsRepository.create({
  name: 'Notebook Dell',
  equipment_type: 'Notebook',
  serial_number: 'SN-123',
})

// Listar com filtros + paginação
const disponiveis = await assetsRepository.list({ status: 'disponivel', limit: 50 })

// Mover (ATÔMICO: aplica custódia no ativo na mesma transação)
await movementsRepository.register({
  asset_id: asset.id,
  type: 'transferencia',
  to_location_id: 'uuid-do-local',
  to_status: 'disponivel',
})

// Empréstimo (exige responsável + devolução prevista)
await movementsRepository.register({
  asset_id: asset.id,
  type: 'emprestimo',
  to_responsible_id: 'uuid-do-responsavel',
  expected_return_at: '2026-07-01T00:00:00Z',
})

// Histórico
const historico = await movementsRepository.listByAsset(asset.id)
```

Erros são sempre `PatrimonioError`, com `code` estável
(`permission_denied`, `conflict`, `invalid_reference`, `invalid_value`,
`not_found`, `validation`, `no_workspace`, `not_configured`, `query_failed`),
`message` segura para exibição e `diagnostic` (bruto, só para log):

```ts
try {
  await assetsRepository.create(input)
} catch (e) {
  if (e instanceof PatrimonioError) {
    toast.error(e.message)          // seguro
    logger.warn(e.code, e.diagnostic) // técnico
  }
}
```

## Autorização (não é esta camada)

A autorização é do banco, resolvida por RLS + RBAC (`user_has_action`):

- ler → `patrimonio.view` (tec, coordinator);
- criar/editar ativo → `patrimonio.asset.create` / `patrimonio.asset.edit` (tec);
- mover → `patrimonio.asset.move` (tec);
- locais/responsáveis → `patrimonio.locations.manage` / `responsibles.manage`;
- vis/lider: nenhum. Super admin: bypass na policy.

A camada de dados **não** reimplementa permissão no cliente. Ela apenas: usa o
cliente da **sessão** (`defaultDb` com o token do Auth — nunca `service_role`),
exige uma unidade ativa (fail-closed) e escopa por `workspace_id`. O RBAC de UI
(esconder botões) é responsabilidade de `useCanAccessAction`, não daqui.

## Por que fora do sync

O Patrimônio **não** foi integrado ao motor local-first (`src/lib/sync.ts`)
porque o encaixe é inseguro:

1. **Append-only × upsert/delete.** O sync faz `upsert`/`delete` genéricos.
   `asset_movements` não aceita UPDATE/DELETE e validaria INSERTs de forma
   diferente — o histórico poderia ser corrompido.
2. **camelCase × snake_case.** O motor compara `updatedAt` (camelCase), mas
   `public.assets`/`asset_movements` são snake_case (`updated_at`). O
   "última escrita vence" nunca reconciliaria de fato — foi exatamente o bug
   latente do mapeamento legado `global_assets → assets`.
3. **Atomicidade.** O efeito no ativo é transacional no banco. Uma escrita
   otimista local criaria um **segundo** caminho de mutação, não atômico,
   proibido pelo contrato do 094.

A leitura também é sempre fresca do banco (RLS), o que é desejável para um
inventário institucional. Se um dia a integração for necessária, ela deve ser
desenhada como uma coleção **read-only** com pull paginado e sem pusher de
custódia — fora do escopo deste PR.

### Volume / paginação

O sync puxa coleções inteiras com `select('*')` sem paginação. No Patrimônio a
camada já nasce paginada: `assets.list` usa `range` com limite padrão **200**
(máx. 1000) e `movementsRepository.listByAsset/listRecent` com limite padrão
**100** (máx. 500). O índice `idx_asset_movements_asset (asset_id, created_at desc)`
atende o histórico por ativo.

## Modelo legado removido

O PR-2 removeu o protótipo morto que duplicava `public.assets`:

- `src/core/assets/global-repository.ts`
- `src/core/assets/global-types.ts` (`GlobalAsset`, cujo `GlobalAssetStatus` —
  `active|maintenance|retired` — nem correspondia ao CHECK real)
- `src/core/assets/__tests__/global-asset.test.ts`
- o mapeamento `global_assets → assets` em `src/lib/sync.ts` (`REMOTE_DB`/`TABLE_NAME_MAP`)
- a coleção `global_assets` em `src/lib/db.ts`

`src/core/assets/{service,types,useAssets}.ts` **não** foram tocados: são outro
conceito (consolidação para o seletor de ativos do Chamados).

## Limitações conhecidas

- **Sem UI**: nada consome o módulo ainda.
- **Sem integração PC Care**: a convivência PC Care ↔ Patrimônio é PR futuro.
- **Importação em massa** (`import.run`) não implementada — a tabela e a coluna
  `import_batch_id` existem, mas o fluxo é separado.
- **Cross-workspace no INSERT de ativo**: a camada não permite local/responsável
  na criação (eles entram por movimento, que valida a unidade), mas o banco, por
  si só, não valida a unidade de um `location_id`/`responsible_id` informado num
  INSERT direto de `assets`. Documentado como limitação do schema (não desta
  camada); o caminho suportado (criar frio → mover) está correto.
