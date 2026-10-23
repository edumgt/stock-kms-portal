"""Market data for the visualization tabs served by the portal itself."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from app.api.routes.home_dashboard import _bars_from_result, _format_bars, _yahoo_chart

router = APIRouter(prefix="/api/market", tags=["data-visualization"])

# Fixed representative samples, matching the visualization's existing labels.
KOSPI = [
    ("005930.KS", "삼성전자", "반도체"), ("000660.KS", "SK하이닉스", "반도체"),
    ("373220.KS", "LG에너지솔루션", "배터리"), ("207940.KS", "삼성바이오로직스", "바이오"),
    ("005380.KS", "현대차", "자동차"), ("000270.KS", "기아", "자동차"),
    ("105560.KS", "KB금융", "금융"), ("035420.KS", "NAVER", "IT/플랫폼"),
    ("055550.KS", "신한지주", "금융"), ("006400.KS", "삼성SDI", "배터리"),
    ("086790.KS", "하나금융지주", "금융"), ("012330.KS", "현대모비스", "자동차"),
    ("051910.KS", "LG화학", "화학"), ("032830.KS", "삼성생명", "금융"),
    ("035720.KS", "카카오", "IT/플랫폼"), ("316140.KS", "우리금융지주", "금융"),
    ("068270.KS", "셀트리온", "바이오"), ("005490.KS", "POSCO홀딩스", "철강"),
    ("017670.KS", "SK텔레콤", "통신"), ("030200.KS", "KT", "통신"),
    ("018260.KS", "삼성SDS", "IT/플랫폼"), ("096770.KS", "SK이노베이션", "에너지"),
    ("034730.KS", "SK", "에너지"), ("003550.KS", "LG", "지주회사"),
    ("090430.KS", "아모레퍼시픽", "소비재"), ("034220.KS", "LG디스플레이", "디스플레이"),
    ("011170.KS", "롯데케미칼", "화학"), ("000120.KS", "CJ대한통운", "물류"),
]
KOSDAQ = [
    ("240810.KQ", "원익IPS", "반도체 장비"), ("036930.KQ", "주성엔지니어링", "반도체 장비"),
    ("084370.KQ", "유진테크", "반도체 장비"), ("403870.KQ", "HPSP", "반도체 장비"),
    ("039030.KQ", "이오테크닉스", "반도체 장비"), ("058470.KQ", "리노공업", "반도체 부품"),
    ("095340.KQ", "ISC", "반도체 부품"), ("357780.KQ", "솔브레인", "반도체 소재"),
    ("005290.KQ", "동진쎄미켐", "반도체 소재"), ("247540.KQ", "에코프로비엠", "2차전지"),
    ("086520.KQ", "에코프로", "2차전지"), ("066970.KS", "엘앤에프", "2차전지"),
    ("196170.KQ", "알테오젠", "바이오"), ("145020.KQ", "휴젤", "바이오"),
    ("068760.KQ", "셀트리온제약", "바이오"), ("214450.KQ", "파마리서치", "바이오"),
    ("293490.KQ", "카카오게임즈", "게임·콘텐츠"), ("112040.KQ", "위메이드", "게임·콘텐츠"),
    ("041510.KQ", "에스엠", "엔터테인먼트"), ("035900.KQ", "JYP Ent.", "엔터테인먼트"),
    ("122870.KQ", "와이지엔터테인먼트", "엔터테인먼트"),
]
US_VOLUME = [
    ("AAPL", "Apple"), ("MSFT", "Microsoft"), ("GOOGL", "Alphabet"),
    ("AMZN", "Amazon"), ("NVDA", "NVIDIA"), ("META", "Meta"), ("TSLA", "Tesla"),
]
KR_VOLUME_TICKERS = [
    "005930.KS", "000660.KS", "373220.KS", "207940.KS", "005380.KS", "000270.KS",
    "068270.KS", "105560.KS", "055550.KS", "012330.KS", "035420.KS", "006400.KS",
    "051910.KS", "005490.KS", "035720.KS", "096770.KS", "034730.KS", "086790.KS",
    "032830.KS", "003550.KS",
]
KOSPI_NAMES = {ticker: name for ticker, name, _ in KOSPI}
KR_VOLUME = [(ticker, KOSPI_NAMES[ticker]) for ticker in KR_VOLUME_TICKERS]

_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
_ttl = timedelta(minutes=5)


async def _recent_bars(client: httpx.AsyncClient, ticker: str, semaphore: asyncio.Semaphore, range_: str) -> list[dict[str, Any]]:
    async with semaphore:
        result = await _yahoo_chart(client, ticker, {"range": range_, "interval": "1d"})
    bars, offset = _bars_from_result(result)
    return [bar for bar in _format_bars(bars, offset, False) if bar["c"] > 0 and bar["v"] >= 0]


async def _fetch_sample(sample: list[tuple[str, ...]], range_: str) -> list[tuple[tuple[str, ...], list[dict[str, Any]] | None]]:
    semaphore = asyncio.Semaphore(6)
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        results = await asyncio.gather(*(
            _recent_bars(client, row[0], semaphore, range_) for row in sample
        ), return_exceptions=True)
    return [(row, None if isinstance(result, BaseException) else result) for row, result in zip(sample, results)]


def _cached(key: str) -> dict[str, Any] | None:
    record = _cache.get(key)
    if record and datetime.now(timezone.utc) - record[0] < _ttl:
        return record[1]
    return None


def _save(key: str, payload: dict[str, Any]) -> dict[str, Any]:
    _cache[key] = (datetime.now(timezone.utc), payload)
    return payload


@router.get("/volume-cloud")
async def market_volume_cloud(market: str = "us") -> dict[str, Any]:
    market = market.lower()
    if market not in {"us", "kr"}:
        raise HTTPException(status_code=400, detail="market은 us 또는 kr만 선택할 수 있습니다.")
    key = f"volume:{market}"
    if cached := _cached(key):
        return cached
    sample = US_VOLUME if market == "us" else KR_VOLUME
    fetched_at = datetime.now(timezone.utc).isoformat()
    items = []
    latest_dates = []
    for (ticker, name), bars in await _fetch_sample(sample, "2mo"):
        if not bars or len(bars) < 2:
            items.append({"ticker": ticker, "name": name, "status": "error"})
            continue
        last, previous = bars[-1], bars[-2]
        prior = bars[-21:-1]
        average_volume = sum(bar["v"] for bar in prior) / len(prior)
        volume = last["v"]
        items.append({
            "ticker": ticker, "name": name, "price": last["c"],
            "change_pct": round((last["c"] / previous["c"] - 1) * 100, 2),
            "volume": volume, "average_volume_20d": int(average_volume),
            "volume_ratio": round(volume / average_volume, 2) if average_volume else 0.0,
            "latest_data_at": last["date"], "status": "ok",
        })
        latest_dates.append(last["date"])
    if not latest_dates:
        raise HTTPException(status_code=502, detail="거래량 시세를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.")
    return _save(key, {"market": market, "items": items, "fetched_at": fetched_at,
                       "latest_data_at": max(latest_dates), "source": "Yahoo Finance"})


@router.get("/sector-cloud")
async def market_sector_cloud(market: str = "kospi") -> dict[str, Any]:
    market = market.lower()
    if market not in {"kospi", "kosdaq"}:
        raise HTTPException(status_code=400, detail="market은 kospi 또는 kosdaq만 선택할 수 있습니다.")
    key = f"sector:{market}"
    if cached := _cached(key):
        return cached
    sample = KOSPI if market == "kospi" else KOSDAQ
    sector_rows: dict[str, list[dict[str, Any]]] = {}
    latest_dates = []
    for (ticker, name, sector), bars in await _fetch_sample(sample, "10d"):
        if not bars or len(bars) < 2:
            continue
        last, previous = bars[-1], bars[-2]
        trade_value = last["c"] * last["v"]
        sector_rows.setdefault(sector, []).append({
            "name": name, "ticker": ticker, "trade_value": trade_value,
            "change_pct": (last["c"] / previous["c"] - 1) * 100,
        })
        latest_dates.append(last["date"])
    if not latest_dates:
        raise HTTPException(status_code=502, detail="섹터 시세를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.")
    sectors = []
    for sector, rows in sector_rows.items():
        trade_value = sum(row["trade_value"] for row in rows)
        leader = max(rows, key=lambda row: row["trade_value"])
        change_pct = (sum(row["change_pct"] * row["trade_value"] for row in rows) / trade_value
                      if trade_value else sum(row["change_pct"] for row in rows) / len(rows))
        sectors.append({
            "sector": sector, "stock_count": len(rows), "trade_value": round(trade_value),
            "change_pct": round(change_pct, 2), "leader_name": leader["name"],
            "leader_ticker": leader["ticker"], "leader_change_pct": round(leader["change_pct"], 2),
        })
    sectors.sort(key=lambda row: row["trade_value"], reverse=True)
    return _save(key, {"market": market, "market_label": market.upper(), "sectors": sectors,
                       "sample_size": len(sample), "fetched_at": datetime.now(timezone.utc).isoformat(),
                       "latest_data_at": max(latest_dates), "source": "Yahoo Finance"})
