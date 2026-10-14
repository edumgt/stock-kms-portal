"""포털 이식 Lex 라우터(6-3): 설정 상태, 세션 ID 검증, Lex 응답 → 대화 상태(intent·dialogAction·slots·sessionAttributes) 매핑, 오류 변환."""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import lex


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("LEX_REGION", "us-east-1"); monkeypatch.setenv("LEX_BOT_ID", "SE3NCP7NMP"); monkeypatch.setenv("LEX_BOT_ALIAS_ID", "ZJFW9O3LZM")
    monkeypatch.delenv("LEX_LOCALE_ID", raising=False)
    lex._client.cache_clear()
    app = FastAPI(); app.include_router(lex.router)
    return TestClient(app)


def test_status_reports_configuration_without_secrets(client, monkeypatch):
    r = client.get("/api/lex/status").json()
    assert r == {"configured": True, "region": "us-east-1", "locale_id": "ko_KR", "bot_id": "SE3NCP7NMP"}
    monkeypatch.delenv("LEX_BOT_ID")
    assert client.get("/api/lex/status").json()["configured"] is False
    assert client.post("/api/lex/chat", json={"message": "안녕", "session_id": "abc-123"}).status_code == 503


def test_chat_maps_lex_session_state(client):
    calls = []
    class Fake:
        def recognize_text(self, **kw):
            calls.append(kw)
            return {"sessionId": kw["sessionId"], "messages": [{"contentType": "PlainText", "content": "어느 종목을 볼까요?"}, {"contentType": "ImageResponseCard", "content": "x"}],
                    "sessionState": {"intent": {"name": "AnalyzeStock", "state": "InProgress",
                                                "slots": {"Ticker": None, "Period": {"value": {"originalValue": "1년", "interpretedValue": "1y"}}}},
                                     "dialogAction": {"type": "ElicitSlot", "slotToElicit": "Ticker"},
                                     "sessionAttributes": {"lastTicker": "005930"}}}
    with patch.object(lex, "_client", lambda region: Fake()):
        r = client.post("/api/lex/chat", json={"message": " 1년치 보여줘 ", "session_id": "s.1", "session_attributes": {"lastTicker": "005930"}})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["messages"] == ["어느 종목을 볼까요?"] and d["intent"] == "AnalyzeStock" and d["intent_state"] == "InProgress"
    assert d["dialog_action"] == "ElicitSlot" and d["slot_to_elicit"] == "Ticker"
    assert d["slots"] == {"Ticker": None, "Period": "1y"} and d["session_attributes"] == {"lastTicker": "005930"}
    assert calls[0]["text"] == "1년치 보여줘" and calls[0]["localeId"] == "ko_KR" and calls[0]["sessionState"] == {"sessionAttributes": {"lastTicker": "005930"}}


def test_chat_validation_and_error_mapping(client):
    assert client.post("/api/lex/chat", json={"message": "안녕", "session_id": "bad id!"}).status_code == 422
    assert client.post("/api/lex/chat", json={"message": "", "session_id": "ok-1"}).status_code == 422
    class ClientError(Exception):
        response = {"Error": {"Code": "AccessDeniedException", "Message": "no"}}
    class Denied:
        def recognize_text(self, **kw):
            raise ClientError("denied")
    with patch.object(lex, "_client", lambda region: Denied()):
        r = client.post("/api/lex/chat", json={"message": "안녕", "session_id": "ok-1"})
    assert r.status_code == 403 and "AccessDeniedException" in r.json()["detail"]
    class NoCreds:
        def recognize_text(self, **kw):
            raise type("NoCredentialsError", (Exception,), {})()
    with patch.object(lex, "_client", lambda region: NoCreds()):
        assert client.post("/api/lex/chat", json={"message": "안녕", "session_id": "ok-1"}).status_code == 503
    class Empty:
        def recognize_text(self, **kw): return {"sessionId": "ok-1", "messages": [], "sessionState": {}}
    with patch.object(lex, "_client", lambda region: Empty()):
        d = client.post("/api/lex/chat", json={"message": "안녕", "session_id": "ok-1"}).json()
    assert d["messages"] == ["응답 메시지가 없습니다."] and d["slots"] == {} and d["session_attributes"] == {}
