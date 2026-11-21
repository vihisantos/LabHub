"""Teste de regressão do fix de VAPID_CLAIMS no push_notify.

O pywebpush MUTA o dict de claims (adiciona `aud` e `exp`) na primeira chamada.
Se o push_notify passasse o global VAPID_CLAIMS, o `aud` do primeiro endpoint
(Ex.: https://fcm.googleapis.com) vazaria para todos os envios seguintes —
causando 403 BadJwtToken na Apple e "aud claim MUST include the origin" no FCM
quando o mesmo processo envia para os dois provedores (usuários com Chrome + Safari).
"""
import importlib.util
import json
import sys
import threading
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pg_store_fakes import PgStoreFakeMixin

RESERVALAB_API = Path(__file__).resolve().parents[2] / "src" / "apps" / "reservalab" / "api" / "app.py"

FCM_SUB = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/testtoken123",
    "keys": {"p256dh": "dGVzdA", "auth": "dGVzdA"},
}
APPLE_SUB = {
    "endpoint": "https://web.push.apple.com/testtoken456",
    "keys": {"p256dh": "dGVzdA", "auth": "dGVzdA"},
}
THIRD_SUB = {
    "endpoint": "https://push.example/terceiro",
    "keys": {"p256dh": "dGVzdA", "auth": "dGVzdA"},
}


@pytest.fixture(scope="module")
def rlab_module():
    spec = importlib.util.spec_from_file_location("reservalab_api_push", RESERVALAB_API)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["reservalab_api_push"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_push_notify_passa_copia_do_vapid_claims_por_envio(rlab_module, monkeypatch):
    """Cada envio recebe um dict proprio — o pywebpush muta aud/exp na copia,
    sem contaminar o global nem os envios seguintes."""
    calls = []

    def fake_webpush(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(rlab_module, "webpush", fake_webpush)

    assert rlab_module.push_notify(FCM_SUB, "titulo", "corpo") == rlab_module.PUSH_ACCEPTED
    assert rlab_module.push_notify(APPLE_SUB, "titulo", "corpo") == rlab_module.PUSH_ACCEPTED

    assert len(calls) == 2
    # Nenhuma chamada pode receber o global (que seria mutado pelo pywebpush)
    for c in calls:
        assert c["vapid_claims"] is not rlab_module.VAPID_CLAIMS
    # Os dois envios nao podem compartilhar o mesmo dict
    assert calls[0]["vapid_claims"] is not calls[1]["vapid_claims"]
    # O global permanece intocado (sem aud/exp vazando)
    assert "aud" not in rlab_module.VAPID_CLAIMS
    assert "exp" not in rlab_module.VAPID_CLAIMS


def test_push_notify_repassa_payload_e_ttl(rlab_module, monkeypatch):
    calls = []
    monkeypatch.setattr(rlab_module, "webpush", lambda **kw: calls.append(kw))

    rlab_module.push_notify(FCM_SUB, "Novo chamado #42", "Sala 1", url="/chamados/x", user_id="u1")

    assert len(calls) == 1
    c = calls[0]
    assert c["subscription_info"] == FCM_SUB
    assert c["ttl"] == 86400
    payload = __import__("json").loads(c["data"])
    assert payload["title"] == "Novo chamado #42"
    assert payload["body"] == "Sala 1"
    assert payload["url"] == "/chamados/x"
    assert payload["userId"] == "u1"


def test_push_notify_inclui_modulo_e_tag_sem_alterar_subscricao(rlab_module, monkeypatch):
    calls = []
    monkeypatch.setattr(rlab_module, "webpush", lambda **kw: calls.append(kw))
    result = rlab_module.push_notify(
        APPLE_SUB, "Chamado #12 sem responsável", "URGENTE: assumir agora",
        url="/chamados/tickets/12", module="chamados",
        tag="chamados:12:ciclo:wave:3",
    )
    assert result == rlab_module.PUSH_ACCEPTED
    data = json.loads(calls[0]["data"])
    assert data["module"] == "chamados"
    assert data["tag"] == "chamados:12:ciclo:wave:3"
    assert data["url"] == "/chamados/tickets/12"
    assert calls[0]["subscription_info"] is APPLE_SUB


class FakeRedis(PgStoreFakeMixin):
    """Mini fake do store: guarda membros e registra srem."""

    def __init__(self, members=None):
        self.members = set(members or [])
        self.removed = []

    def smembers(self, key):
        return set(self.members)

    def sadd(self, key, value):
        self.members.add(value)

    def srem(self, key, value):
        if value in self.members:
            self.members.remove(value)
            self.removed.append(value)
            return 1
        return 0

    def delete(self, key):
        self.members = set()


def _raise_http(status_code):
    from pywebpush import WebPushException

    class FakeResp:
        pass

    def boom(**kwargs):
        resp = FakeResp()
        resp.status_code = status_code
        raise WebPushException("Push failed", response=resp)

    return boom


def test_push_notify_remove_inscricao_410_do_redis(rlab_module, monkeypatch):
    """410 Gone (inscrição expirada) deve remover a inscrição do Redis."""
    fake = FakeRedis([json.dumps(FCM_SUB, ensure_ascii=False)])
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(410))

    resultado = rlab_module.push_notify(FCM_SUB, "t", "b")
    assert resultado == rlab_module.PUSH_REJECTED
    assert getattr(resultado, "invalid_subscription", False) is True
    assert fake.removed == [json.dumps(FCM_SUB, ensure_ascii=False)]
    assert fake.members == set()


def test_push_notify_remove_inscricao_404_do_redis(rlab_module, monkeypatch):
    """404 (endpoint removido) também deve limpar a inscrição."""
    fake = FakeRedis([json.dumps(FCM_SUB, ensure_ascii=False)])
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(404))

    resultado = rlab_module.push_notify(FCM_SUB, "t", "b")
    assert resultado == rlab_module.PUSH_REJECTED
    assert getattr(resultado, "invalid_subscription", False) is True
    assert fake.removed == [json.dumps(FCM_SUB, ensure_ascii=False)]


