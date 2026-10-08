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


### 6-5. 2026-10-07 공통 LLM 모델 qwen2.5:7b → 3b 교체 (사용자 요청)

**배경**: fd 호스트는 2 vCPU · 8GB 를 15개 컨테이너가 공유한다. 7b(4.7GB)는 메모리의 절반 이상을 차지하고 콜드 로딩만 30초대였다.

**fd Ollama 실측** (호스트 load 1.27, num_ctx 2048 · num_predict 160, 앱과 같은 조건)

| 모델 | 콜드(로딩 포함) | 웜 | 생성 속도 |
|------|------|------|------|
| qwen2.5:3b | 40.7초 | 16.6초 (33토큰) | 1.99 tok/s |
| qwen2.5:1.5b | 53.2초 | 39.4초 (160토큰) | 4.06 tok/s |

토큰당 속도는 1.5b 가 3b 의 약 2배다. 160토큰 답변 기준 3b ≈ 80초, 1.5b ≈ 39초로 추정된다.

**변경**: `app/services/qwen_remote.py`·`chart_llm.py` 의 하드코딩 `MODEL` 을 `os.environ.get('QWEN_MODEL', 'qwen2.5:3b')` 로(다음 교체는 설정만으로). `app/core/config.py` `vllm_model`, `deploy/st-iv/compose.yml` 에 `QWEN_MODEL`·`VLLM_MODEL` 3b, `.env*.example` 의 vLLM 경로 `Qwen/Qwen2.5-3B-Instruct`.

**주의**: 모델 교체만으로는 체감이 크게 좋아지지 않는다. `num_predict` 를 100 이하로 줄이고 `keep_alive` 를 30분 이상으로 두어 콜드 로딩을 피하는 쪽이 효과가 크다. 벤치마크 시 `ollama run` CLI 는 토큰 상한이 없어 수천 토큰을 생성하며 호스트를 포화시킨다(2026-10-07 실제 발생). HTTP API 에 `num_predict` 를 주고 측정할 것.

**7b 삭제 순서**: 배포 전에 지우면 구 코드가 도는 컨테이너가 깨진다. ① 이 변경 배포 → ② `sudo docker exec fin-ai-ollama ollama rm qwen2.5:7b`(4.7GB 회수).

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

## 9. 2026-10-08 타이틀 크기 정상화 (사용자 요청)

사용자 스크린샷: 실시간 분봉차트 페이지의 히어로 타이틀이 비정상적으로 큼. "비정상적인 크기의 타이틀 모두 제거, 타이틀을 다른 페이지와 동일하게".

**왜 아직 컸나**: 공통 타이포그래피 가이드(lumina todo 6-27, 2026-10-07)가 `h1, h2, .page-title { font-size:18px !important }` 블록을 두 CSS 맨 끝에 넣었지만, **`style.css?v=` 캐시 버전을 올리지 않아** 브라우저가 옛 CSS 를 계속 썼다. 코드상으로는 이미 18px 로 눌리고 있었다.

| 변경 | 내용 |
|------|------|
| `frontend/style.css` | 타이틀(h1·h2·.page-title 및 그 안의 mark/small/span)에 걸린 개별 `font-size` 선언 **52건 제거**. `!important` 블록이 이미 무력화해 둔 죽은 선언이라 남겨 두면 "페이지마다 크기가 다르다"는 착시만 준다. 빈 껍데기가 된 규칙 정리 |
| `frontend/investment-native/styles.css` | 같은 기준으로 **58건 제거** |
| `frontend/investment-native/js/views/*.js` (26개 파일) | `<h1>`·`<h2>` 인라인 `style="font-size:…"` **32건 제거** |
| `frontend/style.css` (배너) | 분봉차트·통합대시보드 히어로 `padding:clamp(24px,4vw,54px)`·`border-bottom:12px`, 통합학습 `clamp(20px,3vw,38px)`·`10px` → 이 포털 표준인 `.practice-hub-head` 와 동일하게 **`padding:30px 32px` · `border-bottom:8px`** 로 통일. 18px 타이틀에 54px 패딩이면 빈 파란 박스만 커 보인다 |
| `frontend/index.html`·`investment-native/index.html`·`investment-native/pages/youtube.html` | 스타일시트 캐시 버전 4곳 → **`?v=20261008-title18`** (이게 있어야 실제 화면이 바뀐다) |

