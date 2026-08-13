import sys, os, re, secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs, quote

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'apps', 'reservalab', 'api'))
from app import app, _SUPABASE_URL, _SUPABASE_SERVICE_KEY, _supabase_headers

import requests
from flask import jsonify, request


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
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'isLive': False, 'error': str(e)}), 200


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
        api_key = os.environ.get('CLOUDINARY_API_KEY', '')
        api_secret = os.environ.get('CLOUDINARY_API_SECRET', '')

        if not cloud_name:
            return jsonify({'success': False, 'error': 'Cloudinary cloud_name não configurado'}), 200

        if not api_key or not api_secret:
            return jsonify({'success': False, 'error': 'Cloudinary API key/secret não configurados'}), 200

        # Extrair public_id da URL do Cloudinary
        # URL example: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{folder}/{public_id}.{ext}
        import re

        # Verificar se a URL pertence ao cloud_name configurado
        if cloud_name not in image_url:
            return jsonify({'success': False, 'error': 'URL não pertence ao Cloudinary configurado'}), 200

        # Extrair o path após /image/upload/ (ignorando versão opcional v12345/)
        upload_match = re.search(r'/image/upload/(?:v\d+/)?(.+)$', image_url)
        if not upload_match:
            return jsonify({'success': False, 'error': 'URL não é uma imagem do Cloudinary válida'}), 200

        raw_path = upload_match.group(1)
        # Remover query string e fragmento
        raw_path = re.sub(r'[?#].*$', '', raw_path)
        # Remover extensão final (.jpg, .png, etc)
        public_id = re.sub(r'\.(jpg|jpeg|png|gif|webp|svg|pdf)$', '', raw_path, flags=re.IGNORECASE)

        if not public_id:
            return jsonify({'success': False, 'error': 'Não foi possível extrair public_id da URL'}), 200

        # Chamar Cloudinary Admin API para destruir a imagem
        import base64
        auth = base64.b64encode(f'{api_key}:{api_secret}'.encode()).decode()
        destroy_url = f'https://api.cloudinary.com/v1_1/{cloud_name}/image/destroy'
        destroy_resp = requests.post(destroy_url, data={
            'public_id': public_id,
        }, headers={
            'Authorization': f'Basic {auth}',
        }, timeout=10)

        if not destroy_resp.ok:
            return jsonify({'success': False, 'error': f'Cloudinary API erro: {destroy_resp.status_code}'}), 200

        result = destroy_resp.json()
        return jsonify({
            'success': result.get('result') == 'ok',
            'result': result.get('result', 'unknown'),
            'public_id': public_id,
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 200


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
            headers={'Authorization': f'Bearer {token}'},
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
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


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
    "ticketNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "resolvedAt" TIMESTAMPTZ,
    "archived" BOOLEAN NOT NULL DEFAULT FALSE,
    "closedAt" TIMESTAMPTZ,
    "closedBy" TEXT DEFAULT ''
);
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'normal';
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMPTZ;
ALTER TABLE public.chamados_tickets ADD COLUMN IF NOT EXISTS "closedBy" TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_chamados_workspace ON public.chamados_tickets("workspace_id");
CREATE INDEX IF NOT EXISTS idx_chamados_status ON public.chamados_tickets(status);
-- RLS: acesso direto (anon/authenticated) bloqueado; a API acessa via service role.
ALTER TABLE public.chamados_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chamados_tickets FROM anon, authenticated, PUBLIC;
"""

CHAMADOS_PRIORITIES = ('baixa', 'normal', 'alta', 'urgente')


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
        print(f"[chamados] pg_sql error: {e}")


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
        return jsonify({'error': str(e)}), 500


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

        ws_check = requests.get(
            f'{_SUPABASE_URL}/rest/v1/workspaces?id=eq.{quote(workspace_id)}&select=id',
            headers=_supabase_headers(),
            timeout=10,
        )
        if not ws_check.ok or not ws_check.json():
            return jsonify({'error': 'Campus não encontrado'}), 400

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

        return jsonify({'ticket': ins.json()[0]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500


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
        for key in ('status', 'assignedTo', 'problemDescription', 'priority', 'archived', 'closedAt', 'closedBy'):
            if key in body:
                updates[key] = body[key]
        if 'priority' in updates and updates['priority'] not in CHAMADOS_PRIORITIES:
            return jsonify({'error': 'Prioridade inválida'}), 400
        if 'status' in updates and updates['status'] == 'resolvido':
            updates['resolvedAt'] = datetime.now(timezone.utc).isoformat()
        if 'status' in updates and updates['status'] == 'fechado':
            updates['archived'] = True
            updates['closedAt'] = datetime.now(timezone.utc).isoformat()
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
        return jsonify({'ticket': rows[0]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
        return jsonify({'error': str(e)}), 500