def test_push_notify_nao_remove_em_erro_nao_410(rlab_module, monkeypatch):
    """Erros de auth (403) ou genéricos NÃO podem remover a inscrição."""
    fake = FakeRedis([json.dumps(FCM_SUB, ensure_ascii=False)])
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(403))

    resultado = rlab_module.push_notify(FCM_SUB, "t", "b")
    assert resultado == rlab_module.PUSH_REJECTED
    assert getattr(resultado, "invalid_subscription", False) is False
    assert fake.removed == []
    assert fake.members == {json.dumps(FCM_SUB, ensure_ascii=False)}


def test_push_notify_sem_redis_nao_quebra_em_410(rlab_module, monkeypatch):
    """Sem Redis e com store Postgres indisponível, 410 não gera exceção.

    A remoção é best-effort: o serviço tenta o store, engole a falha e mantém
    o resultado `PUSH_REJECTED` com `invalid_subscription=True`.
    """
    chamadas = []

    class _StoreIndisponivel:
        def push_subs_list(self):
            chamadas.append("list")
            raise RuntimeError("Supabase indisponível")

        def push_subs_remove(self, endpoint):
            chamadas.append(("remove", endpoint))
            raise RuntimeError("Supabase indisponível")

    monkeypatch.setattr(rlab_module, "redis", None)
    monkeypatch.setattr(rlab_module, "push_store", _StoreIndisponivel())
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(410))

    resultado = rlab_module.push_notify(FCM_SUB, "t", "b")
    assert resultado == rlab_module.PUSH_REJECTED
    assert getattr(resultado, "invalid_subscription", False) is True
    assert chamadas == [("remove", FCM_SUB["endpoint"])]


def _fake_post_raise(exc):
    def boom(*args, **kwargs):
        raise exc
    return boom


def test_push_notify_timeout_durante_transmissao_retorna_unknown(rlab_module, monkeypatch):
    """Timeout no POST é indeterminado: nunca pode virar rejeição confirmada."""
    from requests.exceptions import Timeout

    sessions = []

    def fake_webpush(**kwargs):
        sessions.append(kwargs["requests_session"])
        kwargs["requests_session"].post("https://push.example/fcm")

    monkeypatch.setattr(rlab_module, "webpush", fake_webpush)
    monkeypatch.setattr(rlab_module.requests, "post",
                        _fake_post_raise(Timeout("tempo esgotado")))

    assert rlab_module.push_notify(FCM_SUB, "t", "b", timeout=20) == rlab_module.PUSH_UNKNOWN
    assert sessions and sessions[0].transmitted is True


def test_push_notify_connection_reset_retorna_unknown(rlab_module, monkeypatch):
    """Conexão reiniciada durante a transmissão não prova não-aceitação."""
    from requests.exceptions import ConnectionError

    def fake_webpush(**kwargs):
        kwargs["requests_session"].post("https://push.example/fcm")

    monkeypatch.setattr(rlab_module, "webpush", fake_webpush)
    monkeypatch.setattr(rlab_module.requests, "post",
                        _fake_post_raise(ConnectionError("connection reset")))

    assert rlab_module.push_notify(FCM_SUB, "t", "b") == rlab_module.PUSH_UNKNOWN


def test_push_notify_excecao_anterior_ao_envio_retorna_rejeitado(rlab_module, monkeypatch):
    """Falha local comprovada (subscription sem endpoint) é rejeição, não unknown."""
    from pywebpush import WebPushException

    def fake_webpush(**kwargs):
        assert kwargs["requests_session"].transmitted is False
        raise WebPushException("subscription_info missing endpoint URL")

    monkeypatch.setattr(rlab_module, "webpush", fake_webpush)

    assert rlab_module.push_notify(FCM_SUB, "t", "b") == rlab_module.PUSH_REJECTED


def test_push_notify_resposta_perdida_apos_aceitacao_explicita(rlab_module, monkeypatch):
    """Cenário explícito: provedor aceitou; a resposta se perdeu antes do retorno."""
    from requests.exceptions import ConnectionError

    provedor = {"aceitou": False}
    sessoes = []

    def fake_webpush(**kwargs):
        # O provedor registra a aceitação ANTES de a resposta se perder.
        provedor["aceitou"] = True
        sessoes.append(kwargs["requests_session"])
        kwargs["requests_session"].post("https://push.example/fcm")

    monkeypatch.setattr(rlab_module, "webpush", fake_webpush)
    monkeypatch.setattr(rlab_module.requests, "post",
                        _fake_post_raise(ConnectionError("resposta perdida")))

    assert rlab_module.push_notify(FCM_SUB, "t", "b") == rlab_module.PUSH_UNKNOWN
    assert provedor["aceitou"] is True
    assert sessoes[0].transmitted is True


def test_push_outcome_nao_transforma_unknown_em_aceito(rlab_module):
    """Contrato legado (bool) é compatível; desconhecido permanece desconhecido."""
    assert rlab_module._push_outcome(True) == rlab_module.PUSH_ACCEPTED
    assert rlab_module._push_outcome(False) == rlab_module.PUSH_REJECTED
    assert rlab_module._push_outcome(rlab_module.PUSH_UNKNOWN) == rlab_module.PUSH_UNKNOWN
    assert rlab_module._push_outcome(object()) == rlab_module.PUSH_UNKNOWN


