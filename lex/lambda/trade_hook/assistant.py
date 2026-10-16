"""FallbackIntent → Claude 도구 호출 (stock-kms-portal 6-15, 2026-10-16).

Lex 인텐트에 안 잡힌 열린 질문("주문 가능한 종목수는?", "보유 주식에 아모레퍼시픽 있어?", "오늘의 환율은?")을 Claude 가
**읽기 전용 도구**(잔고·시세·종목 검색·주문 조회·환율·장 시간·랭킹·문서 검색 search_docs)로 실제 데이터를 조회해 답한다.
주문 도구는 주지 않는다 — 주문은 Lex TradeStock 의 결정론적 슬롯·확인 흐름으로만 나가고, LLM 은 그 말하는 법만 안내한다.

제약: Lex 코드 훅은 Lambda 30초 안에 답해야 한다 → 요청당 타임아웃·전체 예산(LLM_BUDGET_S)·반복 횟수(LLM_MAX_ITER)를 둔다.
ANTHROPIC_API_KEY 가 없으면 answer() 가 None 을 돌려주고 handler 가 기존 명령 안내문을 보낸다.
SDK(anthropic)는 answer() 안에서만 import 한다 — handler 의 다른 경로와 단위 테스트는 SDK 없이 돈다.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import urllib.parse
from datetime import date, datetime
from typing import Any, Callable

logger = logging.getLogger()

MODEL = os.environ.get("LLM_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("LLM_EFFORT", "low")                 # 챗봇 폴백은 짧은 답 — low 로 지연·비용을 낮춘다
MAX_TOKENS = int(os.environ.get("LLM_MAX_TOKENS", "700"))
REQUEST_TIMEOUT_S = float(os.environ.get("LLM_TIMEOUT_S", "9"))
BUDGET_S = float(os.environ.get("LLM_BUDGET_S", "22"))        # Lex 30초 제한 안에서 끝내기 위한 전체 예산
MAX_ITER = int(os.environ.get("LLM_MAX_ITER", "4"))           # 모델 호출 횟수 상한(도구 왕복 포함)
RAG_SEARCH_URL = os.environ.get("RAG_SEARCH_URL", "https://iv.edumgt.co.kr/api/rag/search")
HISTORY_TURNS = int(os.environ.get("LLM_HISTORY_TURNS", "6"))
HISTORY_CHARS = 300
ANSWER_CHARS = 700                                            # 챗봇 말풍선 크기에 맞춘 상한

SYSTEM = """당신은 iv.edumgt.co.kr 「AI 투자 도우미」입니다. 한국어로, 핵심만 2~4문장(최대 350자)으로 답합니다.

