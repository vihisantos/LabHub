import importlib.util
import os
import sys
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
spec = importlib.util.spec_from_file_location("labhub_api_app_ret", API_FILE)
appmod = importlib.util.module_from_spec(spec)
sys.modules["labhub_api_app_ret"] = appmod
spec.loader.exec_module(appmod)


def test_retention_function_exists():
    """Verifica se a migration 105 contém a função esperada."""
    p = Path(r"C:\Users\Admin\Desktop\LabHub\supabase\migrations\105_tv_music_requests_retention.sql")
    s = p.read_text(encoding="utf-8")
    assert "tv_music_requests_retention_qr" in s
    assert "DELETE FROM public.tv_music_requests" in s
    assert "source = 'qr'" in s
    assert "created_at < now() - interval '30 days'" in s
    assert "GRANT EXECUTE ON FUNCTION public.tv_music_requests_retention_qr() TO service_role" in s