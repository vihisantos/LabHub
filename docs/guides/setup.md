# Configuração do ambiente

> Como preparar o ambiente de desenvolvimento do LabHub.

## Pré-requisitos

- **Node.js** 18 ou superior (recomendado usar LTS)
- **Python** 3.10 ou superior (para a API Flask)
- **Git**
- **npm** (gerenciador de pacotes do projeto)

## 1. Clonar e instalar

```bash
git clone https://github.com/vihisantos/LabHub.git
cd LabHub
npm install
```

## 2. Variáveis de ambiente

Copie o arquivo de exemplo e preencha os valores:

```bash
cp .env.example .env
```

### Obrigatórias para funcionalidade completa

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima do Supabase |

### Opcionais

| Variável | Descrição |
|----------|-----------|
| `VITE_RESERVALAB_API_URL` | URL da API Flask (padrão: `/api` relativo) |
| `VITE_VAPID_PUBLIC_KEY` | Chave pública de Web Push |
| `VITE_APP_VERSION` | Versão exibida nas configurações |

> **Sem as variáveis do Supabase**, a aplicação roda em modo somente local (`localStorage`, sem sincronização).

As variáveis do backend (Flask) estão em [Referência: configuração](../reference/configuration.md).

## 3. Iniciar o desenvolvimento

```bash
npm run dev
```

A aplicação fica disponível em `http://localhost:5173`.

## 4. Backend (opcional)

Necessário para o Chamados e para notificações push:

```bash
pip install -r requirements.txt
cd api && python -m pytest tests/ -q
```

Em produção, a API Flask roda como Vercel Serverless. Para desenvolvimento local, ela pode ser executada separadamente.

## 5. Verificar

- Abra `http://localhost:5173`
- O launcher deve aparecer com as aplicações disponíveis
- Navegue até alguma aplicação para confirmar que ela carrega

## Configuração do editor

### Extensões recomendadas (VS Code)

- Tailwind CSS IntelliSense
- ESLint
- Prettier
- GitLens

### TypeScript

O projeto usa `tsconfig.app.json` para o código da aplicação e `tsconfig.node.json` para a configuração de build.

## Relacionados

- [Desenvolvimento](development.md)
- [Testes](testing.md)
- [Referência: configuração](../reference/configuration.md)
