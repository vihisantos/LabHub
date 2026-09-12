# ADR-005 — Padrão de isolamento entre aplicações

## Status

Aceita

## Contexto

À medida que o LabHub cresceu de 4 para mais aplicações, as dependências cruzadas viraram risco. Importar código de outra aplicação cria acoplamento oculto, aumenta o bundle e dificulta habilitar ou desabilitar aplicações de forma independente.

## Decisão

Impor isolamento estrito entre aplicações:

- Aplicações **não importam** código de outras aplicações (`src/apps/outra-aplicacao/`)
- Código compartilhado passa por `core/` ou `lib/`
- Cada aplicação tem tema, rotas, serviços e tipos próprios
- Um workspace pode ter qualquer subconjunto de aplicações habilitado

O Chamados foi a primeira aplicação a implementar isolamento completo; as demais seguem o mesmo padrão.

## Alternativas consideradas

1. **Bibliotecas compartilhadas entre aplicações** — criariam acoplamento e dependências de bundle
2. **Aplicação monolítica única** — não permite habilitar e desabilitar aplicações seletivamente
3. **Micro-frontends (Module Federation)** — complexidade desproporcional ao tamanho do projeto

## Consequências

### Positivas

- Cada aplicação pode ser habilitada ou desabilitada de forma independente
- Fronteiras de responsabilidade claras
- Bundles menores por aplicação, graças ao carregamento sob demanda
- Testes de cada aplicação de forma isolada

### Negativas

- Alguma duplicação de código entre aplicações, considerada aceitável
- Tipos compartilhados precisam viver em `core/` ou `lib/`

## Relacionados

- `src/apps/` — diretórios das aplicações
- [Conceitos: Aplicações](../concepts/applications.md)
