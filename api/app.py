import sys, os, re, secrets, hashlib, json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs, quote

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'apps', 'reservalab', 'api'))
from app import app, _SUPABASE_URL, _SUPABASE_SERVICE_KEY, _supabase_headers, _target_subs, push_notify, redis, logger

import requests
from flask import jsonify, request


# ── Cloudinary (helpers compartilhados) ──

def _cloudinary_public_id(image_url: str) -> str | None:
    """Extrai o public_id de uma URL do Cloudinary (folder/public_id.sem_ext).

    Usa apenas operações de string (sem regex) para evitar ReDoS com URLs
    controladas pelo usuário.
    """
    cloud_name = os.environ.get('VITE_CLOUDINARY_CLOUD_NAME') or os.environ.get('CLOUDINARY_CLOUD_NAME', '')
    if not cloud_name or cloud_name not in image_url:
        return None
    marker = '/image/upload/'
    idx = image_url.find(marker)
    if idx < 0:
        return None
    raw = image_url[idx + len(marker):]
    # Remove o prefixo de versão opcional (ex.: v1234567890/)
    slash = raw.find('/')
    if raw[:1] == 'v' and slash > 0 and raw[1:slash].isdigit():
        raw = raw[slash + 1:]
    # Remove query string e fragmento
    raw = raw.split('?', 1)[0].split('#', 1)[0]
    # Remove a extensão de imagem
    for ext in ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf'):
        if raw.lower().endswith(ext):
            raw = raw[:-len(ext)]
            break
    return raw or None


def _cloudinary_destroy(image_url: str) -> bool:
    """Apaga uma imagem do Cloudinary pelo secure_url. Retorna True se o destroy foi aceito."""
    public_id = _cloudinary_public_id(image_url)
    if not public_id:
        return False
    cloud_name = os.environ.get('VITE_CLOUDINARY_CLOUD_NAME') or os.environ.get('CLOUDINARY_CLOUD_NAME', '')
    api_key = os.environ.get('CLOUDINARY_API_KEY', '')
    api_secret = os.environ.get('CLOUDINARY_API_SECRET', '')
    if not cloud_name or not api_key or not api_secret:
        return False
    import base64
    auth = base64.b64encode(f'{api_key}:{api_secret}'.encode()).decode()
    destroy_url = f'https://api.cloudinary.com/v1_1/{cloud_name}/image/destroy'
    try:
        resp = requests.post(
            destroy_url,
            data={'public_id': public_id},
            headers={'Authorization': f'Basic {auth}'},
            timeout=10,
        )
        if not resp.ok:
            return False
        return resp.json().get('result') == 'ok'
    except Exception:
        return False


def _is_valid_photo(value: str) -> bool:
    """Aceita base64 (fallback) ou URL do Cloudinary. Rejeita URLs arbitrárias."""
    value = (value or '').strip()
    if not value:
        return True
    if value.startswith('data:image/'):
        return True
    cloud_name = os.environ.get('VITE_CLOUDINARY_CLOUD_NAME') or os.environ.get('CLOUDINARY_CLOUD_NAME', '')
    if cloud_name and value.startswith(f'https://res.cloudinary.com/{cloud_name}/image/upload/'):
        return True
    return False


# ── TV: YouTube API ──

def iso_duration_to_seconds(duration: str) -> int:
    if not duration:
        return 0
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration)
    if not m:
        return 0
    h = int(m.group(1) or 0)
    mi = int(m.group(2) or 0)
    s = int(m.group(3) or 0)
    return h * 3600 + mi * 60 + s


def parse_youtube_url(url: str) -> dict | None:
    try:
        u = urlparse(url)
        host = u.hostname.replace('www.', '') if u.hostname else ''
        qs = parse_qs(u.query)

        if host in ('youtube.com', 'm.youtube.com'):
            playlist_id = qs.get('list', [None])[0]
            video_id = qs.get('v', [None])[0]
            if playlist_id and video_id:
                return {'type': 'playlist', 'videoId': video_id, 'playlistId': playlist_id}
            elif playlist_id:
                return {'type': 'playlist', 'playlistId': playlist_id}
            elif video_id:
                return {'type': 'video', 'videoId': video_id}
        elif host == 'youtu.be':
            video_id = u.path.lstrip('/').split('/')[0]
            if video_id:
                return {'type': 'video', 'videoId': video_id}
    except Exception:
        pass
    return None


