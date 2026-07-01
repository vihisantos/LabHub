# API Backend

> Documentacao da API Flask que serve o sub-app ReservaLab.

---

## Visao Geral

O backend e um servidor Flask rodando como **Python Serverless** na Vercel. Ele e responsavel por:

- Buscar e processar dados de reservas de laboratorios via planilhas Excel no SharePoint
- Enviar notificacoes push para dispositivos inscritos
- Fornecer um endpoint de health check

**URL Base:** `/api/*` (via Vercel Serverless)  
**Porta Local:** 5000 (para desenvolvimento)

---

## Endpoints

### GET /api/reservas

Retorna as reservas de laboratorio do dia e da semana.

**Resposta:**

```json
{
  "lab1_reservas": [...],
  "lab2_reservas": [...],
  "reservas_semana": [...],
  "data": "01 de Julho de 2026",
  "cache_info": { "timestamp": 1688169600 }
}
```

**Fonte de dados:** Planilha Excel no SharePoint (aba "RESERVA LAB. INFORMÁTICA")

**Cache:** 60 segundos

---

### GET /api/health

Retorna o status do servidor e informacoes sobre o cache.

**Resposta:**

```json
{
  "status": "ok",
  "cache": {
    "ativo": true,
    "ttl": 60,
    "timestamp": 1688169600
  },
  "url_configurada": true
}
```

---

### POST /api/push/subscribe

Inscreve um dispositivo para receber notificacoes push.

**Body:**

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

**Resposta:**

```json
{
  "status": "ok"
}
```

---

### GET /api/push/test

Envia uma notificacao de teste para todos os subscribers inscritos.

**Resposta:**

```json
{
  "sent": 3,
  "total": 5
}
```

---

### GET /api/push/check

Verifica se ha reservas proximas e envia notificacoes push automaticamente.

**Logica:**
1. Busca reservas de hoje
2. Para cada reserva, verifica se o horario esta dentro dos proximos 15 minutos
3. Envia push para todos os subscribers
4. Deduplicacao via MD5 com TTL de 2 horas
5. Tambem verifica reservas de tablets no Supabase

**Resposta:**

```json
{
  "checked": true,
  "sent": 2,
  "subscribers": 5
}
```

---

## Estrutura do Backend

```
src/apps/reservalab/api/
├── app.py              # Servidor Flask principal
├── .env                # Variaveis de ambiente
└── REGRAS_ARQUITETURA.md
```

---

## Padroes de Codigo

### Modulos

Cada modulo novo segue este padrao:

```python
# api/meu_modulo.py — SEM Flask, SEM app = Flask()
import logging
logger = logging.getLogger(__name__)

def get_meus_dados(parametro=None):
    try:
        # logica aqui
        return {'dados': [...], 'total': N}
    except Exception as e:
        logger.error(f"Erro: {e}")
        return {'error': str(e), 'dados': [], 'total': 0}
```

### Registro de Modulos

```python
import importlib.util as _ilu
_mod_path = os.path.join(BASE_DIR, 'api', 'meu_modulo.py')
_mod_spec = _ilu.spec_from_file_location('meu_modulo', _mod_path)
_mod = _ilu.module_from_spec(_mod_spec)

try:
    _mod_spec.loader.exec_module(_mod)

    @app.route('/api/minha-rota', methods=['GET'])
    def api_minha_rota():
        return jsonify(_mod.get_meus_dados())

    logger.info("Modulo carregado.")
except Exception as _e:
    logger.error(f"Modulo nao carregado: {_e}")
```

### Serializacao de Datas

```python
class DateEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (date, datetime)):
            return obj.strftime('%d/%m/%Y')
        return super().default(obj)
```

---

## Dependencias Python

- `flask` — Framework web
- `flask-cors` — CORS
- `openpyxl` — Leitura de planilhas Excel
- `requests` — Requisicoes HTTP
- `python-dotenv` — Variaveis de ambiente
- `upstash_redis` — Redis para push
- `pywebpush` — Web Push (VAPID)
- `hashlib` — Deduplicacao de push

---

## Variaveis de Ambiente

| Variavel | Obrigatorio | Descricao |
|----------|-------------|-----------|
| `SHAREPOINT_URL` | Sim | URL da planilha de reservas |
| `UPSTASH_REDIS_REST_URL` | Nao | URL do Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Nao | Token do Upstash Redis |
| `SUPABASE_URL` | Nao | URL do Supabase |
| `SUPABASE_SERVICE_KEY` | Nao | Service key do Supabase |

---

## Bugs Conhecidos e Correcoes

- `Object of type date is not JSON serializable` — Resolvido com `DateEncoder`
- Navbar muito alta no iPhone — Resolvido com `env(safe-area-inset-top)`
- Tela branca no PWA — Causada por cache do browser; solucao: reinstalar o app
