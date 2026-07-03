import json
import os
import re
import sys
from urllib.parse import urlparse, parse_qs

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import requests

# Carrega .env do diretório do script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

app = Flask(__name__)
CORS(app)


def iso_duration_to_seconds(duration: str) -> int:
    """Converte ISO 8601 duration (PT1H30M15S) para segundos."""
    if not duration:
        return 0
    m = re.match(r'PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?', duration)
    if not m:
        return 0
    h = int(m.group(1) or 0)
    mi = int(m.group(2) or 0)
    s = int(m.group(3) or 0)
    return h * 3600 + mi * 60 + s


def parse_youtube_url(url: str) -> dict | None:
    """Parse YouTube URL to extract video/playlist info."""
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
def youtube_fetch():
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
            # Fetch playlist items
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

            # Fetch video details (titles + durations)
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
            # Single video
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


@app.route('/api/tv/health', methods=['GET'])
def health():
    api_key_configured = bool(os.environ.get('YOUTUBE_API_KEY'))
    return jsonify({
        'status': 'ok',
        'youtube_api_key_configured': api_key_configured,
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=False, host='0.0.0.0', port=port, use_reloader=False)