@app.route('/api/tv/youtube/fetch', methods=['POST'])
def tv_youtube_fetch():
    try:
        data = request.get_json()
        url = (data or {}).get('url', '')
        if not url:
            return jsonify({'error': 'URL é obrigatória'}), 400

        parsed = parse_youtube_url(url)
        if not parsed:
            return jsonify({'error': 'URL do YouTube inválida'}), 400

        api_key = os.environ.get('YOUTUBE_API_KEY')
        if not api_key:
            return jsonify({'error': 'YouTube API key não configurada'}), 500

        tracks = []

        if parsed['type'] == 'playlist':
            playlist_id = parsed['playlistId']
            pl_url = (
                f'https://www.googleapis.com/youtube/v3/playlistItems'
                f'?part=snippet,contentDetails&playlistId={playlist_id}'
                f'&maxResults=50&key={api_key}'
            )
            resp = requests.get(pl_url, timeout=15)
            if not resp.ok:
                return jsonify({'error': f'Erro YouTube API: {resp.status_code}'}), 502
            pl_data = resp.json()

            items = pl_data.get('items', [])
            video_ids = [
                item['contentDetails']['videoId']
                for item in items if 'contentDetails' in item
            ]

            if not video_ids:
                return jsonify({'tracks': []})

            vid_url = (
                f'https://www.googleapis.com/youtube/v3/videos'
                f'?part=snippet,contentDetails&id={",".join(video_ids)}&key={api_key}'
            )
            vresp = requests.get(vid_url, timeout=15)
            if vresp.ok:
                vdata = vresp.json()
                vid_map = {}
                for vitem in vdata.get('items', []):
                    vid = vitem.get('id', '')
                    title = vitem.get('snippet', {}).get('title', 'Sem título')
                    dur = iso_duration_to_seconds(
                        vitem.get('contentDetails', {}).get('duration', '')
                    )
                    vid_map[vid] = {'title': title, 'duration': dur}

                for vid in video_ids:
                    info = vid_map.get(vid, {'title': 'Sem título', 'duration': 0})
                    tracks.append({
                        'videoId': vid,
                        'title': info['title'],
                        'duration': info['duration'],
                    })
            else:
                for vid in video_ids:
                    tracks.append({'videoId': vid, 'title': 'Carregando...', 'duration': 0})
        else:
            video_id = parsed['videoId']
            vid_url = (
                f'https://www.googleapis.com/youtube/v3/videos'
                f'?part=snippet,contentDetails&id={video_id}&key={api_key}'
            )
            resp = requests.get(vid_url, timeout=15)
            if not resp.ok:
                return jsonify({'error': f'Erro YouTube API: {resp.status_code}'}), 502
            vdata = resp.json()
            items = vdata.get('items', [])
            if items:
                item = items[0]
                tracks.append({
                    'videoId': video_id,
                    'title': item.get('snippet', {}).get('title', 'Sem título'),
                    'duration': iso_duration_to_seconds(
                        item.get('contentDetails', {}).get('duration', '')
                    ),
                })

        return jsonify({'tracks': tracks})

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/tv/youtube/search', methods=['POST'])
def tv_youtube_search():
    """Busca músicas no YouTube por nome (sem precisar colar URL)."""
    try:
        data = request.get_json() or {}
        q = str(data.get('q', '')).strip()
        if not q:
            return jsonify({'error': 'Informe o nome da música'}), 400
        max_results = max(1, min(int(data.get('maxResults', 8)), 20))

        api_key = os.environ.get('YOUTUBE_API_KEY')
        if not api_key:
            return jsonify({'error': 'YouTube API key não configurada'}), 500

        url = (
            'https://www.googleapis.com/youtube/v3/search'
            f'?part=snippet&type=video&videoCategoryId=10'
            f'&q={quote(q)}&maxResults={max_results}&key={api_key}'
        )
        resp = requests.get(url, timeout=15)
        if not resp.ok:
            return jsonify({'error': f'Erro YouTube API: {resp.status_code}'}), 502
        data_resp = resp.json()

        results = []
        for item in data_resp.get('items', []):
            snippet = item.get('snippet', {})
            video_id = item.get('id', {}).get('videoId', '')
            if not video_id:
                continue
            thumbnails = snippet.get('thumbnails', {})
            thumb = thumbnails.get('medium') or thumbnails.get('default') or {}
            results.append({
                'videoId': video_id,
                'title': snippet.get('title', 'Sem título'),
                'channel': snippet.get('channelTitle', ''),
                'thumbnail': thumb.get('url', ''),
            })

        return jsonify({'results': results})

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/tv/calendar/extract', methods=['POST'])
def tv_calendar_extract():
    try:
        data = request.get_json() or {}
        pdf_url = data.get('url', '')
        semester_code = data.get('semester_code', '26/2')
        end_date_str = data.get('end_date', '2026-12-18')

        if not pdf_url:
            return jsonify({'error': 'URL do PDF é obrigatória'}), 400

        # Download PDF
        resp = requests.get(pdf_url, timeout=30)
        if not resp.ok:
            return jsonify({'error': f'Falha ao baixar PDF: HTTP {resp.status_code}'}), 502

        from pypdf import PdfReader
        import io

        pdf_file = io.BytesIO(resp.content)
        reader = PdfReader(pdf_file)

        full_text = []
        for i, page in enumerate(reader.pages):
            txt = page.extract_text()
            if txt:
                full_text.append(txt)

        text_content = "\n".join(full_text)

        # Regex parser para capturar itens no formato "DD - Titulo" ou "DD a DD - Titulo"
        lines = text_content.split('\n')
        extracted_events = []
        pattern = re.compile(r'^(\d{1,2}(?:\s*a\s*\d{1,2})?)\s*[-–—]\s*(.+)$')

        months_map = {
            'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
            'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
            'outubro': 10, 'novembro': 11, 'dezembro': 12
        }

        current_month = 8 # Padrão 2º semestre (agosto)

        for line in lines:
            line_clean = line.strip()
            if not line_clean:
                continue

            # Verificar se é cabeçalho de mês
            for m_name, m_num in months_map.items():
                if m_name in line_clean.lower():
                    current_month = m_num
                    break

            match = pattern.match(line_clean)
            if match:
                day_part = match.group(1).strip()
                title_part = match.group(2).strip()

                # Limpar encoding e ruídos comuns
                title_part = title_part.encode('latin1', 'ignore').decode('utf-8', 'ignore') if not any(c in title_part for c in 'ãõçáéíóú') else title_part

                extracted_events.append({
                    'id': f'cal_{len(extracted_events) + 1}',
                    'day_part': day_part,
                    'title': title_part,
                    'month': current_month,
                    'semester_code': semester_code,
                    'is_academic_calendar': True
                })

        expires_at = f"{end_date_str}T23:59:59Z"

        return jsonify({
            'success': True,
            'semester_code': semester_code,
            'expires_at': expires_at,
            'total_events': len(extracted_events),
            'events': extracted_events
        })

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/tv/youtube/live', methods=['GET'])
def tv_youtube_live():
    """
    Verifica se o canal da faculdade está ao vivo no YouTube.
    Usa um channel_id fixo ou configurado como variável de ambiente.
    """
    try:
        api_key = os.environ.get('YOUTUBE_API_KEY')
        if not api_key:
            return jsonify({'isLive': False, 'error': 'API key não configurada'}), 200

        channel_id = os.environ.get('YOUTUBE_CHANNEL_ID', '')
        if not channel_id:
            return jsonify({'isLive': False, 'error': 'Channel ID não configurado'}), 200

        # YouTube Data API v3: search for active live broadcasts
        search_url = (
            f'https://www.googleapis.com/youtube/v3/search'
            f'?part=snippet&channelId={channel_id}'
            f'&eventType=live&type=video'
            f'&order=date&maxResults=1&key={api_key}'
        )

        resp = requests.get(search_url, timeout=10)
        if not resp.ok:
            return jsonify({'isLive': False, 'error': f'YouTube API erro: {resp.status_code}'}), 200

        data = resp.json()
        items = data.get('items', [])

        if not items:
            return jsonify({'isLive': False})

        live_item = items[0]
        snippet = live_item.get('snippet', {})
        video_id = live_item.get('id', {}).get('videoId', '')

        # Buscar estatísticas (viewer count)
        stats_url = (
            f'https://www.googleapis.com/youtube/v3/videos'
            f'?part=liveStreamingDetails,snippet'
            f'&id={video_id}&key={api_key}'
        )
        stats_resp = requests.get(stats_url, timeout=10)
        viewer_count = None
        if stats_resp.ok:
            stats_data = stats_resp.json()
            stats_items = stats_data.get('items', [])
            if stats_items:
                live_details = stats_items[0].get('liveStreamingDetails', {})
                viewer_count = live_details.get('concurrentViewers')
                if viewer_count is not None:
                    viewer_count = int(viewer_count)

        return jsonify({
            'isLive': True,
            'channelTitle': snippet.get('channelTitle', ''),
            'videoId': video_id,
            'title': snippet.get('title', ''),
            'thumbnailUrl': snippet.get('thumbnails', {}).get('high', {}).get('url', ''),
            'viewerCount': viewer_count,
        })

    except Exception as e:
        logger.error("Erro em tv_youtube_live: %s", e, exc_info=True)
        return jsonify({'isLive': False, 'error': 'Erro interno'}), 200


@app.route('/api/tv/cloudinary/delete', methods=['POST'])
def tv_cloudinary_delete():
    """
    Deleta uma imagem do Cloudinary pelo seu secure_url.
    Requer CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET configurados no ambiente.
    """
    try:
        data = request.get_json() or {}
        image_url = data.get('image_url', '')
        if not image_url:
            return jsonify({'success': False, 'error': 'image_url é obrigatório'}), 400

        cloud_name = os.environ.get('VITE_CLOUDINARY_CLOUD_NAME') or os.environ.get('CLOUDINARY_CLOUD_NAME', '')

        if not cloud_name:
            return jsonify({'success': False, 'error': 'Cloudinary cloud_name não configurado'}), 200

        if not os.environ.get('CLOUDINARY_API_KEY') or not os.environ.get('CLOUDINARY_API_SECRET'):
            return jsonify({'success': False, 'error': 'Cloudinary API key/secret não configurados'}), 200

        public_id = _cloudinary_public_id(image_url)
        if not public_id:
            return jsonify({'success': False, 'error': 'URL não é uma imagem do Cloudinary válida'}), 200

        destroyed = _cloudinary_destroy(image_url)
        return jsonify({
            'success': destroyed,
            'result': 'ok' if destroyed else 'not_found',
            'public_id': public_id,
        })

    except Exception as e:
        logger.error("Erro em tv_cloudinary_delete: %s", e, exc_info=True)
        return jsonify({'success': False, 'error': 'Erro interno'}), 200


@app.route('/api/tv/health', methods=['GET'])
def tv_health():
    api_key_configured = bool(os.environ.get('YOUTUBE_API_KEY'))
    channel_configured = bool(os.environ.get('YOUTUBE_CHANNEL_ID'))
    return jsonify({
        'status': 'ok',
        'youtube_api_key_configured': api_key_configured,
        'youtube_channel_configured': channel_configured,
    })


# ── TV: Código de ativação do app desktop ──

def _generate_activation_code():
    """Código de 6 caracteres sem caracteres ambíguos (0/O, 1/I)."""
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return ''.join(secrets.choice(alphabet) for _ in range(6))


def _require_supabase():
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return None
    return True


def require_module(workspace, module_id):
    """Verifica se module_id está habilitado no workspace.

    Retorna None se permitido, ou uma tupla (flask.Response, int) se bloqueado.
    ``workspace`` deve ser o dict já carregado do Supabase (contendo
    ``disabled_apps`` ou não).  Fail-open: se workspace for None ou vazio,
    permite a execução.
    """
    if not workspace:
        return None
    disabled = workspace.get('disabled_apps') or []
    if module_id in disabled:
        return jsonify({
            'error': 'MODULE_DISABLED',
            'module': module_id,
            'message': 'Este módulo não está habilitado neste workspace.',
        }), 403
    return None


