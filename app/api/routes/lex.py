"""Amazon Lex V2 — 우측 「AI 투자 도우미」 챗봇 (investment-backend 의 routers/lex.py 를 포털로 이식, 6-3).

레거시 /api/* 프록시 대상(investment-backend 컨테이너)이 st 서버에 없어 /api/lex/* 가 502 였다. 홈 대시보드(6-2)처럼
포털이 직접 응답한다. AWS 자격증명은 서버(EC2 인스턴스 역할 또는 환경변수)에만 두고 브라우저에는 내려보내지 않는다.

환경변수: LEX_BOT_ID · LEX_BOT_ALIAS_ID (필수), LEX_REGION(없으면 AWS_REGION/AWS_DEFAULT_REGION), LEX_LOCALE_ID(기본 ko_KR).
응답에는 Lex 의 대화 상태(intent · dialogAction · slots · sessionAttributes)를 그대로 실어 슬롯 필링 단계를 화면이 알 수 있게 한다.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/lex", tags=["Amazon Lex"])

_SESSION_ID_PATTERN = r"^[A-Za-z0-9._:-]{2,100}$"


class LexChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1024, description="Lex 봇에 전달할 사용자 메시지")
    session_id: str = Field(min_length=2, max_length=100, pattern=_SESSION_ID_PATTERN, description="브라우저 대화 세션 ID")
    session_attributes: dict[str, str] | None = Field(default=None, description="이전 응답의 session_attributes 를 그대로 돌려주면 대화 상태가 이어진다")


def _region() -> str | None:
    return os.getenv("LEX_REGION") or os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")


def _settings() -> tuple[str, str, str, str]:
    region, bot_id, alias_id = _region(), os.getenv("LEX_BOT_ID"), os.getenv("LEX_BOT_ALIAS_ID")
    locale_id = os.getenv("LEX_LOCALE_ID", "ko_KR")
    missing = [name for name, value in {"LEX_REGION": region, "LEX_BOT_ID": bot_id, "LEX_BOT_ALIAS_ID": alias_id}.items() if not value]
    if missing:
        raise HTTPException(503, f"Amazon Lex 설정이 필요합니다: {', '.join(missing)}")
    return region, bot_id, alias_id, locale_id


@lru_cache(maxsize=4)
def _client(region: str):
    try:
        import boto3
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(503, "Amazon Lex 연동 모듈(boto3)이 설치되지 않았습니다.") from exc
    return boto3.client("lexv2-runtime", region_name=region)


def _messages(response: dict) -> list[str]:
    return [str(item.get("content", "")).strip() for item in response.get("messages", [])
            if item.get("contentType") in {None, "PlainText", "CustomPayload", "SSML"} and str(item.get("content", "")).strip()]


def _slots(intent: dict) -> dict[str, Any]:
    """슬롯 → {이름: 해석값}. 아직 안 채워진 슬롯은 None."""
    out: dict[str, Any] = {}
    for name, slot in (intent.get("slots") or {}).items():
        value = (slot or {}).get("value") or {}
        out[name] = value.get("interpretedValue") or value.get("originalValue")
    return out


@router.get("/status")
def lex_status() -> dict[str, object]:
    """AWS 자격증명을 노출하지 않고 Lex 연결 설정의 준비 여부만 돌려준다."""
    region = _region()
    return {"configured": bool(region and os.getenv("LEX_BOT_ID") and os.getenv("LEX_BOT_ALIAS_ID")),
            "region": region, "locale_id": os.getenv("LEX_LOCALE_ID", "ko_KR"), "bot_id": os.getenv("LEX_BOT_ID") or None}


@router.post("/chat")
def lex_chat(request: LexChatRequest) -> dict[str, object]:
    """브라우저 메시지를 서버 경유로 Lex V2 에 보낸다. 같은 session_id 를 유지하면 Lex 가 대화 상태(슬롯·인텐트)를 이어간다."""
    if not re.fullmatch(_SESSION_ID_PATTERN, request.session_id):
        raise HTTPException(422, "세션 ID 형식이 올바르지 않습니다.")
    region, bot_id, alias_id, locale_id = _settings()
    kwargs: dict[str, Any] = {"botId": bot_id, "botAliasId": alias_id, "localeId": locale_id,
                              "sessionId": request.session_id, "text": request.message.strip()}
    if request.session_attributes:
        kwargs["sessionState"] = {"sessionAttributes": request.session_attributes}
    try:
        response = _client(region).recognize_text(**kwargs)
    except HTTPException:
        raise
    except Exception as exc:
        error_name = exc.__class__.__name__
        if error_name in {"NoCredentialsError", "PartialCredentialsError"}:
            raise HTTPException(503, "AWS 자격 증명을 찾지 못했습니다. EC2 인스턴스 역할 또는 표준 AWS 자격 증명을 설정하세요.") from exc
        if error_name == "ClientError":
            detail = getattr(exc, "response", {}).get("Error", {})
            code = detail.get("Code", "AWS 오류")
            message = detail.get("Message", "Amazon Lex 요청에 실패했습니다.")
            raise HTTPException(403 if code == "AccessDeniedException" else 502, f"Amazon Lex {code}: {message}") from exc
        raise HTTPException(502, f"Amazon Lex 응답을 받지 못했습니다: {error_name}") from exc

    state = response.get("sessionState", {}) or {}
    intent = state.get("intent", {}) or {}
    dialog = state.get("dialogAction", {}) or {}
    return {
        "session_id": response.get("sessionId", request.session_id),
        "messages": _messages(response) or ["응답 메시지가 없습니다."],
        "intent": intent.get("name"), "intent_state": intent.get("state"),
        "dialog_action": dialog.get("type"), "slot_to_elicit": dialog.get("slotToElicit"),
        "slots": _slots(intent), "session_attributes": state.get("sessionAttributes") or {},
    }
