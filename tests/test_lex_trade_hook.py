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
    # 매수 사전 점검(cash_blocker)이 실제 게이트웨이를 부르지 않게 기본 잔고 응답을 둔다. 개별 테스트는 gateway/get_balance 를 다시 패치한다.
    monkeypatch.setattr(hook, "gateway", lambda m, p, body=None, params=None: {"ok": True, "balance": {"cashBalance": 50_000_000, "holdings": []}})


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
    attrs = r["sessionState"]["sessionAttributes"]
    assert attrs["lastTicker"] == "005930" and attrs["lastTickerName"] == "삼성전자" and '"Ticker": "005930"' in attrs["pendingTrade"]
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
    assert r["sessionState"]["intent"]["state"] == "Failed" and "예수금이 부족해 매수 주문이 거절" in r["messages"][0]["content"] and "HTTP_" not in r["messages"][0]["content"]
    assert r["sessionState"]["sessionAttributes"]["lastRejectCode"] == "INSUFFICIENT_BALANCE"
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


# ── 2026-10-15 실사용 대화 분석에 따른 보강 ──────────────────────────────────
def test_gateway_error_parses_code_message_and_details():
    exc = hook._gateway_error({"ok": False, "error": "INSUFFICIENT_BALANCE", "message": "주문 가능 예수금이 부족합니다.", "availableCash": -10977506, "requiredAmount": 80000}, 409)
    assert exc.code == "INSUFFICIENT_BALANCE" and str(exc) == "주문 가능 예수금이 부족합니다." and exc.details == {"availableCash": -10977506, "requiredAmount": 80000}
    text = hook.reject_message(exc)
    assert "예수금 -10,977,506원" in text and "필요 금액 80,000원" in text and "D+2" in text and "HTTP_409" not in text
    assert hook._gateway_error({"detail": "Not Found"}, 404).code == "HTTP_404"


def test_fulfill_rejection_message_and_last_reject_code(monkeypatch):
    monkeypatch.setattr(hook, "market_open", lambda now=None: True)
    exc = hook._gateway_error({"ok": False, "error": "INSUFFICIENT_BALANCE", "message": "주문 가능 예수금이 부족합니다.", "availableCash": -10977506, "requiredAmount": 80000}, 409)
    with patch.object(hook, "place_order", side_effect=exc):
        r = hook.handler(ev(source="FulfillmentCodeHook", confirmation="Confirmed", attrs={"pendingTrade": "{}"}, Side="BUY", Ticker="005930", Quantity="1", OrderType="MARKET"))
    assert r["sessionState"]["dialogAction"]["type"] == "Close" and "예수금이 부족해 매수 주문이 거절" in r["messages"][0]["content"]
    assert r["sessionState"]["sessionAttributes"]["lastRejectCode"] == "INSUFFICIENT_BALANCE" and "pendingTrade" not in r["sessionState"]["sessionAttributes"]


def test_dialog_elicits_with_known_context_and_remembers_pending():
    r = hook.handler(ev(Ticker="005930", Quantity="1"))                       # "삼성전자 1주 주문하려면?" → Side 를 맥락과 함께 묻는다
    assert r["sessionState"]["dialogAction"] == {"type": "ElicitSlot", "slotToElicit": "Side"}
    assert r["messages"][0]["content"].startswith("[삼성전자(005930) 1주] 매수할까요")
    pend = r["sessionState"]["sessionAttributes"]["pendingTrade"]
    assert '"Ticker": "005930"' in pend and '"Quantity": "1"' in pend
    r2 = hook.handler(ev(attrs={"pendingTrade": pend}, Side="BUY"))         # 잔고 조회로 끊긴 뒤 "매수" → 종목·수량을 이어받아 주문유형만 묻는다
    assert r2["sessionState"]["dialogAction"] == {"type": "ElicitSlot", "slotToElicit": "OrderType"}
    assert r2["messages"][0]["content"].startswith("[삼성전자(005930) 1주 매수] 시장가로")
    assert r2["sessionState"]["intent"]["slots"]["Ticker"]["value"]["interpretedValue"] == "005930"
    stale = pend.replace(f'"ts": {int(float(pend.split(chr(34)+"ts"+chr(34)+": ")[1].rstrip("}")))}', '"ts": 1')
    r3 = hook.handler(ev(attrs={"pendingTrade": stale}, Side="BUY"))        # 만료된 보류 슬롯은 쓰지 않는다
    assert r3["sessionState"]["dialogAction"] == {"type": "Delegate"} and "Ticker" not in r3["sessionState"]["sessionAttributes"].get("pendingTrade", "")


