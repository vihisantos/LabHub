<p align="center">
  <img src="public/logo-192.png" alt="LabHub Logo" width="100" />
</p>

<h1 align="center">LabHub</h1>

<p align="center">
  <strong>Plataforma modular para gestao completa de laboratorios de informatica</strong>
</p>

<p align="center">
  <a href="https://lab-hub-pi.vercel.app">
    <img src="https://img.shields.io/badge/Acessar-Aplicacao-10b981?style=for-the-badge&logo=vercel&logoColor=white" alt="Acessar Aplicacao" />
  </a>
  <img src="https://img.shields.io/github/actions/workflow/status/vihisantos/LabHub/ci.yml?branch=main&style=for-the-badge&label=CI&logo=githubactions&logoColor=white" alt="CI Status" />
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT--Capybara--Holding-purple?style=for-the-badge" alt="License" />
</p>

---

<p align="center">
  PWA modular para gestao de PCs, estoque, reservas de laboratorios e murais digitais em ambientes universitarios.
</p>

<br />

## Visao Geral

O **LabHub** centraliza todas as operacoes de laboratorios de informatica em uma unica plataforma web progressiva. Desenvolvido para atender as necessidades reais de gestores de TI em campus universitarios, ele combina inventario de computadores, controle de estoque, reservas de salas e comunicacao visual em uma interface modular e moderna.

<br />

## Sub-apps

<table>
  <tr>
    <td width="80" align="center">
      <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/monitor.svg" width="32" />
    </td>
    <td>
      <strong><a href="docs/pcare.md">PCare</a></strong><br/>
      <sub>Gestao de PCs, limpeza, manutencao, checklists, QR codes e relatorios (CSV/XLSX/PDF)</sub>
    </td>
    <td width="80" align="center">
      <code>#06b6d4</code>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/package.svg" width="32" />
    </td>
    <td>
      <strong><a href="docs/stock.md">Estoque</a></strong><br/>
      <sub>Controle de materiais, movimentacoes, kits, inventario ciclico e entrada/saida</sub>
    </td>
    <td align="center">
      <code>#10b981</code>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/flask-conical.svg" width="32" />
    </td>
    <td>
      <strong><a href="docs/reservalab.md">ReservaLab</a></strong><br/>
      <sub>Reserva de laboratorios e tablets, dashboard com graficos, notificacoes push</sub>
    </td>
    <td align="center">
      <code>#6366f1</code>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/tv.svg" width="32" />
    </td>
    <td>
      <strong><a href="docs/tv.md">TV</a></strong><br/>
      <sub>Canal corporativo, murais digitais, playlists de video e musica</sub>
    </td>
    <td align="center">
      <code>#ef4444</code>
    </td>
  </tr>
</table>

<br />

## Stack Tecnica

<table>
  <tr>
    <td><strong>Frontend</strong></td>
    <td>React 19 · TypeScript 6 · Vite 8 · Tailwind CSS v4 · Radix UI · Framer Motion · Recharts</td>
  </tr>
  <tr>
    <td><strong>Dados</strong></td>
    <td>localStorage (offline-first) · Supabase PostgreSQL (sync remoto) · Cache com TTL</td>
  </tr>
  <tr>
    <td><strong>Backend</strong></td>
    <td>Flask (Python) · Vercel Serverless · SharePoint Excel · Upstash Redis</td>
  </tr>
  <tr>
    <td><strong>PWA</strong></td>
    <td>vite-plugin-pwa · Workbox · Service Worker · Web Push (VAPID)</td>
  </tr>
  <tr>
    <td><strong>Qualidade</strong></td>
    <td>Vitest · Testing Library · oxlint · GitHub Actions CI</td>
  </tr>
  <tr>
    <td><strong>Deploy</strong></td>
    <td>Vercel (automatico a cada push na main)</td>
  </tr>
</table>

<br />

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    Launcher (PWA)                     │
├──────────┬──────────┬──────────────┬────────────────┤
│  PCare   │  Stock   │  ReservaLab  │       TV       │
├──────────┴──────────┴──────────────┴────────────────┤
│              localStorage (fonte de verdade)          │
├─────────────────────────────────────────────────────┤
│           Engine de Sync (dirty-tracking)             │
├─────────────────────────────────────────────────────┤
│              Supabase (PostgreSQL remoto)              │
└─────────────────────────────────────────────────────┘
```

- **Offline-first**: Dados persistidos localmente, sincronizados em background
- **Modular**: Cada sub-app e independente com seu proprio contexto
- **Multi-lab**: Suporte a multiplos laboratorios com troca rapida

<br />

## Funcionalidades Principais

- Gestao completa de PCs com especificacoes, pecas e historico
- Checklists de limpeza e manutencao preventiva
- Controle de estoque com 7 secoes e subcategorias
- Movimentacoes de entrada/saida com timeline
- Kits com checklist de conferencia
- Inventario ciclico com divergencias
- Reserva de laboratorios e tablets
- Dashboard com graficos de ocupacao
- Murais digitais com carousel de eventos
- Player de video/music para TV corporativa
- QR codes para impressao e leitura via camera
- Relatorios exportaveis em CSV, XLSX e PDF
- Notificacoes push automaticas
- Tema dark/light por sub-app
- Modo kiosk/foco para tablets
- Backup manual (exportar/importar JSON)
- Rota publica de roadmap com progresso

<br />

## Documentacao

Documentacao detalhada de cada modulo esta disponivel na pasta `docs/`:

| Documento | Descricao |
|-----------|-----------|
| [Visao Geral](docs/README.md) | Sumario do projeto e stack |
| [Arquitetura](docs/arquitetura.md) | Estrutura de diretorios e padroes |
| [PCare](docs/pcare.md) | Sub-app de gestao de PCs |
| [Estoque](docs/stock.md) | Sub-app de controle de estoque |
| [ReservaLab](docs/reservalab.md) | Sub-app de reservas |
| [TV](docs/tv.md) | Sub-app de murais digitais |
| [API](docs/api.md) | Backend Flask (ReservaLab) |

<br />

## Roadmap

O roadmap publico esta disponivel em `/roadmap` dentro do app, com 75 features mapeadas por categoria de impacto.

**Progresso Atual:** ~65 features concluidas de 75 total

<br />

## Status

**Versao:** 1.0.0 · **Status:** Pre-release

- Camada de dados no localStorage (fonte de verdade local)
- Sync Supabase disponivel quando configurado
- Deploy automatico via Vercel

<br />

---

<p align="center">
  <sub>Desenvolvido com dedicacao para laboratorios de informatica universitarios.</sub>
</p>

<p align="center">
  <sub>Licenca MIT — Capybara Holding</sub>
</p>
