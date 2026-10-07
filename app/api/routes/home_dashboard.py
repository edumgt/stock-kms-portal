"""홈 대시보드(차트·시세) API — 레거시 investment-backend 없이 포털이 직접 제공한다.

왜: ``frontend/investment-native/js/views/home.js`` 는 ``/api/home/market-candle``·``/api/market/snapshot``·
``/api/home/chart-search`` 를 부르는데, ``/api/*`` 는 ``main.py`` 의 프록시가 ``investment-backend:8000`` 으로
넘긴다. iv 배포(st 서버)에는 그 컨테이너가 없어(todo.md K2) 대시보드가 전부 502 였다. 이 라우터는
프록시보다 먼저 등록되므로 세 경로는 여기서 응답하고, 나머지 ``/api/*`` 는 그대로 프록시된다.

구현은 ``integration-src/investment-backend/main.py`` 의 같은 이름 엔드포인트를 이식한 것으로, 응답 형식
(``ohlcv[{date,o,h,l,c,v}]``·``is_simulated``·``display_from``·``items[{ticker,value,change_pct,status}]``)은 동일하다.
시세는 ``/market/intraday`` 와 같은 Yahoo Finance chart JSON(httpx) 으로 받아 yfinance·pandas 를 쓰지 않는다.
Yahoo 가 실패하면 원본과 같이 결정적 난수 시뮬레이션 봉을 ``is_simulated=true`` 로 돌려준다(화면에 "시뮬레이션 데이터" 표시).
"""
from __future__ import annotations

import asyncio
import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["home-dashboard"])

_UA = {"User-Agent": "Mozilla/5.0 (FinanceRagLab educational use)"}
_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"

PERIOD_DAYS = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365}
INTRADAY_PERIODS = {"1d"}
INTRADAY_INTERVALS = {"1m", "3m", "5m", "15m", "30m", "1h"}
# 이동평균(MA20) 이 표시 구간 처음부터 나오도록 앞선 과거를 더 받아 display_from 으로 잘라 보여 준다.
MA_LOOKBACK_BUFFER_DAYS = 40
CHART_TIMEFRAMES = {
    "1m": ("1m", 1), "3m": ("3m", 1), "5m": ("5m", 1), "15m": ("15m", 1),
    "30m": ("30m", 1), "1h": ("1h", 1), "1d": ("1d", 365), "2y": ("2y", 365 * 2), "5y": ("5y", 365 * 5),
    "1wk": ("1wk", 365 * 5), "1mo": ("1mo", 365 * 10), "1y": ("1y", 365 * 30),
}

