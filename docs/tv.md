# TV — Canal Corporativo

> Sub-app para murais digitais e canais corporativos, com gestao de eventos, playlists de video/musica e modo display.

**Rota:** `/tv`  
**Cor:** `#ef4444` (red)

---

## API Backend

O TV possui backend proprio (Flask/Python) para integracao com YouTube API.

**Endpoints:**

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `POST` | `/api/tv/youtube/fetch` | Buscar metadados de videos/playlists do YouTube |
| `GET` | `/api/tv/health` | Status do servidor e configuracao da API |

**Variaveis de Ambiente:**

| Variavel | Obrigatorio | Descricao |
|----------|-------------|-----------|
| `YOUTUBE_API_KEY` | Sim | Chave da API do YouTube |

**Localizacao:** `src/apps/tv/api/app.py`

---

## Funcionalidades

### Modo Admin
- Gestao de eventos corporativos
- Criar, editar e remover eventos
- Upload de imagens via Cloudinary
- Ordem de exibicao customizavel
- Ativar/desativar eventos

### Gestao de Playlists
- Criar playlists de video (YouTube) e musica
- URLs do YouTube com duracao customizavel
- Ordem de reproducao
- Ativar/desativar itens

### Modo Display (TV)
- Exibicao em tela cheia para murais digitais
- Carousel de eventos com transicoes
- Player de video YouTube integrado
- Player de musica com controle de volume
- Audio de fundo configuravel
- Layout otimizado para resolucoes de TV

### Tipos de Conteudo
```typescript
type ContentType = 'video' | 'music' | 'events'
```

### Dados

```typescript
interface TvEvent {
  id: string
  title: string
  description: string | null
  image_url: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

interface TvPlaylist {
  id: string
  name: string
  type: 'video' | 'music'
  youtube_url: string
  duration_seconds: number
  is_active: boolean
  sort_order: number
  created_at: string
}
```

---

## Rotas

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/tv/` | AdminView | Painel de administracao |
| `/tv/display` | TvDisplay | Modo display (tela cheia) |

---

## Componentes

| Componente | Descricao |
|------------|-----------|
| `EventManager` | CRUD de eventos |
| `EventsCarousel` | Carousel de eventos no display |
| `PlaylistManager` | CRUD de playlists |
| `YouTubePlayer` | Player de video YouTube |
| `MusicPlayer` | Player de musica |
| `BackgroundAudio` | Audio de fundo |
| `CloudinaryUpload` | Upload de imagens para Cloudinary |

---

## Banco de Dados (Supabase)

### Tabela `tv_events`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | uuid | Chave primaria |
| `title` | text | Titulo do evento |
| `description` | text | Descricao (opcional) |
| `image_url` | text | URL da imagem (opcional) |
| `start_date` | timestamptz | Data de inicio |
| `end_date` | timestamptz | Data de fim |
| `is_active` | boolean | Ativo/inativo |
| `sort_order` | int | Ordem de exibicao |
| `created_at` | timestamptz | Data de criacao |

### Tabela `tv_playlists`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | uuid | Chave primaria |
| `name` | text | Nome da playlist |
| `type` | text | 'video' ou 'music' |
| `youtube_url` | text | URL do YouTube |
| `duration_seconds` | int | Duracao em segundos |
| `is_active` | boolean | Ativo/inativo |
| `sort_order` | int | Ordem de reproducao |
| `created_at` | timestamptz | Data de criacao |

### Indices

```sql
CREATE INDEX idx_tv_events_active ON tv_events(is_active, sort_order);
CREATE INDEX idx_tv_playlists_active ON tv_playlists(is_active, sort_order);
```

---

## Servico Supabase

O TV usa o Supabase diretamente (sem camada de sync local):

```typescript
// services/supabase.ts
// Conexao com Supabase para leitura/escrita de eventos e playlists
// Sem localStorage intermediario
```

---

## Uso Tipico

1. **Admin** acessa `/tv` para gerenciar eventos e playlists
2. **TV/Mural** acessa `/tv/display` em tela cheia
3. Eventos sao exibidos em carousel com transicoes
4. Videos/musica sao reproduzidos automaticamente
5. Alteracoes no admin refletem em tempo real no display