def test_push_notify_subs_separa_contadores(rlab_module, monkeypatch):
    """Callers em massa não podem somar unknown/rejected em `sent`."""
    resultados = iter([
        rlab_module.PUSH_ACCEPTED,
        rlab_module.PUSH_UNKNOWN,
        rlab_module.PUSH_REJECTED,
    ])
    chamadas = []

    def fake_push(*args, **kwargs):
        chamadas.append(kwargs)
        return next(resultados)

    monkeypatch.setattr(rlab_module, "push_notify", fake_push)

    assert rlab_module._push_notify_subs(
        [FCM_SUB, APPLE_SUB, FCM_SUB], "titulo", "corpo"
    ) == (1, 1, 1)
    assert chamadas == [{"timeout": rlab_module.PUSH_BULK_TIMEOUT_SECONDS}] * 3


class _RedisDedupFake(PgStoreFakeMixin):
    """Fake do store de dedup com reserva, TTL, token e fencing.

    Não substitui PostgreSQL real: apenas reproduz a semântica atômica
    necessária para testar reserva, confirmação por token, liberação fenciada
    e expiração.
    """

    def __init__(self, fail_set=False, fail_confirm=False, fail_release=False):
        self.store = {}
        self.expires = {}
        self.now = 0
        self.fail_set = fail_set
        self.fail_confirm = fail_confirm
        self.fail_release = fail_release
        self._lock = __import__("threading").RLock()

    def _purge(self, key):
        expires_at = self.expires.get(key)
        if expires_at is not None and self.now >= expires_at:
            self.store.pop(key, None)
            self.expires.pop(key, None)

    def advance(self, seconds):
        with self._lock:
            self.now += int(seconds)
            for key in list(self.store):
                self._purge(key)

    def get(self, key):
        with self._lock:
            self._purge(key)
            return self.store.get(key)

    def ttl(self, key):
        with self._lock:
            self._purge(key)
            if key not in self.store:
                return -2
            expires_at = self.expires.get(key)
            if expires_at is None:
                return -1
            return max(0, expires_at - self.now)

    def set(self, key, value, ex=None, nx=None, **kwargs):
        with self._lock:
            self._purge(key)
            if self.fail_set:
                raise RuntimeError("Redis indisponível")
            if nx and key in self.store:
                return None
            self.store[key] = value
            if ex is not None:
                self.expires[key] = self.now + int(ex)
            else:
                self.expires.pop(key, None)
            return True

    def setex(self, key, ttl, value):
        with self._lock:
            self.store[key] = value
            self.expires[key] = self.now + int(ttl)

    def delete(self, key):
        with self._lock:
            existed = self.store.pop(key, None) is not None
            self.expires.pop(key, None)
            return existed

    def eval(self, script, keys=None, args=None):
        script = script or ''
        key = (keys or [None])[0]
        token = (args or [None])[0]
        with self._lock:
            self._purge(key)
            raw = self.store.get(key)
            if raw is None:
                return 0
            value = str(raw)
            if ':' not in value:
                return 0
            state, current = value.split(':', 1)
            if '-- push-dedup-confirm' in script:
                if self.fail_confirm:
                    raise RuntimeError("Redis eval indisponível")
                if state != 'reserved' or current != token:
                    return 0
                remaining = self.ttl(key)
                if remaining <= 0:
                    remaining = int((args or [None, 3600])[1])
                self.setex(key, remaining, 'accepted:' + token)
                return 1
            if '-- push-dedup-release' in script:
                if self.fail_release:
                    raise RuntimeError("Redis eval indisponível")
                if state != 'reserved' or current != token:
                    return 0
                return 1 if self.delete(key) else 0
            return 0


@pytest.mark.parametrize(
    "outcomes,esperado_envios,esperado_marcas",
    [
        (["PUSH_ACCEPTED"], 1, 1),
        (["PUSH_UNKNOWN"], 0, 0),
        (["PUSH_REJECTED"], 0, 0),
        (["PUSH_ACCEPTED", "PUSH_UNKNOWN"], 1, 1),
        (["PUSH_ACCEPTED", "PUSH_REJECTED"], 1, 1),
        (["PUSH_ACCEPTED", "PUSH_ACCEPTED"], 2, 2),
    ],
)
def test_cron_dedup_individual_em_resultados_mistos(
    rlab_module, monkeypatch, outcomes, esperado_envios, esperado_marcas
):
    """Fluxo real de cron: cada destinatário aceito é marcado, sem afetar os outros."""
    monkeypatch.setenv("SUPABASE_URL", "https://supabase.example")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "chave-teste")

    class _Resp:
        ok = True

        def json(self):
            return [{"id": "u1", "name": "Ana", "email": "ana@example.com"}]

    resultado_push = iter(getattr(rlab_module, nome) for nome in outcomes)
    subs = [
        {"endpoint": f"https://push.example/{i}", "keys": {}}
        for i in range(len(outcomes))
    ]
    fake_redis = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", fake_redis)
    monkeypatch.setattr(rlab_module, "_target_subs", lambda **kw: subs)
    monkeypatch.setattr(rlab_module.requests, "get", lambda *a, **k: _Resp())
    monkeypatch.setattr(rlab_module, "push_notify", lambda *a, **k: next(resultado_push))

    resultado = rlab_module._check_pending_users()

    assert resultado["sent"] == esperado_envios
    # Uma marca por destinatário aceito; nunca uma marca global do lote.
    assert len(fake_redis.store) == esperado_marcas
    identities = {rlab_module._push_sub_dedup_identity(s) for s in subs}
    for chave in fake_redis.store:
        assert chave.startswith("push:sent:")
        assert any(ident in chave for ident in identities)


# ── A2: deduplicação individual por destinatário ───────────────────────────

