# PC Care — Referência

> Rotas, tipos, componentes, hooks, serviços e chaves locais.

## Rotas

| Rota | Página | Descrição |
|------|--------|-----------|
| `/pc-care/` | Dashboard | Visão geral do status dos computadores |
| `/pc-care/pcs` | PCList | Lista de todos os computadores |
| `/pc-care/pcs/:id` | PCDetail | Detalhe de um computador |
| `/pc-care/pcs/:id/edit` | PCForm | Edição do computador |
| `/pc-care/assets` | PCList | Alias de `/pc-care/pcs` para o Registro de Ativos |
| `/pc-care/parts` | PartsList | Estoque de peças |
| `/pc-care/parts/consolidado` | StockConsolidado | Consolidado por laboratório |
| `/pc-care/qr` | QRGenerator | Gerador de QR Codes |
| `/pc-care/scanner` | QRScanner | Leitor de QR Code (rota fora do layout) |
| `/pc-care/checklists` | ChecklistTemplates | Templates de checklist |
| `/pc-care/checklists/:id/execute` | ChecklistExecute | Execução de checklist |
| `/pc-care/reports` | Reports | Relatórios e exportações |
| `/pc-care/maintenance` | Maintenance | Manutenção preventiva |
| `/pc-care/settings` | Settings | Configurações |

## Tipos

```typescript
interface PC {
  id: string
  labName: string          // Laboratório
  pcNumber: string         // Número do PC
  assetTag: string         // Patrimônio
  roomLocation: string     // Localização na sala
  specs: {
    cpu: string
    ram: string
    storage: string
  }
  config: {
    osType: 'windows10' | 'windows11' | 'linux' | 'macos' | ''
    osVersion: string
    osEdition: 'enterprise' | 'education' | ''
    pcType: 'academico' | 'administrativo' | ''
    domain: string         // animaedu.intranet | anima.intranet
  }
  cleaningStatus: 'pending' | 'in_progress' | 'done'
  restorationStatus: 'pending' | 'in_progress' | 'done'
  softwareInstalled: string[]
  partsReplaced: PCPart[]
  observations: string
  photos: string[]
  lastIntervention: string | null
}

type CleaningStatus = 'pending' | 'in_progress' | 'done'
type RestorationStatus = 'pending' | 'in_progress' | 'done'
type OSType = 'windows10' | 'windows11' | 'linux' | 'macos' | ''
```

## Funcionalidades por área

### Dashboard

- Visão geral do status de todos os computadores
- Contadores de pendentes, em andamento e concluídos
- Alertas de manutenção próxima
- Gráficos de status por laboratório

### Gestão de computadores

- **Cadastro e edição** de máquinas, com especificações, configuração e fotos
- **Exclusão** de registros obsoletos
- **Detalhe** com todas as informações da máquina
- **Filtros** por laboratório, status de limpeza e status de restauração
- **Operações em lote** sobre várias máquinas selecionadas

### Estoque de peças

- Cadastro de peças (SSD, HD, memória, fonte e outros)
- Vínculo de peças a computadores específicos
- Histórico de substituições por peça
- Alertas de reposição

### Checklists

- Templates de checklist customizáveis
- Execução com registro de status
- Histórico de checklists por computador

### Manutenção

- Agenda de manutenções preventivas
- Registro das manutenções realizadas
- Calendário visual
- Status: pendente, em andamento e concluído

### Relatórios

- Exportação em CSV, XLSX e PDF
- Filtros por período, laboratório e tipo
- Gráficos com Recharts
- Consolidado de estoque por laboratório

### Configurações

- Alternância entre tema claro e escuro
- Configurações de laboratório
- Modo kiosk/foco para tablets
- Backup manual, com exportação e importação de JSON

## Componentes

| Componente | Descrição |
|------------|-----------|
| `PCCard` | Card de computador com status e ações rápidas |
| `PCChecklistModal` | Modal de checklist de limpeza |
| `ActionTimeline` | Linha do tempo de atividades da máquina |
| `AddPartToPcModal` | Modal para vincular peça ao computador |
| `PCBatchBar` | Barra de ações em lote |
| `FilterBar` | Barra de filtros e busca |
| `StatusBadge` | Indicador colorido de status |
| `SyncStatusBadge` | Indicador de status de sincronização |
| `OnlineBanner` | Aviso de conexão online/offline |
| `Skeletons` | Estados de carregamento |
| `EmptyState` | Estado vazio com chamada para ação |
| `PullToRefresh` | Atualização por gesto nas listas |
| `Modal` | Modal genérico |
| `BottomNav` | Navegação inferior |

## Hooks

| Hook | Descrição |
|------|-----------|
| `usePCs` | CRUD e estado dos computadores |
| `useParts` | CRUD e estado das peças |
| `useChecklists` | Templates e execução de checklists |
| `useMaintenance` | Manutenção preventiva |
| `useActionLog` | Registro de ações realizadas |
| `useOnlineSync` | Sincronização online/offline |
| `useSyncToasts` | Avisos de sincronização |
| `useFocusMode` | Modo kiosk/foco |
| `useSwipeBack` | Navegação por gesto de voltar |

## Serviços

| Serviço | Descrição |
|---------|-----------|
| `pcService` | CRUD de computadores (com sync) |
| `partService` | CRUD de peças (com sync) |
| `partUsageService` | Histórico de uso de peças |
| `checklistService` | Templates e execuções de checklist |
| `maintenanceService` | Manutenção preventiva |
| `actionLogService` | Registro de ações |

## Chaves locais

| Chave | Conteúdo |
|-------|----------|
| `labhub_pcs` | Lista de computadores |
| `labhub_parts` | Lista de peças |
| `labhub_part_usage` | Histórico de uso de peças |
| `labhub_checklist_templates` | Templates de checklist |
| `labhub_pc_checklists` | Checklists executados |
| `labhub_maintenance` | Manutenções |
| `labhub_action_logs` | Registro de ações |
| `pcare_theme` | Tema da aplicação (`dark`/`light`) |

## Relacionados

- [Visão geral](README.md)
- [Referência do banco](../../reference/database.md)
- [Sincronização](../../platform/concepts/synchronization.md)