def test_dialog_blocks_buy_when_cash_negative_or_short():
    with patch.object(hook, "get_balance", lambda: {"cashBalance": -10977506, "holdings": []}):
        r = hook.handler(ev(attrs={"pendingTrade": "{}"}, Side="BUY", Ticker="005930", Quantity="1", OrderType="MARKET"))
        assert r["sessionState"]["dialogAction"]["type"] == "Close" and r["sessionState"]["intent"]["state"] == "Failed"
        assert "-10,977,506원" in r["messages"][0]["content"] and "D+2" in r["messages"][0]["content"]
        assert "pendingTrade" not in r["sessionState"]["sessionAttributes"]
        sell = hook.handler(ev(Side="SELL", Ticker="005930", Quantity="1", OrderType="MARKET"))   # 매도는 예수금과 무관(보유 없음 → 수량 되묻기)
        assert sell["sessionState"]["dialogAction"]["slotToElicit"] == "Quantity"
    with patch.object(hook, "get_balance", lambda: {"cashBalance": 100_000, "holdings": []}):
        r = hook.handler(ev(Side="BUY", Ticker="005930", Quantity="10", OrderType="LIMIT", Price="70000"))
        assert r["sessionState"]["dialogAction"]["slotToElicit"] == "Quantity" and "예수금 100,000원" in r["messages"][0]["content"]
    with patch.object(hook, "get_balance", side_effect=hook.GatewayError("GATEWAY_UNREACHABLE", "x")):   # 조회 실패는 막지 않는다
        r = hook.handler(ev(Side="BUY", Ticker="005930", Quantity="1", OrderType="MARKET"))
        assert r["sessionState"]["dialogAction"] == {"type": "ConfirmIntent"}


def test_balance_note_and_account_faq():
    with patch.object(hook, "get_balance", lambda: {"cashBalance": -10977506, "totalEvalAmount": 87459230, "totalProfitLoss": 0, "holdings": []}):
        r = hook.handler(ev(intent="CheckBalance", source="FulfillmentCodeHook"))
        assert "예수금 -10,977,506원" in r["messages"][0]["content"] and "매수 주문은 거절" in r["messages"][0]["content"]
        r = hook.handler(ev(intent="AccountFaq", source="FulfillmentCodeHook", attrs={"lastRejectCode": "INSUFFICIENT_BALANCE"}))
        text = r["messages"][0]["content"]
        assert text.startswith("직전 주문 거절 사유: 주문 가능 예수금 부족.") and "음수" in text and "D+2" in text
        assert hook.handler(ev(intent="AccountFaq"))["sessionState"]["dialogAction"] == {"type": "Delegate"}
    with patch.object(hook, "get_balance", lambda: {"cashBalance": 5_000_000, "holdings": []}):
        r = hook.handler(ev(intent="AccountFaq", source="FulfillmentCodeHook"))
        assert "예수금 5,000,000원 범위에서 매수할 수 있습니다" in r["messages"][0]["content"] and "회당 100주" in r["messages"][0]["content"]


