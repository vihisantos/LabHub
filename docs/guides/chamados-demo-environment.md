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

As capturas são feitas pelo script `scripts/browser-verify/chamados-screenshots.mjs`, que grava os arquivos em `docs/chamados-demo/screenshots/`.

Pré-requisitos:

```bash
# 1. Backend Flask (porta 5000)
cd api && python app.py &

# 2. Servidor de desenvolvimento (porta 5174)
npm run dev &

# 3. Dados de demonstração
python scripts/seed_chamados_demo.py

# 4. Captura
BASE_URL=http://localhost:5174 node scripts/browser-verify/chamados-screenshots.mjs
```

**Importante:** o backend Flask precisa estar em execução, porque o frontend busca os chamados na API.

As imagens capturadas e o significado de cada tela estão descritos em [`../chamados-demo/screenshots/README.md`](../chamados-demo/screenshots/README.md). O diretório `docs/chamados-demo/screenshots/` é referenciado por script e **não deve ser movido nem renomeado**.

## Limpar o ambiente

```bash
python scripts/cleanup_chamados_demo.py
```

## Relacionados

- [Chamados](../apps/chamados/README.md)
- [Referência do Chamados](../apps/chamados/reference.md)