def _instalar_push(rlab_module, monkeypatch, resultados):
    """Instala push_notify com resultados em sequência e registra os envios."""
    fila = iter(resultados)
    enviados = []

    def fake_push(sub, title, body, **kwargs):
        enviados.append(sub["endpoint"])
        return next(fila)

    monkeypatch.setattr(rlab_module, "push_notify", fake_push)
    return enviados


def test_dedup_individual_aceito_desconhecido_rejeitado(rlab_module, monkeypatch):
    """A aceito, B desconhecido, C rejeitado: só A fica marcado."""
    subs = [FCM_SUB, APPLE_SUB, THIRD_SUB]
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    enviados = _instalar_push(rlab_module, monkeypatch, [
        rlab_module.PUSH_ACCEPTED,
        rlab_module.PUSH_UNKNOWN,
        rlab_module.PUSH_REJECTED,
    ])
    ctx = {"workspace_id": "ws-a", "context": "ctx"}

    primeiro = rlab_module._push_notify_subs_dedup(subs, "evt-1", 3600, "t", "b", **ctx)
    assert primeiro == (1, 1, 1, 0, 0)
    assert enviados == [s["endpoint"] for s in subs]

    chaves = {
        "A": rlab_module._push_dedup_key("evt-1", FCM_SUB, **ctx),
        "B": rlab_module._push_dedup_key("evt-1", APPLE_SUB, **ctx),
        "C": rlab_module._push_dedup_key("evt-1", THIRD_SUB, **ctx),
    }
    assert len(set(chaves.values())) == 3
    assert list(redis_fake.store) == [chaves["A"]]  # B e C liberados

    # 2ª execução: A não reenvia; B e C recebem a política de retentativa.
    enviados = _instalar_push(rlab_module, monkeypatch, [
        rlab_module.PUSH_ACCEPTED,
        rlab_module.PUSH_REJECTED,
    ])
    segundo = rlab_module._push_notify_subs_dedup(subs, "evt-1", 3600, "t", "b", **ctx)
    assert segundo == (1, 1, 0, 1, 0)
    assert enviados == [APPLE_SUB["endpoint"], THIRD_SUB["endpoint"]]
    assert chaves["A"] in redis_fake.store          # marca de A preservada (não reenviado)
    assert chaves["B"] in redis_fake.store          # B voltou a tentar e foi aceito
    assert chaves["C"] not in redis_fake.store      # rejeição não virou confirmação


def test_dedup_individual_isola_workspaces_e_eventos(rlab_module, monkeypatch):
    """Mesmo destinatário em workspaces/eventos diferentes é independente."""
    chave_a1 = rlab_module._push_dedup_key("evt-1", FCM_SUB, workspace_id="ws-a", context="ctx")
    chave_b1 = rlab_module._push_dedup_key("evt-1", FCM_SUB, workspace_id="ws-b", context="ctx")
    chave_a2 = rlab_module._push_dedup_key("evt-2", FCM_SUB, workspace_id="ws-a", context="ctx")
    assert len({chave_a1, chave_b1, chave_a2}) == 3

    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    enviados = _instalar_push(rlab_module, monkeypatch, [rlab_module.PUSH_ACCEPTED] * 3)

    for evento, ws in (("evt-1", "ws-a"), ("evt-1", "ws-b"), ("evt-2", "ws-a")):
        rlab_module._push_notify_subs_dedup(
            [FCM_SUB], evento, 3600, "t", "b", workspace_id=ws, context="ctx"
        )
    assert len(enviados) == 3
    assert set(redis_fake.store) == {chave_a1, chave_b1, chave_a2}