HOME_MARKETS: dict[str, dict[str, Any]] = {
    "kospi":   {"ticker": "^KS11", "name": "KOSPI", "base_price": 2650.0, "seed": 42},
    "kosdaq":  {"ticker": "^KQ11", "name": "KOSDAQ", "base_price": 850.0, "seed": 73},
    "nasdaq":  {"ticker": "^IXIC", "name": "NASDAQ", "base_price": 18000.0, "seed": 109},
    "sp500":   {"ticker": "^GSPC", "name": "S&P 500", "base_price": 5200.0, "seed": 151},
    "dow":     {"ticker": "^DJI", "name": "다우존스", "base_price": 39000.0, "seed": 187},
    "gold":    {"ticker": "GC=F", "name": "국제 금 선물", "base_price": 2600.0, "seed": 211},
    "oil":     {"ticker": "CL=F", "name": "WTI 원유 선물", "base_price": 75.0, "seed": 233},
    "dxy":     {"ticker": "DX-Y.NYB", "name": "달러인덱스(DXY)", "base_price": 103.0, "seed": 255},
    "usdkrw":  {"ticker": "KRW=X", "name": "원/달러 환율", "base_price": 1380.0, "seed": 277},
    "ust10y":  {"ticker": "^TNX", "name": "미국 10년물 국채금리", "base_price": 42.0, "seed": 299},
    "bitcoin": {"ticker": "BTC-USD", "name": "비트코인(BTC/USD)", "base_price": 65000.0, "seed": 321},
}
MODAL_CHART_STOCKS: dict[str, dict[str, Any]] = {
    "aapl": {"ticker": "AAPL", "name": "Apple", "base_price": 220.0, "seed": 401},
    "msft": {"ticker": "MSFT", "name": "Microsoft", "base_price": 450.0, "seed": 419},
    "googl": {"ticker": "GOOGL", "name": "Alphabet", "base_price": 180.0, "seed": 431},
    "amzn": {"ticker": "AMZN", "name": "Amazon", "base_price": 220.0, "seed": 443},
    "nvda": {"ticker": "NVDA", "name": "NVIDIA", "base_price": 180.0, "seed": 457},
    "meta": {"ticker": "META", "name": "Meta", "base_price": 750.0, "seed": 467},
    "tsla": {"ticker": "TSLA", "name": "Tesla", "base_price": 330.0, "seed": 479},
    "samsung": {"ticker": "005930.KS", "name": "삼성전자", "base_price": 75000.0, "seed": 491},
    "skhynix": {"ticker": "000660.KS", "name": "SK하이닉스", "base_price": 250000.0, "seed": 503},
    "lgenergy": {"ticker": "373220.KS", "name": "LG에너지솔루션", "base_price": 350000.0, "seed": 521},
    "samsungbio": {"ticker": "207940.KS", "name": "삼성바이오로직스", "base_price": 1000000.0, "seed": 541},
    "hyundai": {"ticker": "005380.KS", "name": "현대차", "base_price": 220000.0, "seed": 557},
    "kia": {"ticker": "000270.KS", "name": "기아", "base_price": 100000.0, "seed": 571},
    "naver": {"ticker": "035420.KS", "name": "NAVER", "base_price": 200000.0, "seed": 587},
}
MODAL_CHART_INSTRUMENTS = {**HOME_MARKETS, **MODAL_CHART_STOCKS}
MARKET_SNAPSHOT_LABELS = {"^KS11": "KOSPI", "^IXIC": "NASDAQ", "KRW=X": "USD/KRW"}
# Yahoo 자동완성은 한글 회사명을 잘 못 찾으므로 국내 주요 종목은 KRX 코드로 보완한다.
KOREAN_SEARCH_ALIASES = {
    "삼성전자": ("005930.KS", "삼성전자"), "SK하이닉스": ("000660.KS", "SK하이닉스"),
    "LG에너지솔루션": ("373220.KS", "LG에너지솔루션"), "삼성바이오로직스": ("207940.KS", "삼성바이오로직스"),
    "현대차": ("005380.KS", "현대자동차"), "기아": ("000270.KS", "기아"), "NAVER": ("035420.KS", "NAVER"),
    "카카오": ("035720.KS", "카카오"), "셀트리온": ("068270.KS", "셀트리온"), "삼성물산": ("028260.KS", "삼성물산"),
    "삼성SDI": ("006400.KS", "삼성SDI"), "LG화학": ("051910.KS", "LG화학"), "KB금융": ("105560.KS", "KB금융"),
    "신한지주": ("055550.KS", "신한지주"), "POSCO홀딩스": ("005490.KS", "POSCO홀딩스"),
    "한화에어로스페이스": ("012450.KS", "한화에어로스페이스"), "두산에너빌리티": ("034020.KS", "두산에너빌리티"),
    "HD현대중공업": ("329180.KS", "HD현대중공업"), "알테오젠": ("196170.KQ", "알테오젠"),
    "에코프로비엠": ("247540.KQ", "에코프로비엠"), "에코프로": ("086520.KQ", "에코프로"), "HLB": ("028300.KQ", "HLB"),
    "펄어비스": ("263750.KQ", "펄어비스"), "JYP": ("035900.KQ", "JYP Ent."),
}

_TICKER_RE = re.compile(r"^[A-Za-z0-9.^=\-]{1,24}$")
_candle_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
_candle_ttl = timedelta(seconds=60)
_snapshot_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
_snapshot_ttl = timedelta(seconds=30)


class MarketSnapshotRequest(BaseModel):
    tickers: list[str] = ["^KS11", "^IXIC", "KRW=X"]


# ── Yahoo chart JSON → 봉 목록 ─────────────────────────────────────────────────────────

