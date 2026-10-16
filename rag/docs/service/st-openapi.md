---
title: st.edumgt.co.kr KIS 주문 Open API
category: service
updated: 2026-10-16
---

## 개요
st.edumgt.co.kr 는 KIS 모의투자 주문을 HTTP API 로 제공하는 게이트웨이입니다. 챗봇(Lambda 코드 훅)과 fd 자동매매가 이 API 를 Bearer API 키로 호출합니다. 모든 요청에 `environment=paper`(모의) 를 씁니다.

## 엔드포인트(경로 앞에 /openapi/v1/kis)
- `POST /order-approval` 승인 토큰 발급 → `POST /orders` 주문(승인 토큰 필요, 재시도 금지)
- `GET /orders/{orderNo}` 체결 상태, `GET /orders?status=OPEN|ALL` 당일 주문 목록, `DELETE /orders/{orderNo}` 취소
- `GET /balance` 잔고(예수금·총평가·평가손익·보유 종목)
- `GET /quote/{symbol}` 현재가·전일대비·시고저·거래량·상하한가(읽기 전용)

## API 키
st.edumgt.co.kr 회원이 발급합니다. 주문 권한(kis:order)은 운영자가 부여합니다. 챗봇은 전용 키(iv-lex-trade-hook)를 쓰고, fd 자동매매 키와 분리되어 있습니다.

## 한도와 안전장치
회당 주문 금액 1천만원 한도, 예수금 검사, 비상 정지 스위치가 게이트웨이에서 적용됩니다. KIS 모의 서버는 초당 호출 수 제한(EGW00215)이 있어 잔고를 몇 초 안에 연속 조회하면 실패할 수 있습니다.