@app.route('/api/tv/activation/create', methods=['POST'])
def tv_activation_create():
    """
    Gera um código de ativação para o app desktop da TV.
    Requer o token de acesso do usuário logado (Supabase) via Bearer.
    O código é vinculado ao primeiro workspace do usuário (ou ao escolhido,
    se super admin), tem validade de 24h e uso único.
    """
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        token = (request.headers.get('Authorization') or '').replace('Bearer ', '').strip()
        if not token:
            return jsonify({'error': 'Token de autenticação ausente'}), 401

        # 1. Valida o JWT do usuário via Supabase Auth
        auth_resp = requests.get(
            f'{_SUPABASE_URL}/auth/v1/user',
            headers={'apikey': _SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        if not auth_resp.ok:
            return jsonify({'error': 'Sessão inválida ou expirada. Faça login novamente.'}), 401
        auth_user = auth_resp.json()
        user_id = auth_user.get('id')
        if not user_id:
            return jsonify({'error': 'Usuário não identificado'}), 401

        # 2. Perfil do usuário (workspaces atribuídos)
        prof_resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/profiles?id=eq.{quote(user_id)}',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not prof_resp.ok or not prof_resp.json():
            return jsonify({'error': 'Perfil não encontrado'}), 404
        profile = prof_resp.json()[0]
        workspace_ids = profile.get('workspace_ids') or []
        is_super_admin = bool(profile.get('is_super_admin'))

        # 3. Workspace alvo
        body = request.get_json() or {}
        workspace_id = None
        if is_super_admin and body.get('workspace_id'):
            workspace_id = body.get('workspace_id')
        elif workspace_ids:
            workspace_id = workspace_ids[0]
        if not workspace_id:
            return jsonify({'error': 'Este usuário não tem workspace atribuído'}), 400

        ws_resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/workspaces?id=eq.{quote(workspace_id)}',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not ws_resp.ok or not ws_resp.json():
            return jsonify({'error': 'Workspace não encontrado'}), 400

        device_name = str(body.get('device_name') or '').strip()[:60] or None

        # 4. Gera código único (tentativas em caso de colisão)
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        inserted = None
        for _ in range(5):
            code = _generate_activation_code()
            ins_resp = requests.post(
                f'{_SUPABASE_URL}/rest/v1/tv_activation_codes',
                headers={**_supabase_headers(), 'Prefer': 'return=representation'},
                json={
                    'code': code,
                    'workspace_id': workspace_id,
                    'user_id': user_id,
                    'device_name': device_name,
                    'status': 'pending',
                    'expires_at': expires_at,
                },
                timeout=10,
            )
            if ins_resp.ok:
                inserted = ins_resp.json()[0]
                break
            # PostgREST devolve 409 em violação de unique (colisão de código)
            if ins_resp.status_code != 409:
                return jsonify({'error': f'Erro ao criar o código: {ins_resp.status_code}'}), 500
        if not inserted:
            return jsonify({'error': 'Não foi possível gerar um código único'}), 500

        return jsonify({
            'success': True,
            'code': inserted.get('code'),
            'expires_at': inserted.get('expires_at'),
            'workspace_id': workspace_id,
            'device_name': device_name,
        })

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/tv/activation/redeem', methods=['POST'])
def tv_activation_redeem():
    """
    Valida e consome um código de ativação (chamado pelo app desktop, anon).
    Retorna o workspace, o usuário dono e o nome sugerido da TV.
    """
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        body = request.get_json() or {}
        code = str(body.get('code') or '').strip().upper()
        if not code:
            return jsonify({'error': 'Informe o código de ativação'}), 400

        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/tv_activation_codes?code=eq.{quote(code)}&select=*',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not resp.ok:
            return jsonify({'error': 'Erro ao validar o código'}), 502
        rows = resp.json()
        if not rows:
            return jsonify({'error': 'Código inválido. Verifique e tente novamente.'}), 404

        row = rows[0]
        if row.get('status') != 'pending':
            return jsonify({'error': 'Código já utilizado'}), 400

        expires_at = row.get('expires_at')
        if expires_at:
            try:
                exp = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                if exp < datetime.now(timezone.utc):
                    return jsonify({'error': 'Código expirado. Gere um novo no painel.'}), 400
            except Exception:
                pass

        # Consome o código (uso único)
        requests.patch(
            f"{_SUPABASE_URL}/rest/v1/tv_activation_codes?id=eq.{quote(row['id'])}",
            headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
            json={'status': 'used', 'used_at': datetime.now(timezone.utc).isoformat()},
            timeout=10,
        )

        ws_resp = requests.get(
            f"{_SUPABASE_URL}/rest/v1/workspaces?id=eq.{quote(row['workspace_id'])}",
            headers=_supabase_headers(),
            timeout=10,
        )
        workspace = ws_resp.json()[0] if ws_resp.ok and ws_resp.json() else None
        if not workspace:
            return jsonify({'error': 'Workspace do código não encontrado'}), 500

        return jsonify({
            'success': True,
            'code': code,
            'workspace': workspace,
            'user_id': row.get('user_id'),
            'device_name': row.get('device_name'),
        })

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


# ── Chamados (formulário público via QR) ──

CHAMADOS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS public.chamados_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id" UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    "roomId" TEXT NOT NULL DEFAULT '',
    "roomName" TEXT NOT NULL DEFAULT '',
    "assetId" TEXT DEFAULT '',
    "assetSource" TEXT DEFAULT '',
    "assetName" TEXT DEFAULT '',
    "assetPatrimony" TEXT DEFAULT '',
    "problemCategory" TEXT NOT NULL DEFAULT '',
    "problemArea" TEXT NOT NULL DEFAULT '',
    "problemDescription" TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'aberto',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "reportedBy" TEXT NOT NULL DEFAULT '',
    "reportedByEmail" TEXT DEFAULT '',
    "assignedTo" TEXT DEFAULT '',
    "assignedToUserId" TEXT DEFAULT '',
    "ticketNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "resolvedAt" TIMESTAMPTZ,
    "archived" BOOLEAN NOT NULL DEFAULT FALSE,
    "closedAt" TIMESTAMPTZ,
    "closedBy" TEXT DEFAULT '',
    "statusNote" TEXT DEFAULT '',
    "photos" TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS public.ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL REFERENCES public.chamados_tickets(id) ON DELETE CASCADE,
    "workspace_id" UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'comentario',
    content TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    "photo_urls" TEXT DEFAULT '',
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ticket_events ADD COLUMN IF NOT EXISTS "ticket_id" UUID;
ALTER TABLE public.ticket_events ADD COLUMN IF NOT EXISTS "workspace_id" UUID;
ALTER TABLE public.ticket_events ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'comentario';
ALTER TABLE public.ticket_events ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';
ALTER TABLE public.ticket_events ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '';
ALTER TABLE public.ticket_events ADD COLUMN IF NOT EXISTS "photo_urls" TEXT DEFAULT '';
ALTER TABLE public.ticket_events ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'normal';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMPTZ;
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "closedBy" TEXT DEFAULT '';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "statusNote" TEXT DEFAULT '';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT DEFAULT '';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "photos" TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_chamados_workspace ON public.chamados_tickets("workspace_id");
CREATE INDEX IF NOT EXISTS idx_chamados_status ON public.chamados_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON public.ticket_events("ticket_id");
-- RLS: acesso direto (anon/authenticated) bloqueado; a API acessa via service role.
ALTER TABLE public.chamados_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chamados_tickets FROM anon, authenticated, PUBLIC;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_events FROM anon, authenticated, PUBLIC;
"""

CHAMADOS_PRIORITIES = ('baixa', 'normal', 'alta', 'urgente')
CHAMADOS_STATUSES = ('aberto', 'a_caminho', 'em_atendimento', 'resolvido', 'fechado')

CHAMADOS_STATUS_LABELS = {
    'aberto': 'Aguardando técnico',
    'a_caminho': 'Técnico a caminho',
    'em_atendimento': 'Atendendo agora',
    'resolvido': 'Chamado resolvido',
    'fechado': 'Chamado concluído',
}

CHAMADOS_SUBS_PER_TICKET = 10


def _chamado_subs(ticket_id):
    """Inscrições de push registradas para um chamado (professor, página pública)."""
    if not redis:
        return []
    raw = redis.smembers(f'push:chamado:{ticket_id}')
    subs = []
    for r in raw:
        try:
            subs.append(json.loads(r) if isinstance(r, str) else r)
        except Exception:
            continue
    return subs


def _save_chamado_subs(ticket_id, subs):
    if not redis:
        return
    key = f'push:chamado:{ticket_id}'
    redis.delete(key)
    for s in subs[:CHAMADOS_SUBS_PER_TICKET]:
        redis.sadd(key, json.dumps(s, ensure_ascii=False))


def _record_ticket_event(ticket_id, workspace_id, event_type, content='', author='', photo_urls=''):
    """Insere um evento no histórico do chamado (falhas não quebram o fluxo principal)."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return None
    try:
        payload = {
            'ticket_id': ticket_id,
            'workspace_id': workspace_id or None,
            'type': event_type,
            'content': content,
            'author': author,
            'photo_urls': photo_urls,
        }
        resp = requests.post(
            f'{_SUPABASE_URL}/rest/v1/ticket_events',
            headers={**_supabase_headers(), 'Prefer': 'return=representation'},
            json=payload,
            timeout=10,
        )
        if not resp.ok:
            print(f"[chamados] erro ao gravar evento: {resp.status_code} {resp.text[:200]}")
            return None
        rows = resp.json() or []
        return rows[0] if rows else None
    except Exception as e:
        logger.error("[chamados] evento error: %s", e, exc_info=True)
        return None


def _notify_ticket_status(ticket):
    """Push ao professor (inscrições do próprio chamado) quando status/mensagem mudam."""
    try:
        subs = _chamado_subs(ticket.get('id', ''))
        if not subs:
            return
        status = ticket.get('status', '')
        note = (ticket.get('statusNote') or '').strip()
        label = CHAMADOS_STATUS_LABELS.get(status, status)
        msg = f'{label} — {note}' if note else label
        title = f"Chamado #{ticket.get('ticketNumber')}: {msg}"
        body = ' · '.join(
            str(part) for part in (ticket.get('roomName'), ticket.get('problemCategory')) if part
        )
        url = f"/chamados-publico/success/{ticket.get('id')}"
        keep = []
        for sub in subs:
            if push_notify(sub, title, body, url=url):
                keep.append(sub)
        _save_chamado_subs(ticket.get('id', ''), keep)
        print(f"[chamados] push status #{ticket.get('ticketNumber')}: {len(keep)}/{len(subs)} enviados")
    except Exception as e:
        logger.error("[chamados] push status error: %s", e, exc_info=True)


def _notify_ticket_assigned(ticket):
    """Push direto ao técnico atribuído quando o chamado é designado a ele.

    Segmenta pelas inscrições do usuário (user_id) com acesso ao módulo chamados
    no workspace do chamado. Falha de push não quebra o fluxo de atualização.
    """
    try:
        user_id = ticket.get('assignedToUserId') or ''
        if not user_id:
            return
        subs = _target_subs(
            module='chamados',
            workspace_id=ticket.get('workspace_id'),
            user_id=user_id,
        )
        if not subs:
            return
        title = f"Chamado #{ticket.get('ticketNumber')} atribuído a você"
        body = ' · '.join(
            str(part) for part in (ticket.get('roomName'), ticket.get('problemCategory'), ticket.get('reportedBy')) if part
        )
        url = f"/chamados/tickets/{ticket.get('id')}"
        sent = 0
        for sub in subs:
            if push_notify(sub, title, body, url=url):
                sent += 1
        print(f"[chamados] push atribuição #{ticket.get('ticketNumber')}: {sent}/{len(subs)} enviados")
    except Exception as e:
        logger.error("[chamados] push atribuição error: %s", e, exc_info=True)


def _notify_new_ticket(ticket):
    """Dispara push imediato para o TI quando um chamado é aberto.

    Usa a mesma infra de push do app (Upstash Redis + VAPID + pywebpush):
    filtra os inscritos pelo módulo 'chamados' e pelo workspace do chamado,
    respeitando perfil (apps), cargo e notify_settings de cada usuário.
    Falha de push não impede a criação do chamado.
    """
    try:
        subs = _target_subs(module='chamados', workspace_id=ticket.get('workspace_id'))
        if not subs:
            return
        title = f"Novo chamado #{ticket.get('ticketNumber')}"
        body = ' · '.join(
            str(part) for part in (
                ticket.get('roomName'),
                ticket.get('problemCategory'),
                ticket.get('reportedBy'),
            ) if part
        )
        url = f"/chamados/tickets/{ticket.get('id')}"
        sent = 0
        for sub in subs:
            if push_notify(sub, title, body, url=url):
                sent += 1
        print(f"[chamados] push novo chamado #{ticket.get('ticketNumber')}: {sent}/{len(subs)} enviados")
    except Exception as e:
        logger.error("[chamados] push error: %s", e, exc_info=True)


def _ensure_chamados_schema():
    """Cria a tabela de chamados se não existir (mesmo padrão do _ensure_stock_schema)."""
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return
    headers = {'apikey': _SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {_SUPABASE_SERVICE_KEY}'}
    try:
        resp = requests.post(
            f'{_SUPABASE_URL}/rest/v1/rpc/pg_sql',
            json={'query': CHAMADOS_TABLE_SQL},
            headers=headers,
            timeout=10,
        )
        print(f"[chamados] pg_sql: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        logger.error("[chamados] pg_sql error: %s", e, exc_info=True)


@app.route('/api/chamados/workspaces', methods=['GET'])
def chamados_workspaces():
    """Lista os campi (workspaces) para o formulário público. Público, service role."""
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/workspaces?select=id,name,slug,location&order=name',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not resp.ok:
            return jsonify({'error': 'Erro ao listar campi'}), 502
        return jsonify({'workspaces': resp.json() or []})
    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/chamados', methods=['POST'])
def chamados_create():
    """Cria um chamado a partir do formulário público (professor), sem login."""
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()
        body = request.get_json() or {}

        workspace_id = str(body.get('workspace_id') or '').strip()
        room_name = str(body.get('roomName') or '').strip()
        reported_by = str(body.get('reportedBy') or '').strip()
        problem_category = str(body.get('problemCategory') or '').strip()
        problem_area = str(body.get('problemArea') or '').strip()
        problem_description = str(body.get('problemDescription') or '').strip()
        priority = str(body.get('priority') or 'normal').strip().lower()

        if not workspace_id:
            return jsonify({'error': 'Selecione o campus'}), 400
        if not room_name:
            return jsonify({'error': 'Informe a sala'}), 400
        if not reported_by:
            return jsonify({'error': 'Informe seu nome'}), 400
        if problem_area not in ('administrativa', 'academica'):
            return jsonify({'error': 'Selecione a área do problema'}), 400
        if not problem_category:
            return jsonify({'error': 'Selecione o tipo de problema'}), 400
        if not problem_description:
            return jsonify({'error': 'Descreva o que está acontecendo'}), 400
        if priority not in CHAMADOS_PRIORITIES:
            return jsonify({'error': 'Prioridade inválida'}), 400

        photos = str(body.get('photos') or '').strip()
        if len(photos) > 600000:
            return jsonify({'error': 'Foto muito grande'}), 400
        if photos and not _is_valid_photo(photos):
            return jsonify({'error': 'Foto inválida'}), 400

        ws_check = requests.get(
            f'{_SUPABASE_URL}/rest/v1/workspaces?id=eq.{quote(workspace_id)}&select=id,disabled_apps',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not ws_check.ok or not ws_check.json():
            return jsonify({'error': 'Campus não encontrado'}), 400

        workspace = ws_check.json()[0]
        module_err = require_module(workspace, 'chamados')
        if module_err:
            return module_err

        num_resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets'
            f'?select=ticketNumber&workspace_id=eq.{quote(workspace_id)}'
            f'&order=ticketNumber.desc&limit=1',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not num_resp.ok:
            return jsonify({'error': 'Erro ao gerar o número do chamado'}), 502
        num_rows = num_resp.json()
        ticket_number = (num_rows[0].get('ticketNumber') if num_rows else 0) + 1

        now = datetime.now(timezone.utc).isoformat()
        payload = {
            'workspace_id': workspace_id,
            'roomId': str(body.get('roomId') or '').strip(),
            'roomName': room_name,
            'assetId': str(body.get('assetId') or ''),
            'assetSource': str(body.get('assetSource') or ''),
            'assetName': str(body.get('assetName') or ''),
            'assetPatrimony': str(body.get('assetPatrimony') or ''),
            'problemCategory': problem_category,
            'problemArea': problem_area,
            'problemDescription': problem_description,
            'status': 'aberto',
            'priority': priority,
            'reportedBy': reported_by,
            'reportedByEmail': str(body.get('reportedByEmail') or '').strip(),
            'assignedTo': str(body.get('assignedTo') or ''),
            'assignedToUserId': str(body.get('assignedToUserId') or ''),
            'photos': photos,
            'ticketNumber': ticket_number,
            'createdAt': now,
            'updatedAt': now,
            'resolvedAt': None,
        }

        ins = requests.post(
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets',
            headers={**_supabase_headers(), 'Prefer': 'return=representation'},
            json=payload,
            timeout=10,
        )
        if not ins.ok:
            return jsonify({'error': f'Erro ao criar chamado: {ins.status_code} {ins.text[:200]}'}), 502

        ticket = ins.json()[0]

        # Notificação imediata: avisa o TI no momento em que o professor abre o chamado.
        # Evento, não agendamento — não depende de cron nenhum (próprio app).
        _notify_new_ticket(ticket)

        return jsonify({'ticket': ticket})

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/chamados', methods=['GET'])
def chamados_list():
    """Lista chamados (filtros opcionais: workspace_id, status, reportedBy). Usado pelo app do TI."""
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()
        url = f'{_SUPABASE_URL}/rest/v1/chamados_tickets?select=*&order=createdAt.desc'
        workspace_id = request.args.get('workspace_id')
        if workspace_id:
            url += f'&workspace_id=eq.{quote(workspace_id)}'
        status = request.args.get('status')
        if status:
            url += f'&status=eq.{quote(status)}'
        reported_by = request.args.get('reportedBy')
        if reported_by:
            url += f'&reportedBy=ilike.*{quote(reported_by)}*'
        resp = requests.get(url, headers=_supabase_headers(), timeout=15)
        if not resp.ok:
            return jsonify({'error': 'Erro ao listar chamados'}), 502
        return jsonify({'tickets': resp.json() or []})
    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/chamados/<ticket_id>', methods=['GET', 'PATCH', 'DELETE'])
def chamados_manage(ticket_id):
    """Consulta, atualiza status/responsável/prioridade de um chamado ou remove."""
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()

        if request.method == 'GET':
            resp = requests.get(
                f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}&select=*',
                headers=_supabase_headers(),
                timeout=10,
            )
            if not resp.ok:
                return jsonify({'error': 'Erro ao buscar chamado'}), 502
            rows = resp.json() or []
            if not rows:
                return jsonify({'error': 'Chamado não encontrado'}), 404
            return jsonify({'ticket': rows[0]})

        if request.method == 'DELETE':
            resp = requests.delete(
                f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}',
                headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
                timeout=10,
            )
            if not resp.ok:
                return jsonify({'error': 'Erro ao remover chamado'}), 502
            return jsonify({'success': True})

        body = request.get_json() or {}
        updates = {}
        for key in ('status', 'assignedTo', 'assignedToUserId', 'problemDescription', 'priority', 'archived', 'closedAt', 'closedBy', 'statusNote', 'photos'):
            if key in body:
                updates[key] = body[key]
        if 'priority' in updates and updates['priority'] not in CHAMADOS_PRIORITIES:
            return jsonify({'error': 'Prioridade inválida'}), 400
        if 'photos' in updates:
            photos_val = str(updates['photos'] or '').strip()
            if len(photos_val) > 600000:
                return jsonify({'error': 'Foto muito grande'}), 400
            if photos_val and not _is_valid_photo(photos_val):
                return jsonify({'error': 'Foto inválida'}), 400
            updates['photos'] = photos_val

        prev = None
        assignment_changed = False
        if 'assignedToUserId' in updates:
            # Busca o responsável atual para só notificar quando houver troca/atribuição
            fetch = requests.get(
                f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}&select=assignedToUserId',
                headers=_supabase_headers(),
                timeout=10,
            )
            if not fetch.ok:
                return jsonify({'error': 'Erro ao buscar chamado'}), 502
            prev = (fetch.json() or [{}])[0]
            assignment_changed = (prev.get('assignedToUserId') or '') != (updates.get('assignedToUserId') or '')
        if 'status' in updates:
            status = updates['status']
            if status not in CHAMADOS_STATUSES:
                return jsonify({'error': 'Status inválido'}), 400

            # Busca o estado atual para detectar reabertura (resolvido/fechado → fluxo ativo)
            fetch = requests.get(
                f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}&select=status,statusNote,resolvedAt,closedAt,archived',
                headers=_supabase_headers(),
                timeout=10,
            )
            if not fetch.ok:
                return jsonify({'error': 'Erro ao buscar chamado'}), 502
            prev = (fetch.json() or [{}])[0]
            prev_status = prev.get('status')

            if status == 'resolvido':
                updates['resolvedAt'] = datetime.now(timezone.utc).isoformat()
                updates['statusNote'] = ''
            elif status == 'fechado':
                updates['archived'] = True
                updates['closedAt'] = datetime.now(timezone.utc).isoformat()
                updates['statusNote'] = ''
            elif prev_status in ('resolvido', 'fechado'):
                # Reabertura: volta ao fluxo ativo e limpa marcas de conclusão
                updates['resolvedAt'] = None
                updates['closedAt'] = None
                updates['closedBy'] = ''
                updates['archived'] = False
        elif 'statusNote' in updates:
            # Busca o estado atual para comparar a mensagem e notificar só em mudança
            fetch = requests.get(
                f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}&select=status,statusNote',
                headers=_supabase_headers(),
                timeout=10,
            )
            if not fetch.ok:
                return jsonify({'error': 'Erro ao buscar chamado'}), 502
            prev = (fetch.json() or [{}])[0]
        if not updates:
            return jsonify({'error': 'Nada para atualizar'}), 400
        updates['updatedAt'] = datetime.now(timezone.utc).isoformat()

        resp = requests.patch(
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}',
            headers={**_supabase_headers(), 'Prefer': 'return=representation'},
            json=updates,
            timeout=10,
        )
        if not resp.ok:
            return jsonify({'error': 'Erro ao atualizar chamado'}), 502
        rows = resp.json()
        if not rows:
            return jsonify({'error': 'Chamado não encontrado'}), 404

        ticket = rows[0]
        if assignment_changed and ticket.get('assignedToUserId'):
            # Push direto ao técnico atribuído (filtro por user_id no _target_subs).
            _notify_ticket_assigned(ticket)
        if prev is not None and ('status' in updates or 'statusNote' in updates):
            changed = ('status' in updates and prev.get('status') != ticket.get('status')) or (
                'statusNote' in updates and prev.get('statusNote') != ticket.get('statusNote')
            )
            if changed:
                _notify_ticket_status(ticket)
                note = str(body.get('statusNote') or ticket.get('statusNote') or '').strip()
                content = note or CHAMADOS_STATUS_LABELS.get(ticket.get('status', ''), ticket.get('status', ''))
                author = str(body.get('author') or '').strip() or 'Sistema'
                _record_ticket_event(
                    ticket_id,
                    ticket.get('workspace_id'),
                    'status',
                    content=content,
                    author=author,
                )
        return jsonify({'ticket': ticket})

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


