# stock-kms-portal — 작업 기록·인수인계

> 2026-10-06 작성. 형식은 domain-rag-lab/lumina-invest/stock-coin-trade `todo.md` 와 같다(6절 작업 보고 · 7절 사용자 의사결정 · 8절 운영 배포).

## 1. 역할

domain-rag-lab 포크 + investment-analysis 웹앱 통합 포털(`test.md` 과제). `app/`·`docker-compose*.yml`·`.github/workflows` 는 domain-rag-lab 구조를 따르고, `integration-src/`·`index.html` 에 통합 프런트가 있다. LEAN 백테스트는 domain-rag-lab 과 같은 `lean_backtest_service.py`(25줄 차이) 로 `quantconnect/lean:latest` 를 로컬 Docker 에서 실행한다. `lean_reference_data`(시장시간·심볼 DB) 는 포함되지 않았다.

## 6. 작업 보고

### 6-1. 2026-10-06 GitHub Actions 직접 배포 정비 (사용자 요청)

| 변경 | 내용 |
|------|------|
| `.github/workflows/cd-ecr.yml`, `docker-compose.ecr.yml` | **삭제**(git rm, 미커밋). GitHub 에서 "CD — Build to ECR and Deploy" 워크플로 disable. 배포는 `cd.yml`(rsync → compose) 한 경로만 |
| `.github/workflows/cd.yml` | rsync 에 `--exclude 'data/lean-workflows'`, `--filter 'protect data/'` 추가(domain-rag-lab 과 동일 — 서버의 root 소유 데이터가 `--delete` 로 지워지지 않게) |
| GitHub secret | `EC2_SSH_PRIVATE_KEY`(= lumina-invest `fd.edumgt.co.kr.pem`), `EC2_USER=ubuntu` 등록. `EC2_HOST`, `EC2_APP_DIR` 은 **의도적으로 비움**(7절 K1) |

**검증**: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/cd.yml'))"` OK. 배포는 대상 미확정으로 실행하지 않음.

### 6-2. 2026-10-07 iv.edumgt.co.kr 홈 대시보드 차트 502 → 포털 자체 API 로 대체 (사용자 요청)

**진단**: 홈(`investment-native/js/views/home.js`)의 지수 카드 4개는 `/api/home/market-candle`, 시세 패널은 `POST /api/market/snapshot`, 확대 모달 검색은 `/api/home/chart-search` 를 부른다. `/api/*` 전체는 `app/main.py` 의 프록시가 `investment_api_base`(`http://investment-backend:8000`) 로 넘기는데 st 서버 iv 스택(`/opt/stock-kms-portal`, compose 프로젝트 `stock-kms-portal`, `deploy/st-iv/compose.yml`)에 그 컨테이너가 없다(K2) → 전부 502 "투자 분석 API에 연결하지 못했습니다". 서버 코드는 로컬과 동일(md5 일치)했다.

| 변경 | 내용 |
|------|------|
| `app/api/routes/home_dashboard.py` 신설 | `integration-src/investment-backend/main.py` 의 세 엔드포인트를 이식. Yahoo chart JSON(httpx, `/market/intraday` 와 같은 방식)으로 받아 yfinance·pandas 미사용. 응답 형식 동일(`ohlcv[{date,o,h,l,c,v}]`, `is_simulated`, `display_from`, `interval` / `items[{ticker,label,value,change_pct,status}]` / `items[{ticker,name,exchange}]`). 3분봉은 1분봉 집계, 주·월·연봉은 일봉 집계. 캔들 60초·시세 30초 캐시. Yahoo 실패 시 원본과 같은 시뮬레이션 봉(`is_simulated=true`, 화면 "시뮬레이션 데이터") |
| `app/main.py` | 라우터를 `/api/{path}` 프록시보다 먼저 등록. 나머지 `/api/*`(데이터 시각화 6종, `/api/search` 등)는 여전히 프록시 → K2 결정 전까지 502 그대로 |
| 배포 | **반영 완료(2026-10-07, 사용자 수행)** — 에이전트의 서버 배포 명령은 정책(운영 배포)으로 거부되어 사용자가 아래 명령으로 반영. 서버 파일 md5 = 로컬. 재빌드 직후 ~1분은 nginx 가 HTML 502 를 주므로 curl 확인은 컨테이너 `(healthy)` 뒤에 |

