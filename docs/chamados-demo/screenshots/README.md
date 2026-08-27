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

## Cleanup

Nao executado. Dataset DEMO permanece disponivel.
```bash
python scripts/cleanup_chamados_demo.py
```
