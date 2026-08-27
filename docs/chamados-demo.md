# Chamados — Ambiente de Demonstracao

Guia rapido para criar, acessar, fotografar e limpar o ambiente DEMO do modulo Chamados.

---

## Criar o ambiente DEMO

```bash
python scripts/seed_chamados_demo.py
```

Ou apenas planejar sem gravar:

```bash
python scripts/seed_chamados_demo.py --dry-run
```

### Pre-requisitos

- `.env` com `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` preenchidos
- Python 3.10+ com `requests` instalado

### O que e criado

| Tipo | Qtd | Detalhes |
|------|-----|----------|
| Workspace | 1 | "Campus Demo LabHub" (slug: `demo-chamados`) |
| Tickets | 14 | Todos os status e prioridades |
| Eventos | ~25 | Timeline nos principais chamados |
| Feedback | 5 | Avaliacoes 4-5 estrelas |
| Fotos | 2 | Placeholders SVG (base64 inline) |

### Workspace DEMO

- **ID:** UUID deterministico (v5 baseado no slug)
- **Slug:** `demo-chamados`
- **Nome:** Campus Demo LabHub
- **Isolamento:** Todos os dados tem `workspace_id` deste workspace

---

## Acessar as telas

### Rotas para screenshots

| Tela | Rota | Descricao |
|------|------|-----------|
| Dashboard | `/chamados` | Visao geral operacional |
| Lista | `/chamados/tickets` | Fila de chamados |
| Detalhe ticket #1 | `/chamados/tickets/{id_ticket_1}` | Ticket "estrela" em atendimento |
| SLA | `/chamados/sla` | Analise de prazos |
| Relatorios | `/chamados/reports` | Estatisticas por periodo |
| QR Code | `/chamados/qr` | Poster para impressao |
| Formulario publico | `/chamados-publico/new` | Abertura de chamado |
| Acompanhar | `/chamados-publico/track` | Busca por nome |
| Feedback | `/chamados-publico/feedback/{id_ticket_6}` | Avaliacao pos-atendimento |

### Ticket principal (estrela)

**Ticket #1** — Laboratorio 01, Computador Desktop, prioridade alta, status "Em atendimento"

Este ticket contem:
- Sala, equipamento, patrimonio
- Descricao detalhada do problema
- Fotos (placeholder SVG)
- Responsavel atribuido
- 7 eventos na timeline
- Status note visivel
- SLA ativo

### Ticket para feedback

**Ticket #6** — Sala de Aula 201, Caixa de Som, resolvido, ★5

Fluxo completo:
1. `/chamados-publico/feedback/{id_ticket_6}`
2. Estrelas + comentario
3. Tela de agradecimento

### Ticket para track

Qualquer ticket funciona no track. Para testar:
1. Acesse `/chamados-publico/track`
2. Busque por: `Ana Martins`, `Carlos Mendes`, `Fernanda Souza`, `Pedro Santos` ou `Juliana Lima`

---

## Distribuicao dos tickets

| # | Sala | Problema | Status | Prioridade | Tecnico |
|---|------|----------|--------|------------|---------|
| 1 | Lab 01 | Computador nao liga | em_atendimento | alta | Rafael O. |
| 2 | Sala 102 | Projetor nao acende | a_caminho | urgente | Mariana C. |
| 3 | Lab 02 | Internet indisponivel | aberto | normal | — |
| 4 | Sala 101 | Projetor tremulando | aberto | alta | — |
| 5 | Lab 03 | Monitor piscando | em_atendimento | normal | Lucas A. |
| 6 | Sala 201 | Audio nao funciona | resolvido | alta | Rafael O. |
| 7 | Lab 01 | Switch com portas mortas | resolvido | normal | Mariana C. |
| 8 | Sala 101 | Teclado emperrado | resolvido | baixa | Lucas A. |
| 9 | Lab 02 | Computador lento | fechado | normal | Rafael O. |
| 10 | Sala 102 | Projetor amarelado | fechado | alta | Mariana C. |
| 11 | Lab 03 | Computador reiniciando | a_caminho | urgente | Lucas A. |
| 12 | Sala 201 | Projetor sem Wi-Fi | aberto | normal | — |
| 13 | Lab 01 | Switch com LEDs apagados | resolvido | urgente | Rafael O. |
| 14 | Sala 101 | Monitor pixel morto | em_atendimento | baixa | Mariana C. |

### SLA

| Ticket | Prioridade | SLA (horas) | Criado ha | Situacao |
|--------|-----------|-------------|-----------|----------|
| #1 | alta | 8h | 36h | Atrasado |
| #2 | urgente | 2h | 1.5h | Dentro do prazo |
| #11 | urgente | 2h | 24h | Atrasado |
| #12 | normal | 24h | 20h | Proximo do prazo |

---

## Screenshots recomendadas

| # | Tela | O que mostrar |
|---|------|---------------|
| 01 | QR Code | Poster com QR, instrucoes, aparencia para impressao |
| 02 | Formulario publico | Sala pre-identificada, categorias, descricao |
| 03 | Dashboard | Status, SLA, atrasados, satisfacao, tempo medio, salas |
| 04 | Lista | Multiplos tickets, filtros, prioridades, busca |
| 05 | Detalhe #1 | Ticket estrela completo com timeline |
| 06 | Em atendimento | Status, responsavel, acao disponivel |
| 07 | Mensagem professor | Status note visivel no detalhe |
| 08 | SLA | Compliance, atrasados, por prioridade |
| 09 | Relatorios | 30 dias, todas as metricas |
| 10 | Feedback | Estrelas, confirmacao |

---

## Limpar o ambiente DEMO

```bash
python scripts/cleanup_chamados_demo.py
```

Ou apenas verificar o que seria removido:

```bash
python scripts/cleanup_chamados_demo.py --dry-run
```

### O que o cleanup remove

- Workspace `demo-chamados`
- Todos os `chamados_tickets` com `workspace_id` do DEMO
- Todos os `ticket_events` com `workspace_id` do DEMO
- Fotos sao base64 inline (removidas com os tickets)

### O que NAO e afetado

- Dados de producao
- Workspaces existentes
- Outros tickets
- Configuracoes do sistema
- RLS ou autenticacao

### Confirmacao

O cleanup pede confirmacao digitando `DEMO-DELETE` antes de apagar.

---

## Seguranca

- RLS nao e alterado
- Service role usado apenas nos scripts (nunca no frontend)
- Todos os dados DEMO sao identificaveis pelo `workspace_id`
- Cleanup e cirurgico (filtra por workspace_id)
- Nenhum bypass permanente e criado
- Fotos sao placeholders SVG (sem pessoas reais)
- Nomes e emails sao ficticios (`@demo.labhub`)
