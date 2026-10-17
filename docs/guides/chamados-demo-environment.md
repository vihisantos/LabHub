# Ambiente DEMO do Chamados

> Guia para criar, acessar, fotografar e limpar o ambiente de demonstração da aplicação Chamados.

## Criar o ambiente

```bash
python scripts/seed_chamados_demo.py
```

Para apenas planejar, sem gravar:

```bash
python scripts/seed_chamados_demo.py --dry-run
```

## Acessar

Depois do seed, a aplicação de demonstração fica disponível nas rotas públicas e do painel de TI:

| Rota | Tela |
|------|------|
| `/chamados/qr` | QR Code de acesso ao formulário |
| `/chamados-publico/new` | Formulário público de abertura |
| `/chamados-publico/track` | Acompanhamento por nome do professor |
| `/chamados-publico/feedback/:id` | Avaliação do atendimento |
| `/chamados` | Painel de TI |
| `/chamados/tickets` | Lista de chamados |
| `/chamados/tickets/:id` | Detalhe do atendimento |
| `/chamados/sla` | Cumprimento de prazos |
| `/chamados/reports` | Relatórios |

## Capturar telas

As capturas são feitas por scripts em `scripts/browser-verify/`, que gravam os arquivos em `docs/chamados-demo/screenshots/`:

| Script | Capturas | Telas |
|--------|----------|-------|
| `chamados-screenshots.mjs` | `01`–`11` | Visão geral do módulo (QR, formulário, painel, SLA, relatórios) |
| `chamados-espera-indeferido.mjs` | `12`–`19` | Em espera / Indeferimento (#369), interno e público |

Pré-requisitos:

```bash
# 1. Backend Flask (porta 5000)
cd api && python app.py &

# 2. Servidor de desenvolvimento (porta 5173 por padrão nos scripts)
npm run dev &

# 3. Dados de demonstração
python scripts/seed_chamados_demo.py

# 4. Captura
BASE_URL=http://localhost:5173 node scripts/browser-verify/chamados-screenshots.mjs
BASE_URL=http://localhost:5173 node scripts/browser-verify/chamados-espera-indeferido.mjs
```

**Importante:** o backend Flask precisa estar em execução, porque o frontend busca os chamados na API.

> **Sem ambiente local?** A execução E2E real também pode ser disparada sob demanda
> no GitHub Actions: workflow **"E2E Browser (manual)"** (`workflow_dispatch`,
> `.github/workflows/e2e-manual.yml`). Ele não é check obrigatório de PR — a
> aprovação continua dependendo apenas dos checks determinísticos (lint, testes,
> build, API Python e CodeQL). A escrita (seed) acontece **somente no modo
> local** do workflow e **somente no Supabase de demonstração autorizado**
> (allowlist em código + preflight fail-closed, environment `e2e-demo`); o modo
> remoto (`base_url` de um preview) **não faz seed nem escreve dados**.

### Usuário de demonstração

Os scripts internos autenticam com um usuário de demonstração com acesso ao
workspace `demo-chamados`. A senha **não** é versionada: segue a convenção dos
outros scripts, lendo o arquivo `.playwright-creds` (gitignored) no formato
`usuario;senha`, ou as variáveis de ambiente `DEMO_USER` / `DEMO_PASS`:

```bash
# .playwright-creds (não versionado)
demo-screenshots;SUA_SENHA_DE_DEMO
```

O usuário precisa de membership ativa no workspace `demo-chamados` e permissões
para operar chamados (o seed **não** cria o usuário — crie-o pelo cadastro normal
e aprove-o, concedendo acesso à unidade `Campus Demo LabHub`).

### Tracking tokens (#369)

O seed grava os tickets #15 (`em_espera`) e #16 (`indeferido`) com *tracking
tokens* determinísticos, usados nas telas públicas:

| Ticket | Estado | Token | URL de acompanhamento |
|--------|--------|-------|-----------------------|
| #15 | `em_espera` | `DEMO-ESPERA-2026` | `/chamados-publico/track?token=DEMO-ESPERA-2026` |
| #16 | `indeferido` | `DEMO-INDEFERIDO-2026` | `/chamados-publico/track?token=DEMO-INDEFERIDO-2026` |

Apenas o SHA-256 do token fica no banco (`tracking_token_hash`); o token em claro
é o link que o solicitante recebe.

As imagens capturadas e o significado de cada tela estão descritos em [`../chamados-demo/screenshots/README.md`](../chamados-demo/screenshots/README.md). O diretório `docs/chamados-demo/screenshots/` é referenciado por script e **não deve ser movido nem renomeado**.

## Limpar o ambiente

```bash
python scripts/cleanup_chamados_demo.py
```

## Relacionados

- [Chamados](../apps/chamados/README.md)
- [Referência do Chamados](../apps/chamados/reference.md)
