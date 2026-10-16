"""FallbackIntent → Claude 도구 호출(lex/lambda/trade_hook/assistant.py, 6-15): 도구 결과 형식·이력·예산·거절, handler 연결. SDK 없이(가짜 runner) 돈다."""
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

HOOK_DIR = Path(__file__).resolve().parents[1] / "lex" / "lambda" / "trade_hook"
sys.path.insert(0, str(HOOK_DIR))
_SPEC = importlib.util.spec_from_file_location("trade_hook", HOOK_DIR / "handler.py")
hook = importlib.util.module_from_spec(_SPEC); sys.modules["trade_hook"] = hook; _SPEC.loader.exec_module(hook)
import assistant  # noqa: E402  (handler 가 sys.path 에 넣는다)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(hook, "GATEWAY_API_KEY", "k")
    monkeypatch.setattr(hook, "gateway", lambda m, p, body=None, params=None: {"ok": True, "balance": {"cashBalance": 87_459_230, "totalEval": 87_434_820, "profitLoss": -23_000,
                                                                                                   "holdings": [{"symbol": "005930", "quantity": 46, "evalAmount": 9_924_500, "profitRate": -0.23}]}})


def _tool(tools, name):
    return next(t for t in tools if t.__name__ == name)


def test_tools_answer_the_questions_lex_could_not():
    attrs = {}
    tools = assistant.build_tools(hook, attrs)
    assert [t.__name__ for t in tools] == ["search_docs", "get_balance", "get_quote", "find_stock", "tradable_universe", "get_order", "fx_rates", "market_status", "ranking"]
    assert all(t.__doc__ for t in tools)                                                       # beta_tool 이 설명·스키마를 docstring 에서 만든다
    b = json.loads(_tool(tools, "get_balance")())
    assert b["holdingsCount"] == 1 and b["holdings"][0]["name"] == "삼성전자" and b["cashBalance"] == 87_459_230           # "보유 종목 수", "아모레퍼시픽 있어?"
    u = json.loads(_tool(tools, "tradable_universe")())
    assert u["total"] == 2677 and u["buyEligible"] == 2469 and u["byMarket"]["KOSPI"] > 0                                 # "주문 가능한 종목수"
    f = json.loads(_tool(tools, "find_stock")("아모레"))
    assert any(r["symbol"] == "090430" for r in f["items"])
    quote = {"price": 215500, "change": 5500, "changeRate": 2.62}
    with patch.object(hook, "get_quote", lambda s: quote), patch.object(hook, "market_open", lambda now=None: True):
        q = json.loads(_tool(tools, "get_quote")("현대자동차"))                                   # 별칭 해석
    assert q["symbol"] == "005380" and q["name"] == "현대차" and q["price"] == 215500 and attrs["lastTicker"] == "005380"
    assert _tool(tools, "get_quote")("존재하지않는종목XYZ").startswith("오류")
    rates = {"result": "success", "time_last_update_unix": 1792108951, "rates": {"KRW": 1345.9, "JPY": 157.98, "EUR": 0.89222, "CNY": 6.691}}
    with patch.object(hook, "fetch_json", lambda url: rates):
        fx = json.loads(_tool(tools, "fx_rates")("JPY"))
    assert fx["rates"] == {"100엔": 851.9}
    m = json.loads(_tool(tools, "market_status")())
    assert "09:00~15:30" in m["krxHours"] and "nextHoliday" in m and isinstance(m["krxOpenNow"], bool)
    with patch.object(hook, "fetch_json", lambda url: {"hits": [{"title": "KIS 모의계좌와 예수금", "section": "매도 대금은 언제 입금되나요", "content": "D+2 영업일"}]}):
        assert _tool(tools, "search_docs")("매도 대금 언제").startswith("[KIS 모의계좌와 예수금 / 매도 대금은 언제 입금되나요] D+2")
    with patch.object(hook, "fetch_json", lambda url: {"hits": []}):
        assert _tool(tools, "search_docs")("오늘 점심") == "관련 자료 없음"
    with patch.object(hook, "fetch_json", side_effect=hook.GatewayError("UNREACHABLE", "x")):
        assert _tool(tools, "search_docs")("x").startswith("오류")                               # 도구 실패는 예외가 아니라 문자열


def _msg(text, stop="end_turn"):
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], stop_reason=stop)


def test_answer_uses_runner_keeps_history_and_handles_refusal(monkeypatch):
    seen = {}
    def factory(tools, messages):
        seen["tools"] = [t.__name__ for t in tools]; seen["messages"] = messages
        return iter([_msg("도구 호출 중"), _msg("KIS 모의계좌 보유 종목은 삼성전자 1개이며 아모레퍼시픽은 없습니다.")])
    attrs = {"llmHistory": json.dumps([["user", "안녕"], ["assistant", "안녕하세요"]])}
    text = assistant.answer("보유 주식에 아모레퍼시픽 있어?", attrs, hook, runner_factory=factory)
    assert text.startswith("KIS 모의계좌 보유 종목은") and "search_docs" in seen["tools"]
    assert seen["messages"][0] == {"role": "user", "content": "안녕"} and seen["messages"][-1]["content"] == "보유 주식에 아모레퍼시픽 있어?"
    hist = json.loads(attrs["llmHistory"])
    assert hist[-2:] == [["user", "보유 주식에 아모레퍼시픽 있어?"], ["assistant", text]] and len(hist) <= assistant.HISTORY_TURNS
    assert assistant.answer("x", {}, hook, runner_factory=lambda t, m: iter([_msg("", stop="refusal")])).startswith("그 질문에는 답해 드리기 어렵습니다")
    assert assistant.answer("x", {}, hook, runner_factory=lambda t, m: iter([_msg("긴 답", stop="max_tokens")])).endswith("(답이 길어 일부만 표시)")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert assistant.answer("x", {}, hook) is None                                              # 키 없음 → handler 가 안내문


def test_handler_routes_fallback_intent_and_degrades_to_help_text(monkeypatch):
    ev = {"sessionId": "s", "invocationSource": "DialogCodeHook", "inputTranscript": "현재 KIS Testbed 에서 주문 가능한 종목수는?",
          "sessionState": {"intent": {"name": "FallbackIntent", "slots": {}, "state": "InProgress"}, "sessionAttributes": {}}}
    with patch.object(assistant, "answer", lambda q, attrs, ctx: "주문 가능 종목은 2,469개입니다."):
        r = hook.handler(ev)
    assert r["sessionState"]["dialogAction"] == {"type": "Close"} and r["sessionState"]["intent"]["state"] == "Fulfilled"
    assert r["messages"][0]["content"] == "주문 가능 종목은 2,469개입니다."
    with patch.object(assistant, "answer", lambda q, attrs, ctx: None):                         # 키 없음
        r = hook.handler(ev)
    assert r["messages"][0]["content"] == assistant.HELP_TEXT and r["sessionState"]["intent"]["state"] == "Failed"
    def boom(q, attrs, ctx): raise TimeoutError("slow")
    with patch.object(assistant, "answer", boom):                                               # 모델 오류 → 안내문 + 오류 기록
        r = hook.handler(ev)
    assert r["messages"][0]["content"] == assistant.HELP_TEXT and r["sessionState"]["sessionAttributes"]["llmError"] == "TimeoutError"