def _aggregate_ticket_reports(rows):
    """Agrega chamados do período em métricas para a página de relatórios."""
    total = len(rows)
    by_status = {}
    by_priority = {}
    by_category = {}
    by_area = {}
    by_room = {}
    tech = {}
    resolution_total_ms = 0
    resolution_count = 0
    rating_sum = 0
    rating_count = 0

    for t in rows:
        status = t.get('status') or 'aberto'
        by_status[status] = by_status.get(status, 0) + 1
        priority = t.get('priority') or 'normal'
        by_priority[priority] = by_priority.get(priority, 0) + 1
        category = t.get('problemCategory') or 'Outros'
        by_category[category] = by_category.get(category, 0) + 1
        area = t.get('problemArea') or ''
        if area:
            by_area[area] = by_area.get(area, 0) + 1
        room = t.get('roomName') or ''
        if room:
            by_room[room] = by_room.get(room, 0) + 1

        name = (t.get('assignedTo') or '').strip()
        if name:
            row = tech.setdefault(name, {'name': name, 'open': 0, 'resolved': 0, 'total': 0, 'resolutionMs': 0, 'ratingSum': 0, 'ratingCount': 0})
            row['total'] += 1
            if status in ('aberto', 'a_caminho', 'em_atendimento'):
                row['open'] += 1
            if status in ('resolvido', 'fechado') or t.get('resolvedAt'):
                row['resolved'] += 1
            if t.get('resolvedAt') and t.get('createdAt'):
                try:
                    row['resolutionMs'] += (_parse_iso(t['resolvedAt'], 'resolvedAt') - _parse_iso(t['createdAt'], 'createdAt')).total_seconds() * 1000
                except Exception:
                    pass
            rating = t.get('feedbackRating')
            if rating:
                row['ratingSum'] += float(rating)
                row['ratingCount'] += 1

        if t.get('resolvedAt') and t.get('createdAt'):
            try:
                ms = _parse_iso(t['resolvedAt'], 'resolvedAt') - _parse_iso(t['createdAt'], 'createdAt')
                resolution_total_ms += ms.total_seconds() * 1000
                resolution_count += 1
            except Exception:
                pass

        rating = t.get('feedbackRating')
        if rating:
            try:
                rating_sum += float(rating)
                rating_count += 1
            except (TypeError, ValueError):
                pass

    by_technician = []
    for row in tech.values():
        by_technician.append({
            'name': row['name'],
            'open': row['open'],
            'resolved': row['resolved'],
            'total': row['total'],
            'avgResolutionHours': round(row['resolutionMs'] / row['resolved'] / 3600000, 1) if row['resolved'] else None,
            'rating': round(row['ratingSum'] / row['ratingCount'], 2) if row['ratingCount'] else None,
            'ratingCount': row['ratingCount'],
        })
    by_technician.sort(key=lambda r: -r['total'])

    return {
        'total': total,
        'byStatus': by_status,
        'byPriority': by_priority,
        'byCategory': by_category,
        'byArea': by_area,
        'byRoom': sorted(by_room.items(), key=lambda kv: -kv[1]),
        'byTechnician': by_technician,
        'avgResolutionHours': round(resolution_total_ms / resolution_count / 3600000, 1) if resolution_count else None,
        'feedback': {'count': rating_count, 'average': round(rating_sum / rating_count, 2) if rating_count else None},
    }