async def _yahoo_chart(client: httpx.AsyncClient, symbol: str, params: dict[str, Any]) -> dict[str, Any]:
    response = await client.get(_CHART_URL.format(symbol=symbol), params=params, headers=_UA)
    response.raise_for_status()
    result = response.json()["chart"]["result"][0]
    return result


def _bars_from_result(result: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    """[{ts(초), o,h,l,c,v}], 거래소 UTC 오프셋(초). 값이 빠진 봉은 건너뛴다."""
    quote = result["indicators"]["quote"][0]
    timestamps = result.get("timestamp") or []
    opens, highs = quote.get("open") or [], quote.get("high") or []
    lows, closes, volumes = quote.get("low") or [], quote.get("close") or [], quote.get("volume") or []
    bars = []
    for i, ts in enumerate(timestamps):
        vals = [arr[i] if i < len(arr) else None for arr in (opens, highs, lows, closes)]
        if any(v is None or not math.isfinite(float(v)) for v in vals):
            continue
        v = volumes[i] if i < len(volumes) and volumes[i] is not None else 0
        bars.append({"ts": int(ts), "o": float(vals[0]), "h": float(vals[1]), "l": float(vals[2]), "c": float(vals[3]), "v": int(v)})
    return bars, int(result.get("meta", {}).get("gmtoffset") or 0)


def _aggregate(bars: list[dict[str, Any]], key) -> list[dict[str, Any]]:
    """같은 key 를 갖는 연속 봉을 하나로 합친다(첫 시가·최고·최저·마지막 종가·거래량 합). 3분봉·주·월·연봉용."""
    out: list[dict[str, Any]] = []
    current_key = object()
    for bar in bars:
        k = key(bar)
        if out and k == current_key:
            agg = out[-1]
            agg["h"] = max(agg["h"], bar["h"]); agg["l"] = min(agg["l"], bar["l"])
            agg["c"] = bar["c"]; agg["v"] += bar["v"]
        else:
            out.append(dict(bar)); current_key = k
    return out


def _format_bars(bars: list[dict[str, Any]], gmtoffset: int, intraday: bool) -> list[dict[str, Any]]:
    tz = timezone(timedelta(seconds=gmtoffset))
    rows = []
    for bar in bars:
        local = datetime.fromtimestamp(bar["ts"], tz=tz)
        rows.append({
            "date": local.isoformat() if intraday else local.date().isoformat(),
            "o": round(bar["o"], 2), "h": round(bar["h"], 2), "l": round(bar["l"], 2), "c": round(bar["c"], 2), "v": bar["v"],
        })
    return rows


def _simulated_bars(config: dict[str, Any], intraday: bool, interval: str, display_days: int) -> tuple[list[dict[str, Any]], str | None]:
    """원본과 같은 LCG 난수 봉. Yahoo 장애 시 화면이 비지 않게 하며 is_simulated=true 로 표시된다."""
    rng_state = int(config["seed"])

    def _rand() -> float:
        nonlocal rng_state
        rng_state = (rng_state * 1664525 + 1013904223) % 2**32
        return rng_state / 2**32

    def _randn() -> float:
        u, v = max(_rand(), 1e-10), _rand()
        return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)

    price = float(config["base_price"])
    ohlcv: list[dict[str, Any]] = []
    today = datetime.now(timezone.utc).date()
    display_from: str | None = None
    if intraday:
        minutes = 60 if interval == "1h" else int(interval[:-1])
        base = datetime.combine(today, datetime.min.time(), tzinfo=timezone(timedelta(hours=9))) + timedelta(hours=9)
        for i in range(390 // minutes):
            ts = base + timedelta(minutes=minutes * i)
            o = price; c = max(o * 0.97, o + _randn() * price * 0.003)
            h = max(o, c) * (1 + _rand() * 0.002); l = min(o, c) * (1 - _rand() * 0.002)
            ohlcv.append({"date": ts.isoformat(), "o": round(o, 2), "h": round(h, 2), "l": round(l, 2), "c": round(c, 2), "v": int(_rand() * 1e6)})
            price = c
    else:
        total_days = display_days + MA_LOOKBACK_BUFFER_DAYS
        base = today - timedelta(days=total_days)
        display_from = (today - timedelta(days=display_days)).isoformat()
        for i in range(int(total_days * 0.72)):
            o = price; c = max(o * 0.9, o + _randn() * price * 0.012)
            h = max(o, c) * (1 + _rand() * 0.008); l = min(o, c) * (1 - _rand() * 0.008)
            ohlcv.append({"date": (base + timedelta(days=i + 1)).isoformat(), "o": round(o, 2), "h": round(h, 2), "l": round(l, 2), "c": round(c, 2), "v": int(_rand() * 1e8)})
            price = c
    return ohlcv, display_from


# ── 엔드포인트 ──────────────────────────────────────────────────────────────────────────

@router.get("/home/market-candle")
async def home_market_candle(
    market: str = Query("kospi"), period: str = Query("3mo"), interval: str = Query("5m"),
    ticker: str = Query(""), timeframe: str = Query(""),
) -> dict[str, Any]:
    """홈 카드(일봉, period)와 확대 모달(timeframe: 분봉·일·주·월·연)의 OHLCV. 60초 캐시."""
    if period not in PERIOD_DAYS and period not in INTRADAY_PERIODS:
        period = "3mo"
    if interval not in INTRADAY_INTERVALS:
        interval = "5m"
    if ticker and _TICKER_RE.fullmatch(ticker):
        config = {"ticker": ticker.upper(), "name": ticker.upper(), "base_price": 100.0, "seed": 911}
    else:
        config = MODAL_CHART_INSTRUMENTS.get(market, HOME_MARKETS["kospi"])
    if timeframe in CHART_TIMEFRAMES:
        interval, display_days = CHART_TIMEFRAMES[timeframe]
        intraday = interval in INTRADAY_INTERVALS
    else:
        intraday = period in INTRADAY_PERIODS
        display_days = PERIOD_DAYS.get(period, 90)

    cache_key = f"{config['ticker']}:{period}:{interval}:{timeframe}"
    now = datetime.now(timezone.utc)
    cached = _candle_cache.get(cache_key)
    if cached and now - cached[0] < _candle_ttl:
        return cached[1]

    display_from: str | None = None
    ohlcv: list[dict[str, Any]] = []
    simulated = False
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            if intraday:
                # Yahoo 에는 3분 간격이 없어 1분봉을 받아 3분으로 합친다.
                fetch_interval = "1m" if interval in {"1m", "3m"} else interval
                result = await _yahoo_chart(client, config["ticker"], {"range": "1d", "interval": fetch_interval})
                bars, gmtoffset = _bars_from_result(result)
                if interval == "3m":
                    bars = _aggregate(bars, key=lambda b: b["ts"] // 180)
            else:
                end_date = date.today() + timedelta(days=1)
                start_date = end_date - timedelta(days=display_days + MA_LOOKBACK_BUFFER_DAYS)
                display_from = (end_date - timedelta(days=display_days)).isoformat()
                period1 = int(datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc).timestamp())
                period2 = int(datetime.combine(end_date, datetime.min.time(), tzinfo=timezone.utc).timestamp())
                result = await _yahoo_chart(client, config["ticker"], {"period1": period1, "period2": period2, "interval": "1d"})
                bars, gmtoffset = _bars_from_result(result)
                if timeframe in {"1wk", "1mo", "1y"}:
                    tz = timezone(timedelta(seconds=gmtoffset))
                    keyers = {
                        "1wk": lambda b: datetime.fromtimestamp(b["ts"], tz=tz).isocalendar()[:2],
                        "1mo": lambda b: datetime.fromtimestamp(b["ts"], tz=tz).strftime("%Y-%m"),
                        "1y": lambda b: datetime.fromtimestamp(b["ts"], tz=tz).year,
                    }
                    bars = _aggregate(bars, key=keyers[timeframe])
        if not bars:
            raise ValueError("empty")
        ohlcv = _format_bars(bars, gmtoffset, intraday)
    except Exception:
        ohlcv, display_from = _simulated_bars(config, intraday, interval, display_days)
        simulated = True

    payload = {"market": market, "name": config["name"], "ticker": config["ticker"], "ohlcv": ohlcv,
               "is_simulated": simulated, "display_from": display_from, "interval": interval}
    if not simulated:
        _candle_cache[cache_key] = (now, payload)
    return payload


async def _snapshot_one(client: httpx.AsyncClient, ticker: str, fetched_at: str) -> dict[str, Any]:
    label = MARKET_SNAPSHOT_LABELS.get(ticker, ticker)
    try:
        result = await _yahoo_chart(client, ticker, {"range": "5d", "interval": "1d"})
        meta = result.get("meta", {})
        current = meta.get("regularMarketPrice")
        previous = meta.get("chartPreviousClose") or meta.get("previousClose")
        if current is None:
            bars, _ = _bars_from_result(result)
            if not bars:
                raise ValueError("no price")
            current = bars[-1]["c"]
            previous = bars[-2]["c"] if len(bars) > 1 else current
        current = float(current)
        previous = float(previous) if previous else current
        change_pct = ((current / previous) - 1) * 100 if previous else 0.0
        return {"ticker": ticker, "label": label, "value": round(current, 4), "change_pct": round(change_pct, 2),
                "latest_data_at": fetched_at, "status": "ok"}
    except Exception as exc:  # 한 종목 실패가 전체 응답을 막지 않게 — 화면은 '조회 불가' 로 표시
        return {"ticker": ticker, "label": label, "status": "error", "error": str(exc)[:120]}


@router.post("/market/snapshot")
async def market_snapshot(req: MarketSnapshotRequest) -> dict[str, Any]:
    """대시보드 시세 패널(미국 7·한국 7 종목). 종목별 동시 조회, 30초 캐시."""
    tickers = [t.strip().upper() for t in req.tickers if t and _TICKER_RE.fullmatch(t.strip())][:40]
    if not tickers:
        return {"items": [], "fetched_at": datetime.now(timezone.utc).isoformat()}
    cache_key = ",".join(sorted(tickers))
    now = datetime.now(timezone.utc)
    cached = _snapshot_cache.get(cache_key)
    if cached and now - cached[0] < _snapshot_ttl:
        return cached[1]
    fetched_at = now.isoformat()
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        items = list(await asyncio.gather(*(_snapshot_one(client, t, fetched_at) for t in tickers)))
    payload = {"items": items, "fetched_at": fetched_at}
    if any(item["status"] == "ok" for item in items):
        _snapshot_cache[cache_key] = (now, payload)
    return payload


@router.get("/home/chart-search")
async def home_chart_search(q: str = Query("")) -> dict[str, Any]:
    """확대 모달의 종목 검색: 국내 별칭 → Yahoo 자동완성 → 내장 대표 종목 순."""
    query = q.strip()
    if not query:
        return {"items": []}
    lowered = query.lower()
    items: list[dict[str, str]] = []
    for alias, (ticker, name) in KOREAN_SEARCH_ALIASES.items():
        if lowered in alias.lower() or lowered in name.lower():
            items.append({"ticker": ticker, "name": name, "exchange": "Korea Exchange"})
    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
            response = await client.get(_SEARCH_URL, params={"q": query, "quotesCount": 12, "newsCount": 0}, headers=_UA)
            response.raise_for_status()
            payload = response.json()
        allowed = {"EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY", "FUTURE", "MUTUALFUND"}
        for quote in payload.get("quotes", []):
            ticker = str(quote.get("symbol", "")).upper()
            if quote.get("quoteType") not in allowed or not _TICKER_RE.fullmatch(ticker):
                continue
            items.append({"ticker": ticker, "name": str(quote.get("shortname") or quote.get("longname") or ticker),
                          "exchange": str(quote.get("exchange", ""))})
    except Exception:
        pass
    if not items:
        for config in MODAL_CHART_INSTRUMENTS.values():
            if lowered in config["ticker"].lower() or lowered in config["name"].lower():
                items.append({"ticker": config["ticker"], "name": config["name"], "exchange": ""})
    return {"items": items[:12]}


from app.services.chart_llm import ChartAnalysisRequest, analyze_chart


@router.post('/home/chart-analysis')
def home_chart_analysis(payload: ChartAnalysisRequest):
    return analyze_chart(payload)