```bash
# 1) 로컬 → st 서버 파일 복사 (lumina 작업 PC에서)
scp -i /home/ubuntu/stock-coin-trade/pr-test.pem app/main.py ubuntu@43.202.161.134:/tmp/main.py
scp -i /home/ubuntu/stock-coin-trade/pr-test.pem app/api/routes/home_dashboard.py ubuntu@43.202.161.134:/tmp/home_dashboard.py
# 2) 서버에서 설치 + api 컨테이너만 재빌드(pip 레이어 캐시, 1~2분)
ssh -i /home/ubuntu/stock-coin-trade/pr-test.pem ubuntu@43.202.161.134 'sudo install -m 644 /tmp/main.py /opt/stock-kms-portal/app/main.py && sudo install -m 644 /tmp/home_dashboard.py /opt/stock-kms-portal/app/api/routes/home_dashboard.py && cd /opt/stock-kms-portal && sudo docker compose -p stock-kms-portal -f deploy/st-iv/compose.yml up -d --build api'
# 3) 확인: 200 과 bars 수
curl -s 'https://iv.edumgt.co.kr/api/home/market-candle?market=kospi&period=3mo' | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d["ohlcv"]), d["is_simulated"])'
curl -s -X POST -H 'Content-Type: application/json' -d '{"tickers":["005930.KS","AAPL"]}' https://iv.edumgt.co.kr/api/market/snapshot
```

**검증(로컬, 실데이터)**: kospi/kosdaq/nasdaq/sp500 3mo·1y 일봉 87~277봉, `^KS11` 5분봉·3분봉 당일, 주봉 267·월봉 123, 미존재 티커는 시뮬레이션 폴백, 시세 14종목 전부 ok(0.5초), 검색 "삼성"→삼성전자·삼성바이오로직스·삼성물산·삼성SDI. 라우터 단독 FastAPI 앱 + httpx ASGI 로 확인(포털 `app.main` 은 import 시 DB 연결).

**남은 것(K2)**: 데이터 시각화 메뉴(세계 시장·거래량/섹터 클라우드·그룹사 네트워크·투자 성향 트리·자산배분 국면)와 상단 종목 검색(`/api/search`)은 investment-backend(MongoDB) 컨테이너가 있어야 한다. 선택: ① `integration-src/investment-backend` 를 st-iv compose 에 `investment-backend` 서비스로 추가 ② 자주 쓰는 것만 이 라우터처럼 이식. 이 세션은 대시보드(홈)만 복구.

### 6-3. 2026-10-07 홈 차트 모달 — RSI 패널이 「추세 해설」 과 겹치는 문제 (사용자 요청)

**원인**: `frontend/investment-native/js/views/home.js` 의 LightweightCharts 어댑터는 컨테이너 안에 px 높이 div 를 만들고 ResizeObserver 로 `clientHeight` 를 따라간다. 모달 본문(세로 flex)에서 `.home-chart-modal-macd/-rsi` 가 `flex:1 1 auto`(내용 크기) 라 차트 px 만큼 자라 부모 `.home-market-macd-wrap`(`flex:1 1 0; min-height:0`)의 배분 높이를 넘겼고, overflow 가 잘리지 않아 RSI 패널·시간축이 아래 추세 해설 KPI 위로 겹쳤다.

| 변경 | 내용 |
|------|------|
| `frontend/investment-native/styles.css` | 차트 컨테이너 `flex:1 1 0`(배분 높이 기준) + `overflow:hidden`, macd-wrap `min-height:150px; overflow:hidden`, 캔들 wrap/chart `overflow:hidden`, 「추세 해설」·「Qwen 차트 분석」 `position:relative; z-index:1`. 760px 이하는 `flex:none; height:140px` 고정 |
| 배포 | 정적 파일(`/static/` no-store). st 서버 `/opt/stock-kms-portal` 에 styles.css 반영 후 api 재빌드: `scp -i /home/ubuntu/stock-coin-trade/pr-test.pem frontend/investment-native/styles.css ubuntu@43.202.161.134:/tmp/styles.css && ssh -i … 'sudo install -m 644 /tmp/styles.css /opt/stock-kms-portal/frontend/investment-native/styles.css && cd /opt/stock-kms-portal && sudo docker compose -p stock-kms-portal -f deploy/st-iv/compose.yml up -d --build api'` |

**확인**: 모달에서 창 높이를 줄여도 RSI 패널이 해설 블록 위로 넘치지 않고, 본문 스크롤만 생기는지. 브라우저 미실행(정적 수정).


### 6-4. 2026-10-07 공통 타이포그래피 가이드 — 타이틀 Pretendard 18px 고정, 18px 초과 금지 (사용자 요청, 4개 사이트 공통)