def _parse_iso(value, label):
    try:
        s = value.replace('Z', '+00:00') if isinstance(value, str) else ''
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


@app.route('/api/chamados/reports', methods=['GET'])
def chamados_reports():
    """Relatório de chamados (agregação no servidor). Período via from/to (ISO).

    Métricas: total, por status/prioridade/categoria/área/sala, por técnico,
    tempo médio de resolução e satisfação. Fonte: Supabase (chamados_tickets).
    """
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()

        now = datetime.now(timezone.utc)
        from_iso = request.args.get('from') or (now - timedelta(days=30)).isoformat()
        to_iso = request.args.get('to') or now.isoformat()
        from_dt = _parse_iso(from_iso, 'from')
        to_dt = _parse_iso(to_iso, 'to')
        if not from_dt or not to_dt:
            return jsonify({'error': 'Período inválido (use ISO, ex.: 2026-06-01T00:00:00Z)'}), 400
        if from_dt > to_dt:
            return jsonify({'error': 'from deve ser anterior a to'}), 400

        url = (
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets'
            f'?select=status,priority,problemCategory,problemArea,roomName,assignedTo,createdAt,resolvedAt,feedbackRating'
            f'&createdAt=gte.{quote(from_iso)}&createdAt=lte.{quote(to_iso)}'
        )
        workspace_id = request.args.get('workspace_id')
        if workspace_id:
            url += f'&workspace_id=eq.{quote(workspace_id)}'
        resp = requests.get(url, headers=_supabase_headers(), timeout=15)
        if not resp.ok:
            return jsonify({'error': 'Erro ao gerar relatório'}), 502

        report = _aggregate_ticket_reports(resp.json() or [])
        report['period'] = {'from': from_iso, 'to': to_iso}
        return jsonify({'report': report})
    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/chamados/<ticket_id>/subscribe', methods=['POST'])
