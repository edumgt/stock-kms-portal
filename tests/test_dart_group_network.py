import io
import zipfile

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import dart_group_network as group


def _dart_zip():
    xml = """<result>
      <list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code></list>
      <list><corp_code>00100001</corp_code><corp_name>삼성SDI</corp_name><stock_code>006400</stock_code></list>
      <list><corp_code>00100002</corp_code><corp_name>삼성비상장</corp_name><stock_code></stock_code></list>
      <list><corp_code>00100003</corp_code><corp_name>다른회사</corp_name><stock_code>000001</stock_code></list>
    </result>"""
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("CORPCODE.xml", xml)
    return stream.getvalue()


class FakeResponse:
    def __init__(self, content):
        self.content = content

    def raise_for_status(self):
        pass


def _client():
    app = FastAPI()
    app.include_router(group.router)
    return TestClient(app)


def test_group_network_reads_dart_zip_and_keeps_listed_matches(monkeypatch):
    group._listed_companies.cache_clear()
    monkeypatch.setenv("DART_API_KEY", "test-key")
    monkeypatch.delenv("DART_API_KEY_FILE", raising=False)
    calls = []

    def get(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse(_dart_zip())

    monkeypatch.setattr(group.requests, "get", get)
    response = _client().post("/api/dart/group-network", json={"group_name": "삼성", "limit": 5})
    assert response.status_code == 200
    result = response.json()
    assert result["count"] == 2
    assert {row["corp_name"] for row in result["results"]} == {"삼성전자", "삼성SDI"}
    assert result["market_data_available"] is False
    assert result["total_market_cap"] == 0 and result["kospi_count"] == 0
    assert any(row["dart_url"].endswith("corp_code=00126380") for row in result["results"])
    assert len(calls) == 1 and calls[0][1]["params"]["crtfc_key"] == "test-key"
    group._listed_companies.cache_clear()


def test_dart_error_does_not_expose_the_key(monkeypatch):
    group._listed_companies.cache_clear()
    monkeypatch.setenv("DART_API_KEY", "test-key")
    monkeypatch.delenv("DART_API_KEY_FILE", raising=False)
    monkeypatch.setattr(group.requests, "get", lambda *args, **kwargs: FakeResponse(b"invalid response"))
    response = _client().post("/api/dart/group-network", json={"group_name": "삼성"})
    assert response.status_code == 502
    assert "test-key" not in response.text


def test_missing_key_returns_configuration_error(monkeypatch):
    group._listed_companies.cache_clear()
    monkeypatch.delenv("DART_API_KEY", raising=False)
    monkeypatch.delenv("OPENDART_API_KEY", raising=False)
    monkeypatch.delenv("DART_API_KEY_FILE", raising=False)
    response = _client().post("/api/dart/group-network", json={"group_name": "삼성"})
    assert response.status_code == 503
