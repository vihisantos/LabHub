# Estoque — Controle de Materiais

> Sub-app para gestao completa de materiais e suprimentos do laboratorio, com movimentacoes, kits, inventario ciclico e entrada/saida.

**Rota:** `/stock`  
**Cor:** `#10b981` (emerald)

---

## Funcionalidades

### Dashboard
- Resumo de itens por secao
- Graficos de distribuicao (barras/pizza)
- Tendencias de movimentacao
- Precisao de inventario

### Gestao de Itens
- **Cadastro**: Criar itens com secao, subcategoria, numero de serie
- **Edicao**: Atualizar dados de qualquer item
- **Exclusao**: Remover itens
- **Duplicar**: Copiar item existente com dados pre-preenchidos
- **Detalhe**: Visualizar todas as informacoes de um item
- **Fotos**: Upload e visualizacao de fotos dos itens

### Secoes de Estoque

| Secao | Subcategorias |
|-------|---------------|
| Maquinas | Notebook, Desktop, Monitor, Impressora |
| Perifericos | Mouse, Teclado, Webcam, Caixa de Som, Headset |
| Material de Escritorio | Papel, Caneta, Fita, Envelope |
| Adaptadores | USB-C, HDMI, VGA, Rede, Energia |
| Equipamentos | SSD, HD, RAM, Fonte |
| Cabos | HDMI, VGA, USB, Rede, Extensao, Energia |
| Outros | (livre) |

### Status de Itens
```typescript
type StockItemStatus = 'ativo' | 'em_conserto' | 'descartado' | 'emprestado'
```

### Condicoes
- Bom
- Regular
- Danificado

### Especificacoes de Itens
```typescript
interface StockItem {
  id: string
  name: string
  section: StockSection
  subcategory: string
  serialNumber: string
  room: string
  status: StockItemStatus
  condition: string
  notes: string
  cableType?: string          // Para cabos
  cableLength?: string        // Para cabos
  connectorType?: string      // Para adaptadores
  outletCount?: number        // Para adaptadores
  linkedPcId?: string         // Vinculo com PC
  linkedPcLabel?: string      // Label do PC vinculado
  photos?: string[]           // Fotos do item
}
```

### Movimentacoes
- Historico completo de entradas e saidas
- Tipos: entrada, saida, emprestimo, devolucao, transferencia
- Registro de quem fez a movimentacao
- Timeline visual de movimentacoes por item

### Kits
- Agrupamento de itens para uso conjunto
- Checklist de conferencia de kit
- Status do kit (completo/incompleto)
- Vinculacao de itens do kit

### Inventario Ciclico
- Contagem fisica periodica
- Comparacao com dados do sistema
- Divergencias destacadas
- Historico de inventarios realizados

### Entrada/Saida
- Fluxo rapido de entrada e saida de itens
- Movimentacao automatica registrada
- Validacao de estoque disponivel

### Manutencao Preventiva
- Calendario de manutencoes para equipamentos
- Status: pendente, agendada, concluida
- Historico de manutencoes

### QR Codes
- **Gerador**: Criar QR codes para itens
- **Scanner**: Leitor de QR code integrado para localizar itens
- **Etiquetas**: Layout A4 com etiquetas adesivas (nome/série/QR)

---

## Rotas

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/stock/` | StockDashboard | Visao geral com graficos |
| `/stock/items` | StockSectionPage | Itens por secao |
| `/stock/items/:id` | StockDetail | Detalhe de um item |
| `/stock/movements` | MovementsPage | Historico de movimentacoes |
| `/stock/kits` | KitList | Lista de kits |
| `/stock/kits/:id` | KitDetail | Detalhe de um kit |
| `/stock/inventory` | InventoryList | Inventario ciclico |
| `/stock/inventory/:id` | InventoryDetail | Detalhe do inventario |
| `/stock/qr` | QRGenerator | Gerador de QR codes |
| `/stock/qr-scan` | StockQRScanner | Scanner QR |
| `/stock/entry-exit` | StockEntryExit | Entrada/Saida rapida |
| `/stock/maintenance` | StockMaintenance | Manutencao preventiva |

---

## Componentes

| Componente | Descricao |
|------------|-----------|
| `StockCard` | Card de item com status e acoes |
| `StockForm` | Formulario de cadastro/edicao |
| `StockBottomNav` | Navegacao inferior do Stock |
| `SectionTabs` | Tabs para navegacao entre secoes |
| `MovementForm` | Formulario de movimentacao |
| `MovementTimeline` | Timeline de movimentacoes |
| `KitCard` | Card de kit com status |
| `KitChecklist` | Checklist de conferencia de kit |
| `StockBatchBar` | Barra de acoes em lote |
| `StatusBadge` | Badge de status colorido |

---

## Hooks

| Hook | Descricao |
|------|-----------|
| `useStock` | CRUD e estado dos itens |
| `useMovements` | Movimentacoes de entrada/saida |
| `useKits` | Gestao de kits |
| `useInventory` | Inventario ciclico |
| `useStockMaintenance` | Manutencao preventiva |
| `useStockPhotos` | Upload e gestao de fotos |

---

## Servicos

| Servico | Descricao |
|---------|-----------|
| `stockService` | CRUD de itens (sync) |
| `movementService` | Movimentacoes (sync) |
| `kitService` | Kits (sync) |
| `inventoryService` | Inventario ciclico (sync) |
| `stockMaintenanceService` | Manutencao preventiva (sync) |
| `stockPhotoService` | Fotos dos itens |

---

## Dados Locais (localStorage)

| Chave | Conteudo |
|-------|----------|
| `labhub_stock_items` | Lista de itens |
| `labhub_stock_movements` | Movimentacoes |
| `labhub_stock_kits` | Kits |
| `labhub_stock_inventory` | Inventario ciclico |
| `labhub_stock_maintenance` | Manutencao |
| `labhub_stock_photos` | Fotos dos itens |
| `stock_theme` | Tema do Stock (dark/light) |