def test_dedup_individual_sem_identidade_fica_fechado(rlab_module, monkeypatch):
    """Destinatário sem identidade estável não é enviado nem marcado."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    monkeypatch.setattr(rlab_module, "push_notify", lambda *a, **k: rlab_module.PUSH_ACCEPTED)

    resultado = rlab_module._push_notify_subs_dedup(
        [{"keys": {}}], "evt", 3600, "t", "b"
    )
    assert resultado == (0, 0, 0, 1, 0)
    assert redis_fake.store == {}


def test_dedup_individual_falha_redis_nao_gera_confirmacao(rlab_module, monkeypatch):
    """Falha na reserva atômica: nenhum envio e nenhuma confirmação falsa."""
    monkeypatch.setattr(rlab_module, "redis", _RedisDedupFake(fail_set=True))
    chamados = []
    monkeypatch.setattr(rlab_module, "push_notify", lambda *a, **k: chamados.append(1))

    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB, APPLE_SUB], "evt", 3600, "t", "b"
    )
    assert resultado == (0, 0, 0, 0, 2)
    assert chamados == []


def test_dedup_individual_concorrencia_atomica(rlab_module, monkeypatch):
    """Duas execuções simultâneas no mesmo destinatário: um único envio."""
    import threading as _threading

    barreira = _threading.Barrier(2)
    erros = []

    class _BarreiraRedis(_RedisDedupFake):
        def set(self, key, value, ex=None, nx=None, **kwargs):
            # Sincroniza as duas threads ANTES do SET NX, sem sleep.
            assert barreira.wait(10) >= 0
            return super().set(key, value, ex=ex, nx=nx)

    redis_fake = _BarreiraRedis()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    enviados = []

    def fake_push(sub, title, body, **kwargs):
        enviados.append(sub["endpoint"])
        return rlab_module.PUSH_ACCEPTED

    monkeypatch.setattr(rlab_module, "push_notify", fake_push)

    resultados = []

    def rodar():
        try:
            resultados.append(
                rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-race", 3600, "t", "b")
            )
        except Exception as exc:  # pragma: no cover - diagnóstico do teste
            erros.append(exc)

    t1 = _threading.Thread(target=rodar, name="dedup-1", daemon=True)
    t2 = _threading.Thread(target=rodar, name="dedup-2", daemon=True)
    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    assert not t1.is_alive() and not t2.is_alive()
    assert erros == []
    assert len(enviados) == 1
    assert len(resultados) == 2
    assert sorted(r[0] for r in resultados) == [0, 1]  # um aceito, um skipado
    assert len(redis_fake.store) == 1


# ── Reserva temporária, confirmação e liberação fenciada ───────────────────


def _dedup_ctx():
    return {"workspace_id": "ws-a", "context": "ctx"}


def _instalar_push_unico(rlab_module, monkeypatch, resultado):
    enviados = []

    def fake_push(sub, title, body, **kwargs):
        enviados.append(sub["endpoint"])
        return resultado

    monkeypatch.setattr(rlab_module, "push_notify", fake_push)
    return enviados


def test_reserva_abandonada_expira_e_nova_execucao_envia(rlab_module, monkeypatch):
    """Processo encerrado após a reserva: o TTL libera a chave para nova execução."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    chamados = []

    def morre_antes_do_push(sub, title, body, **kwargs):
        chamados.append(sub["endpoint"])
        raise SystemExit("processo encerrado antes do envio")

    monkeypatch.setattr(rlab_module, "push_notify", morre_antes_do_push)
    ctx = _dedup_ctx()

    with pytest.raises(SystemExit):
        rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-aband", 60, "t", "b", **ctx)

    key = rlab_module._push_dedup_key("evt-aband", FCM_SUB, **ctx)
    estado, token = rlab_module._push_dedup_state(redis_fake.get(key))
    assert estado == "reserved"
    assert token
    assert chamados == [FCM_SUB["endpoint"]]

    enviados = _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_ACCEPTED)
    bloqueado = rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-aband", 60, "t", "b", **ctx)
    assert bloqueado == (0, 0, 0, 1, 0)
    assert enviados == []

    redis_fake.advance(60)
    assert redis_fake.get(key) is None

    enviado = rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-aband", 60, "t", "b", **ctx)
    assert enviado[0] == 1
    assert enviados == [FCM_SUB["endpoint"]]
    estado, _ = rlab_module._push_dedup_state(redis_fake.get(key))
    assert estado == "accepted"


def test_push_accepted_consolida_marca_definitiva(rlab_module, monkeypatch):
    """PUSH_ACCEPTED transforma a reserva em marca definitiva, preservando o TTL."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_ACCEPTED)
    ctx = _dedup_ctx()

    resultado = rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-ok", 300, "t", "b", **ctx)
    assert resultado == (1, 0, 0, 0, 0)

    key = rlab_module._push_dedup_key("evt-ok", FCM_SUB, **ctx)
    raw = redis_fake.get(key)
    estado, token = rlab_module._push_dedup_state(raw)
    assert estado == "accepted"
    assert raw == f"accepted:{token}"
    assert 0 < redis_fake.ttl(key) <= 300


def test_push_rejected_libera_apenas_reserva_atual(rlab_module, monkeypatch):
    """PUSH_REJECTED remove a reserva da execução atual, nunca marca alheia."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    ctx = _dedup_ctx()
    key = rlab_module._push_dedup_key("evt-rej", FCM_SUB, **ctx)

    chave_alheia = "push:sent:alheio"
    redis_fake.set(chave_alheia, "accepted:token-alheio", ex=300)

    # A reserva atual é criada pelo "erved" com a chave do destinatário, que é
    # exatamente a chave que a liberação fenciada deve remover.
    class _CapturaSet(_RedisDedupFake):
        def set(self, key_arg, value, ex=None, nx=None, **kwargs):
            self.token_capturado = str(value).split(":", 1)[1]
            return super().set(key_arg, value, ex=ex, nx=nx)

    redis_fake = _CapturaSet()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    redis_fake.set(chave_alheia, "accepted:token-alheio", ex=300)
    _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_REJECTED)

    resultado = rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-rej", 300, "t", "b", **ctx)
    assert resultado == (0, 1, 0, 0, 0)
    assert redis_fake.get(key) is None
    assert redis_fake.get(chave_alheia) == "accepted:token-alheio"
    assert redis_fake.token_capturado
    assert not rlab_module._push_dedup_release(key, "token-errado")


