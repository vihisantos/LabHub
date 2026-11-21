import importlib.util
from pathlib import Path
from unittest.mock import Mock

MODULE_PATH = (
    Path(__file__).resolve().parents[2]
    / "src" / "apps" / "reservalab" / "api" / "notification_queue.py"
)
SPEC = importlib.util.spec_from_file_location("notification_queue_under_test", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_enqueue_serializes_event_without_touching_database():
    redis = Mock()
    redis.xadd.return_value = "1730000000000-0"
    queue = MODULE.NotificationQueue(redis)

    result = queue.enqueue("evt-1", {"title": "Chamado", "target": "user-1"})

    assert result == "1730000000000-0"
    args = redis.xadd.call_args.args
    assert args[0] == MODULE.DEFAULT_STREAM
    assert args[1]["event_id"] == "evt-1"
    assert '"title":"Chamado"' in args[1]["payload"]


def test_ensure_group_treats_only_busygroup_as_existing():
    redis = Mock()
    redis.xgroup_create.side_effect = RuntimeError("BUSYGROUP Consumer Group name already exists")
    queue = MODULE.NotificationQueue(redis)
    assert queue.ensure_group() == "EXISTS"

    redis.xgroup_create.side_effect = RuntimeError("connection timeout")
    try:
        queue.ensure_group()
    except RuntimeError as exc:
        assert "timeout" in str(exc)
    else:
        raise AssertionError("non-BUSYGROUP failures must propagate")


def test_read_new_decodes_stream_messages():
    redis = Mock()
    redis.xreadgroup.return_value = [[
        MODULE.DEFAULT_STREAM,
        [["1730000000000-0", ["event_id", "evt-1", "payload", '{"title":"Olá"}']]],
    ]]
    queue = MODULE.NotificationQueue(redis)

    messages = queue.read_new("worker-a", count=5)

    assert messages == [{
        "stream": MODULE.DEFAULT_STREAM,
        "message_id": "1730000000000-0",
        "event_id": "evt-1",
        "payload": {"title": "Olá"},
    }]


def test_reclaim_stale_returns_cursor_and_messages():
    redis = Mock()
    redis.xautoclaim.return_value = [
        "0-0",
        [["1730000000000-0", ["event_id", "evt-1", "payload", '{"ok":true}']]],
        [],
    ]
    queue = MODULE.NotificationQueue(redis)

    result = queue.reclaim_stale("worker-b", min_idle_ms=30_000)

    assert result["next_id"] == "0-0"
    assert result["messages"][0]["event_id"] == "evt-1"
    assert result["messages"][0]["payload"] == {"ok": True}
    assert result["deleted_ids"] == []


def test_acknowledge_delegates_only_after_caller_processing():
    redis = Mock()
    redis.xack.return_value = 1
    queue = MODULE.NotificationQueue(redis)

    assert queue.acknowledge("1730000000000-0") == 1
    redis.xack.assert_called_once_with(
        MODULE.DEFAULT_STREAM, MODULE.DEFAULT_GROUP, "1730000000000-0"
    )


def test_invalid_event_is_rejected_before_enqueue():
    redis = Mock()
    queue = MODULE.NotificationQueue(redis)
    for event_id, payload in [("", {}), ("evt-1", [])]:
        try:
            queue.enqueue(event_id, payload)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid event must be rejected")
    redis.xadd.assert_not_called()
