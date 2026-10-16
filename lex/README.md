# lex/ — iv.edumgt.co.kr 「AI 투자 도우미」 주식 거래 대화 (Amazon Lex V2 + Lambda 코드 훅)

**서울 리전(ap-northeast-2)** 에 봇 InvestmentAnalysisAssistant(별칭 investment-analysis-prod) 를 새로 만들고(옛 버지니아 봇의 기본 인텐트는 `data/base_intents.json` 으로 옮김) **TradeStock · CheckBalance · CheckOrder** 인텐트(이후 AccountFaq·CheckQuote·MarketHours·MarketHolidays·CheckRanking·CheckFxRate 추가)를 더해,
대화 중 슬롯(매수/매도 · 종목 · 수량 · 시장가/지정가 · 가격)을 채우고 사용자가 확인하면 Lambda 훅이 stock-coin-trade Open API 로 **KIS 모의투자 주문**을 보낸다.

| 경로 | 역할 |
|---|---|
| `lambda/trade_hook/handler.py` | Lex 코드 훅(표준 라이브러리만). DialogCodeHook: 슬롯 검증·조건부 가격·매도 보유수량·확인 문구. FulfillmentCodeHook: 장중 확인 → 승인 토큰 → 주문. 잔고·주문 조회 |
| `lambda/trade_hook/tickers.json` | KRX 종목코드 → {name, market, buy}. lumina `app/data/korea-universe.json` 에서 생성(관리종목 등 buy=false 는 매수 거절) |
| `lambda/trade_hook/aliases.json` | 종목코드 → 통칭·구칭(현대자동차→현대차, 하이닉스, 네이버, 포스코, LG엔솔 …). 슬롯 동의어와 훅 `ticker_matches` 가 함께 쓴다(2026-10-16) |
| `data/base_intents.json` | 옛 us-east-1 봇(SE3NCP7NMP)에서 2026-10-14 내보낸 Greeting·PortfolioHelp·MarketBasics 고정 응답 + Fallback 응답 |
| `scripts/build_bot.py` | `--create-bot`(서울 봇·ko_KR·별칭 생성 + 기본 인텐트) · 슬롯 타입(OrderSide·OrderTypeKind·StockTicker 2,677값+별칭·FxCurrency)·인텐트·슬롯 생성/갱신(멱등) → 로캘 빌드 → `--lambda-arn` 이면 버전 발행 + 별칭에 훅 연결 |
| `scripts/deploy.sh` | 봇 생성(없으면) → Lambda 패키징·생성/갱신(서울) → Lex 호출 권한 → build_bot → 스모크 대화. `--delete-virginia` 로 옛 봇 삭제 |
| `../tests/test_lex_trade_hook.py` | 훅 단위 테스트 |

안전장치: `environment` 는 항상 `paper` · 회당 수량/금액 상한(기본 100주·500만원, Lambda 환경변수) · 장중(KST 평일 09:00~15:30)만 주문 · 매도는 보유수량 확인 ·
확인(네) 전에는 주문하지 않음 · 게이트웨이 쪽 한도(회당 1천만원, API 키 scope, 비상 정지)는 그대로 적용된다.

실행: `GATEWAY_API_KEY=<st Open API 키> bash lex/scripts/deploy.sh` → 출력된 LEX_BOT_ID/LEX_BOT_ALIAS_ID 로 `deploy/st-iv/deploy-lex.sh --iam` 과 `deploy-lex.sh` → 확인 후 `DELETE_OLD_BOT=1 bash lex/scripts/deploy.sh --delete-virginia`.
리전 조사(2026-10-14, 전 리전 Lex V2 list-bots): ap-northeast-2 에 AcademyReservationBot2·FinanceInvestBot(실습), us-east-1 에 InvestmentAnalysisAssistant(iv, 삭제 대상). 그 외 리전 없음. Lex V1 API 는 전 리전 503(서비스 종료).
대화 예: "삼성전자 10주 시장가 매수" → "KIS 모의계좌로 삼성전자(005930) 10주 시장가 매수 주문을 보낼까요?" → "네" → "주문번호 … 상태 ACCEPTED" → "주문 확인".