def test_push_unknown_nao_cria_confirmacao(rlab_module, monkeypatch):
    """PUSH_UNKNOWN jamais vira marca accepted: a reserva é liberada."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_UNKNOWN)
    ctx = _dedup_ctx()

    resultado = rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-unk", 300, "t", "b", **ctx)
    assert resultado == (0, 0, 1, 0, 0)

    key = rlab_module._push_dedup_key("evt-unk", FCM_SUB, **ctx)
    assert redis_fake.get(key) is None
    estado, _ = rlab_module._push_dedup_state(redis_fake.get(key))
    assert estado == "absent"


def test_falha_redis_ao_confirmar_nao_reporta_aceitacao(rlab_module, monkeypatch):
    """Falha no EVAL de confirmação: nenhuma confirmação falsa é reportada."""
    redis_fake = _RedisDedupFake(fail_confirm=True)
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_ACCEPTED)
    ctx = _dedup_ctx()

    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB], "evt-falha-confirm", 300, "t", "b", **ctx
    )
    assert resultado == (0, 0, 0, 0, 1)

    key = rlab_module._push_dedup_key("evt-falha-confirm", FCM_SUB, **ctx)
    assert redis_fake.get(key) is None


def test_falha_redis_ao_liberar_reserva_expira(rlab_module, monkeypatch):
    """Falha no EVAL de liberação: a reserva expira pelo TTL e permite retentativa."""
    redis_fake = _RedisDedupFake(fail_release=True)
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_UNKNOWN)
    ctx = _dedup_ctx()

    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB], "evt-falha-release", 30, "t", "b", **ctx
    )
    assert resultado == (0, 0, 1, 0, 0)

    key = rlab_module._push_dedup_key("evt-falha-release", FCM_SUB, **ctx)
    estado, _ = rlab_module._push_dedup_state(redis_fake.get(key))
    assert estado == "reserved"

    # A reserva órfã bloqueia enquanto válida e expira naturalmente.
    redis_fake.fail_release = False
    bloqueado = rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-falha-release", 30, "t", "b", **ctx)
    assert bloqueado == (0, 0, 0, 1, 0)

    redis_fake.advance(30)
    assert redis_fake.get(key) is None
    enviados = _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_ACCEPTED)
    recuperado = rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-falha-release", 30, "t", "b", **ctx)
    assert recuperado[0] == 1
    assert enviados == [FCM_SUB["endpoint"]]


def test_token_antigo_nao_altera_reserva_nova(rlab_module, monkeypatch):
    """Execução A perde a reserva; B adquire nova; A não confirma nem libera B."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    ctx = _dedup_ctx()
    key = rlab_module._push_dedup_key("evt-fencing", FCM_SUB, **ctx)

    token_a = "token-a"
    token_b = "token-b"
    redis_fake.set(key, f"reserved:{token_a}", ex=300, nx=True)

    # A tenta confirmar e liberar depois que B substituiu a reserva.
    redis_fake.set(key, f"reserved:{token_b}", ex=300)
    assert redis_fake.dedup_confirm(key, token_a) is False
    estado, atual = rlab_module._push_dedup_state(redis_fake.get(key))
    assert estado == "reserved"
    assert atual == token_b

    assert not rlab_module._push_dedup_release(key, token_a)
    estado, atual = rlab_module._push_dedup_state(redis_fake.get(key))
    assert estado == "reserved"
    assert atual == token_b

    # B confirma normalmente.
    assert redis_fake.dedup_confirm(key, token_b) is True
    estado, atual = rlab_module._push_dedup_state(redis_fake.get(key))
    assert estado == "accepted"
    assert atual == token_b


def test_reserva_existente_impede_envio_concorrente(rlab_module, monkeypatch):
    """Uma reserva válida bloqueia outra execução até expirar."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    ctx = _dedup_ctx()
    key = rlab_module._push_dedup_key("evt-reservada", FCM_SUB, **ctx)
    redis_fake.set(key, "reserved:token-vivo", ex=300, nx=True)

    enviados = _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_ACCEPTED)
    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB], "evt-reservada", 300, "t", "b", **ctx
    )
    assert resultado == (0, 0, 0, 1, 0)
    assert enviados == []
    estado, token = rlab_module._push_dedup_state(redis_fake.get(key))
    assert estado == "reserved"
    assert token == "token-vivo"


def test_marca_accepted_existente_impede_novo_envio(rlab_module, monkeypatch):
    """Marca definitiva (inclusive formato legado) bloqueia reenvio."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    ctx = _dedup_ctx()
    key = rlab_module._push_dedup_key("evt-accepted", FCM_SUB, **ctx)

    for raw in ("accepted:token-antigo", "1"):
        redis_fake.store[key] = raw
        redis_fake.expires[key] = redis_fake.now + 300
        enviados = _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_ACCEPTED)
        resultado = rlab_module._push_notify_subs_dedup(
            [FCM_SUB], "evt-accepted", 300, "t", "b", **ctx
        )
        assert resultado == (0, 0, 0, 1, 0)
        assert enviados == []
        assert redis_fake.get(key) == raw


def test_dedup_valor_desconhecido_e_fechado(rlab_module, monkeypatch):
    """Valores corrompidos não são interpretados como confirmação nem apagados."""
    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    ctx = _dedup_ctx()
    key = rlab_module._push_dedup_key("evt-corrompido", FCM_SUB, **ctx)
    redis_fake.store[key] = "lixo"
    redis_fake.expires[key] = redis_fake.now + 300

    enviados = _instalar_push_unico(rlab_module, monkeypatch, rlab_module.PUSH_ACCEPTED)
    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB], "evt-corrompido", 300, "t", "b", **ctx
    )
    assert resultado == (0, 0, 0, 1, 0)
    assert enviados == []
    assert redis_fake.get(key) == "lixo"
    assert rlab_module._push_dedup_state("lixo") == ("unknown", None)
    assert rlab_module._push_dedup_state(None) == ("absent", None)


def test_dedup_isola_destinatario_e_contexto(rlab_module, monkeypatch):
    """Chaves distintas por destinatário, evento, workspace e contexto."""
    ctx_a = {"workspace_id": "ws-a", "context": "ctx-a"}
    ctx_b = {"workspace_id": "ws-a", "context": "ctx-b"}
    ctx_ws = {"workspace_id": "ws-b", "context": "ctx-a"}

    chaves = {
        "dest": rlab_module._push_dedup_key("evt", FCM_SUB, **ctx_a),
        "ctx": rlab_module._push_dedup_key("evt", FCM_SUB, **ctx_b),
        "ws": rlab_module._push_dedup_key("evt", FCM_SUB, **ctx_ws),
        "evt": rlab_module._push_dedup_key("evt-2", FCM_SUB, **ctx_a),
    }
    assert len(set(chaves.values())) == 4

    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    enviados = []

    def fake_push(sub, title, body, **kwargs):
        enviados.append(sub["endpoint"])
        return rlab_module.PUSH_ACCEPTED

    monkeypatch.setattr(rlab_module, "push_notify", fake_push)
    rlab_module._push_notify_subs_dedup([FCM_SUB], "evt", 300, "t", "b", **ctx_a)
    rlab_module._push_notify_subs_dedup([FCM_SUB], "evt", 300, "t", "b", **ctx_b)
    rlab_module._push_notify_subs_dedup([FCM_SUB], "evt", 300, "t", "b", **ctx_ws)
    rlab_module._push_notify_subs_dedup([FCM_SUB], "evt-2", 300, "t", "b", **ctx_a)

    assert len(enviados) == 4
    assert set(redis_fake.store) == set(chaves.values())


