import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

from _api_loader import load_api

appmod = load_api()

def test_report_failure_route_registered():
    rules = [r.rule for r in appmod.app.url_map.iter_rules()]
    assert "/api/tv/station/report-failure" in rules