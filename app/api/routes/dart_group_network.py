"""OpenDART company-code search for the group network visualization."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache
import io
import os
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import requests

router = APIRouter(prefix="/api/dart", tags=["data-visualization"])


class GroupNetworkRequest(BaseModel):
    group_name: str = Field(default="삼성", min_length=1, max_length=50)
    limit: int = Field(default=80, ge=1, le=100)


def _dart_api_key() -> str:
    key_file = os.getenv("DART_API_KEY_FILE", "")
    try:
        key = Path(key_file).read_text(encoding="utf-8").strip() if key_file else (
            os.getenv("DART_API_KEY") or os.getenv("OPENDART_API_KEY") or ""
        ).strip()
    except OSError as error:
        raise HTTPException(status_code=503, detail="DART 인증키 파일을 읽을 수 없습니다.") from error
    if not key:
        raise HTTPException(status_code=503, detail="DART 인증키가 설정되지 않았습니다.")
    return key


@lru_cache(maxsize=2)
def _listed_companies(cache_date: str) -> list[dict[str, str]]:
    # The key stays on the server; never include the request URL in an error.
    try:
        response = requests.get(
            "https://opendart.fss.or.kr/api/corpCode.xml",
            params={"crtfc_key": _dart_api_key()},
            timeout=25,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        raise HTTPException(status_code=502, detail="DART 회사코드 목록을 불러오지 못했습니다.") from error

    try:
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            xml_name = next(name for name in archive.namelist() if name.lower().endswith(".xml"))
            with archive.open(xml_name) as source:
                root = ET.parse(source).getroot()
    except (zipfile.BadZipFile, StopIteration, ET.ParseError) as error:
        raise HTTPException(
            status_code=502,
            detail="DART 회사코드 응답 형식이 올바르지 않습니다. 인증키 상태와 호출 한도를 확인하세요.",
        ) from error

    rows = []
    for item in root.findall("list"):
        stock_code = (item.findtext("stock_code") or "").strip()
        corp_code = (item.findtext("corp_code") or "").strip()
        corp_name = (item.findtext("corp_name") or "").strip()
        if len(stock_code) == 6 and stock_code.isdigit() and corp_code and corp_name:
            rows.append({
                "corp_code": corp_code,
                "corp_name": corp_name,
                "stock_code": stock_code,
                "modify_date": (item.findtext("modify_date") or "").strip(),
            })
    if not rows:
        raise HTTPException(status_code=502, detail="DART 상장기업 목록이 비어 있습니다.")
    return rows


@router.post("/group-network")
def group_network(request: GroupNetworkRequest) -> dict[str, object]:
    query = request.group_name.strip()
    normalized = "".join(query.split()).casefold()
    if not normalized:
        raise HTTPException(status_code=400, detail="그룹명을 입력하세요.")

    today = datetime.now(timezone(timedelta(hours=9))).date()
    companies = _listed_companies(today.isoformat())
    matches = [row for row in companies if normalized in "".join(row["corp_name"].split()).casefold()]
    matches.sort(key=lambda row: (not "".join(row["corp_name"].split()).casefold().startswith(normalized), row["corp_name"]))
    matches = matches[:request.limit]

    results = []
    for row in matches:
        results.append({
            **row,
            "market": "기타",
            "market_cap": 0,
            "close": 0,
            "dart_url": f'https://dart.fss.or.kr/corp/main.do?corp_code={row["corp_code"]}',
        })

    return {
        "query": query,
        "count": len(results),
        "market_data_available": False,
        "total_market_cap": 0,
        "kospi_count": 0,
        "kosdaq_count": 0,
        "results": results,
        "source": "OpenDART corpCode.xml",
    }