# ── A3: matriz de classificação de erros do Push ───────────────────────────

@pytest.mark.parametrize("status,esperado_attr,remove", [
    (400, "PUSH_REJECTED", False),
    (401, "PUSH_REJECTED", False),
    (403, "PUSH_REJECTED", False),
    (404, "PUSH_REJECTED", True),
    (410, "PUSH_REJECTED", True),
    (500, "PUSH_UNKNOWN", False),
    (502, "PUSH_UNKNOWN", False),
    (503, "PUSH_UNKNOWN", False),
    (429, "PUSH_UNKNOWN", False),
])
def test_classificacao_http_status_preserva_efeitos_colaterais(
    rlab_module, monkeypatch, status, esperado_attr, remove
):
    """5xx é indeterminado; 404/410 removem inscrição; 400/401/403 rejeitam."""
    fake = FakeRedis([json.dumps(FCM_SUB, ensure_ascii=False)])
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(status))

    assert rlab_module.push_notify(FCM_SUB, "t", "b") == getattr(rlab_module, esperado_attr)
    assert bool(fake.removed) is remove
    if not remove:
        assert fake.members == {json.dumps(FCM_SUB, ensure_ascii=False)}


def test_classificacao_http_2xx_e_aceitacao_para_entrega(rlab_module, monkeypatch):
    """2xx é aceitação para entrega, nunca confirmação de exibição."""
    monkeypatch.setattr(rlab_module, "webpush", lambda **kw: None)
    assert rlab_module.push_notify(FCM_SUB, "t", "b") == rlab_module.PUSH_ACCEPTED


def test_5xx_no_cron_nao_marca_dedup_nem_conta_sent(rlab_module, monkeypatch):
    """Erro 5xx no fluxo real: sem marca, sem `sent`, sem remoção de inscrição."""
    monkeypatch.setenv("SUPABASE_URL", "https://supabase.example")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "chave-teste")

    class _Resp:
        ok = True

        def json(self):
            return [{"id": "u5", "name": "Ana", "email": "ana@example.com"}]

    redis_fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", redis_fake)
    monkeypatch.setattr(rlab_module, "_target_subs", lambda **kw: [FCM_SUB])
    monkeypatch.setattr(rlab_module.requests, "get", lambda *a, **k: _Resp())
    # webpush 503 com resposta: classificado como unknown (não rejeição).
    monkeypatch.setattr(rlab_module, "webpush", _raise_http(503))

    resultado = rlab_module._check_pending_users()
    assert resultado["sent"] == 0
    assert redis_fake.store == {}


# ── Auditoria final: chave legada global e semântica de `sent` ───────────────

def test_dedup_legada_global_tentativa_nao_conta_aceitacao(rlab_module, monkeypatch):
    """`'1'` é tentativa antiga: não prova 2xx, não pula o lote e não é `accepted`."""
    fake = _RedisDedupFake()
    chave_legada = rlab_module._push_legacy_dedup_key("evento-legado")
    assert chave_legada == "push:sent:evento-legado"
    fake.store[chave_legada] = "1"
    fake.expires[chave_legada] = fake.now + 600
    monkeypatch.setattr(rlab_module, "redis", fake)

    chamados = []

    def push(*args, **kwargs):
        chamados.append(args[0]["endpoint"])
        return rlab_module.PUSH_ACCEPTED

    monkeypatch.setattr(rlab_module, "push_notify", push)

    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB, APPLE_SUB], "evento-legado", 600, "titulo", "corpo",
    )

    # Segue o fluxo individual; a chave antiga não vira confirmação global nem
    # marca individual. Aceitações contam somente se o provedor responder 2xx.
    assert resultado == (2, 0, 0, 0, 0)
    assert chamados == [FCM_SUB["endpoint"], APPLE_SUB["endpoint"]]
    assert fake.store[chave_legada] == "1"  # não reescreve nem cria chave global
    individuais = [k for k in fake.store if k != chave_legada]
    assert len(individuais) == 2
    assert all(k.startswith("push:sent:evento-legado:") for k in individuais)
    assert all(str(fake.store[k]).startswith("accepted:") for k in individuais)


def test_dedup_legada_um_nao_marca_aceitacao_individual(rlab_module, monkeypatch):
    """Mesmo com chave antiga `'1'`, rejeição do provedor permanece rejeição."""
    fake = _RedisDedupFake()
    chave_legada = rlab_module._push_legacy_dedup_key("evento-legado-rejeitado")
    fake.store[chave_legada] = "1"
    fake.expires[chave_legada] = fake.now + 600
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(
        rlab_module, "push_notify", lambda *a, **k: rlab_module.PUSH_REJECTED,
    )

    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB], "evento-legado-rejeitado", 600, "titulo", "corpo",
    )

    assert resultado == (0, 1, 0, 0, 0)
    assert fake.store[chave_legada] == "1"
    assert set(fake.store) == {chave_legada}  # nenhuma marca individual criada


def test_classificacao_chave_legada_global(rlab_module):
    """Estado da chave global é explícito: tentativa não é aceitação."""
    assert rlab_module._push_legacy_dedup_state(None) == "absent"
    assert rlab_module._push_legacy_dedup_state("1") == "attempted"
    assert rlab_module._push_legacy_dedup_state("accepted:token") == "unknown"
    assert rlab_module._push_legacy_dedup_state("reserved:token") == "unknown"
    assert rlab_module._push_legacy_dedup_state("lixo") == "unknown"