# ── 2026-10-15 2차 대화 분석: 시세·장 시간·휴장일·입금일 ─────────────────────
def test_business_days_and_market_open_respect_krx_holidays():
    from datetime import date
    assert not hook.is_business_day(date(2026, 12, 25)) and not hook.is_business_day(date(2026, 10, 17)) and hook.is_business_day(date(2026, 10, 15))
    assert hook.add_business_days(date(2026, 10, 15), 2) == date(2026, 10, 19)          # 목 → 월 (주말 건너뜀)
    assert hook.add_business_days(date(2026, 12, 23), 2) == date(2026, 12, 28)          # 성탄절·주말 건너뜀
    assert not hook.market_open(datetime(2026, 12, 25, 10, 0, tzinfo=KST)) and hook.market_open(datetime(2026, 12, 24, 10, 0, tzinfo=KST))
    assert hook.us_dst(date(2026, 7, 1)) and not hook.us_dst(date(2026, 11, 2)) and hook.us_dst(date(2026, 3, 8)) and not hook.us_dst(date(2026, 3, 7))


def test_quote_intent_validates_ticker_and_formats_quote():
    r = hook.handler(ev(intent="CheckQuote", Ticker="999999"))
    assert r["sessionState"]["dialogAction"]["slotToElicit"] == "Ticker"
    assert hook.handler(ev(intent="CheckQuote", Ticker="042660"))["sessionState"]["dialogAction"] == {"type": "Delegate"}
    quote = {"symbol": "042660", "price": 71500, "change": -500, "changeRate": -0.69, "open": 72000, "high": 72300, "low": 71200, "volume": 1234567}
    with patch.object(hook, "get_quote", lambda s: quote), patch.object(hook, "market_open", lambda now=None: False):
        r = hook.handler(ev(intent="CheckQuote", source="FulfillmentCodeHook", Ticker="042660"))
    text = r["messages"][0]["content"]
    assert text.startswith("한화오션(042660) 현재가 71,500원 (▼500원, -0.69%)") and "거래량 1,234,567주" in text and "장 시간이 아니라" in text
    assert r["sessionState"]["sessionAttributes"]["lastTicker"] == "042660"
    with patch.object(hook, "get_quote", lambda s: quote):                                 # 종목 생략 → 직전 종목 재사용
        r = hook.handler(ev(intent="CheckQuote", source="FulfillmentCodeHook", attrs={"lastTicker": "042660"}))
    assert "한화오션(042660)" in r["messages"][0]["content"]
    r = hook.handler(ev(intent="CheckQuote", source="FulfillmentCodeHook"))
    assert r["sessionState"]["intent"]["state"] == "Failed" and "어느 종목" in r["messages"][0]["content"]
    with patch.object(hook, "get_quote", side_effect=hook.GatewayError("KIS_QUOTE_UNAVAILABLE", "현재가를 확인할 수 없습니다.", 502)):
        r = hook.handler(ev(intent="CheckQuote", source="FulfillmentCodeHook", Ticker="042660"))
    assert "시세를 조회하지 못했습니다" in r["messages"][0]["content"]


def test_market_hours_and_holidays_answers(monkeypatch):
    class _Now(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 15, 11, 30, tzinfo=KST)
    monkeypatch.setattr(hook, "datetime", _Now)
    text = hook.handler(ev(intent="MarketHours", source="FulfillmentCodeHook"))["messages"][0]["content"]
    assert "09:00~15:30" in text and "지금은 열려 있습니다" in text and "22:30~05:00(서머타임" in text and "다음 한국 휴장일은 12/25(금) 성탄절" in text
    text = hook.handler(ev(intent="MarketHolidays", source="FulfillmentCodeHook"))["messages"][0]["content"]
    assert text.startswith("2026년 남은 한국 증시 휴장일(주말 제외)은 12/25(금) 성탄절, 12/31(목) 연말 휴장 총 2일입니다.")
    faq = hook.handler(ev(intent="AccountFaq", source="FulfillmentCodeHook"))["messages"][0]["content"]
    assert "예: 10/15(목) 체결 → 10/19(월) 입금" in faq
