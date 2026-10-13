# Chamados Demo — Screenshots

Screenshots capturadas do modulo Chamados para apresentacao no Gamma.

**Viewport:** 390x844 (mobile — iPhone 14) — o modulo Chamados e mobile-first.

## Capturas

| Arquivo | Tela | Rota | Tamanho | Uso no slide |
|---------|------|------|---------|--------------|
| 01-qr-code.png | QR Code | `/chamados/qr` | 25KB | "Precisa de suporte?" |
| 02-formulario-publico.png | Formulario publico | `/chamados-publico/new` | 47KB | "Abra um chamado em segundos" |
| 03-acompanhamento.png | Acompanhamento | `/chamados-publico/track` | 16KB | "Acompanhe o atendimento" |
| 04-feedback.png | Feedback | `/chamados-publico/feedback/{id}` | 9KB | "Resolvido? Avalie." |
| 05-dashboard.png | Dashboard | `/chamados` | 107KB | "Visao completa da operacao" |
| 06-lista.png | Lista de chamados | `/chamados/tickets` | 114KB | "Todos os chamados organizados" |
| 07-atendimento.png | Atendimento | `/chamados/tickets/{id}` | 123KB | "Do chamado ao atendimento" |
| 08-sla.png | SLA | `/chamados/sla` | 55KB | "Controle de SLA" |
| 09-relatorios.png | Relatorios | `/chamados/reports` | 75KB | "Dados para melhorar a operacao" |
| 10-fluxo-completo.png | Fluxo completo | `/chamados` | 107KB | "O ciclo completo" |
| 11-detalhe-chamado.png | Detalhe (scroll) | `/chamados/tickets/{id}` | 119KB | Complementar ao 07 |
| 12-em-espera-acoes.png | Detalhe — ações Em espera / Indeferir | `/chamados/tickets/{id}` | 111KB | Issue #369 |
| 13-modal-colocar-em-espera.png | Modal "Colocar em espera" (motivo) | `/chamados/tickets/{id}` | 149KB | Issue #369 |
| 14-modal-indeferir.png | Modal "Indeferir chamado" (motivo) | `/chamados/tickets/{id}` | 153KB | Issue #369 |
| 15-chamado-em-espera.png | Estado Em espera + Retomar | `/chamados/tickets/{id}` | 66KB | Issue #369 |
| 16-chamado-indeferido.png | Estado Indeferido (card vermelho) | `/chamados/tickets/{id}` | 61KB | Issue #369 |
| 17-acompanhar-em-espera.png | Acompanhamento público — em espera | `/chamados-publico/track?token=…` | 24KB | Issue #369 |
| 18-acompanhar-indeferido.png | Acompanhamento público — indeferido | `/chamados-publico/track?token=…` | 27KB | Issue #369 |
| 19-resultado-indeferido.png | Resultado do indeferimento | `/chamados-publico/success/{id}?token=…` | 43KB | Issue #369 |

> As capturas **12–19** (issue #369) são geradas por um script próprio, que também
> verifica o texto esperado de cada tela antes de fotografar. Ver
> [Capturar as telas de Em espera / Indeferimento](#capturar-as-telas-de-em-espera--indeferimento-369).

## Dados visiveis

| Pagina | Conteudo |
|--------|----------|
| **Dashboard** | 3 Aberto, 2 A caminho, 3 Em atendimento, 4 Resolvido, 2 Arquivados |
| **Lista** | 12 ativos, filtros por status/prioridade |
| **Atendimento** | SLA atrasado ha 1d 6h, timeline com eventos, fotos |
| **SLA** | Cumprimento de prazos por periodo |
| **Relatorios** | 14 chamados no periodo, 19.6h tempo medio |
| **Track** | Busca por nome do professor |
| **Feedback** | Avaliacao 1-5 estrelas |
| **Em espera (#369)** | Card violeta, `Em espera — Aguardando equipamento/peça`, botão "Retomar atendimento" |
| **Indeferido (#369)** | Card vermelho `CHAMADO INDEFERIDO`, motivo e observação ao solicitante |
| **Track público (#369)** | `#15 Em espera — Aguardando equipamento/peça`; `#16 CHAMADO INDEFERIDO` + motivo + observação |

## Pre-requisitos

```bash
# 1. Flask backend (porta 5000)
cd api && python app.py &

# 2. Dev server (porta 5174)
npm run dev &

# 3. Seed demo data
python scripts/seed_chamados_demo.py

# 4. Capturar
BASE_URL=http://localhost:5174 node scripts/browser-verify/chamados-screenshots.mjs
```

**IMPORTANTE:** O Flask backend DEVE estar rodando para que o frontend busque os tickets.

## Capturar as telas de Em espera / Indeferimento (#369)

As capturas 12–19 vêm do script `scripts/browser-verify/chamados-espera-indeferido.mjs`,
que autentica com o usuário de demonstração, navega pelo app (rotas internas via
navegação SPA e rotas públicas em contexto anônimo) e fotografa cada estado. Antes
de fotografar, ele **verifica o texto esperado** de cada tela — se o conteúdo não
aparecer, a execução falha em vez de gravar uma tela errada.

```bash
# 1. Backend Flask (porta 5000), com as variáveis do .env carregadas
python api/app.py

# 2. Servidor de desenvolvimento (o script usa a porta 5173 por padrão)
npm run dev

# 3. Dados de demonstração (tickets #15 em_espera e #16 indeferido + tracking tokens)
python scripts/seed_chamados_demo.py

# 4. Captura
BASE_URL=http://localhost:5173 node scripts/browser-verify/chamados-espera-indeferido.mjs
```

O seed cria o workspace `demo-chamados` com os tickets #15/#16 e os *tracking
tokens* `DEMO-ESPERA-2026` e `DEMO-INDEFERIDO-2026` (somente o SHA-256 fica no
banco). O script precisa também de um **usuário de demonstração** com acesso ao
workspace — veja [Ambiente DEMO](../../guides/chamados-demo-environment.md).

Cenários cobertos (todos aprovados):

| # | Cenário | Como o script verifica antes de fotografar |
|---|---------|--------------------------------------------|
| 12 | Botões Em espera / Indeferir no detalhe | ambos os botões presentes |
| 13 | Modal Colocar em espera | título + motivo obrigatório |
| 14 | Modal Indeferir chamado | título + motivo obrigatório |
| 15 | Estado Em espera | `Em espera — …` + "Retomar atendimento" |
| 16 | Estado Indeferido | `CHAMADO INDEFERIDO` + motivo |
| 17 | Acompanhamento público em espera | `Em espera — …` |
| 18 | Acompanhamento público indeferido | `CHAMADO INDEFERIDO` + motivo |
| 19 | Resultado do indeferimento | `CHAMADO INDEFERIDO` + motivo |

## Cleanup

Nao executado. Dataset DEMO permanece disponivel.
```bash
python scripts/cleanup_chamados_demo.py
```