검증: 타이틀 font-size 선언 잔여 **0건**(두 CSS), 인라인 잔여 **0건**, 중괄호 균형 OK(1907/1907·2505/2505), 수정한 JS 26개 파일 문법 검사 통과. 이 저장소엔 테스트 스위트가 없다.

남겨 둔 것: `.atlas-header { padding: clamp(28px,5vw,54px) }` — 매거진형 히어로로 성격이 달라 패딩은 두었다(그 안의 `h2` 크기 선언은 제거됨). 타이틀 위 `content-kicker`(15.95px)는 타이틀이 아니라 손대지 않았다.

**배포 필요**: iv.edumgt.co.kr 은 st 서버(43.202.161.134) `/opt/stock-kms-portal` 에 rsync/scp 로 반영하는 구조라, 위 변경은 동기화 전까지 화면에 안 나온다.

## 10. 2026-10-08 LEAN 투자 판단 실습 — 저장된 실행 결과를 좌측 메뉴로 통합 + UI 개선 (사용자 요청)

요구: 상단에 따로 떠 있던 「현대자동차·삼성전자·삼성전기」(저장된 LEAN 리포트) 메뉴를 좌측의 다른 클릭 메뉴와 같이 포함시키고 UI 개선.

| 변경 | 내용 |
|------|------|
| `frontend/app.js` `renderBacktestWorkflow()` | 상단에 `insertAdjacentHTML` 로 주입하던 `.lean-report-library` 배너 제거. 좌측 레일(`aside.backtest-examples`)을 **두 그룹**으로 재구성 — ①「저장된 실행 결과 · 바로 보기」(LEAN 리포트 3개) ②「직접 검증 · 조건 수정 가능」(예시 5개). 각 그룹은 `<nav>` + `aria-label`, 구분 라벨에 아이콘·배지 |
| 〃 선택 동기화 | `selectRail(kind, id)` 신설 — 저장된 리포트와 직접 검증 예시 중 **하나만** 선택 표시된다(종전에는 양쪽이 동시에 selected 로 남아 결과 영역이 무엇인지 알 수 없었다). `runBacktest()` 로 직접 실행해도 리포트 선택이 풀린다 |
| 〃 모드 표시줄 | `setBacktestMode()` + `#backtestMode` 신설. 결과 영역 바로 위에 「저장된 LEAN 실행 결과 · 현대자동차 · 이동평균 추세추종」 또는 「직접 검증 · 005930.KS · 매수 후 보유」를 띄우고 한 줄 설명을 붙인다(리포트는 조건을 바꿔도 안 변한다는 점 명시) |
| 〃 초기 상태 | 종전엔 예시 0번과 리포트 0번이 **둘 다 selected** 였다. 이제 폼만 예시 값으로 채우고(`applyBacktestExample(id, {select:false})`) 레일 선택·결과는 저장된 리포트 하나로 맞춘다 |
| `frontend/style.css` | `.bt-rail-group`·`.bt-rail-label`·`.bt-rail-list`·`.bt-mode` 추가. 리포트 버튼을 예시 버튼과 같은 세로 카드 형태로(우측 눈 아이콘, 선택 시 강조). 레일이 길어져 `max-height:calc(100vh - 24px); overflow-y:auto` 추가. 쓰지 않게 된 `.lean-report-library`·`.lean-report-choices` 규칙과 전용 미디어쿼리·테마 참조 제거 |
| 캐시 버전 | `style.css`·`investment-native/styles.css`·`app.js` → `?v=20261008-lean-rail` (3개 HTML, 5곳) |

검증: `app.js` 문법 검사 통과, `style.css` 중괄호 1919/1919, `lean-report-library`/`lean-report-choices` 잔여 참조 0, 빈 규칙 없음. 이 저장소엔 테스트 스위트가 없다.

