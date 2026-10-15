import importlib.util
import os
import sys
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-testing-only-32chars!!")

API_FILE = Path(__file__).resolve().parents[1] / "app.py"
spec = importlib.util.spec_from_file_location("labhub_api_app_rep", API_FILE)
appmod = importlib.util.module_from_spec(spec)
sys.modules["labhub_api_app_rep"] = appmod
spec.loader.exec_module(appmod)

def test_report_failure_route_registered():
    rules = [r.rule for r in appmod.app.url_map.iter_rules()]
    assert "/api/tv/station/report-failure" in rules