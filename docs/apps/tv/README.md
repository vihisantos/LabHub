# TV Desktop

> Aplicativo de murais digitais para TVs dos laboratórios (instalação desktop).

**Platform:** Windows Tauri Desktop · **Código:** `src/tv-desktop`

## Propósito

O TV Desktop alimenta os murais digitais dos laboratórios, exibindo eventos, vídeos, música, avisos e galerias de fotos. Ele funciona em modo kiosk (tela cheia) e requer ativação via pendrive USB.

## O que resolve

- Informação institucional chega às telas dos laboratórios sem intervenção manual em cada máquina
- Eventos institucionais, avisos urgentes e conteúdo multimídia têm um canal único
- Cada campus controla seu próprio conteúdo, isolado por workspace

## Principais funcionalidades

- **Eventos** — por campus, direcionados a uma TV específica (`tv_events.device_id`) ou a todo o campus (`NULL`, exibido em todas). O **ReservaLab** cria um evento diretamente na TV Desktop a partir de uma reserva, escolhendo a TV do campus que deve exibi-lo
- **Playlists de vídeo** — integração com o YouTube, com busca de metadados
- **Música** — filas de reprodução em segundo plano e pedidos de música
- **Avisos** — mensagens em rolagem, incluindo alertas urgentes por severidade
- **Galerias de fotos** — carrosséis de imagens
- **Gestão de dispositivos** — códigos de ativação via USB para as TVs
- **Instalação** — baixar instalador do GitHub Releases e ativar com pendrive USB

## Modo display

Apresentação em tela cheia com:

- Carrossel de eventos com transições
- Player de vídeo do YouTube
- Player de música com volume/mudo locais (persistidos no dispositivo)
- Áudio de fundo
- Layout otimizado para resoluções de TV

## Fluxo de conteúdo

```mermaid
flowchart LR
    DISP["Display"] -->|leitura direta| SB["Supabase - tabelas tv_*"]
    SB --> DISP
    ADMIN["Modo admin (web)] -->|metadados de vídeo| FL["API Flask - /api/*"]
    FL --> YT["YouTube API"]
```

## Instalação

O TV Desktop é distribuído como instalador `.msi` para Windows, gerado com Tauri:

```bash
npx tauri build
```

O instalador é publicado nas [Releases do labhub-tv](https://github.com/vihisantos/LabHub-TV/releases). O processo de ativação exige:

1. Baixar e instalar o instalador
2. Conectar pendrive USB com chave de ativação (fornecida pela equipe de TI)
3. Seguir o fluxo de ativação automático

## Criar eventos a partir do ReservaLab

No ReservaLab, uma reserva pode virar um evento na TV Desktop do campus: ao agendar ou visualizar uma reserva, o usuário escolhe **"Criar evento na TV"** e seleciona, entre as TVs ativadas do campus, qual deve exibi-lo. O evento é gravado em `tv_events` com `device_id` da TV escolhida e `is_active: true`, aparecendo no display no intervalo informado.

- Escopo por campus: só aparecem as TVs do workspace da reserva (`fetchWorkspaceDevices`)
- Se o campus não tem nenhuma TV ativada, o ReservaLab orienta a ativação
- O evento é independente da reserva na planilha

## Fonte de dados

- **Acesso direto ao Supabase** via backend Tauri Rust
- Tabelas `tv_*` no schema `public` (eventos, playlists, música, avisos, galerias, dispositivos)
- API do YouTube para metadados de vídeo

## Componentes do Desktop

O código do TV Desktop está em `src/tv-desktop/`:

- `main.tsx` - Entrada da aplicação desktop
- `DesktopApp.tsx` - Tela principal com gerenciamento de estado (loading, USB auth, recovery, ready)
- `DisplayShell.tsx` - Kiosk que renderiza a tela escolhida
- `ScreenRenderer.tsx` - Decisão de qual componente renderizar (TV Display ou CallsDashboardScreen)
- `config.ts` - Persistência de configurações via Tauri Store

## Arquitetura Tauri

O TV Desktop usa Tauri como backend nativo:

| Recurso | Implementação |
|---------|---------------|
| USB Auth | `src-tauri/src/usb_auth.rs` - Validação de chave USB embarcada |
| Drive Discovery | `src-tauri/src/main.rs` - Listagem de arquivos do Google Drive |
| Config Storage | Tauri Store API - Persistência duradoura |
| Commands | `invoke()` do frontend → handlers Rust |

## Relacionados

- [Visão geral da TV (módulo)](../../modules/tv/overview.md)
- [Referência de eventos](../../reference/events.md)
- [Glossário: Estação TV](../../glossary.md)