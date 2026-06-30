# Sistema de Reservas de Laboratorios & Inventario - Anhembi Morumbi

Sistema web para visualizacao e gerenciamento de reservas de laboratorios de informatica e inventario de equipamentos, integrado com planilhas do SharePoint/OneDrive.

## Tecnologias Utilizadas

### Backend
![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![OpenPyXL](https://img.shields.io/badge/OpenPyXL-217346?style=for-the-badge&logo=python&logoColor=white)
![Upstash Redis](https://img.shields.io/badge/Upstash_Redis-FF4438?style=for-the-badge&logo=redis&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

### Frontend
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![MUI](https://img.shields.io/badge/MUI-007FFF?style=for-the-badge&logo=mui&logoColor=white)
![Radix UI](https://img.shields.io/badge/Radix_UI-161618?style=for-the-badge&logo=radixui&logoColor=white)

### Deploy
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)

## Funcionalidades

- **Visualizacao em Tempo Real**: Dados sincronizados diretamente da planilha do SharePoint
- **Dashboard Intuitivo**: Interface moderna com Material UI + Radix UI
- **Reservas do Dia**: Visualizacao rapida das reservas de hoje (LAB01 e LAB02)
- **Reservas da Semana**: Visao semanal completa
- **Inventario de Equipamentos**: Consulta de computadores por laboratorio, consultorio e sala
- **Notificacoes Push**: Lembrete automatico 15 minutos antes de cada reserva
- **Reserva de Tablets**: Integracao com Supabase para gestao de tablets
- **Cache Inteligente**: Cache de 60s para reservas e 30min para inventario
- **PWA**: Instalavel como aplicativo no celular/desktop
- **Internacionalizacao (i18n)**: Suporte a multiplos idiomas
- **Status da API**: Indicador em tempo real da conexao com o servidor

## Como Executar Localmente

### Pre-requisitos
- Python 3.8+
- Node.js 18+
- Git

### 1. Clone o repositorio
```bash
git clone https://github.com/vihisantos/ReservaLab-UAM.git
cd ReservaLab-UAM
```

### 2. Configure as variaveis de ambiente
Crie um arquivo `.env` na raiz do projeto:
```env
# Obrigatorio
SHAREPOINT_URL=https://seu-sharepoint-url-aqui.com/reservas.xlsx?download=1

# Opcionais
INVENTARIO_URL=https://seu-sharepoint-url-aqui.com/inventario.xlsx?download=1
UPSTASH_REDIS_REST_URL=https://seu-upstash-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=seu-token-upstash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=suaservice-role-key
```

### 3. Instale as dependencias do backend
```bash
pip install -r requirements.txt
```

### 4. Execute a aplicacao
```bash
python app.py
```

Acesse: `http://localhost:5000`

### Desenvolvimento frontend + backend
```bash
npm run dev:all
```

## Estrutura do Projeto

```
ReservaLab-UAM/
├── api/                       # Modulos de logica (sem Flask)
│   ├── index.py              # Entry point da Vercel
│   └── invent.py             # Logica do inventario
├── frontend/                  # Codigo fonte do React
│   ├── src/                  # Componentes e logica
│   │   ├── layouts/          # Telas (Dashboard, FigmaReservas, Inventario)
│   │   ├── components/       # Componentes reutilizaveis
│   │   └── hooks/            # Hooks customizados
│   ├── public/               # Estaticos (manifest.json, sw.js para PWA)
│   ├── dist/                 # Build de producao (commitado)
│   └── vite.config.js
├── app.py                    # Servidor Flask principal (todas as rotas /api/*)
├── REGRAS_ARQUITETURA.md     # Regras de arquitetura do projeto
├── supabase_setup.sql        # Schema SQL para reserva de tablets
├── requirements.txt          # Dependencias Python
├── vercel.json               # Configuracao de deploy
└── .env                      # Variaveis de ambiente (nao commitado)
```

## API Endpoints

| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/api/health` | GET | Status da API e cache |
| `/api/reservas` | GET | Lista todas as reservas (hoje + semana) |
| `/api/inventario?aba=` | GET | Itens do inventario (filtro por aba) |
| `/api/inventario/abas` | GET | Abas disponiveis na planilha de inventario |
| `/api/push/subscribe` | POST | Inscrever para notificacoes push |
| `/api/push/test` | GET | Testar notificacoes push |
| `/api/push/check` | GET | Verificar e disparar pushes programados |

## Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `SHAREPOINT_URL` | Sim | URL de download da planilha de reservas |
| `INVENTARIO_URL` | Nao | URL de download da planilha de inventario |
| `UPSTASH_REDIS_REST_URL` | Nao | URL do Upstash Redis (push notifications) |
| `UPSTASH_REDIS_REST_TOKEN` | Nao | Token do Upstash Redis |
| `SUPABASE_URL` | Nao | URL do projeto Supabase (reserva de tablets) |
| `SUPABASE_SERVICE_KEY` | Nao | Service role key do Supabase |

## Scripts Disponiveis

### Frontend (diretorio `frontend/`)
```bash
npm run dev         # Desenvolvimento (Vite apenas)
npm run build       # Build de producao
npm run preview     # Preview do build
```

### Backend
```bash
python app.py                # Executar servidor Flask
python debug_parse.py        # Debug da planilha de reservas
python check_windows.py      # Script auxiliar Windows
python test_final.py         # Testes finais
python test_invent.py        # Testes do inventario
python test_mapping.py       # Testes de mapeamento
```

### Raiz do projeto
```bash
npm run dev:all     # Backend + Frontend simultaneamente
npm run build       # Build completo (frontend + copia para dist/)
npm run start       # Iniciar servidor em producao
```

## Deploy na Vercel

1. Faca fork deste repositorio
2. Acesse vercel.com e importe o repositorio
3. Configure as variaveis de ambiente na Vercel:
   - `SHAREPOINT_URL` (obrigatorio)
   - `INVENTARIO_URL` (opcional)
   - `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (opcional)
   - `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` (opcional)
4. Deploy automatico ao fazer push na branch `main`!

## Formato da Planilha de Reservas

A planilha deve conter a aba **"RESERVA LAB. INFORMÁTICA"** com as colunas:

| Coluna | Descricao |
|--------|-----------|
| A | Reserva feita por |
| B | Professor responsavel |
| C | E-mail |
| D | Data da reserva |
| E | Horario |
| F | Quantidade de alunos |
| G | Observacao/Motivo |
| I | Laboratorio (LAB01 ou LAB02) |

## Formato da Planilha de Inventario

A planilha de inventario aceita abas nos seguintes formatos:

| Tipo de Aba | Colunas esperadas |
|-------------|-------------------|
| Consultorios | Processador, Service TAG, Hostname, Local, Ambiente, MAC, Armazenamento, Memoria RAM, SO |
| Lab. Informatica | Nome, Localizacao, Ambiente, Patrimonio, Tipo de Dispositivo, N° Serie, Status, Modelo |
| PCs Sala | Sala, Ambiente |

## Notificacoes Push

O sistema suporta notificacoes push via Web Push API com Upstash Redis:

1. O usuario se inscreve via `POST /api/push/subscribe`
2. A cada 1 minuto, `GET /api/push/check` verifica reservas com inicio nos proximos 15 min
3. Dispara notificacao com lab, horario, professor e observacao
4. Tambem verifica reservas de tablets no Supabase

## Banco de Dados (Tablets)

Para usar reserva de tablets, execute o script `supabase_setup.sql` no SQL Editor do Supabase. Isso criara a tabela `tablet_reservations` com RLS liberado.

## Contribuicao

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudancas (`git commit -m 'Add nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licenca

Projeto pessoal desenvolvido para uso na organizacao.
Dados fornecidos via API da Anima Educacao.

## Autor

**Manoel Vitor Santos Santana**
- Email: manoel.santana@animaeducacao.com.br
- GitHub: [@vihisantos](https://github.com/vihisantos)
