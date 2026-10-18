import os
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

from _api_loader import load_api

appmod = load_api()

# Caminho relativo à estrutura do projeto (funciona em Windows e no runner
# Linux do CI, sem depender do usuário/diretório local).
MIGRATION_105 = (
    Path(__file__).resolve().parents[2]
    / "supabase" / "migrations" / "105_tv_music_requests_retention.sql"
)


def test_retention_function_exists():
    """Verifica se a migration 105 contém a função esperada."""
    p = MIGRATION_105
    s = p.read_text(encoding="utf-8")
    assert "tv_music_requests_retention_qr" in s
    assert "DELETE FROM public.tv_music_requests" in s
    assert "source = 'qr'" in s
    assert "created_at < now() - interval '30 days'" in s
    assert "GRANT EXECUTE ON FUNCTION public.tv_music_requests_retention_qr() TO service_role" in s