@pytest.mark.parametrize("valor", ["reserved:token-alheio", "accepted:token-alheio", "lixo"])
def test_dedup_legada_estado_duplicado_falha_fechado(rlab_module, monkeypatch, valor):
    """Valor não aceito na chave global não autoriza envio nem confirmação."""
    fake = _RedisDedupFake()
    chave_legada = rlab_module._push_legacy_dedup_key("evento-duplicado")
    fake.store[chave_legada] = valor
    fake.expires[chave_legada] = fake.now + 600
    monkeypatch.setattr(rlab_module, "redis", fake)

    chamados = []
    monkeypatch.setattr(
        rlab_module, "push_notify",
        lambda *a, **k: chamados.append(a[0]["endpoint"]) or rlab_module.PUSH_ACCEPTED,
    )

    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB, APPLE_SUB], "evento-duplicado", 600, "titulo", "corpo",
    )

    assert resultado == (0, 0, 0, 0, 2)
    assert chamados == []


def test_dedup_legada_falha_na_leitura_falha_fechado(rlab_module, monkeypatch):
    """Redis indisponível na checagem legada não pode virar permissão de envio."""
    fake = _RedisDedupFake()

    def falha_get(key):
        raise RuntimeError("Redis get falhou")

    monkeypatch.setattr(fake, "get", falha_get)
    monkeypatch.setattr(rlab_module, "redis", fake)
    chamados = []
    monkeypatch.setattr(
        rlab_module, "push_notify",
        lambda *a, **k: chamados.append(a[0]["endpoint"]) or rlab_module.PUSH_ACCEPTED,
    )

    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB], "evento-sem-redis", 600, "titulo", "corpo",
    )

    assert resultado == (0, 0, 0, 0, 1)
    assert chamados == []


def test_dedup_legada_ausente_usa_marcas_individuais(rlab_module, monkeypatch):
    """Sem chave global antiga, o fluxo individual continua normalmente."""
    fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", fake)
    monkeypatch.setattr(rlab_module, "push_notify", lambda *a, **k: rlab_module.PUSH_ACCEPTED)

    resultado = rlab_module._push_notify_subs_dedup(
        [FCM_SUB], "evento-novo", 600, "titulo", "corpo",
    )

    assert resultado == (1, 0, 0, 0, 0)
    assert len(fake.store) == 1
    chave = next(iter(fake.store))
    assert chave.startswith("push:sent:evento-novo:")
    assert rlab_module._push_legacy_dedup_key("evento-novo") not in fake.store


def test_sent_conta_apenas_aceitacao_confirmada(rlab_module, monkeypatch):
    """`sent` é número de destinatários aceitos, não tentativas/rejeições/unknown."""
    fake = _RedisDedupFake()
    monkeypatch.setattr(rlab_module, "redis", fake)
    quarto_sub = {
        "endpoint": "https://push.example/quarto",
        "keys": {"p256dh": "dGVzdA", "auth": "dGVzdA"},
    }
    resultados = iter([
        rlab_module.PUSH_ACCEPTED,
        rlab_module.PUSH_UNKNOWN,
        rlab_module.PUSH_REJECTED,
        rlab_module.PUSH_ACCEPTED,
    ])
    monkeypatch.setattr(rlab_module, "push_notify", lambda *a, **k: next(resultados))

    accepted, rejected, unknown, skipped, dedup_failed = rlab_module._push_notify_subs_dedup(
        [FCM_SUB, APPLE_SUB, THIRD_SUB, quarto_sub], "evento-sent", 600, "titulo", "corpo",
    )

    assert (accepted, rejected, unknown) == (2, 1, 1)
    assert skipped == 0 and dedup_failed == 0
    assert len(fake.store) == 2  # uma marca por aceitação confirmada


def test_push_device_test_only_sends_to_the_authenticated_devices_subscription(rlab_module, monkeypatch):
    sub = {**FCM_SUB, "user": {"id": "user-1"}}
    calls = []
    monkeypatch.setattr(rlab_module, "redis", object())
    monkeypatch.setattr(rlab_module, "_get_subs", lambda: [sub])
    monkeypatch.setattr(rlab_module, "push_notify", lambda *args, **kwargs: calls.append((args, kwargs)) or True)

    with rlab_module.app.test_request_context(
        "/api/push/test-device", method="POST", json={"endpoint": FCM_SUB["endpoint"]}
    ):
        rlab_module.g.user = {"id": "user-1"}
        response = rlab_module.app.make_response(rlab_module.push_test_device.__wrapped__())

    assert response.status_code == 200
    assert response.get_json() == {"sent": True}
    assert len(calls) == 1
    assert calls[0][0][0] == sub


def test_push_device_test_rejects_another_users_subscription(rlab_module, monkeypatch):
    sub = {**FCM_SUB, "user": {"id": "user-2"}}
    calls = []
    monkeypatch.setattr(rlab_module, "redis", object())
    monkeypatch.setattr(rlab_module, "_get_subs", lambda: [sub])
    monkeypatch.setattr(rlab_module, "push_notify", lambda *args, **kwargs: calls.append(args) or True)

    with rlab_module.app.test_request_context(
        "/api/push/test-device", method="POST", json={"endpoint": FCM_SUB["endpoint"]}
    ):
        rlab_module.g.user = {"id": "user-1"}
        response = rlab_module.app.make_response(rlab_module.push_test_device.__wrapped__())

    assert response.status_code == 404
    assert response.get_json()["error"]
    assert calls == []
