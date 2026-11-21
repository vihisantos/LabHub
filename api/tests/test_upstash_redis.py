import importlib.util
from pathlib import Path
from unittest.mock import Mock, patch

MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "src" / "apps" / "reservalab" / "api" / "upstash_redis.py"
)
SPEC = importlib.util.spec_from_file_location("upstash_redis_under_test", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def make_client():
    return MODULE.UpstashRedis("https://example.upstash.io", "test-token")


@patch.object(MODULE.requests, "post")
def test_ping_sends_authenticated_command(post):
    response = Mock()
    response.json.return_value = {"result": "PONG"}
    post.return_value = response

    assert make_client().ping() == "PONG"
    kwargs = post.call_args.kwargs
    assert kwargs["json"] == ["PING"]
    assert kwargs["headers"]["Authorization"] == "Bearer test-token"
    assert kwargs["timeout"] == 2.5


@patch.object(MODULE.requests, "post")
def test_set_supports_expiration_and_nx(post):
    response = Mock()
    response.json.return_value = {"result": "OK"}
    post.return_value = response

    assert make_client().set("labhub:test", "value", ex=60, nx=True) == "OK"
    assert post.call_args.kwargs["json"] == [
        "SET", "labhub:test", "value", "EX", 60, "NX"
    ]


@patch.object(MODULE.requests, "post")
def test_eval_builds_key_and_argument_list(post):
    response = Mock()
    response.json.return_value = {"result": 1}
    post.return_value = response

    result = make_client().eval("return 1", ["queue:lock"], ["worker", 30])
    assert result == 1
    assert post.call_args.kwargs["json"] == [
        "EVAL", "return 1", 1, "queue:lock", "worker", 30
    ]


@patch.object(MODULE.requests, "post")
def test_upstash_error_is_not_reported_as_empty_result(post):
    response = Mock()
    response.json.return_value = {"error": "WRONGTYPE"}
    post.return_value = response

    try:
        make_client().get("labhub:key")
    except MODULE.UpstashRedisError as exc:
        assert "WRONGTYPE" in str(exc)
    else:
        raise AssertionError("Upstash error must propagate")


def test_client_is_disabled_without_both_environment_variables(monkeypatch):
    monkeypatch.delenv("UPSTASH_REDIS_REST_URL", raising=False)
    monkeypatch.delenv("UPSTASH_REDIS_REST_TOKEN", raising=False)
    assert MODULE.create_redis_client() is None


@patch.object(MODULE.requests, "post")
def test_xadd_encodes_stream_fields(post):
    response = Mock()
    response.json.return_value = {"result": "1730000000000-0"}
    post.return_value = response

    result = make_client().xadd(
        "labhub:notifications:stream:v1",
        {"event_id": "evt-1", "payload": "{\"ok\":true}"},
    )

    assert result == "1730000000000-0"
    assert post.call_args.kwargs["json"] == [
        "XADD", "labhub:notifications:stream:v1", "*",
        "event_id", "evt-1", "payload", "{\"ok\":true}",
    ]


@patch.object(MODULE.requests, "post")
def test_xreadgroup_is_non_blocking_and_bounded(post):
    response = Mock()
    response.json.return_value = {"result": []}
    post.return_value = response

    assert make_client().xreadgroup("stream", "workers", "worker-a", count=5) == []
    assert post.call_args.kwargs["json"] == [
        "XREADGROUP", "GROUP", "workers", "worker-a",
        "COUNT", 5, "STREAMS", "stream", ">",
    ]


@patch.object(MODULE.requests, "post")
def test_xautoclaim_and_xack_commands(post):
    response = Mock()
    response.json.return_value = {"result": ["0-0", [], []]}
    post.return_value = response

    client = make_client()
    assert client.xautoclaim("stream", "workers", "worker-b", 30_000) == ["0-0", [], []]
    assert post.call_args.kwargs["json"] == [
        "XAUTOCLAIM", "stream", "workers", "worker-b", 30_000, "0-0", "COUNT", 10,
    ]

    response.json.return_value = {"result": 1}
    assert client.xack("stream", "workers", "1730000000000-0") == 1
    assert post.call_args.kwargs["json"] == [
        "XACK", "stream", "workers", "1730000000000-0",
    ]


def make_http_error(status: int, error: str):
    response = Mock()
    response.status_code = status
    response.json.return_value = {"error": error}
    return response


@patch.object(MODULE.requests, "post")
def test_xgroup_create_sends_exact_arguments(post):
    response = Mock()
    response.status_code = 200
    response.json.return_value = {"result": "OK"}
    post.return_value = response

    assert make_client().xgroup_create(
        "labhub:notifications:stream:v1", "labhub-notification-workers",
        "0", mkstream=True,
    ) == "OK"
    assert post.call_args.kwargs["json"] == [
        "XGROUP", "CREATE", "labhub:notifications:stream:v1",
        "labhub-notification-workers", "0", "MKSTREAM",
    ]


@patch.object(MODULE.requests, "post")
def test_http_400_busygroup_keeps_redis_error_message(post):
    post.return_value = make_http_error(
        400, "BUSYGROUP Consumer Group name already exists"
    )

    try:
        make_client().xgroup_create("stream", "workers")
    except MODULE.UpstashRedisError as exc:
        assert "BUSYGROUP" in str(exc)
    else:
        raise AssertionError("BUSYGROUP must not be reported as a transport error")


@patch.object(MODULE.requests, "post")
def test_http_400_nogroup_is_not_treated_as_success(post):
    post.return_value = make_http_error(400, "NOGROUP No such key 'stream' in database")

    try:
        make_client().xreadgroup("stream", "workers", "worker-a")
    except MODULE.UpstashRedisError as exc:
        assert "NOGROUP" in str(exc)
    else:
        raise AssertionError("NOGROUP must propagate")


@patch.object(MODULE.requests, "post")
def test_http_400_wrongtype_is_not_treated_as_success(post):
    post.return_value = make_http_error(400, "WRONGTYPE Operation against a wrong kind of value")

    try:
        make_client().get("stream")
    except MODULE.UpstashRedisError as exc:
        assert "WRONGTYPE" in str(exc)
    else:
        raise AssertionError("WRONGTYPE must propagate")


@patch.object(MODULE.requests, "post")
def test_http_500_without_json_is_reported_as_invalid_response(post):
    response = Mock()
    response.status_code = 500
    response.json.side_effect = ValueError("not json")
    post.return_value = response

    try:
        make_client().get("stream")
    except MODULE.UpstashRedisError as exc:
        assert "HTTP 500" in str(exc)
        assert "inválida" in str(exc)
    else:
        raise AssertionError("non-JSON HTTP response must fail closed")


@patch.object(MODULE.requests, "post")
def test_http_200_with_normal_result_is_unchanged(post):
    response = Mock()
    response.status_code = 200
    response.json.return_value = {"result": ["0-0", [], []]}
    post.return_value = response

    assert make_client().xautoclaim("stream", "workers", "worker-a") == ["0-0", [], []]
