# Estoque — Referência

> Rotas, tipos, componentes, hooks, serviços e chaves locais.

## Rotas

| Rota | Página | Descrição |
|------|--------|-----------|
| `/stock/` | StockDashboard | Visão geral com gráficos |
| `/stock/items` | StockSectionPage | Itens por seção |
| `/stock/items/:id` | StockDetail | Detalhe de um item |
| `/stock/movements` | MovementsPage | Histórico de movimentações |
| `/stock/kits` | KitList | Lista de kits |
| `/stock/kits/:id` | KitDetail | Detalhe de um kit |
| `/stock/inventory` | InventoryList | Inventário cíclico |
| `/stock/inventory/:id` | InventoryDetail | Detalhe do inventário |
| `/stock/qr` | QRGenerator | Gerador de QR Codes |
| `/stock/qr-scan` | StockQRScanner | Leitor de QR Code (tela cheia, fora do layout) |
| `/stock/entry-exit` | StockEntryExit | Entrada e saída rápida |
| `/stock/maintenance` | StockMaintenance | Manutenção preventiva |
| `/stock/pipeline` | Pipeline | Pipeline de manutenção |
| `/general-stock/*` | — | Alias do mesmo aplicativo, usado pelo atalho PWA "Estoque Geral" |

## Tipos

```typescript
type StockItemStatus = 'ativo' | 'em_conserto' | 'descartado' | 'emprestado'
type MovementType = 'entrada' | 'saida' | 'emprestimo' | 'devolucao' | 'transferencia'
type KitStatus = 'ok' | 'incompleto' | 'nao_conferido'

interface StockItem {
  id: string
  name: string
  section: StockSection
  subcategory: string
  serialNumber: string
  room: string
  status: StockItemStatus
  condition: string           // Bom | Regular | Danificado
  notes: string
  cableType?: string          // Para cabos
  cableLength?: string        // Para cabos
  connectorType?: string      // Para adaptadores
  outletCount?: number        // Para adaptadores
  linkedPcId?: string         // Vínculo com um computador do PC Care
  linkedPcLabel?: string      // Rótulo do computador vinculado
  photos?: string[]           // Fotos do item
}
```

## Funcionalidades por área

### Dashboard

- Resumo de itens por seção
- Gráficos de distribuição (barras e pizza)
- Tendências de movimentação
- Precisão do inventário

### Gestão de itens

- Cadastro com seção, subcategoria e número de série
- Edição, exclusão e duplicação de itens (a duplicação reaproveita os dados existentes)
- Detalhe com todas as informações do item
- Upload e visualização de fotos

### Movimentações

- Histórico completo de entradas e saídas
- Tipos: entrada, saída, empréstimo, devolução e transferência
- Registro de quem realizou a movimentação
- Linha do tempo por item

### Kits

- Agrupamento de itens para uso conjunto
- Checklist de conferência
- Status do kit: completo ou incompleto
- Vínculo dos itens que compõem o kit

### Inventário cíclico

- Contagem física periódica
- Comparação com os dados do sistema
- Divergências destacadas
- Histórico dos inventários realizados

### Entrada e saída

- Fluxo rápido de entrada e saída de itens
- Movimentação registrada automaticamente
- Validação de disponibilidade em estoque

### Manutenção preventiva

- Calendário de manutenções por equipamento
- Status: pendente, agendada e concluída
- Histórico de manutenções

### QR Codes

- Geração de QR Codes para itens
- Layout A4 com etiquetas adesivas (nome, número de série e QR)
- Leitura integrada para localizar itens

## Componentes

| Componente | Descrição |
|------------|-----------|
| `StockCard` | Card de item com status e ações |
| `StockForm` | Formulário de cadastro e edição |
| `StockBottomNav` | Navegação inferior |
| `SectionTabs` | Abas de navegação entre seções |
| `MovementForm` | Formulário de movimentação |
| `MovementTimeline` | Linha do tempo de movimentações |
| `KitCard` | Card de kit com status |
| `KitChecklist` | Checklist de conferência de kit |
| `StockBatchBar` | Barra de ações em lote |
| `StatusBadge` | Indicador colorido de status |

## Hooks

| Hook | Descrição |
|------|-----------|
| `useStock` | CRUD e estado dos itens |
| `useMovements` | Movimentações de entrada e saída |
| `useKits` | Gestão de kits |
| `useInventory` | Inventário cíclico |
| `useStockMaintenance` | Manutenção preventiva |
| `useStockPhotos` | Upload e gestão de fotos |

## Serviços

| Serviço | Descrição |
|---------|-----------|
| `stockService` | CRUD de itens (com sync) |
| `movementService` | Movimentações (com sync) |
| `kitService` | Kits (com sync) |
| `inventoryService` | Inventário cíclico (com sync) |
| `stockMaintenanceService` | Manutenção preventiva (com sync) |
| `stockPhotoService` | Fotos dos itens |

## Chaves locais

| Chave | Conteúdo |
|-------|----------|
| `labhub_stock_items` | Lista de itens |
| `labhub_stock_movements` | Movimentações |
| `labhub_stock_kits` | Kits |
| `labhub_stock_inventory` | Inventário cíclico |
| `labhub_stock_maintenance` | Manutenções |
| `labhub_stock_photos` | Fotos dos itens |
| `stock_theme` | Tema da aplicação (`dark`/`light`) |

## Relacionados

- [Visão geral](README.md)
- [Referência do banco](../../reference/database.md)
- [Sincronização](../../platform/concepts/synchronization.md)