| 변경 | 내용 |
|------|------|
| `frontend/style.css`, `frontend/investment-native/styles.css` | 파일 맨 위에 공통 가이드 주석(4항), 주 CSS 맨 끝에 「타이틀 고정」 블록: `--title-size:18px`·`--title-font: Pretendard…`, `h1, h2, .page-title { font-size:18px !important; font-family: Pretendard !important }`(인라인·유틸리티 클래스보다 우선), `h1/h2` 안의 mark·small·span 은 inherit |
| 적용 범위 | 타이틀(h1·h2)만 강제. 본문·KPI 숫자 등 기존 18px 초과 선언은 그대로 두었다(아래 수치) — 가이드 2항에 따라 새 규칙에서는 금지, 기존 값은 화면별로 줄여 나간다 |

같은 블록이 pr(`frontend/style.css`)·fd(`public/css/app.css`)·st(`frontend/css/style.css`, 가이드 주석은 `kis-practice.css` 에도)·iv(`frontend/style.css`, `investment-native/styles.css`) 에 들어 있다. 캐시 버전이 있는 링크는 각 페이지에서 갱신 필요(st `style.css?v=…`, pr/iv `style.css?v=…`); fd `/css` 는 no-cache.

## 7. 사용자 의사결정 필요 항목

| # | 결정할 것 | 선택지와 영향 | 에이전트 권고 |
|---|-----------|---------------|---------------|
| K1 | 배포 대상 서버·compose 방식 | 현재 `cd.yml` 은 `-p domain-rag-lab -f docker-compose.prod.yml`(자체 Caddy 80/443). ① fd 서버(43.201.229.188)에 올리면 pr 스택(프로젝트명 `domain-rag-lab`)과 **충돌**. ② st 서버(43.202.161.134)는 nginx+certbot·에이전트 SSH 불가·50GB. ③ 별도 EC2 | fd 서버 + pr-edumgt 방식(`deploy/<name>/compose.yml`, 호스트 포트 없음, shared-net alias, Caddy 블록 추가, `-p stock-kms-portal`). 결정 후 `EC2_HOST`/`EC2_APP_DIR` 등록·`cd.yml` compose 명령 교체 |
| K2 | 레거시 `/api/*` 프록시 대상 investment-backend(MongoDB 필요) | 컨테이너 정의 없음 → 별도 compose 작성 vs 해당 메뉴 제거. **2026-10-07 홈 대시보드 3개 경로는 포털 자체 구현으로 대체(6-2)**, 데이터 시각화 6종·`/api/search` 는 아직 502 | 과제 범위면 제거, 운영이면 compose 추가(또는 6-2 방식으로 이식) |
| K3 | 새 호스트명 DNS | 미등록. 도메인 결정 필요 | fd Caddy 블록 추가 시점에 A 레코드 등록 |
| K4 | domain-rag-lab 변경 추적 | 포크 이후 upstream 과 분기(`lean_reference_data` 등 누락). 주기적 머지 vs 독립 | 통합 포털 목적이면 독립, LEAN 기능 쓰면 `lean_reference_data` 만 가져오기 |
| K5 | 변경분 커밋 | 6-1 변경 4경로 미커밋 | 기능 단위 커밋 |

## 8. 운영 배포

| 항목 | 상태(2026-10-06) |
|------|------|
| origin/main | `25d97ba` (Enhance lesson page styles…, 2026-09-22). 10-06 fetch/pull 로컬=원격 |
| 로컬 미커밋 | `cd.yml`(헬스체크 `--retry-connrefused`), `todo.md`(신규), `test.md`(작업 메모 → todo.md 이동). 에이전트 커밋·푸시는 분류기 거부 → 사용자 수행 |
| 워크플로 | `CI — Lint & Test` dfaa7e1 성공. `CD — Deploy to EC2` dfaa7e1(사용자 푸시) 는 `EC2_HOST` 비어 있어 ssh-keyscan 단계에서 **의도대로 실패**(배포 안 함). ECR disable·파일 삭제 완료(a8c9b8c). 10-06 추가 수정(미커밋): 헬스체크 curl 에 `--retry-connrefused`(domain-rag-lab 과 동일 원인 선반영) |
| 배포 서버 | st 서버(43.202.161.134) `/opt/stock-kms-portal`, compose 프로젝트 `stock-kms-portal`(`deploy/st-iv/compose.yml`) → https://iv.edumgt.co.kr (git 체크아웃 아님 — rsync/scp 로 파일 반영). **nginx 역프록시 정본은 stock-coin-trade `docker/nginx.ssl.conf` 의 iv 블록**(stock-coin-trade todo 6-12). `deploy/st-iv/nginx.iv.conf` 는 참고 사본 |
| 참고 | 2026-10-02 판단(메모리/domain-rag-lab 8절): fd 권고, st 부적합 |
