"""Lex 코드 훅(lex/lambda/trade_hook/handler.py, 6-10): 슬롯 검증·조건부 가격·확인·매도 보유수량·이행(승인→주문)·오류·잔고·주문확인."""
import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

_SPEC = importlib.util.spec_from_file_location("trade_hook", Path(__file__).resolve().parents[1] / "lex" / "lambda" / "trade_hook" / "handler.py")
hook = importlib.util.module_from_spec(_SPEC); sys.modules["trade_hook"] = hook; _SPEC.loader.exec_module(hook)
KST = timezone(timedelta(hours=9))


def _slot(v):
    return {"value": {"originalValue": v, "interpretedValue": v}} if v is not None else None


def ev(intent="TradeStock", source="DialogCodeHook", confirmation="None", attrs=None, **slots):
    return {"sessionId": "sess-1", "invocationSource": source,
            "sessionState": {"intent": {"name": intent, "slots": {k: _slot(v) for k, v in slots.items()}, "confirmationState": confirmation, "state": "InProgress"},
                             "sessionAttributes": attrs or {}}}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setattr(hook, "GATEWAY_API_KEY", "k"); monkeypatch.setattr(hook, "MAX_ORDER_QTY", 100); monkeypatch.setattr(hook, "MAX_ORDER_AMOUNT", 5_000_000)


def test_dialog_delegates_missing_required_slots_and_elicits_bad_values():
    r = hook.handler(ev(Side="BUY"))
    assert r["sessionState"]["dialogAction"] == {"type": "Delegate"}
    r = hook.handler(ev(Side="BUY", Ticker="999999"))
    assert r["sessionState"]["dialogAction"] == {"type": "ElicitSlot", "slotToElicit": "Ticker"} and "찾지 못했" in r["messages"][0]["content"]
    r = hook.handler(ev(Side="BUY", Ticker="005930", Quantity="500"))
    assert r["sessionState"]["dialogAction"]["slotToElicit"] == "Quantity" and "100주" in r["messages"][0]["content"]
    r = hook.handler(ev(Side="BUY", Ticker="000040", Quantity="1"))        # KR모터스: buy_eligible False(관리종목)
    assert r["sessionState"]["dialogAction"]["slotToElicit"] == "Ticker" and "매수 대상이 아닙니다" in r["messages"][0]["content"]
    r = hook.handler(ev(Side="BUY", Ticker="005930", Quantity="10", OrderType="LIMIT"))   # 지정가인데 가격 없음 → 직접 Price 요청
    assert r["sessionState"]["dialogAction"]["slotToElicit"] == "Price"
    r = hook.handler(ev(Side="BUY", Ticker="005930", Quantity="100", OrderType="LIMIT", Price="233000"))
    assert r["sessionState"]["dialogAction"]["slotToElicit"] == "Quantity" and "한도" in r["messages"][0]["content"]


def test_dialog_confirms_buy_with_summary_and_session_attributes():
    r = hook.handler(ev(Side="BUY", Ticker="005930", Quantity="10", OrderType="MARKET"))
    assert r["sessionState"]["dialogAction"] == {"type": "ConfirmIntent"}
    assert "삼성전자(005930) 10주 시장가 매수" in r["messages"][0]["content"]
    assert r["sessionState"]["sessionAttributes"] == {"lastTicker": "005930", "lastTickerName": "삼성전자"}
    denied = hook.handler(ev(Side="BUY", Ticker="005930", Quantity="10", OrderType="MARKET", confirmation="Denied"))
    assert denied["sessionState"]["dialogAction"]["type"] == "Close" and denied["sessionState"]["intent"]["state"] == "Failed"
    confirmed = hook.handler(ev(Side="BUY", Ticker="005930", Quantity="10", OrderType="MARKET", confirmation="Confirmed"))
    assert confirmed["sessionState"]["dialogAction"] == {"type": "Delegate"}


def test_dialog_sell_checks_holdings():
    with patch.object(hook, "get_balance", lambda: {"holdings": [{"symbol": "005930", "quantity": 5}]}):
        r = hook.handler(ev(Side="SELL", Ticker="005930", Quantity="10", OrderType="MARKET"))
        assert r["sessionState"]["dialogAction"]["slotToElicit"] == "Quantity" and "보유수량은 5주" in r["messages"][0]["content"]
        r = hook.handler(ev(Side="SELL", Ticker="000660", Quantity="1", OrderType="MARKET"))
        assert "보유하고 있지 않아" in r["messages"][0]["content"]
        ok = hook.handler(ev(Side="SELL", Ticker="005930", Quantity="5", OrderType="LIMIT", Price="240000"))
        assert ok["sessionState"]["dialogAction"]["type"] == "ConfirmIntent" and "지정가 240,000원 매도" in ok["messages"][0]["content"] and "1,200,000원" in ok["messages"][0]["content"]


