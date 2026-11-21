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