def chamados_subscribe(ticket_id):
    """Registra o push do professor para um chamado (página pública de sucesso).

    Armazena só endpoint/chaves (sem dados de usuário — página pública).
    Dedupe por endpoint e teto de inscrições por chamado para evitar abuso.
    """
    if not redis:
        return jsonify({'error': 'Redis não configurado'}), 500
    try:
        body = request.get_json() or {}
        endpoint = body.get('endpoint', '')
        if not endpoint:
            return jsonify({'error': 'endpoint é obrigatório'}), 400

        sub = {
            'key': hashlib.sha256(endpoint.encode()).hexdigest(),
            'endpoint': endpoint,
            'expirationTime': body.get('expirationTime'),
            'keys': body.get('keys') or {},
        }
        subs = [s for s in _chamado_subs(ticket_id) if s.get('endpoint') != endpoint]
        subs.append(sub)
        _save_chamado_subs(ticket_id, subs)
        return jsonify({'status': 'ok', 'count': len(subs)})
    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/chamados/push/test', methods=['POST'])
def chamados_push_test():
    """Envia uma push de teste para o próprio usuário logado (módulo chamados).

    Usado pela página de Configurações do Chamados para validar o fluxo completo
    (inscrição → service worker → notificação). Requer sessão Supabase (Bearer):
    o push é segmentado pelas inscrições do usuário com acesso ao módulo chamados.
    """
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        token = (request.headers.get('Authorization') or '').replace('Bearer ', '').strip()
        if not token:
            return jsonify({'error': 'Token de autenticação ausente'}), 401

        # Valida o JWT do usuário via Supabase Auth (mesmo padrão da ativação da TV)
        auth_resp = requests.get(
            f'{_SUPABASE_URL}/auth/v1/user',
            headers={'apikey': _SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        if not auth_resp.ok:
            return jsonify({'error': 'Sessão inválida ou expirada. Faça login novamente.'}), 401
        auth_user = auth_resp.json() or {}
        user_id = auth_user.get('id')
        if not user_id:
            return jsonify({'error': 'Usuário não identificado'}), 401

        subs = _target_subs(module='chamados', user_id=user_id)
        if not subs:
            return jsonify({
                'sent': 0,
                'total': 0,
                'message': 'Nenhuma inscrição push encontrada para este usuário. Ative as notificações primeiro.',
            })

        title = 'Teste de notificação — Chamados'
        body = 'Push funcionando! Você receberá avisos de novos chamados. 🔔'
        sent = 0
        for sub in subs:
            if push_notify(sub, title, body, url='/chamados'):
                sent += 1
        print(f"[chamados] push de teste: {sent}/{len(subs)} enviados (user={user_id})")
        return jsonify({'sent': sent, 'total': len(subs)})
    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


# ── Zerar dados (factory reset) ──

WIPE_TOKEN = os.environ.get('WIPE_TOKEN', '')

# Tabelas operacionais apagadas no wipe. Config (workspaces/perfis/cargos) é preservada.
WIPE_TABLES = [
    # public (filhos primeiro para respeitar FKs)
    ('public', 'tv_music_tracks'),
    ('public', 'tv_music_queues'),
    ('public', 'tv_gallery_photos'),
    ('public', 'tv_galleries'),
    ('public', 'tv_events'),
    ('public', 'tv_playlists'),
    ('public', 'tv_announcements'),
    ('public', 'tv_calendar_cache'),
    ('public', 'tv_urgent_announcements'),
    ('public', 'tv_activation_codes'),
    ('public', 'tablet_reservations'),
    ('public', 'chamados_tickets'),
    # schema stock
    ('stock', 'stock_movements'),
    ('stock', 'stock_maintenance'),
    ('stock', 'inventory_counts'),
    ('stock', 'inventory_cycles'),
    ('stock', 'stock_kits'),
    ('stock', 'notifications'),
    ('stock', 'stock_items'),
    # schema pcare
    ('pcare', 'action_logs'),
    ('pcare', 'pc_checklists'),
    ('pcare', 'checklist_templates'),
    ('pcare', 'part_usage'),
    ('pcare', 'maintenance'),
    ('pcare', 'parts'),
    ('pcare', 'pcs'),
]


@app.route('/api/admin/wipe', methods=['POST'])
def admin_wipe():
    """Apaga TODAS as linhas das tabelas operacionais (stock, pcare, chamados, tv).

    Requer o header `X-Wipe-Token` igual a WIPE_TOKEN (variável de ambiente).
    Workspaces, perfis e cargos NÃO são apagados (config essencial do app).
    """
    token = (request.headers.get('X-Wipe-Token') or '').strip()
    if not WIPE_TOKEN or token != WIPE_TOKEN:
        return jsonify({'error': 'Token inválido ou não configurado'}), 403
    if not _SUPABASE_URL or not _SUPABASE_SERVICE_KEY:
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        results = {}
        for schema, table in WIPE_TABLES:
            headers = dict(_supabase_headers())
            if schema in ('stock', 'pcare'):
                headers['Accept-Profile'] = schema
                headers['Content-Profile'] = schema
            try:
                # WHERE é obrigatório (extensão safeupdate no Supabase).
                # 404 = tabela ainda não criada no projeto (sem dados para apagar).
                resp = requests.delete(
                    f'{_SUPABASE_URL}/rest/v1/{table}?id=neq.00000000-0000-0000-0000-000000000000',
                    headers={**headers, 'Prefer': 'return=minimal'},
                    timeout=20,
                )
                if resp.status_code == 204:
                    results[table] = 'ok'
                elif resp.status_code == 404:
                    results[table] = 'sem-tabela'
                else:
                    results[table] = f'HTTP {resp.status_code}'
            except Exception as e:
                logger.error("Erro ao limpar %s: %s", table, e, exc_info=True)
                results[table] = 'erro'
        return jsonify({'wipe': results})
    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/chamados/<ticket_id>/feedback', methods=['POST'])
def chamados_feedback(ticket_id):
    """Registra o feedback do professor (nota 1-5) após a resolução do chamado."""
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()

        fetch = requests.get(
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}&select=*',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not fetch.ok:
            return jsonify({'error': 'Erro ao buscar chamado'}), 502
        rows = fetch.json() or []
        if not rows:
            return jsonify({'error': 'Chamado não encontrado'}), 404
        ticket = rows[0]

        if ticket.get('status') not in ('resolvido', 'fechado'):
            return jsonify({'error': 'Só é possível avaliar após a resolução do chamado'}), 400
        if ticket.get('feedbackRating') is not None:
            return jsonify({'error': 'Chamado já avaliado'}), 400

        body = request.get_json() or {}
        try:
            rating = int(body.get('rating'))
        except (TypeError, ValueError):
            rating = 0
        if rating not in (1, 2, 3, 4, 5):
            return jsonify({'error': 'Nota inválida (1 a 5)'}), 400
        comment = str(body.get('comment') or '').strip()[:500]

        now = datetime.now(timezone.utc).isoformat()
        updates = {
            'feedbackRating': rating,
            'feedbackComment': comment,
            'feedbackAt': now,
            'updatedAt': now,
        }
        resp = requests.patch(
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}',
            headers={**_supabase_headers(), 'Prefer': 'return=representation'},
            json=updates,
            timeout=10,
        )
        if not resp.ok:
            return jsonify({'error': 'Erro ao registrar o feedback'}), 502
        return jsonify({'ticket': resp.json()[0]})

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


def _require_cron():
    """Valida o Bearer do cron. Se CRON_SECRET não estiver no ambiente, permite (dev/local)."""
    secret = os.environ.get('CRON_SECRET', '')
    if not secret:
        return True
    token = (request.headers.get('Authorization') or '').replace('Bearer ', '').strip()
    return token and token == secret


@app.route('/api/chamados/<ticket_id>/events', methods=['GET'])
def chamados_events_list(ticket_id):
    """Histórico (timeline) de um chamado, do mais novo para o mais antigo."""
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/ticket_events?ticket_id=eq.{quote(ticket_id)}&order=createdAt.desc',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not resp.ok:
            return jsonify({'error': 'Erro ao buscar o histórico'}), 502
        events = []
        for ev in (resp.json() or []):
            try:
                urls = json.loads(ev.get('photo_urls') or '[]')
            except (TypeError, ValueError):
                urls = []
            ev['photos'] = urls if isinstance(urls, list) else []
            events.append(ev)
        return jsonify({'events': events})
    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/chamados/<ticket_id>/events', methods=['POST'])
def chamados_events_create(ticket_id):
    """Comentário/suporte visual no chamado (solicitante ou técnico), com até 2 fotos."""
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()
        fetch = requests.get(
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(ticket_id)}&select=id,workspace_id,status',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not fetch.ok:
            return jsonify({'error': 'Erro ao buscar chamado'}), 502
        rows = fetch.json() or []
        if not rows:
            return jsonify({'error': 'Chamado não encontrado'}), 404
        ticket = rows[0]

        body = request.get_json() or {}
        content = str(body.get('content') or '').strip()[:1000]
        author = str(body.get('author') or '').strip()[:120]
        photos = body.get('photos') or []

        if not isinstance(photos, list):
            return jsonify({'error': 'photos deve ser uma lista'}), 400
        if len(photos) > 2:
            return jsonify({'error': 'Máximo de 2 fotos por evento'}), 400
        for p in photos:
            pv = str(p or '').strip()
            if not _is_valid_photo(pv):
                return jsonify({'error': 'Foto inválida'}), 400
        if not content and not photos:
            return jsonify({'error': 'Escreva um comentário ou anexe uma foto'}), 400

        event = _record_ticket_event(
            ticket_id,
            ticket.get('workspace_id'),
            'comentario',
            content=content,
            author=author or 'Anônimo',
            photo_urls=json.dumps([str(p) for p in photos], ensure_ascii=False),
        )
        if not event:
            return jsonify({'error': 'Erro ao gravar o evento'}), 502
        try:
            event['photos'] = json.loads(event.get('photo_urls') or '[]')
        except (TypeError, ValueError):
            event['photos'] = []
        return jsonify({'event': event}), 201

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


def _send_email_via_resend(to, subject, html):
    """Envia email via Resend (API REST). Retorna (ok, erro)."""
    api_key = os.environ.get('RESEND_API_KEY', '').strip()
    from_addr = os.environ.get('EMAIL_FROM', '').strip() or 'LabHub <labhub@resend.dev>'
    if not api_key:
        return False, 'RESEND_API_KEY não configurado no servidor'
    if not to:
        return False, 'Informe o destinatário do email'
    try:
        resp = requests.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={'from': from_addr, 'to': [to], 'subject': subject, 'html': html},
            timeout=15,
        )
        if not resp.ok:
            return False, f'Resend retornou {resp.status_code}: {resp.text[:200]}'
        return True, ''
    except Exception as e:
        logger.error('Erro ao enviar email via Resend: %s', e, exc_info=True)
        return False, 'Falha de rede ao enviar o email'