def test_fulfill_places_order_via_approval_and_records_order_no():
    calls = []
    def fake_gateway(method, path, body=None, params=None):
        calls.append((method, path, body, params))
        if path == "/order-approval":
            assert body["environment"] == "paper" and body["symbol"] == "005930" and body["side"] == "BUY" and body["quantity"] == 10 and body["orderType"] == "MARKET" and body["price"] == 0
            assert body["clientOrderId"].startswith("lex:sess-1:005930:BUY:")
            return {"ok": True, "approvalToken": "tok"}
        if path == "/orders":
            assert body["approvalToken"] == "tok"
            return {"ok": True, "order": {"orderNo": "0000044931", "status": "ACCEPTED"}, "duplicate": False}
        raise AssertionError(path)
    with patch.object(hook, "gateway", fake_gateway), patch.object(hook, "market_open", lambda now=None: True):
        r = hook.handler(ev(source="FulfillmentCodeHook", Side="BUY", Ticker="005930", Quantity="10", OrderType="MARKET", confirmation="Confirmed"))
    assert r["sessionState"]["intent"]["state"] == "Fulfilled" and "주문번호 0000044931" in r["messages"][0]["content"]
    assert r["sessionState"]["sessionAttributes"]["lastOrderNo"] == "0000044931" and [c[1] for c in calls] == ["/order-approval", "/orders"]


def test_fulfill_blocks_outside_market_hours_and_maps_gateway_errors():
    with patch.object(hook, "market_open", lambda now=None: False):
        r = hook.handler(ev(source="FulfillmentCodeHook", Side="BUY", Ticker="005930", Quantity="1", OrderType="MARKET"))
    assert r["sessionState"]["intent"]["state"] == "Failed" and "장 시간" in r["messages"][0]["content"]
    def rejected(method, path, body=None, params=None):
        raise hook.GatewayError("INSUFFICIENT_BALANCE", "주문 가능 예수금이 부족합니다.", 409)
    with patch.object(hook, "gateway", rejected), patch.object(hook, "market_open", lambda now=None: True):
        r = hook.handler(ev(source="FulfillmentCodeHook", Side="BUY", Ticker="005930", Quantity="1", OrderType="MARKET"))
    assert r["sessionState"]["intent"]["state"] == "Failed" and "예수금이 부족" in r["messages"][0]["content"] and "[INSUFFICIENT_BALANCE]" in r["messages"][0]["content"]
    assert hook.market_open(datetime(2026, 10, 14, 12, 0, tzinfo=KST)) and not hook.market_open(datetime(2026, 10, 14, 15, 31, tzinfo=KST)) and not hook.market_open(datetime(2026, 10, 17, 12, 0, tzinfo=KST))


def test_balance_and_order_check_and_unknown_intent():
    with patch.object(hook, "gateway", lambda m, p, body=None, params=None: {"ok": True, "balance": {"cashBalance": -31826005, "totalEvalAmount": 87459226, "totalProfitLoss": -51,
                                                                                                        "holdings": [{"symbol": "000040", "name": "KR모터스", "quantity": 1, "evalAmount": 979}]}}):
        r = hook.handler(ev(intent="CheckBalance", source="FulfillmentCodeHook"))
    assert "예수금 -31,826,005원" in r["messages"][0]["content"] and "KR모터스 1주" in r["messages"][0]["content"]
    with patch.object(hook, "gateway", lambda m, p, body=None, params=None: {"ok": True, "order": {"symbol": "005930", "side": "SELL", "quantity": 41, "status": "FILLED", "filledQuantity": 41, "avgFilledPrice": 232500}}):
        r = hook.handler(ev(intent="CheckOrder", source="FulfillmentCodeHook", attrs={"lastOrderNo": "0000044931"}))
    assert "주문 0000044931" in r["messages"][0]["content"] and "체결 41주 @ 232,500원" in r["messages"][0]["content"]
    r = hook.handler(ev(intent="CheckOrder", source="FulfillmentCodeHook"))
    assert r["sessionState"]["intent"]["state"] == "Failed"
    assert hook.handler(ev(intent="Greeting"))["sessionState"]["dialogAction"] == {"type": "Delegate"}
    with patch.object(hook, "gateway", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))):
        r = hook.handler(ev(intent="CheckBalance", source="FulfillmentCodeHook"))
    assert r["sessionState"]["intent"]["state"] == "Failed" and "RuntimeError" in r["messages"][0]["content"]
