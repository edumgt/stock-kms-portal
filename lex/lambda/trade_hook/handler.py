"""Amazon Lex V2 코드 훅 — iv.edumgt.co.kr 「AI 투자 도우미」에서 주식 대화를 KIS 모의투자 주문으로 잇는다 (stock-kms-portal 6-10).

Lex 가 DialogCodeHook(매 턴 검증·확인) 과 FulfillmentCodeHook(이행) 으로 이 함수를 부른다. 이행은 stock-coin-trade Open API
(계약 docs/contracts/kis-autotrade-api.md 2절: POST /openapi/v1/kis/order-approval → POST /openapi/v1/kis/orders) 를 Bearer API 키로 호출한다.

안전장치: environment 는 항상 paper(모의) · 회당 수량/금액 상한(MAX_ORDER_QTY, MAX_ORDER_AMOUNT) · 장중(KST 평일 09:00~15:30)만 주문
· 매도는 보유수량 확인 · 사용자가 확인(ConfirmIntent) 해야 주문 · 종목은 KRX 상장 목록(tickers.json)에 있어야 함.
표준 라이브러리만 쓴다(배포 zip 에 의존성 없음).

인텐트/슬롯(scripts/build_bot.py 가 만든다):
  TradeStock  : Side(OrderSide: BUY/SELL) · Ticker(StockTicker: 종목코드, 동의어=종목명) · Quantity(AMAZON.Number) · OrderType(OrderTypeKind: MARKET/LIMIT) · Price(AMAZON.Number, 지정가일 때만)
  CheckBalance: 슬롯 없음 → 잔고 요약
  CheckOrder  : OrderNo(AMAZON.AlphaNumeric, 선택; 없으면 세션의 lastOrderNo)
  AccountFaq  : 슬롯 없음 → 예수금 음수·거절 사유·모의계좌 주문 가능 여부를 실제 잔고로 답한다
세션 속성: pendingTrade(끊긴 주문 대화의 슬롯, PENDING_TTL 초) · lastTicker/lastTickerName · lastOrderNo · lastRejectCode
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger()
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))
GATEWAY_BASE = os.environ.get("GATEWAY_BASE", "https://st.edumgt.co.kr").rstrip("/")
GATEWAY_API_KEY = os.environ.get("GATEWAY_API_KEY", "")
ENVIRONMENT = "paper"                                               # 실전(real)은 이 훅에서 절대 쓰지 않는다
MAX_ORDER_QTY = int(os.environ.get("MAX_ORDER_QTY", "100"))
MAX_ORDER_AMOUNT = int(os.environ.get("MAX_ORDER_AMOUNT", "5000000"))
HTTP_TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", "12"))

_TICKERS: dict[str, dict] | None = None


def tickers() -> dict[str, dict]:
    global _TICKERS
    if _TICKERS is None:
        path = Path(__file__).with_name("tickers.json")
        _TICKERS = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return _TICKERS


def ticker_name(code: str) -> str:
    return (tickers().get(code) or {}).get("name") or code


def market_open(now: datetime | None = None) -> bool:
    t = (now or datetime.now(KST)).astimezone(KST)
    return t.weekday() < 5 and 9 * 60 <= t.hour * 60 + t.minute <= 15 * 60 + 30


# ── 게이트웨이 ────────────────────────────────────────────────────────────────
class GatewayError(Exception):
    def __init__(self, code: str, message: str, status: int = 0, details: dict | None = None):
        super().__init__(message)
        self.code, self.status, self.details = code, status, details or {}


def _gateway_error(payload: dict, status: int) -> GatewayError:
    """게이트웨이 오류 본문 {ok:false, error:<코드>, message:<문구>, ...세부} → GatewayError. (FastAPI 기본 {detail} 도 수용)"""
    code = str(payload.get("code") or payload.get("error_code") or payload.get("error") or (f"HTTP_{status}" if status else "GATEWAY_ERROR"))
    message = str(payload.get("message") or payload.get("detail") or payload.get("error") or (f"게이트웨이 HTTP {status}" if status else "게이트웨이 오류"))
    details = {k: v for k, v in payload.items() if k not in ("ok", "code", "error_code", "error", "message", "detail")}
    return GatewayError(code, message, status, details)


def gateway(method: str, path: str, body: dict | None = None, params: dict | None = None) -> dict:
    if not GATEWAY_API_KEY:
        raise GatewayError("NOT_CONFIGURED", "주문 게이트웨이 API 키가 설정되지 않았습니다.")
    url = f"{GATEWAY_BASE}/openapi/v1/kis{path}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Authorization": f"Bearer {GATEWAY_API_KEY}", "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode() or "{}")
        except Exception:
            payload = {}
        raise _gateway_error(payload, exc.code)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise GatewayError("GATEWAY_UNREACHABLE", f"게이트웨이에 연결하지 못했습니다: {exc}")
    if payload.get("ok") is False:
        raise _gateway_error(payload, 0)
    return payload


def get_balance() -> dict:
    return gateway("GET", "/balance", params={"environment": ENVIRONMENT}).get("balance") or {}


def place_order(intent: dict) -> dict:
    approval = gateway("POST", "/order-approval", body=intent)
    token = approval.get("approvalToken")
    if not token:
        raise GatewayError("APPROVAL_MISSING", "승인 토큰을 받지 못했습니다.")
    return gateway("POST", "/orders", body={**intent, "approvalToken": token})


def get_order(order_no: str) -> dict:
    return gateway("GET", f"/orders/{order_no}", params={"environment": ENVIRONMENT}).get("order") or {}


# ── Lex 응답 도우미 ───────────────────────────────────────────────────────────
def slot_value(slots: dict, name: str) -> str | None:
    slot = (slots or {}).get(name) or {}
    value = slot.get("value") or {}
    v = value.get("interpretedValue") or value.get("originalValue")
    return str(v).strip() if v not in (None, "") else None


def _msg(text: str) -> dict:
    return {"contentType": "PlainText", "content": text}


def _state(event: dict, **over) -> dict:
    st = dict(event.get("sessionState") or {})
    st.pop("originatingRequestId", None)
    st.update(over)
    return st


def elicit_slot(event: dict, slot: str, text: str, attrs: dict | None = None) -> dict:
    intent = dict(event["sessionState"]["intent"])
    intent["state"] = "InProgress"
    return {"sessionState": _state(event, intent=intent, dialogAction={"type": "ElicitSlot", "slotToElicit": slot},
                                   sessionAttributes=attrs if attrs is not None else event["sessionState"].get("sessionAttributes") or {}),
            "messages": [_msg(text)]}


def delegate(event: dict, attrs: dict | None = None) -> dict:
    intent = dict(event["sessionState"]["intent"])
    intent["state"] = "InProgress"
    return {"sessionState": _state(event, intent=intent, dialogAction={"type": "Delegate"},
                                   sessionAttributes=attrs if attrs is not None else event["sessionState"].get("sessionAttributes") or {})}


def confirm_intent(event: dict, text: str, attrs: dict | None = None) -> dict:
    intent = dict(event["sessionState"]["intent"])
    intent["state"] = "InProgress"
    return {"sessionState": _state(event, intent=intent, dialogAction={"type": "ConfirmIntent"},
                                   sessionAttributes=attrs if attrs is not None else event["sessionState"].get("sessionAttributes") or {}),
            "messages": [_msg(text)]}


def close(event: dict, text: str, fulfilled: bool = True, attrs: dict | None = None) -> dict:
    intent = dict(event["sessionState"]["intent"])
    intent["state"] = "Fulfilled" if fulfilled else "Failed"
    return {"sessionState": _state(event, intent=intent, dialogAction={"type": "Close"},
                                   sessionAttributes=attrs if attrs is not None else event["sessionState"].get("sessionAttributes") or {}),
            "messages": [_msg(text)]}


def won(v: Any) -> str:
    try:
        return f"{int(float(v)):,}원"
    except (TypeError, ValueError):
        return "-"


# ── 주문 대화 상태(세션 속성) ────────────────────────────────────────────────
PENDING_TTL = int(os.environ.get("PENDING_TRADE_TTL", "600"))     # 잔고 조회 등 다른 인텐트로 끊긴 주문 대화를 이어 주는 시간(초)
TRADE_SLOTS = ("Side", "Ticker", "Quantity", "OrderType", "Price")
REJECT_HINTS = {"INSUFFICIENT_BALANCE": "주문 가능 예수금 부족", "INSUFFICIENT_HOLDINGS": "보유수량 부족", "LIMIT_EXCEEDED": "회당 주문 한도(수량·금액) 초과",
                "MARKET_CLOSED": "장 시간 아님", "KIS_QUOTE_UNAVAILABLE": "현재가 조회 불가", "FORBIDDEN": "API 키 권한 없음", "NOT_CONFIGURED": "게이트웨이 미설정",
                "GATEWAY_UNREACHABLE": "게이트웨이 연결 실패", "APPROVAL_MISSING": "승인 토큰 없음"}


def set_slot(event: dict, name: str, value: str) -> None:
    """코드 훅이 슬롯 값을 채워 Lex 에 돌려준다(Lex 는 응답의 intent.slots 를 그대로 받아들인다)."""
    slots = event["sessionState"]["intent"].get("slots") or {}
    slots[name] = {"shape": "Scalar", "value": {"originalValue": value, "interpretedValue": value, "resolvedValues": [value]}}
    event["sessionState"]["intent"]["slots"] = slots


def restore_pending(event: dict, attrs: dict) -> list[str]:
    """직전 주문 대화에서 받아 둔 슬롯(pendingTrade)을 비어 있는 슬롯에 채운다. 예: '한화오션 1주 주문' → 잔고 조회 → '매수' 로 돌아와도 종목·수량을 다시 묻지 않는다."""
    raw = attrs.get("pendingTrade")
    if not raw:
        return []
    try:
        pend = json.loads(raw)
    except ValueError:
        attrs.pop("pendingTrade", None)
        return []
    if time.time() - float(pend.get("ts") or 0) > PENDING_TTL:
        attrs.pop("pendingTrade", None)
        return []
    slots = event["sessionState"]["intent"].get("slots") or {}
    filled = []
    for name in TRADE_SLOTS:
        if slot_value(slots, name) is None and pend.get(name):
            set_slot(event, name, str(pend[name]))
            filled.append(name)
    return filled


def remember_pending(event: dict, attrs: dict) -> None:
    slots = event["sessionState"]["intent"].get("slots") or {}
    known = {n: slot_value(slots, n) for n in TRADE_SLOTS if slot_value(slots, n) is not None}
    if known:
        attrs["pendingTrade"] = json.dumps({**known, "ts": int(time.time())}, ensure_ascii=False)
    else:
        attrs.pop("pendingTrade", None)


def known_context(event: dict) -> str:
    """되물을 때 앞에 붙일 '지금까지 받은 주문 내용'. 종목이나 수량을 알 때만 만든다. 예: [한화오션(042660) 1주 매수] """
    slots = event["sessionState"]["intent"].get("slots") or {}
    parts: list[str] = []
    code = slot_value(slots, "Ticker")
    if code and code in tickers():
        parts.append(f"{ticker_name(code)}({code})")
    qty = slot_value(slots, "Quantity")
    try:
        if qty and int(float(qty)) >= 1:
            parts.append(f"{int(float(qty)):,}주")
    except ValueError:
        pass
    if not parts:
        return ""
    side = {"BUY": "매수", "SELL": "매도"}.get((slot_value(slots, "Side") or "").upper())
    how = {"MARKET": "시장가", "LIMIT": "지정가"}.get((slot_value(slots, "OrderType") or "").upper())
    parts += [p for p in (how, side) if p]
    return f"[{' '.join(parts)}] "


def cash_blocker(intent: dict) -> tuple[str | None, str | None]:
    """매수 확인 전에 예수금을 보고 거절이 확실하면 (되물을 슬롯 또는 None, 안내문). 조회 실패는 막지 않는다."""
    if intent["side"] != "BUY":
        return None, None
    try:
        cash = int(float(get_balance().get("cashBalance") or 0))
    except (GatewayError, TypeError, ValueError):
        return None, None
    if cash < 0:
        return None, (f"현재 KIS 모의계좌 예수금이 {won(cash)}(음수)이라 매수 주문은 거절됩니다. 보유 종목 매도 대금이 결제되는 D+2 영업일 이후 "
                      "예수금이 양수가 되면 다시 매수할 수 있습니다. 매도·잔고 조회·주문 확인은 지금도 됩니다.")
    if intent["orderType"] == "LIMIT" and intent["price"] * intent["quantity"] > cash:
        return "Quantity", f"예상 주문금액 {won(intent['price'] * intent['quantity'])}이 주문 가능 예수금 {won(cash)}을 넘습니다. 수량을 줄여 주세요."
    return None, None


def reject_message(exc: GatewayError) -> str:
    d = exc.details or {}
    if exc.code == "INSUFFICIENT_BALANCE":
        cash, need = d.get("availableCash"), d.get("requiredAmount")
        text = "주문 가능 예수금이 부족해 매수 주문이 거절됐습니다."
        if cash is not None:
            text += f" 예수금 {won(cash)}" + (f", 필요 금액 {won(need)}" if need is not None else "") + "."
            try:
                if float(cash) < 0:
                    text += " 예수금이 음수이면 보유 종목 매도 대금이 결제되는 D+2 영업일 이후 양수가 되어야 매수할 수 있습니다."
            except (TypeError, ValueError):
                pass
        return text
    hint = REJECT_HINTS.get(exc.code)
    return f"주문이 거절됐습니다. {hint + '.' if hint else exc} (사유 코드 {exc.code})"


# ── TradeStock ────────────────────────────────────────────────────────────────
def _trade_intent(event: dict) -> tuple[dict | None, str | None, str | None]:
    """슬롯 → 주문 의도. (intent, 다시 물을 슬롯, 안내문) — 슬롯이 모자라거나 틀리면 intent 는 None."""
    slots = event["sessionState"]["intent"].get("slots") or {}
    side = (slot_value(slots, "Side") or "").upper()
    if side not in ("BUY", "SELL"):
        return None, "Side", "매수할까요, 매도할까요?"
    code = slot_value(slots, "Ticker") or ""
    if not code or code not in tickers():
        return None, "Ticker", "종목을 찾지 못했습니다. 종목명(예: 삼성전자)이나 6자리 종목코드로 알려 주세요."
    if side == "BUY" and not tickers()[code].get("buy", True):
        return None, "Ticker", f"{ticker_name(code)}({code})은 관리·거래정지 등으로 매수 대상이 아닙니다. 다른 종목을 알려 주세요."
    qty_raw = slot_value(slots, "Quantity")
    try:
        qty = int(float(qty_raw)) if qty_raw else 0
    except ValueError:
        qty = 0
    if qty < 1:
        return None, "Quantity", "몇 주를 주문할까요? (1주 이상)"
    if qty > MAX_ORDER_QTY:
        return None, "Quantity", f"챗봇 주문은 회당 {MAX_ORDER_QTY:,}주까지입니다. 수량을 다시 알려 주세요."
    order_type = (slot_value(slots, "OrderType") or "").upper()
    if order_type not in ("MARKET", "LIMIT"):
        return None, "OrderType", "시장가로 할까요, 지정가로 할까요?"
    price = 0
    if order_type == "LIMIT":
        price_raw = slot_value(slots, "Price")
        try:
            price = int(float(price_raw)) if price_raw else 0
        except ValueError:
            price = 0
        if price < 1:
            return None, "Price", "지정가 주문의 1주 가격을 원 단위로 알려 주세요."
        if price * qty > MAX_ORDER_AMOUNT:
            return None, "Quantity", f"회당 주문금액 한도 {MAX_ORDER_AMOUNT:,}원을 넘습니다({won(price * qty)}). 수량을 줄여 주세요."
    session_id = str(event.get("sessionId") or "lex")[:24]
    intent = {"environment": ENVIRONMENT, "symbol": code, "side": side, "orderType": order_type, "quantity": qty, "price": price,
              "clientOrderId": f"lex:{session_id}:{code}:{side}:{int(time.time())}"}
    return intent, None, None


def trade_dialog(event: dict) -> dict:
    attrs = dict(event["sessionState"].get("sessionAttributes") or {})
    restore_pending(event, attrs)                      # 끊겼던 주문 대화의 슬롯 이어받기
    intent, slot, text = _trade_intent(event)
    if intent is None:
        remember_pending(event, attrs)
        # 값이 있는데 틀린 경우와 종목·수량을 이미 아는 경우(맥락을 붙여 묻는다)는 직접 되묻고, 아무것도 모르는 필수 슬롯은 Lex 기본 프롬프트에 맡긴다(Delegate).
        slots = event["sessionState"]["intent"].get("slots") or {}
        has_value = slot_value(slots, slot) is not None
        ctx = known_context(event)
        if slot == "Price" or has_value or ctx:
            return elicit_slot(event, slot, ctx + text, attrs)
        return delegate(event, attrs)
    confirmation = event["sessionState"]["intent"].get("confirmationState") or "None"
    if confirmation == "Denied":
        attrs.pop("pendingTrade", None)
        return close(event, "주문을 취소했습니다. 다른 주문이 필요하면 말씀해 주세요.", fulfilled=False, attrs=attrs)
    if confirmation == "Confirmed":
        return delegate(event, attrs)
    blocker_slot, blocker = cash_blocker(intent)       # 예수금 음수·부족이면 확인 단계 전에 알려 헛주문을 막는다
    if blocker and blocker_slot:
        remember_pending(event, attrs)
        return elicit_slot(event, blocker_slot, blocker, attrs)
    if blocker:
        attrs.pop("pendingTrade", None)
        return close(event, blocker, fulfilled=False, attrs=attrs)
    remember_pending(event, attrs)
    if intent["side"] == "SELL":
        try:
            held = next((int(h.get("quantity") or 0) for h in (get_balance().get("holdings") or []) if str(h.get("symbol")) == intent["symbol"]), 0)
        except GatewayError as exc:
            return close(event, f"보유수량을 확인하지 못해 주문을 진행하지 않았습니다. ({exc})", fulfilled=False, attrs=attrs)
        if held < intent["quantity"]:
            return elicit_slot(event, "Quantity", f"{ticker_name(intent['symbol'])} 보유수량은 {held:,}주입니다. 매도 수량을 다시 알려 주세요." if held else
                               f"{ticker_name(intent['symbol'])}은 보유하고 있지 않아 매도할 수 없습니다. 다른 수량이나 종목을 알려 주세요.", attrs)
    name = ticker_name(intent["symbol"])
    how = "시장가" if intent["orderType"] == "MARKET" else f"지정가 {won(intent['price'])}"
    what = "매수" if intent["side"] == "BUY" else "매도"
    amount = f" · 예상 {won(intent['price'] * intent['quantity'])}" if intent["orderType"] == "LIMIT" else ""
    attrs.update({"lastTicker": intent["symbol"], "lastTickerName": name})
    return confirm_intent(event, f"KIS 모의계좌로 {name}({intent['symbol']}) {intent['quantity']:,}주 {how} {what} 주문을 보낼까요?{amount} (네/아니요)", attrs)


def trade_fulfill(event: dict) -> dict:
    attrs = dict(event["sessionState"].get("sessionAttributes") or {})
    intent, slot, text = _trade_intent(event)
    if intent is None:
        return close(event, f"주문 정보가 부족해 보내지 않았습니다. {text}", fulfilled=False, attrs=attrs)
    if not market_open():
        return close(event, "지금은 장 시간(평일 09:00~15:30)이 아니라 주문을 보내지 않았습니다. 장중에 다시 말씀해 주세요.", fulfilled=False, attrs=attrs)
    attrs.pop("pendingTrade", None)
    try:
        result = place_order(intent)
    except GatewayError as exc:
        attrs["lastRejectCode"] = exc.code
        return close(event, reject_message(exc), fulfilled=False, attrs=attrs)
    order = result.get("order") or {}
    name = ticker_name(intent["symbol"])
    attrs.pop("lastRejectCode", None)
    attrs.update({"lastOrderNo": str(order.get("orderNo") or ""), "lastTicker": intent["symbol"], "lastTickerName": name})
    status = order.get("status") or "ACCEPTED"
    what = "매수" if intent["side"] == "BUY" else "매도"
    return close(event, f"{name} {intent['quantity']:,}주 {what} 주문을 KIS 모의계좌에 보냈습니다. 주문번호 {order.get('orderNo') or '-'}, 상태 {status}."
                 + (" (이미 접수된 주문입니다)" if result.get("duplicate") else "") + " 체결 확인은 「주문 확인」이라고 말씀해 주세요.", attrs=attrs)


# ── CheckBalance · CheckOrder ─────────────────────────────────────────────────
def balance_fulfill(event: dict) -> dict:
    try:
        b = get_balance()
    except GatewayError as exc:
        return close(event, f"잔고를 조회하지 못했습니다. ({exc})", fulfilled=False)
    holdings = b.get("holdings") or []
    top = sorted(holdings, key=lambda h: -float(h.get("evalAmount") or 0))[:5]
    lines = [f"KIS 모의계좌 — 예수금 {won(b.get('cashBalance'))}, 총평가 {won(b.get('totalEvalAmount'))}, 평가손익 {won(b.get('totalProfitLoss'))}, 보유 {len(holdings)}종목."]
    if top:
        lines.append("상위 보유: " + ", ".join(f"{h.get('name') or ticker_name(str(h.get('symbol')))} {int(h.get('quantity') or 0):,}주({won(h.get('evalAmount'))})" for h in top))
    try:
        if float(b.get("cashBalance") or 0) < 0:
            lines.append("예수금이 음수라 매수 주문은 거절됩니다. 보유 종목 매도 대금이 결제되는 D+2 영업일 이후 양수가 되면 매수할 수 있습니다.")
    except (TypeError, ValueError):
        pass
    return close(event, " ".join(lines))


def account_faq_fulfill(event: dict) -> dict:
    """AccountFaq: '예수금이 마이너스인데 가능해?', '모의계좌로 주문돼?', '왜 거절됐어?' — 실제 잔고와 직전 거절 사유로 답한다."""
    attrs = dict(event["sessionState"].get("sessionAttributes") or {})
    try:
        cash = int(float(get_balance().get("cashBalance") or 0))
    except (GatewayError, TypeError, ValueError) as exc:
        return close(event, f"잔고를 확인하지 못해 답하기 어렵습니다. ({exc})", fulfilled=False, attrs=attrs)
    lines = []
    if attrs.get("lastRejectCode"):
        code = attrs["lastRejectCode"]
        lines.append(f"직전 주문 거절 사유: {REJECT_HINTS.get(code, code)}.")
    if cash < 0:
        lines.append(f"KIS 모의계좌 예수금이 {won(cash)}으로 음수입니다. 모의계좌라도 예수금이 음수면 매수 주문은 거절되고(INSUFFICIENT_BALANCE), "
                     "보유 종목 매도 대금이 결제되는 D+2 영업일 이후 예수금이 양수가 되면 매수할 수 있습니다. 매도·잔고 조회·주문 확인은 지금도 됩니다.")
    else:
        lines.append(f"KIS 모의계좌 예수금 {won(cash)} 범위에서 매수할 수 있습니다. 챗봇 주문은 회당 {MAX_ORDER_QTY:,}주·{won(MAX_ORDER_AMOUNT)}까지, "
                     "장중(평일 09:00~15:30)에만 보냅니다. 예: '삼성전자 1주 시장가 매수'")
    return close(event, " ".join(lines), attrs=attrs)


def order_fulfill(event: dict) -> dict:
    attrs = dict(event["sessionState"].get("sessionAttributes") or {})
    slots = event["sessionState"]["intent"].get("slots") or {}
    order_no = slot_value(slots, "OrderNo") or attrs.get("lastOrderNo")
    if not order_no:
        return close(event, "확인할 주문번호가 없습니다. 주문번호를 알려 주시거나 먼저 주문해 주세요.", fulfilled=False, attrs=attrs)
    try:
        o = get_order(order_no)
    except GatewayError as exc:
        return close(event, f"주문 {order_no} 을 조회하지 못했습니다. ({exc})", fulfilled=False, attrs=attrs)
    filled = int(o.get("filledQuantity") or 0)
    return close(event, f"주문 {order_no}: {ticker_name(str(o.get('symbol') or ''))} {o.get('side') or ''} {int(o.get('quantity') or 0):,}주 · 상태 {o.get('status') or '-'}"
                 + (f" · 체결 {filled:,}주 @ {won(o.get('avgFilledPrice'))}" if filled else "") + ".", attrs=attrs)


# ── 진입점 ────────────────────────────────────────────────────────────────────
def handler(event: dict, context: Any = None) -> dict:
    name = (event.get("sessionState") or {}).get("intent", {}).get("name")
    source = event.get("invocationSource")
    logger.info("lex hook intent=%s source=%s session=%s", name, source, event.get("sessionId"))
    try:
        if name == "TradeStock":
            return trade_dialog(event) if source == "DialogCodeHook" else trade_fulfill(event)
        if name == "CheckBalance":
            return delegate(event) if source == "DialogCodeHook" else balance_fulfill(event)
        if name == "CheckOrder":
            return delegate(event) if source == "DialogCodeHook" else order_fulfill(event)
        if name == "AccountFaq":
            return delegate(event) if source == "DialogCodeHook" else account_faq_fulfill(event)
        return delegate(event)
    except Exception as exc:                       # 훅 예외는 Lex 에 500 으로 가 대화가 깨진다 → 메시지로 돌려준다
        logger.exception("lex hook failed")
        return close(event, f"처리 중 오류가 났습니다: {exc.__class__.__name__}", fulfilled=False)
