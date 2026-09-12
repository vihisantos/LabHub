# Desenvolvimento

> Fluxo de trabalho do dia a dia no LabHub.

## Estrutura do projeto

```text
src/
├── apps/           # Aplicações (carregadas sob demanda)
│   ├── chamados/   # Chamados técnicos
│   ├── pcare/      # Inventário de computadores
│   ├── stock/      # Materiais e suprimentos
│   ├── reservalab/ # Reservas
│   └── tv/         # Murais digitais
├── core/           # Infraestrutura compartilhada
│   ├── auth/       # Autenticação
│   ├── workspaces/ # Multi-tenancy
│   ├── assets/     # Registro global de ativos
│   └── ...
├── lib/            # Utilitários e hooks compartilhados
│   ├── sync.ts     # Engine de sincronização
│   ├── storage.ts  # Camada de localStorage
│   └── ...
├── pages/          # Páginas de topo (launcher, roadmap)
└── platform/       # Código da plataforma
```

## Convenções

### Isolamento entre aplicações

- Aplicações não importam código de outras aplicações
- Código compartilhado vai para `core/` ou `lib/`
- Cada aplicação tem tema, rotas e serviços próprios

### Acesso a dados

```typescript
// Use a camada de serviço; nunca acesse o localStorage diretamente
const service = createSyncService<DataType>('collection_name')

service.getAll()
service.getById(id)
service.create(data)
service.update(id, data)
service.remove(id)
service.query(predicate)
```

### Componentes

- Um componente por arquivo
- Testes colocados em diretórios `__tests__/`
- Interfaces TypeScript para as props
- Prefira composição a configuração

### Estilos

- Classes utilitárias do Tailwind CSS v4
- Tokens de tema: `text-fg`, `bg-surface`, `border-line` etc.
- Responsivo com abordagem mobile-first e breakpoints `sm:`, `md:` e `lg:`

### Tratamento de erros

- Nunca use `alert()` — prefira erros em linha ou avisos por toast
- Erros de API aparecem na interface, não somente no console
- Falhas de sincronização são registradas e repetidas automaticamente

## Comandos

```bash
# Desenvolvimento
npm run dev              # Servidor de desenvolvimento
npm run build            # Build de produção
npm run preview          # Pré-visualização do build

# Qualidade
npm run lint             # oxlint
npx tsc -b --noEmit      # Verificação de tipos

# Testes
npm test                 # Todos os testes (modo watch)
npm run test:run         # Execução única
```

## Como adicionar funcionalidades

1. Verifique se a funcionalidade pertence a uma aplicação existente
2. Se pertencer, adicione em `pages/`, `components/` e `services/` daquela aplicação
3. Se for transversal, adicione em `core/` ou `lib/`
4. Se for uma aplicação nova, siga [Criar uma nova aplicação](adding-application.md)

## Relacionados

- [Configuração do ambiente](setup.md)
- [Testes](testing.md)
- [Criar uma nova aplicação](adding-application.md)
- [Arquitetura de frontend](../platform/architecture/frontend.md)
