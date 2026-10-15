import importlib.util
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TV_REQUEST_SIGNING_SECRET", "unit-test-secret-123")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
spec = importlib.util.spec_from_file_location("labhub_api_app_tvqr", API_FILE)
appmod = importlib.util.module_from_spec(spec)
sys.modules["labhub_api_app_tvqr"] = appmod
spec.loader.exec_module(appmod)


def test_token_valid_roundtrip():
    ws = "11111111-2222-3333-4444-555555555555"
    bucket = int(time.time() // appmod.TV_REQUEST_BUCKET_SECONDS)
    token, _ = appmod._sign_request_token(ws, bucket)
    res = appmod._verify_request_token(token, expected_workspace=ws)
    assert res is not None
    assert res[0] == ws


def test_token_tampered_signature():
    ws = "11111111-2222-3333-4444-555555555555"
    bucket = int(time.time() // appmod.TV_REQUEST_BUCKET_SECONDS)
    token, _ = appmod._sign_request_token(ws, bucket)
    bad = token[:-4] + "AAAA"
    assert appmod._verify_request_token(bad) is None


def test_token_expired_bucket():
    ws = "11111111-2222-3333-4444-555555555555"
    bucket = int(time.time() // appmod.TV_REQUEST_BUCKET_SECONDS) - 2
    token, _ = appmod._sign_request_token(ws, bucket)
    assert appmod._verify_request_token(token) is None


def test_token_previous_bucket_accepted():
    ws = "11111111-2222-3333-4444-555555555555"
    bucket = int(time.time() // appmod.TV_REQUEST_BUCKET_SECONDS) - 1
    token, _ = appmod._sign_request_token(ws, bucket)
    assert appmod._verify_request_token(token) is not None


def test_token_workspace_mismatch():
    ws = "11111111-2222-3333-4444-555555555555"
    other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    bucket = int(time.time() // appmod.TV_REQUEST_BUCKET_SECONDS)
    token, _ = appmod._sign_request_token(ws, bucket)
    assert appmod._verify_request_token(token, expected_workspace=other) is None