def _build_weekly_report_html(report, workspace_name):
    """Monta o HTML do resumo semanal de chamados (usado no email)."""
    total = report.get('total', 0)
    by_status = report.get('byStatus', {})
    by_room = report.get('byRoom', []) or []
    by_tech = report.get('byTechnician', []) or []
    feedback = report.get('feedback', {})

    status_rows = ''.join(
        f'<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#374151">{label}</td>'
        f'<td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#111827;text-align:right;font-weight:600">{by_status.get(status, 0)}</td></tr>'
        for status, label in [
            ('aberto', 'Abertos'),
            ('a_caminho', 'Técnico a caminho'),
            ('em_atendimento', 'Em atendimento'),
            ('resolvido', 'Resolvidos'),
            ('fechado', 'Fechados'),
        ]
    )

    room_rows = ''.join(
        f'<tr><td style="padding:5px 12px;border-bottom:1px solid #e5e7eb;color:#374151">{room}</td>'
        f'<td style="padding:5px 12px;border-bottom:1px solid #e5e7eb;color:#111827;text-align:right;font-weight:600">{count}</td></tr>'
        for room, count in by_room[:8]
    ) or '<tr><td style="padding:6px 12px;color:#6b7280">Sem chamados no período</td></tr>'

    tech_rows = ''.join(
        f'<tr><td style="padding:5px 12px;border-bottom:1px solid #e5e7eb;color:#374151">{t["name"]}</td>'
        f'<td style="padding:5px 12px;border-bottom:1px solid #e5e7eb;color:#111827;text-align:right">{t["resolved"]} resolvido(s)</td></tr>'
        for t in by_tech[:6]
    ) or '<tr><td style="padding:6px 12px;color:#6b7280">Nenhum técnico com chamados no período</td></tr>'

    avg = report.get('avgResolutionHours')
    avg_txt = f'{avg}h' if avg is not None else '—'
    fb_count = feedback.get('count', 0)
    fb_avg = feedback.get('average')
    fb_txt = f'{fb_avg:.1f} / 5 ({fb_count} avaliações)' if fb_avg is not None else f'{fb_count} avaliações' if fb_count else 'Sem avaliações'

    ws_name = workspace_name or 'todas as unidades'

    return f"""\
<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:24px 28px">
      <h1 style="margin:0;color:#ffffff;font-size:20px">LabHub · Resumo Semanal</h1>
      <p style="margin:6px 0 0;color:#fef3c7;font-size:13px">{ws_name}</p>
    </div>
    <div style="padding:24px 28px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="text-align:center;background:#fef3c7;border-radius:8px;padding:14px">
            <p style="margin:0;font-size:28px;font-weight:700;color:#111827">{total}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#6b7280">chamados na semana</p>
          </td>
          <td style="width:12px"></td>
          <td style="text-align:center;background:#ecfdf5;border-radius:8px;padding:14px">
            <p style="margin:0;font-size:28px;font-weight:700;color:#111827">{avg_txt}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#6b7280">tempo médio de resolução</p>
          </td>
        </tr>
      </table>

      <h2 style="margin:0 0 8px;font-size:15px;color:#111827">Por status</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">{status_rows}</table>

      <h2 style="margin:0 0 8px;font-size:15px;color:#111827">Top salas</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">{room_rows}</table>

      <h2 style="margin:0 0 8px;font-size:15px;color:#111827">Técnicos</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">{tech_rows}</table>

      <p style="margin:0;font-size:13px;color:#374151">
        Satisfação dos professores: <strong>{fb_txt}</strong>
      </p>
    </div>
    <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:11px;color:#9ca3af">Gerado automaticamente pelo LabHub · {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M UTC')}</p>
    </div>
  </div>
</body>
</html>
"""