규칙
- 잔고·보유 종목·시세·종목 코드·주문 상태·환율·장 시간·휴장일·랭킹은 반드시 도구로 조회한 값만 말합니다. 추측하거나 지어내지 않습니다.
- 서비스 안내·용어·규칙 질문은 search_docs 로 찾아 답하고 문서 제목을 괄호로 붙입니다. 결과가 없으면 "관련 자료가 없습니다"라고 말합니다.
- 당신은 주문을 낼 수 없습니다. 사용자가 매수·매도를 원하면 정확한 말하기 예를 알려 줍니다: "삼성전자 1주 시장가 매수". 주문을 냈다고 말하지 않습니다.
- 도구가 오류를 돌려주면 그 사실을 짧게 전합니다. 숫자는 천 단위 구분(1,234원)으로 씁니다.
- 이 챗봇은 KIS 모의투자 공용 계좌 1개만 다룹니다(실계좌·다른 계좌 없음). 투자 추천·종목 추천은 하지 않습니다.
- 투자와 무관한 질문에는 한 문장으로 할 수 있는 일을 안내합니다.
"""

HELP_TEXT = ('질문을 이해하지 못했습니다. 이렇게 말씀해 보세요 — 주문: "삼성전자 1주 시장가 매수" · 시세: "한화오션 현재가" · 잔고: "잔고 알려줘" · '
             '체결: "주문 확인" · 계좌: "예수금이 마이너스인데 가능해?" · 장 시간: "미국장 시간" · 휴장일: "올해 휴장일" · 랭킹: "랭킹 알려줘" · 환율: "오늘 환율". '
             '종목명만 입력해도 시세를 보여줍니다. 주문 입력 중에는 "취소"라고 하면 멈춥니다.')


def _j(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


def _trim(text: str, n: int) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


# ── 도구 ─────────────────────────────────────────────────────────────────────
def build_tools(ctx: Any, attrs: dict) -> list[Callable[..., str]]:
    """ctx = handler 모듈(잔고·시세·종목 사전·환율·장 시간 함수). 각 도구는 짧은 문자열(JSON/한국어)을 돌려준다."""

    def _resolve(stock: str) -> str | None:
        s = (stock or "").strip()
        if not s:
            return attrs.get("lastTicker")
        t = ctx.tickers()
        if s in t:
            return s
        key = s.replace(" ", "").lower()
        for code, v in t.items():
            names = [v["name"]] + list(v.get("aliases") or [])
            if any(key == n.replace(" ", "").lower() for n in names):
                return code
        for code, v in t.items():
            names = [v["name"]] + list(v.get("aliases") or [])
            if any(key in n.replace(" ", "").lower() or n.replace(" ", "").lower() in key for n in names if len(n) >= 2):
                return code
        return None

    def search_docs(query: str) -> str:
        """서비스 안내·계좌 규칙(D+2, 예수금, 한도)·주문 방법·장 시간·휴장일·호가 단위·투자 용어(PER, RSI) 같은 설명 질문에 쓰는 문서 검색.
        실시간 숫자(잔고·시세)는 여기 없다 — 다른 도구를 쓴다.

        Args:
            query: 사용자 질문을 한국어 자연어 그대로.
        """
        try:
            data = ctx.fetch_json(f"{RAG_SEARCH_URL}?{urllib.parse.urlencode({'q': query[:300], 'limit': 3})}")
        except Exception as exc:                                      # noqa: BLE001 — 도구 실패는 모델이 사용자에게 전한다
            return f"오류: 문서 검색 실패 ({exc})"
        hits = data.get("hits") or []
        if not hits:
            return "관련 자료 없음"
        return "\n\n".join(f"[{h.get('title')} / {h.get('section')}] {_trim(str(h.get('content') or ''), 450)}" for h in hits)

    def get_balance() -> str:
        """KIS 모의계좌 잔고: 예수금·총평가·평가손익과 보유 종목 전체(코드·이름·수량·평가금액·수익률). "보유 종목 수", "OO 보유 중?" 질문에 쓴다."""
        try:
            b = ctx.get_balance()
        except Exception as exc:                                      # noqa: BLE001
            return f"오류: 잔고 조회 실패 ({exc})"
        holdings = [{"symbol": h.get("symbol"), "name": ctx.ticker_name(str(h.get("symbol") or "")), "quantity": h.get("quantity"),
                     "evalAmount": h.get("evalAmount"), "profitRate": h.get("profitRate")} for h in (b.get("holdings") or [])]
        return _j({"cashBalance": b.get("cashBalance"), "totalEval": b.get("totalEval"), "profitLoss": b.get("profitLoss"),
                   "holdingsCount": len(holdings), "holdings": holdings[:30]})

    def get_quote(stock: str) -> str:
        """종목 현재 시세(현재가·전일대비·등락률·시고저·거래량·상하한가).

        Args:
            stock: 종목명(통칭 가능: 현대자동차, 하이닉스) 또는 6자리 종목코드. 비우면 직전에 말한 종목.
        """
        code = _resolve(stock)
        if not code:
            return f"오류: '{stock}' 종목을 찾지 못함. find_stock 으로 검색하거나 6자리 코드를 확인"
        try:
            q = ctx.get_quote(code)
        except Exception as exc:                                      # noqa: BLE001
            return f"오류: 시세 조회 실패 ({exc})"
        attrs.update({"lastTicker": code, "lastTickerName": ctx.ticker_name(code)})
        return _j({"symbol": code, "name": ctx.ticker_name(code), **q, "marketOpen": ctx.market_open()})

    def find_stock(query: str) -> str:
        """KRX 상장 종목 사전에서 이름 일부로 종목을 찾는다(최대 10개: 코드·이름·시장·챗봇 매수 가능 여부).

        Args:
            query: 종목명 일부 또는 종목코드.
        """
        key = (query or "").replace(" ", "").lower()
        if not key:
            return "오류: 검색어 없음"
        rows = []
        for code, v in ctx.tickers().items():
            names = [v["name"]] + list(v.get("aliases") or [])
            if code == key or any(key in n.replace(" ", "").lower() for n in names):
                rows.append({"symbol": code, "name": v["name"], "market": v.get("market"), "buyEligible": bool(v.get("buy"))})
        if not rows:
            return "일치하는 종목 없음"
        return _j({"count": len(rows), "items": sorted(rows, key=lambda r: len(r["name"]))[:10]})

    def tradable_universe() -> str:
        """챗봇으로 주문 가능한 종목 수(KRX 상장 종목 사전 전체 수, 매수 가능 수, 매수 제외(관리종목 등) 수, 시장별 수)."""
        t = ctx.tickers()
        by_market: dict[str, int] = {}
        for v in t.values():
            by_market[v.get("market") or "?"] = by_market.get(v.get("market") or "?", 0) + 1
        buy = sum(1 for v in t.values() if v.get("buy"))
        return _j({"total": len(t), "buyEligible": buy, "buyExcluded": len(t) - buy, "byMarket": by_market,
                   "note": "KIS 모의계좌(국내 주식) 기준. 챗봇 회당 한도 %d주·%s원" % (ctx.MAX_ORDER_QTY, f"{ctx.MAX_ORDER_AMOUNT:,}")})

    def get_order(order_no: str = "") -> str:
        """주문 체결 상태 조회.

        Args:
            order_no: 주문번호. 비우면 이 세션의 마지막 주문.
        """
        no = (order_no or "").strip() or attrs.get("lastOrderNo")
        if not no:
            return "이 세션에 조회할 주문이 없음"
        try:
            o = ctx.get_order(no)
        except Exception as exc:                                      # noqa: BLE001
            return f"오류: 주문 조회 실패 ({exc})"
        return _j({**o, "name": ctx.ticker_name(str(o.get("symbol") or ""))})

    def fx_rates(currency: str = "") -> str:
        """오늘 원화 환율(1달러·100엔·1유로·1위안당 원). 참고용 중간 환율.

        Args:
            currency: USD/JPY/EUR/CNY 중 하나. 비우면 전부.
        """
        try:
            rates, src = ctx.get_fx_rates()
        except Exception as exc:                                      # noqa: BLE001
            return f"오류: 환율 조회 실패 ({exc})"
        cur = (currency or "").upper()
        keys = [cur] if cur in ctx.FX_UNITS else list(ctx.FX_UNITS)
        return _j({"source": src, "rates": {f"{ctx.FX_UNITS[c][0]}{ctx.FX_UNITS[c][1]}": round(ctx.fx_krw(rates, c) or 0, 1) for c in keys}})

    def market_status() -> str:
        """지금 한국 장이 열려 있는지, 한국·미국 정규장 시간(KST), 다음 휴장일과 올해 남은 휴장일."""
        now = datetime.now(ctx.KST)
        rest = [(d, n) for d, n in sorted(ctx.KRX_HOLIDAYS.items()) if date.fromisoformat(d) >= now.date()]
        dst = ctx.us_dst(now.date())
        return _j({"nowKST": now.strftime("%Y-%m-%d %H:%M"), "krxOpenNow": ctx.market_open(now), "krxHours": "평일 09:00~15:30 (동시호가 08:30~09:00, 15:20~15:30)",
                   "usHoursKST": "22:30~05:00 (서머타임)" if dst else "23:30~06:00 (표준시)", "nextHoliday": rest[0] if rest else None,
                   "remainingHolidaysThisYear": [f"{d} {n}" for d, n in rest if d.startswith(str(now.year))]})

    def ranking() -> str:
        """st.edumgt.co.kr 사이트 모의투자(초기자산 1억) 공개 수익 랭킹 상위 5명. KIS 모의계좌는 공용 1개라 개인 랭킹은 없다."""
        try:
            rows = (ctx.fetch_json(ctx.RANKING_URL).get("rankings") or [])[:5]
        except Exception as exc:                                      # noqa: BLE001
            return f"오류: 랭킹 조회 실패 ({exc})"
        return _j([{"rank": r.get("rank"), "user": r.get("username"), "profitRate": r.get("profitRate"), "totalAsset": r.get("totalAsset")} for r in rows])

    return [search_docs, get_balance, get_quote, find_stock, tradable_universe, get_order, fx_rates, market_status, ranking]


# ── 대화 이력(세션 속성) ──────────────────────────────────────────────────────
def load_history(attrs: dict) -> list[dict]:
    try:
        hist = json.loads(attrs.get("llmHistory") or "[]")
    except ValueError:
        hist = []
    return [{"role": h[0], "content": h[1]} for h in hist if isinstance(h, list) and len(h) == 2 and h[0] in ("user", "assistant")][-HISTORY_TURNS:]


def save_history(attrs: dict, history: list[dict], question: str, answer: str) -> None:
    items = [[h["role"], _trim(h["content"], HISTORY_CHARS)] for h in history] + [["user", _trim(question, HISTORY_CHARS)], ["assistant", _trim(answer, HISTORY_CHARS)]]
    attrs["llmHistory"] = json.dumps(items[-HISTORY_TURNS:], ensure_ascii=False)


# ── 모델 호출 ─────────────────────────────────────────────────────────────────
def _client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=REQUEST_TIMEOUT_S, max_retries=1)


def _runner(client, tools, messages):
    from anthropic import beta_tool
    return client.beta.messages.tool_runner(
        model=MODEL, max_tokens=MAX_TOKENS, max_iterations=MAX_ITER,
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],      # 고정 프롬프트+도구 정의는 캐시
        tools=[beta_tool(fn) for fn in tools], messages=messages,
        output_config={"effort": EFFORT},
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",                        # 안전 분류기 거절 시 서버가 대체 모델로 재시도
    )


def _text_of(message) -> str:
    return "".join(getattr(b, "text", "") for b in (message.content or []) if getattr(b, "type", "") == "text").strip()


def answer(question: str, attrs: dict, ctx: Any, runner_factory: Callable | None = None) -> str | None:
    """질문 → Claude(도구 호출) → 답 문자열. API 키가 없으면 None. 예외는 호출자가 처리한다."""
    if not os.environ.get("ANTHROPIC_API_KEY") and runner_factory is None:
        return None
    history = load_history(attrs)
    messages = history + [{"role": "user", "content": question}]
    tools = build_tools(ctx, attrs)
    runner = runner_factory(tools, messages) if runner_factory else _runner(_client(), tools, messages)
    started = time.time()
    last = None
    for message in runner:
        last = message
        if time.time() - started > BUDGET_S:                                                   # Lex 30초 안에 끝낸다
            logger.warning("llm budget exceeded after %.1fs", time.time() - started)
            break
    if last is None:
        return None
    text = _text_of(last)
    if getattr(last, "stop_reason", "") == "refusal":
        text = "그 질문에는 답해 드리기 어렵습니다. 잔고·시세·주문·환율·장 시간처럼 투자 관련 질문을 해 주세요."
    elif not text:
        text = "답을 완성하지 못했습니다. 질문을 조금 더 구체적으로 다시 말씀해 주세요."
    elif getattr(last, "stop_reason", "") == "max_tokens":
        text += " …(답이 길어 일부만 표시)"
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _trim(text, ANSWER_CHARS)
    save_history(attrs, history, question, text)
    return text