**배포 필요**: 9절과 같이 st 서버(43.202.161.134) `/opt/stock-kms-portal` 로 rsync/scp 동기화해야 iv.edumgt.co.kr 에 반영된다.

## 11. 2026-10-08 주식투자 4개 저장소 푸터 통일 — 검정 배경·높이 25px 고정·동일 문구 (사용자 요청)

요구: 4개 저장소(pr `domain-rag-lab` / fd `lumina-invest` / st `stock-coin-trade` / iv `stock-kms-portal`)의 **모든 `<footer>`** 를 검정색·높이 25px 고정·동일 스타일·동일 문구로 통일. 적용 범위는 사용자가 "모든 `<footer>` 요소"로 지정했다(카드·모달·섹션 내부 푸터 포함).

문구: `© 2026 (주)에듀엠지티 All rights reserved.`
마크업: `<footer class="site-footer-unified">© 2026 (주)에듀엠지티 All rights reserved.</footer>`
스타일: `height/min-height/max-height:25px` · `background:#000` · `color:#fff` · `font-size:11.5px` · 가운데 정렬 1줄 · `overflow:hidden` · `white-space:nowrap` · border/radius/shadow 제거. 기존 푸터 규칙과 테마 오버라이드를 덮어야 해서 전 속성 `!important`. 선택자는 `footer, .site-footer-unified` 로 동적 생성 푸터까지 걸리게 했다.

| 변경 | 내용 |
|------|------|
| `frontend/style.css`, `frontend/days/assets/site.css`, `frontend/investment-native/styles.css` | 맨 끝에 공통 푸터 블록 추가 |
| `frontend/index.html`, `days/01~04.html`, `days/index.html`, `investment-native/index.html`, `investment-native/pages/youtube.html` | 푸터 마크업 12곳 교체 |
| `frontend/app.js`(7곳), `days/assets/site.js`, `investment-native/js/views/{learn,home,assetClasses,worldMarkets,globalCapitalMap}.js` | 템플릿 문자열 안의 푸터 교체(learn.js 13곳 포함) |
| 예외 보존 | `investment-native/styles.css` 의 `html.embedded-dashboard .site-footer{display:none}` 가 통일 규칙에 덮이지 않도록 `html.embedded-dashboard footer{display:none!important}` 를 뒤에 추가 |
| **기능 복구** `investment-native/js/views/home.js` | 차트 카드·차트 모달의 `footer.home-market-foot`(기간 라벨 `[data-foot-label]`·출처 `[data-source]`, `#home-chart-modal-foot-label`·`#home-chart-modal-source`) → `div` 로 복구. 안 하면 `home.js:499-500`·`579-580` 이 null 참조 |
| **기능 복구** `investment-native/js/views/todayGainers.js` | 급등주 시세 모달의 `footer#gainers-quote-source` → `div` 로 복구(`todayGainers.js:56` 참조 유지) |
| 캐시 버전 | 변경 자산 전부 `?v=20261008-footer-25px` (14곳) |

**4개 저장소 합계**: `<footer>` 106곳 중 101곳을 통일 푸터로 교체, 5곳은 기능 요소라 `div` 로 바꿔 동작을 지켜냈다(위 "기능 복구" 항목). 통일 CSS 블록은 9곳(CSS 8개 + `hts.html` 인라인).

**카드·모달 내부 푸터의 내용은 사라졌다**: 투자 판단 체크리스트 결론, 기업분석 모달 면책 문구, `day-offcanvas-footer` 의 Swagger·상태확인 링크, 공시/숫자 읽기 원칙, tr-pine 단계별 요약 코드(`guide.footer`) 등. "모든 `<footer>` 통일" 지시에 따른 결과이며, 되살리려면 해당 블록만 `div` 로 바꾸면 된다.

검증: 남은 `<footer>` 101곳이 모두 동일 문자열, 변경 JS 전부 `node --check` 통과, 변경 CSS 중괄호 균형 일치, 푸터와 함께 사라진 id·class 중 JS가 참조하는 것 없음(`#footer-year` 만 남았고 null 가드 있음).

**커밋 안 했다** — 변경만 남겨 두었다.