@app.route('/api/chamados/reports/weekly-email', methods=['POST'])
def chamados_reports_weekly_email():
    """Envia por email o resumo semanal de chamados (últimos 7 dias).

    Requer usuário logado (Bearer Supabase). O destinatário vem do body
    (ou de REPORT_EMAIL_TO). Usa Resend (RESEND_API_KEY). Pode ser chamado
    manualmente pelo app ou por um cron agendado.
    """
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        token = (request.headers.get('Authorization') or '').replace('Bearer ', '').strip()
        if not token:
            return jsonify({'error': 'Token de autenticação ausente'}), 401
        auth_resp = requests.get(
            f'{_SUPABASE_URL}/auth/v1/user',
            headers={'apikey': _SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {token}'},
            timeout=10,
        )
        if not auth_resp.ok:
            return jsonify({'error': 'Sessão inválida ou expirada. Faça login novamente.'}), 401

        _ensure_chamados_schema()
        now = datetime.now(timezone.utc)
        from_iso = (now - timedelta(days=7)).isoformat()
        to_iso = now.isoformat()

        body = request.get_json() or {}
        workspace_id = str(body.get('workspace_id') or '').strip()
        workspace_name = ''
        if workspace_id:
            ws_resp = requests.get(
                f'{_SUPABASE_URL}/rest/v1/workspaces?id=eq.{quote(workspace_id)}&select=name',
                headers=_supabase_headers(),
                timeout=10,
            )
            if ws_resp.ok and ws_resp.json():
                workspace_name = (ws_resp.json()[0].get('name') or '').strip()

        url = (
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets'
            f'?select=status,priority,problemCategory,problemArea,roomName,assignedTo,createdAt,resolvedAt,feedbackRating'
            f'&createdAt=gte.{quote(from_iso)}&createdAt=lte.{quote(to_iso)}'
        )
        if workspace_id:
            url += f'&workspace_id=eq.{quote(workspace_id)}'
        resp = requests.get(url, headers=_supabase_headers(), timeout=15)
        if not resp.ok:
            return jsonify({'error': 'Erro ao gerar o resumo'}), 502

        report = _aggregate_ticket_reports(resp.json() or [])
        html = _build_weekly_report_html(report, workspace_name)

        to = str(body.get('to') or '').strip() or os.environ.get('REPORT_EMAIL_TO', '').strip()
        ok, err = _send_email_via_resend(to, f'LabHub · Resumo semanal de chamados ({report["total"]})', html)
        if not ok:
            return jsonify({'error': err}), 400 if 'não configurado' in err or 'destinatário' in err else 502

        return jsonify({'ok': True, 'total': report['total'], 'sent_to': to})
    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


@app.route('/api/chamados/photos/purge', methods=['POST'])
def chamados_photos_purge():
    """Cron diário: apaga do Cloudinary as fotos de chamados fechados há mais de 2 dias.

    Roda via GitHub Actions (photos-cleanup.yml) com Bearer CRON_SECRET.
    Limpa a coluna photos do ticket e photo_urls dos eventos afetados.
    """
    if not _require_cron():
        return jsonify({'error': 'Não autorizado'}), 401
    if not _require_supabase():
        return jsonify({'error': 'Supabase não configurado'}), 503
    try:
        _ensure_chamados_schema()
        cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        resp = requests.get(
            f'{_SUPABASE_URL}/rest/v1/chamados_tickets'
            f'?status=eq.fechado&closedAt=lt.{quote(cutoff)}&select=id,workspace_id,photos',
            headers=_supabase_headers(),
            timeout=15,
        )
        if not resp.ok:
            return jsonify({'error': 'Erro ao buscar chamados fechados'}), 502
        tickets = resp.json() or []

        deleted = 0
        cleared_tickets = []
        cleared_events = 0

        for t in tickets:
            ticket_photo = str(t.get('photos') or '').strip()
            if ticket_photo and ticket_photo.startswith('https://res.cloudinary.com/') and _cloudinary_destroy(ticket_photo):
                deleted += 1
                cleared_tickets.append(t.get('id'))
                requests.patch(
                    f'{_SUPABASE_URL}/rest/v1/chamados_tickets?id=eq.{quote(t.get("id"))}',
                    headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
                    json={'photos': '', 'updatedAt': datetime.now(timezone.utc).isoformat()},
                    timeout=10,
                )

        ticket_ids = [t.get('id') for t in tickets if t.get('id')]
        if ticket_ids:
            events_resp = requests.get(
                f'{_SUPABASE_URL}/rest/v1/ticket_events'
                f'?ticket_id=in.({",".join(quote(i) for i in ticket_ids)})&select=id,photo_urls',
                headers=_supabase_headers(),
                timeout=15,
            )
            if events_resp.ok:
                for ev in (events_resp.json() or []):
                    try:
                        urls = json.loads(ev.get('photo_urls') or '[]')
                    except (TypeError, ValueError):
                        urls = []
                    cloud_urls = [u for u in urls if isinstance(u, str) and u.startswith('https://res.cloudinary.com/')]
                    if not cloud_urls:
                        continue
                    removed = 0
                    for u in cloud_urls:
                        if _cloudinary_destroy(u):
                            removed += 1
                    if removed:
                        deleted += removed
                        cleared_events += 1
                        remaining = [u for u in urls if u not in cloud_urls]
                        requests.patch(
                            f'{_SUPABASE_URL}/rest/v1/ticket_events?id=eq.{quote(ev.get("id"))}',
                            headers={**_supabase_headers(), 'Prefer': 'return=minimal'},
                            json={'photo_urls': json.dumps(remaining, ensure_ascii=False)},
                            timeout=10,
                        )

        return jsonify({
            'tickets_scanned': len(tickets),
            'tickets_cleared': len(cleared_tickets),
            'events_cleared': cleared_events,
            'photos_deleted': deleted,
        })

    except Exception as e:
        logger.error("Erro interno na API: %s", e, exc_info=True)
        return jsonify({'error': 'Erro interno'}), 500


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000, use_reloader=False)

