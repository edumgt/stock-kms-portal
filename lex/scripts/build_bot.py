#!/usr/bin/env python3
"""iv.edumgt.co.kr 「AI 투자 도우미」 Lex V2 봇 — 서울 리전(ap-northeast-2) 생성·갱신 (stock-kms-portal 6-10/6-11). 멱등 — 이름으로 찾아 있으면 갱신.

  python3 lex/scripts/build_bot.py --create-bot                 # 서울에 봇 신규 생성(ko_KR, 별칭 investment-analysis-prod) + 기본 인텐트(lex/data/base_intents.json) + 거래 인텐트 + 빌드
  python3 lex/scripts/build_bot.py                              # 기존 봇(LEX_BOT_ID) DRAFT 갱신·빌드 (운영 별칭은 안 바뀜)
  python3 lex/scripts/build_bot.py --lambda-arn arn:...         # + 버전 발행 + 운영 별칭을 새 버전·코드 훅으로 갱신 (서비스 반영)
  python3 lex/scripts/build_bot.py --delete-bot us-east-1 SE3NCP7NMP   # 옛 버지니아 봇 삭제(서울 봇 전환 확인 후)
환경변수: LEX_REGION(기본 ap-northeast-2) · LEX_BOT_ID · LEX_BOT_ALIAS_ID · LEX_BOT_NAME(기본 InvestmentAnalysisAssistant) · LEX_ROLE_ARN(기본 LexLabServiceRole)

슬롯 타입: OrderSide(BUY/SELL) · OrderTypeKind(MARKET/LIMIT) · StockTicker(값=종목코드, 동의어=종목명; lex/lambda/trade_hook/tickers.json)
인텐트: TradeStock(DialogCodeHook+Fulfillment) · CheckBalance(Fulfillment) · CheckOrder(Fulfillment)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import boto3

import os

REGION = os.environ.get("LEX_REGION", "ap-northeast-2")
BOT_ID = os.environ.get("LEX_BOT_ID", "")
ALIAS_ID = os.environ.get("LEX_BOT_ALIAS_ID", "")
BOT_NAME = os.environ.get("LEX_BOT_NAME", "InvestmentAnalysisAssistant")
ALIAS_NAME = os.environ.get("LEX_BOT_ALIAS_NAME", "investment-analysis-prod")
ROLE_ARN = os.environ.get("LEX_ROLE_ARN", "arn:aws:iam::086015456585:role/LexLabServiceRole")
LOCALE = "ko_KR"
ROOT = Path(__file__).resolve().parents[1]


def create_bot(lex) -> tuple[str, str]:
    """서울에 봇 + ko_KR 로캘 + 운영 별칭(DRAFT) 을 만든다. 같은 이름이 있으면 그 봇을 쓴다. (bot_id, alias_id)"""
    found = [b for b in lex.list_bots(maxResults=100).get("botSummaries", []) if b["botName"] == BOT_NAME]
    if found:
        bot_id = found[0]["botId"]; print("bot exists:", BOT_NAME, bot_id)
    else:
        bot_id = lex.create_bot(botName=BOT_NAME, description="Korean investment learning assistant for the investment-analysis web application (iv.edumgt.co.kr) — 서울 리전",
                                roleArn=ROLE_ARN, dataPrivacy={"childDirected": False}, idleSessionTTLInSeconds=1800)["botId"]
        for _ in range(60):
            if lex.describe_bot(botId=bot_id)["botStatus"] == "Available":
                break
            time.sleep(3)
        print("bot created:", BOT_NAME, bot_id)
    locales = {l["localeId"] for l in lex.list_bot_locales(botId=bot_id, botVersion="DRAFT").get("botLocaleSummaries", [])}
    if LOCALE not in locales:
        base_cfg = json.loads((ROOT / "data" / "base_intents.json").read_text(encoding="utf-8"))
        lex.create_bot_locale(botId=bot_id, botVersion="DRAFT", localeId=LOCALE, nluIntentConfidenceThreshold=float(base_cfg.get("nluIntentConfidenceThreshold") or 0.4))
        for _ in range(60):
            if lex.describe_bot_locale(botId=bot_id, botVersion="DRAFT", localeId=LOCALE)["botLocaleStatus"] in ("NotBuilt", "Built"):
                break
            time.sleep(3)
        print("locale created:", LOCALE)
    # 별칭은 숫자 버전만 가리킬 수 있어(DRAFT 불가) 버전 발행 뒤 main() 에서 만든다. 이미 있으면 그 ID.
    aliases = {a["botAliasName"]: a["botAliasId"] for a in lex.list_bot_aliases(botId=bot_id, maxResults=100).get("botAliasSummaries", [])}
    alias_id = aliases.get(ALIAS_NAME, "")
    print("alias:", ALIAS_NAME, alias_id or "(버전 발행 후 생성)")
    return bot_id, alias_id


def wait_build(lex, base: dict, timeout: int) -> str:
    """build_bot_locale 제출 후 Built/Failed 까지 대기. 진행 상태가 바뀔 때와 1분마다 한 줄씩 찍는다."""
    cur = lex.describe_bot_locale(**base)["botLocaleStatus"]
    if cur not in ("Building", "ReadyExpressTesting"):          # 이미 빌드 중이면 다시 제출하지 않는다
        lex.build_bot_locale(**base)
    start, last, shown = time.time(), "", 0.0
    while time.time() - start < timeout:
        status = lex.describe_bot_locale(**base)["botLocaleStatus"]
        if status in ("Built", "Failed", "NotBuilt"):
            return status
        if status != last or time.time() - shown >= 60:
            print(f"  build {status} ... {int(time.time() - start)}s", flush=True); last, shown = status, time.time()
        time.sleep(10)
    return lex.describe_bot_locale(**base)["botLocaleStatus"]


def seed_base_intents(lex, base: dict) -> None:
    """옛 버지니아 봇에서 내보낸 기본 인텐트(Greeting·PortfolioHelp·MarketBasics 고정 응답)와 Fallback 응답을 넣는다."""
    cfg = json.loads((ROOT / "data" / "base_intents.json").read_text(encoding="utf-8"))
    intents = {i["intentName"]: i["intentId"] for i in lex.list_intents(**base, maxResults=100).get("intentSummaries", [])}
    for d in cfg["intents"]:
        body = {k: v for k, v in d.items() if v is not None and k in ("intentName", "description", "sampleUtterances", "intentClosingSetting", "fulfillmentCodeHook", "dialogCodeHook")}
        if d["intentName"] in intents:
            lex.update_intent(**base, intentId=intents[d["intentName"]], **body); print("updated base intent", d["intentName"])
        else:
            lex.create_intent(**base, **body); print("created base intent", d["intentName"])
    fb = (cfg.get("fallback") or {})
    if fb.get("closing") and "FallbackIntent" in intents:
        lex.update_intent(**base, intentId=intents["FallbackIntent"], intentName="FallbackIntent", parentIntentSignature="AMAZON.FallbackIntent",
                          intentClosingSetting=fb["closing"])
        print("updated FallbackIntent closing response")


def msg(text: str, retries: int = 2) -> dict:
    return {"promptSpecification": {"messageGroups": [{"message": {"plainTextMessage": {"value": text}}}], "maxRetries": retries, "allowInterrupt": True}}


def plain(text: str) -> dict:
    return {"messageGroups": [{"message": {"plainTextMessage": {"value": text}}}], "allowInterrupt": True}


def slot_type_defs() -> list[dict]:
    tickers = json.loads((ROOT / "lambda" / "trade_hook" / "tickers.json").read_text(encoding="utf-8"))
    values = [{"sampleValue": {"value": code}, "synonyms": [{"value": v["name"]}] + ([{"value": v["name"].replace(" ", "")}] if " " in v["name"] else [])}
              for code, v in sorted(tickers.items())][:10000]
    return [
        {"slotTypeName": "OrderSide", "description": "매수/매도", "valueSelectionSetting": {"resolutionStrategy": "TopResolution"},
         # 실사용(2026-10-15)에서 "매수해" 가 BUY 로 안 잡혀 Side 를 되물었다 → 활용형을 동의어로 넓힌다.
         "slotTypeValues": [{"sampleValue": {"value": "BUY"}, "synonyms": [{"value": s} for s in (
                                "매수", "매수해", "매수해줘", "매수할래", "매수할게", "매수하자", "매수요", "매수로", "사줘", "사", "살래", "살게", "사자", "사고 싶어", "매입", "구매")]},
                            {"sampleValue": {"value": "SELL"}, "synonyms": [{"value": s} for s in (
                                "매도", "매도해", "매도해줘", "매도할래", "매도할게", "매도하자", "매도요", "매도로", "팔아", "팔래", "팔게", "팔자", "팔아줘", "팔고 싶어", "처분")]}]},
        {"slotTypeName": "OrderTypeKind", "description": "시장가/지정가", "valueSelectionSetting": {"resolutionStrategy": "TopResolution"},
         "slotTypeValues": [{"sampleValue": {"value": "MARKET"}, "synonyms": [{"value": s} for s in ("시장가", "시장가로", "현재가로", "바로")]},
                            {"sampleValue": {"value": "LIMIT"}, "synonyms": [{"value": s} for s in ("지정가", "지정가로", "가격 지정")]}]},
        {"slotTypeName": "StockTicker", "description": "KRX 종목 (값=종목코드, 동의어=종목명)", "valueSelectionSetting": {"resolutionStrategy": "TopResolution"},
         "slotTypeValues": values},
    ]


def intent_defs(slot_type_ids: dict[str, str]) -> list[dict]:
    hook_on = {"enabled": True}
    return [
        {"intentName": "TradeStock", "description": "KIS 모의계좌 주식 매수·매도 (코드 훅이 검증·확인·주문)",
         "sampleUtterances": [{"utterance": u} for u in (
             "{Ticker} {Quantity}주 {Side}", "{Ticker} {Quantity}주 {OrderType} {Side}", "{Ticker} {Side}", "{Side} 주문", "주식 {Side}",
             "{Ticker} {Quantity}주 {Price}원에 {Side}", "{Ticker} 사고 싶어", "{Ticker} 팔고 싶어", "{Quantity}주 {Side}해줘", "주문할래", "매매하고 싶어",
             # 실사용(2026-10-15): "한화오션 1주 주문하려면?", "매수해", "매수" 단독
             "{Ticker} {Quantity}주 주문하려면", "{Ticker} 주문하려면", "{Ticker} {Quantity}주 주문", "{Ticker} {Quantity}주 주문해줘", "{Ticker} 주문",
             "{Side}", "{Side}해", "{Side}해줘", "{Side}할래", "{Ticker} {Side}해", "{Ticker} {Quantity}주 {Side}해", "{Ticker} {Quantity}주 {Side}하려면",
             "{Quantity}주 {Side}", "{Side} {Quantity}주", "{Ticker} {OrderType} {Side}", "{OrderType}로 {Quantity}주 {Side}")],
         "dialogCodeHook": hook_on, "fulfillmentCodeHook": {**hook_on, "active": True},
         "intentConfirmationSetting": {"promptSpecification": msg("이 주문을 KIS 모의계좌로 보낼까요? (네/아니요)")["promptSpecification"],
                                       "declinationResponse": plain("주문을 취소했습니다."), "active": True},
         "slots": [
             ("Side", slot_type_ids["OrderSide"], "Required", "매수할까요, 매도할까요?"),
             ("Ticker", slot_type_ids["StockTicker"], "Required", "어느 종목인가요? 종목명이나 6자리 종목코드로 알려 주세요."),
             ("Quantity", "AMAZON.Number", "Required", "몇 주를 주문할까요?"),
             ("OrderType", slot_type_ids["OrderTypeKind"], "Required", "시장가로 할까요, 지정가로 할까요?"),
             ("Price", "AMAZON.Number", "Optional", "지정가 1주 가격을 원 단위로 알려 주세요."),
         ]},
        {"intentName": "CheckBalance", "description": "KIS 모의계좌 잔고·보유종목 요약",
         "sampleUtterances": [{"utterance": u} for u in ("잔고 알려줘", "내 계좌 보여줘", "보유 종목 알려줘", "예수금 얼마야", "평가손익 알려줘", "잔고 조회",
                                                         "나의 잔고 조회해봐", "잔고 조회해봐", "계좌 잔고", "예수금 알려줘", "내 보유 종목", "총평가 얼마야")],
         "dialogCodeHook": hook_on, "fulfillmentCodeHook": {**hook_on, "active": True}, "slots": []},
        {"intentName": "AccountFaq", "description": "모의계좌 주문 가능 여부·예수금 음수·거절 사유 질문 (코드 훅이 실제 잔고로 답한다)",
         # 실사용(2026-10-15): "예수금이 - 인데 가능해?" 는 CheckBalance 로, "모의 투자 계좌로는 가능해?" 는 PortfolioHelp 로 잘못 잡혔다.
         "sampleUtterances": [{"utterance": u} for u in (
             "예수금이 마이너스인데 가능해", "예수금이 음수인데 매수 돼", "예수금이 마이너스야", "예수금이 왜 마이너스야", "예수금이 음수면 어떻게 돼",
             "모의 투자 계좌로는 가능해", "모의투자 계좌로 가능해", "모의계좌로 주문할 수 있어", "모의투자 가능해", "모의계좌로 매수 돼",
             "지금 매수할 수 있어", "언제 매수할 수 있어", "매수 가능해", "주문 가능해", "주문이 왜 거절됐어", "거절 이유가 뭐야", "왜 안 돼",
             "D+2 가 뭐야", "결제일이 언제야", "주문 한도가 얼마야", "챗봇으로 주문하면 어떻게 돼")],
         "dialogCodeHook": hook_on, "fulfillmentCodeHook": {**hook_on, "active": True}, "slots": []},
        {"intentName": "CheckOrder", "description": "주문 체결 상태 확인",
         "sampleUtterances": [{"utterance": u} for u in ("주문 확인", "주문 상태 알려줘", "체결됐어?", "방금 주문 어떻게 됐어", "주문번호 {OrderNo} 확인", "{OrderNo} 체결 확인")],
         "dialogCodeHook": hook_on, "fulfillmentCodeHook": {**hook_on, "active": True},
         "slots": [("OrderNo", "AMAZON.AlphaNumeric", "Optional", "주문번호를 알려 주세요.")]},
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lambda-arn", default="", help="코드 훅 Lambda ARN. 주면 버전 발행 + 운영 별칭 갱신까지 한다")
    ap.add_argument("--alias-id", default=ALIAS_ID)
    ap.add_argument("--create-bot", action="store_true", help="봇이 없으면 서울 리전에 새로 만들고 기본 인텐트를 넣는다")
    ap.add_argument("--delete-bot", nargs=2, metavar=("REGION", "BOT_ID"), help="옛 봇 삭제(예: us-east-1 SE3NCP7NMP). 서울 봇 전환 확인 후에만")
    ap.add_argument("--skip-build", action="store_true", help="로캘 빌드 생략(뒤에 --lambda-arn 실행이 빌드할 때)")
    ap.add_argument("--build-timeout", type=int, default=2700, help="로캘 빌드 대기 초(기본 45분; 2026-10-14 실측 25분 — 종목 슬롯 2,677개)")
    ap.add_argument("--publish-only", action="store_true", help="슬롯 타입·인텐트 갱신과 빌드를 건너뛰고(DRAFT 가 이미 Built 일 때) 버전 발행·별칭 연결만 한다")
    args = ap.parse_args()
    if args.delete_bot:
        region, bot_id = args.delete_bot
        old = boto3.client("lexv2-models", region_name=region)
        name = old.describe_bot(botId=bot_id)["botName"]
        old.delete_bot(botId=bot_id, skipResourceInUseCheck=True)
        print(f"deleted bot {name} ({bot_id}) in {region}")
        return 0
    lex = boto3.client("lexv2-models", region_name=REGION)
    bot_id, alias_id = BOT_ID, args.alias_id
    if args.create_bot or not bot_id:
        bot_id, alias_id = create_bot(lex)
        print(f"export LEX_REGION={REGION} LEX_BOT_ID={bot_id} LEX_BOT_ALIAS_ID={alias_id}")
    base = {"botId": bot_id, "botVersion": "DRAFT", "localeId": LOCALE}
    if args.publish_only:
        status = lex.describe_bot_locale(**base)["botLocaleStatus"]
        if status != "Built":
            print(f"--publish-only 인데 로캘 상태가 {status} 입니다. 먼저 빌드가 끝나야 합니다."); return 1
        if not args.lambda_arn:
            print("--publish-only 는 --lambda-arn 과 함께 씁니다."); return 1
        print("publish-only: DRAFT(Built) 그대로 버전 발행")
        return publish(lex, bot_id, alias_id, args)
    if args.create_bot or not BOT_ID:
        seed_base_intents(lex, base)

    # 1) 슬롯 타입
    existing = {s["slotTypeName"]: s["slotTypeId"] for s in lex.list_slot_types(**base, maxResults=100).get("slotTypeSummaries", [])}
    slot_type_ids: dict[str, str] = {}
    for d in slot_type_defs():
        if d["slotTypeName"] in existing:
            lex.update_slot_type(**base, slotTypeId=existing[d["slotTypeName"]], **d)
            slot_type_ids[d["slotTypeName"]] = existing[d["slotTypeName"]]
            print("updated slot type", d["slotTypeName"], len(d["slotTypeValues"]), "values")
        else:
            r = lex.create_slot_type(**base, **d)
            slot_type_ids[d["slotTypeName"]] = r["slotTypeId"]
            print("created slot type", d["slotTypeName"], len(d["slotTypeValues"]), "values")

    # 2) 인텐트 + 슬롯
    intents = {i["intentName"]: i["intentId"] for i in lex.list_intents(**base, maxResults=100).get("intentSummaries", [])}
    for d in intent_defs(slot_type_ids):
        slots = d.pop("slots")
        body = {k: v for k, v in d.items()}
        if d["intentName"] in intents:
            intent_id = intents[d["intentName"]]
            cur = lex.describe_intent(**base, intentId=intent_id)
            lex.update_intent(**base, intentId=intent_id, **body, slotPriorities=cur.get("slotPriorities", []))
            print("updated intent", d["intentName"])
        else:
            intent_id = lex.create_intent(**base, **body)["intentId"]
            print("created intent", d["intentName"])
        have = {s["slotName"]: s["slotId"] for s in lex.list_slots(**base, intentId=intent_id, maxResults=100).get("slotSummaries", [])}
        priorities = []
        for pri, (name, type_id, constraint, prompt) in enumerate(slots, start=1):
            spec = {"slotName": name, "slotTypeId": type_id,
                    "valueElicitationSetting": {"slotConstraint": constraint, **({"promptSpecification": msg(prompt)["promptSpecification"]} if constraint == "Required" else {})}}
            if constraint == "Optional":
                spec["valueElicitationSetting"]["promptSpecification"] = msg(prompt)["promptSpecification"]   # 훅이 ElicitSlot 할 때 쓰는 프롬프트
            if name in have:
                lex.update_slot(**base, intentId=intent_id, slotId=have[name], **spec)
                sid = have[name]
            else:
                sid = lex.create_slot(**base, intentId=intent_id, **spec)["slotId"]
            priorities.append({"priority": pri, "slotId": sid})
        if priorities:
            lex.update_intent(**base, intentId=intent_id, **body, slotPriorities=priorities)
        print("  slots:", [s[0] for s in slots])

    # 3) 로캘 빌드. ReadyExpressTesting 은 '아직 빌드 중(간이 테스트만 가능)' 이라 Built 까지 기다린다.
    if args.skip_build:
        print("locale build: skipped (--skip-build)")
        return 0
    status = wait_build(lex, base, args.build_timeout)
    print("locale build:", status)
    if status != "Built":
        print("failureReasons:", lex.describe_bot_locale(**base).get("failureReasons"))
        return 1
    if not args.lambda_arn:
        print("DRAFT 만 갱신. 운영 반영은 --lambda-arn 으로 다시 실행.")
        return 0

    return publish(lex, bot_id, alias_id, args)


def publish(lex, bot_id: str, alias_id: str, args) -> int:
    """4) 버전 발행 + 별칭 생성/갱신 (코드 훅 연결)"""
    ver = lex.create_bot_version(botId=bot_id, botVersionLocaleSpecification={LOCALE: {"sourceBotVersion": "DRAFT"}})["botVersion"]
    print(f"version {ver} 발행 요청, Available 대기")
    for _ in range(60):
        time.sleep(5)   # 생성 직후 DescribeBotVersion 이 ResourceNotFound 를 돌려주는 반영 지연이 있어 먼저 기다린다
        try:
            if lex.describe_bot_version(botId=bot_id, botVersion=ver)["botStatus"] == "Available":
                break
        except lex.exceptions.ResourceNotFoundException:
            continue
    locale_settings = {LOCALE: {"enabled": True, "codeHookSpecification": {"lambdaCodeHook": {"lambdaARN": args.lambda_arn, "codeHookInterfaceVersion": "1.0"}}}}
    if not alias_id:
        aliases = {a["botAliasName"]: a["botAliasId"] for a in lex.list_bot_aliases(botId=bot_id, maxResults=100).get("botAliasSummaries", [])}
        alias_id = aliases.get(ALIAS_NAME, "")
    if alias_id:
        alias = lex.describe_bot_alias(botId=bot_id, botAliasId=alias_id)
        lex.update_bot_alias(botId=bot_id, botAliasId=alias_id, botAliasName=alias["botAliasName"], botVersion=ver,
                             botAliasLocaleSettings=locale_settings,
                             sentimentAnalysisSettings=alias.get("sentimentAnalysisSettings") or {"detectSentiment": False})
        print(f"alias {alias['botAliasName']} ({alias_id}) -> version {ver}, lambda hook {args.lambda_arn}")
    else:
        alias_id = lex.create_bot_alias(botId=bot_id, botAliasName=ALIAS_NAME, botVersion=ver, botAliasLocaleSettings=locale_settings)["botAliasId"]
        print(f"alias {ALIAS_NAME} created ({alias_id}) -> version {ver}, lambda hook {args.lambda_arn}")
    for _ in range(30):
        if lex.describe_bot_alias(botId=bot_id, botAliasId=alias_id)["botAliasStatus"] == "Available":
            break
        time.sleep(3)
    print(f"export LEX_REGION={REGION} LEX_BOT_ID={bot_id} LEX_BOT_ALIAS_ID={alias_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
