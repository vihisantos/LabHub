"""Testes de _get_client_ip (FASE 1.5, item A1)."""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
spec = importlib.util.spec_from_file_location("labhub_api_app_client_ip", API_FILE)
appmod = importlib.util.module_from_spec(spec)
sys.modules["labhub_api_app_client_ip"] = appmod
spec.loader.exec_module(appmod)


def _ip(headers=None, remote_addr="203.0.113.9"):
    with appmod.app.test_request_context("/", headers=headers or {}, environ_base={"REMOTE_ADDR": remote_addr}):
        return appmod._get_client_ip()


def test_prefers_x_real_ip():
    assert _ip({"x-real-ip": "198.51.100.7"}) == "198.51.100.7"


def test_vercel_forwarded_for_uses_rightmost():
    h = {"x-vercel-forwarded-for": "203.0.113.1, 198.51.100.7"}
    assert _ip(h) == "198.51.100.7"


def test_xff_fallback_uses_rightmost_not_first():
    # forged first IP + trusted proxy-added rightmost
    h = {"X-Forwarded-For": "10.0.0.1, 203.0.113.50"}
    assert _ip(h) == "203.0.113.50"


def test_forged_xff_and_x_vercel_id_ignored():
    # x-vercel-id alone must not be trusted
    h = {"x-vercel-id": "fake", "X-Forwarded-For": "10.0.0.1"}
    assert _ip(h, remote_addr="198.51.100.10") == "198.51.100.10"


def test_ipv6_valid():
    assert _ip({"x-real-ip": "2001:db8::1"}) == "2001:db8::1"


def test_invalid_value_returns_unknown():
    assert _ip({"x-real-ip": "not-an-ip"}, remote_addr="also-bad") == "unknown"