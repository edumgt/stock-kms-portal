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
| K6 | 라이브가 git 보다 앞선 `investment-native/styles.css` | 2026-10-12 확인: 라이브(st 서버 `stock-kms-portal-api-1`) 269,895B·`:root` 토큰 49개 vs 로컬 git 261,452B·47개. 서버에서 직접 고친 변경이 git 에 없는 것으로 보인다(파싱은 정상). 이대로 두면 다음 배포가 라이브 변경을 **덮어 지운다** | 서버 사본을 내려받아 diff 후 git 에 반영(권고) vs git 기준으로 덮기. 반영 전까지 이 파일은 배포 대상에서 제외 |

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

### 6-6. 2026-10-08 4개 저장소 공통 스타일 CSS 단일화 → www.edumgt.co.kr S3 `css/` 호스팅 (사용자 요청)

요구: 4개 저장소(pr `domain-rag-lab` / fd `lumina-invest` / st `stock-coin-trade` / iv `stock-kms-portal`)의 공통 스타일 CSS 를 **하나로 만들어** `www.edumgt.co.kr` 의 S3 `css/` 폴더에 올리고, 네 사이트가 그것을 쓰도록 개편.

**단일 정본**: `https://www.edumgt.co.kr/css/common.css` (`s3://www.edumgt.co.kr/css/common.css`, CloudFront 경유, `text/css; charset=utf-8`, `Cache-Control: public, max-age=300`)
**소스 정본(버전 관리)**: `lumina-invest/shared-css/common.css` + `deploy.sh` + `README.md`. 스타일 변경은 소스를 고치고 `./shared-css/deploy.sh` 로 올린다. 최대 5분 뒤 전파된다(이 계정 IAM 에 `cloudfront:ListDistributions`/무효화 권한이 없어 max-age 로 처리).

**공통 CSS 에 들어간 것**(4개 저장소에 바이트 단위로 동일하게 복제돼 있던 블록 + 한글 스케일):

| 블록 | 종전 위치 |
|------|-----------|
| 공통 타이포그래피 가이드 주석(6-27) | 주 CSS 6개 맨 위에 8줄씩 중복 |
| 타이틀 고정 — `--title-size:18px`, `h1·h2·.page-title` 18px `!important` | 주 CSS 5개 맨 끝에 중복 |
| 공통 푸터 통일 — 25px·검정·1줄(6-34) | CSS 8개에 39줄씩 중복 |
| 전역 최소 글자 크기 — `small,sub,sup{font-size:max(13px,.9em)!important}` | st `style.css` 에만 있었다 → 4개 사이트 전체 적용 |
| 한글 글자 스케일 — `Pretendard Hangul 110` @font-face(`size-adjust:110%`) | pr `hangul-scale.css` 에만 있었다 → 4개 사이트 전체 적용 |

**공통 CSS 에 넣지 않은 것**: 테마 토큰(색·배경·그림자·레이아웃)은 사이트마다 전혀 달라서 각 저장소 주 CSS 에 남겼다 — pr 다크+노란색(`#0a0a0a`/`#F5C518`), fd 라이트, st 라이트 TradingView 블루(`#F0F3FA`/`#2962FF`), iv 파랑/노랑(`#0058a3`/`#ffda1a`).

**읽는 방법**: 모든 HTML 의 `</head>` 바로 앞에 **마지막 스타일시트**로 넣었다. 공통 블록이 각 사이트 CSS 를 덮어써야 하므로 순서가 중요하다.
`<link rel="stylesheet" href="https://www.edumgt.co.kr/css/common.css?v=20261008-common-1" />`

**예외 1곳**: `stock-coin-trade/vscode-kis-mcp/media/panel.css` 는 VSCode 웹뷰이고 CSP 가 `style-src ${webview.cspSource}` 라서 외부 CSS 를 못 읽는다. 공통 푸터 블록을 로컬에 유지했다.

**사용자 결정**(작업 전 확인): 범위는 "이미 동일한 블록 + 한글 폰트 스케일", 폴백은 "S3 만 사용"(각 저장소에 런타임 사본을 두지 않음). 따라서 S3/CloudFront 장애 시 4개 사이트의 푸터·타이틀 고정·한글 스케일이 동시에 빠진다(테마·레이아웃은 로컬이라 유지).

검증: ① 공통 블록이 로컬 CSS 에 남아있지 않음(panel.css 예외 1곳만) ② HTML 111곳 전부에서 `common.css` 가 마지막 스타일시트 ③ 변경 CSS 9개 중괄호 균형 일치 ④ S3 응답 200 + 소스와 `diff` 일치 ⑤ 4개 저장소에 CSP 설정 없음(외부 스타일시트 차단 없음) ⑥ CSS `?v=` 만 `20261008-common-1` 로 갱신, JS 버전은 그대로.

**커밋 안 했다** — 변경만 남겨 두었다.
**이 저장소의 변경**

| 변경 | 내용 |
|------|------|
| `frontend/style.css` | 상단 8줄 가이드 주석 → 정본 포인터 3줄, 맨 끝 타이틀 고정+공통 푸터 블록(46줄) 제거 |
| `frontend/investment-native/styles.css` | 같은 제거. `html.embedded-dashboard footer{display:none}` 는 공통 CSS 로 옮겼다 |
| `frontend/days/assets/site.css` | 맨 끝 공통 푸터 블록(40줄) 제거 |
| `frontend/hangul-scale.css` | 삭제. pr 판본(Hangul 110 @font-face 포함)이 공통 정본이 되었으므로 **iv 한글 글자가 10% 커진다**(사용자 승인) |
| HTML 20개 | `</head>` 앞에 공통 CSS 링크 추가. 파셜 `investment-native/pages/partials/sidebar-nav.html` 은 `<head>` 가 없어 제외(상위 페이지가 이미 로드) |

### 6-7. 2026-10-08 공통 CSS 단일화 회귀 수정 — CSS 맨 위 한 줄이 삭제돼 `:root` 가 무효화된 문제

**증상**: fd `app.html` 에서 스타일이 거의 적용되지 않았다(사용자 보고 "CSS 적용에 문제 있음" → "스타일이 아예 적용 안 됨").

**원인 — 직전 공통 CSS 단일화 작업에서 내가 넣은 버그**: 각 CSS 맨 위의 공통 가이드 주석을 정본 포인터로 교체할 때 그 주석을 **8줄로 착각**하고 `tail -n +9` 로 잘라냈다. 실제로는 **7줄**이라 **8번째 줄이 모든 파일에서 삭제**됐다.

| 파일 | 삭제된 8번째 줄 | 결과 |
|------|----------------|------|
| `lumina-invest/public/css/app.css` | `    /* ═══…` (자체 주석 여는 `/*`) | 뒤따르는 주석 본문이 생 텍스트가 되어 CSS 파서가 **`:root` 블록 전체를 깨진 선택자의 본문으로 먹었다** → 커스텀 속성 24개 → **0개**. `var(--bg)` 등이 전부 무효가 되어 화면이 무스타일로 보였다 |
| `stock-kms-portal/frontend/investment-native/styles.css` | 같은 형태 | `:root` 45개 → **17개** |
| `stock-coin-trade/frontend/css/kis-practice.css` | `:root{--trade-bg…}` — **주석이 아니라 실제 CSS 규칙** | 색 토큰 8개 → **0개** |
| `stock-coin-trade/frontend/css/style.css` | `/* ───…` (자체 주석 여는 `/*`) | `:root` 24개 → 22개(공통 이동분 2개 제외하면 동일), 뒤 주석 본문이 `@font-face` 를 삼켰다 |
| `domain-rag-lab/frontend/style.css` | `/* ===== Reset & Base ===== */` (완결된 주석) | 영향 없음(주석만 사라짐) |
| `stock-kms-portal/frontend/style.css` | 같음 | 영향 없음 |

**조치**: 6개 파일 모두 직전 커밋에서 8번째 줄을 복원했다. 캐시 버전을 `20261008-common-2` 로 올렸다(깨진 CSS 가 이미 브라우저·CloudFront 에 캐시됐다).

**검증(이번엔 실제 CSS 파서로)**: `tinycss2` 로 파싱해 규칙 수와 `:root` 커스텀 속성 수를 원본과 비교했다.

| 파일 | 원본 | 깨진 배포본 | 복원본 | 복원본 + common.css(2개) |
|------|------|------------|--------|------------------------|
| fd `app.css` | 24 | **0** | 22 | **24 ✓** |
| iv `investment-native/styles.css` | 45 | **17** | 43 | **45 ✓** |
| st `style.css` | 24 | 22 | 22 | **24 ✓** |
| st `kis-practice.css` | 8 | **0** | 8 | **8 ✓**(이 파일엔 타이틀 블록이 없었다) |

수정한 CSS 9개 전부 파싱 오류 0개. 직전 커밋 대비 diff 에서 의도한 제거(가이드 주석 7줄·타이틀 고정·공통 푸터) 외의 변화가 없음을 확인했다.

**교훈**: 중괄호 개수 균형만 봐서는 이 버그를 못 잡는다(깨진 파일도 균형은 맞았다). 주석 여는 `/*` 가 사라지면 균형은 유지되면서 뒤따르는 규칙 하나가 통째로 사라진다. CSS 를 기계적으로 편집한 뒤에는 **실제 파서로 규칙 수와 커스텀 속성 수를 전후 비교**해야 한다.

**커밋 안 했다** — 변경만 남겨 두었다.

### 6-8. 2026-10-12 깨진 CSS 배포본 복구 + 4개 사이트 스타일 공통화 2단계(캐스케이드 계층·표준 토큰) (사용자 요청)

**증상**: 사용자가 "https://fd.edumgt.co.kr/ 의 스타일 css 가 이상함" 이라고 보고했다.

**원인 — 수정은 됐지만 배포가 안 됐다**: 6-7 에서 고친 것은 **로컬 파일뿐**이었다. fd·st 운영 컨테이너는
`c63cc1a`(2026-10-08 17:18, 버그가 들어간 커밋) 시점에 빌드된 이미지로 돌고 있어서, 28분 뒤 커밋된 수정(`5b0a768`)이
반영되지 않은 **깨진 CSS 를 2026-10-12 까지 계속 서비스**했다. 정적 파일은 Dockerfile 로 이미지에 구워지고
두 서버에는 git 이 없어(소스 복사본만 있다) 로컬 수정이 자동으로 따라가지 않는다.

라이브에서 실제로 무효화된 것:

| 라이브 파일 | 삼켜진 것 | 결과 |
|---|---|---|
| fd `css/app.css` | 4행 `/*` | `:root` 테마 토큰 **22개 → 0개**. `var(--bg)` 등 전부 무효 |
| st `css/style.css` | 4행 `/*` | `:root` **22개 → 0개** |
| st `css/kis-practice.css` | 4행 `:root{…}` 규칙 자체 | 색 토큰 **8개 → 0개** |
| pr·iv `style.css` | 4행(완결된 한 줄 주석) | 영향 없음 |

**조치 1 — 배포 복구**(이미지 재빌드 없이 호스트 소스 + `docker cp`, 정적 파일이라 재시작 불필요)

- iv: 이 저장소 배포본도 4행이 완결 주석이라 파싱 피해는 없었다
- 이번 공통화 변경분 19개 파일을 `/opt/stock-kms-portal/frontend`(st 서버) 와 `stock-kms-portal-api-1:/app/frontend`
  양쪽에 반영. 백업 `/opt/css-common-backup-20261012/iv-frontend.tar`
- **확인 필요**: 라이브 `investment-native/styles.css` 는 269,895B·`:root` 토큰 49개인데 로컬 git 은 261,452B·47개로
  **라이브가 로컬보다 앞서 있다**(파싱은 정상). 서버에서 직접 고친 변경이 git 에 없는 것으로 보인다 → 7절 참조

**조치 2 — 공통화 2단계: 측정 먼저**

4개 저장소 CSS 전체(약 1.3MB, 규칙 13,000여 개)를 셀렉터+선언 단위로 비교했다.

| 공유 범위 | 동일 규칙 수 |
|---|---|
| 4개 저장소 전부 | **0개** |
| 3개 저장소 | 3개 |
| pr + iv (포크쌍) | **3,419개 / 337KB** |
| 그 외 2개 조합 | 6개 |

즉 "같은 CSS 가 4곳에 복제돼 있다"는 상태는 2026-10-08 작업으로 이미 끝났다. 4개 저장소에 공통으로 나타나는
셀렉터는 17개뿐이고 모두 **구조는 같고 값만 다른** 것들이었다(`:root`, `body`, 스크롤바 4종, 리셋, `.btn-primary`,
`.btn-ghost`, `.hero`, `.eyebrow`). 그래서 공통화를 **규칙 옮기기가 아니라 토큰 이름 통일 + 토큰만 참조하는 구조 계층**으로 했다.

**조치 2 — 구현**

- `common.css` 에 CSS 캐스케이드 계층 `@layer edumgt-reset, edumgt-tokens, edumgt-components` 추가.
  계층 규칙은 **계층 밖(각 사이트 CSS)보다 항상 약하므로**, 공통 CSS 를 마지막에 불러도 사이트 테마를 덮지 않는다.
  기존 "타이틀 고정"·"공통 푸터" 블록은 계층 밖 `!important` 로 남겨 종전처럼 사이트를 덮는다. 두 성질을 README 에 표로 구분해 적었다.
- 표준 토큰 8개 계약: `--bg --surface --border --text --muted --accent --radius --radius-sm` (+ `--accent-on`, 스크롤바 `--sb-*` 6개).
  각 저장소 주 CSS 끝에 `표준 토큰 계약` 블록을 추가해 **기존 토큰에 연결만** 했다(색·값 변화 없음):
  pr·iv `--text-muted → --muted`, fd `--surf → --surface`·`--text-mute → --muted`·`--radius`/`--radius-sm` 신규, st `--fg → --text`
- 스크롤바 규칙 16개(4사이트 × 4종) → 공통 4개로 통합. 각 사이트는 `--sb-*` 토큰만 갖는다. **현재 모양 그대로 유지**
  (pr·iv 5px/`auto`, fd 4px·`--border2`·4px, st 4px·`--bg` 트랙·2px·`--muted` 호버). `--sb-height` 기본값을 `auto` 로 둬서
  가로 스크롤바 두께가 pr·iv 에서 바뀌지 않게 했다.
- `.btn-primary`·`.btn-ghost`·`.eyebrow` 공통 정의 추가(토큰만 참조). 사이트가 같은 클래스를 정의하면 사이트가 이기므로,
  **실제로 새로 적용되는 곳은 fd `app.html:1564` 의 `.btn-ghost` 버튼 한 곳뿐**이다(지금까지 브라우저 기본 버튼 모양이었다).
- 캐시 버전 `20261008-common-2` → `20261012-common-3` (공통 CSS 링크 111개 + 수정한 주 CSS 링크 83개).
  내가 고치지 않은 CSS 의 `?v=` 는 그대로 뒀다.

**조치 3 — 감사 스크립트 `shared-css/audit.py` 신설** (lumina-invest 저장소, 4개 사이트 공용)

```bash
python3 shared-css/audit.py          # 로컬 4개 저장소
python3 shared-css/audit.py --live   # 라이브 4개 사이트
```

검사: ① 주석 균형 ② 중괄호 균형 ③ `:root` 토큰 수 하한 ④ 표준 토큰 8개 선언 ⑤ 미정의 `var()` ⑥ 18px 초과 font-size.
①③ 이 이번 사고 유형을 잡는다(깨진 파일도 중괄호 균형은 맞았으므로 ② 만으로는 못 잡는다).
`deploy.sh` 가 S3 업로드 **전에 자동으로 돌리고**, 오류가 있으면 배포가 중단된다.

**검증**

- 로컬 감사·라이브 감사 모두 **오류 0건**. 4개 저장소 모두 표준 토큰 8개 선언 확인
- 라이브 주 CSS 4개가 로컬 git 과 바이트 단위로 동일, `:root` 토큰 pr 19·fd 31·st 30·iv 19개
- 4개 사이트 라이브 페이지 12개에서 링크된 **CSS 17개 전부** 주석·중괄호 균형 정상
- 라이브 공통 CSS 에 `@layer` 3계층 반영 확인, 4개 사이트 HTML 이 `?v=20261012-common-3` 로 읽는 것 확인
- 각 사이트 주 CSS 에 남은 최상위 스크롤바 규칙 0개(공통으로 이동) 확인
- 브라우저 렌더링 캡처는 못 했다 — WSL 에 `libnspr4` 가 없어 headless chromium 이 뜨지 않고 sudo 는 비밀번호가 필요하다

**남은 경고(이번 작업 범위 밖, 기존 문제)**

- pr·iv: 어디에도 선언되지 않은 `var(--line)`·`var(--text-1)` 사용
- 18px 초과 `font-size`: pr 83건·iv 71건·fd 7건·st 7건 (공통 타이포그래피 가이드 2·3항 위반. 타이틀 고정 `!important` 가 덮는
  `h1`·`h2`·`.page-title` 외에는 그대로 보인다)
- pr↔iv 포크 중복 337KB(`days/assets/site.css` 147KB 등)를 S3 공통 파일로 끌어올리는 작업은 별건으로 남겼다

**커밋 안 했다** — 변경만 남겨 두었다.

### 6-9. 2026-10-14 iv.edumgt.co.kr 「AI 투자 도우미」(Amazon Lex V2) 복구 — Lex 라우터 포털 이식 (사용자 요청)

**흔적 조사**: AWS 계정에 봇 **InvestmentAnalysisAssistant**(us-east-1, 봇 SE3NCP7NMP, 운영 별칭 investment-analysis-prod ZJFW9O3LZM, 2026-08-08, ko_KR, 인텐트 Greeting/PortfolioHelp/MarketBasics 고정 응답, 코드 훅·대화 로그 없음)이 남아 있고 `recognize-text` 로 응답 확인. 원본 저장소 edumgt/investment-analysis(`app/backend/routers/lex.py`, compose LEX_*)에서 이식된 `integration-src/investment-backend/routers/lex.py` 가 있으나, 그 백엔드 컨테이너가 st 서버에 없어(K2) `/api/lex/*` 는 502 "투자 분석 API에 연결하지 못했습니다". 같은 계정 ap-northeast-2 의 FinanceInvestBot(VP2C22LIIZ, 상담 예약 6슬롯 + 이행 Lambda)은 슬롯 필링 실습 봇으로 iv 와 무관.

| 변경 | 내용 |
|------|------|
| `app/api/routes/lex.py` 신설 | investment-backend 의 lex.py 를 포털로 이식(6-2 홈 대시보드와 같은 방식). `GET /api/lex/status`(configured·region·locale·bot_id), `POST /api/lex/chat`(message·session_id·**session_attributes**). 응답에 Lex 대화 상태 — `intent`·`intent_state`·`dialog_action`·`slot_to_elicit`·`slots{이름: 해석값}`·`session_attributes` — 를 실어 슬롯 필링 단계를 화면이 알 수 있게 함. 리전은 `LEX_REGION`(없으면 AWS_REGION). 자격증명 오류 503, AccessDenied 403, 기타 502 |
| `app/main.py` | `/api/{path}` 프록시보다 먼저 `lex_router` 등록 |
| `requirements.txt` | `boto3==1.43.107` 추가(이미지 재빌드 필요) |
| `tests/test_lex.py` | 3개(설정 상태·미설정 503, Lex 응답 → 대화 상태 매핑·session_attributes 전달, 세션 ID/빈 메시지 422·AccessDenied 403·NoCredentials 503·빈 응답) — 저장소 첫 tests/ 디렉터리(CI 가 pytest 를 돌리기 시작함) |
| `deploy/st-iv/deploy-lex.sh`·`lex-policy.json` | `--iam`: 인스턴스 역할 StockCoinTradeSecretsReadRole 에 운영 별칭 한정 `lex:RecognizeText` 인라인 정책(추가 전용). 본 실행: 소스 tar 갱신 → `.env.prod` 에 LEX_REGION/BOT_ID/ALIAS_ID/LOCALE 추가 → api 재빌드·재기동 → 공개 주소로 status/chat 확인 |

**검증**: `tests/test_lex.py` 3개 통과(lumina venv). 이 PC 의 관리자 자격증명으로 운영 별칭에 "포트폴리오를 어떻게 구성해" → PortfolioHelp/Fulfilled/Close 응답 확인. 브라우저 미실행.
**배포(미완, 사용자)**: ① `bash deploy/st-iv/deploy-lex.sh --iam`(에이전트의 IAM 변경은 자동 모드가 차단 — 인스턴스 역할 StockCoinTradeSecretsReadRole 에는 현재 Secrets Manager 읽기만 있고 Lex 권한이 없음) ② `bash deploy/st-iv/deploy-lex.sh`. 컨테이너는 IMDS 로 역할 자격증명을 받으므로 키를 .env 에 넣지 않는다.
**다음**: 슬롯 필링을 넣으려면 봇에 인텐트·슬롯·코드 훅 추가 + `sidebarUI.js` 가 `dialog_action`(ElicitSlot/ConfirmIntent) 과 `session_attributes` 를 쓰도록 확장.

### 6-10. 2026-10-14 iv 챗봇 주식 대화 → Lambda 코드 훅 → KIS 모의 주문 (사용자 요청)

**설계**: Lex 봇 InvestmentAnalysisAssistant(us-east-1) 에 인텐트 3개 추가. **TradeStock**(슬롯 Side=OrderSide BUY/SELL · Ticker=StockTicker(값 종목코드, 동의어 종목명 2,677개 — lumina `korea-universe.json`) · Quantity · OrderType=OrderTypeKind MARKET/LIMIT · Price(지정가만)), **CheckBalance**, **CheckOrder**. Lambda `iv-lex-trade-hook` 이 DialogCodeHook(값 검증·관리종목 매수 거절·수량/금액 상한·지정가 가격 요청·매도 보유수량 확인·확인 문구 ConfirmIntent) 과 FulfillmentCodeHook(장중 확인 → stock-coin-trade `POST /openapi/v1/kis/order-approval` → `POST /orders`, 계약 v0.6 2절, Bearer API 키) 을 맡는다. `environment` 는 코드에서 paper 고정. 세션 속성 lastTicker/lastOrderNo 로 "주문 확인" 후속 대화. 포털 lex.py(6-9)는 slots·dialog_action·session_attributes 를 이미 돌려주므로 프런트 변경 없이 동작(프롬프트는 Lex 메시지로 옴).

| 파일 | 내용 |
|------|------|
| `lex/lambda/trade_hook/handler.py` + `tickers.json` | 코드 훅(표준 라이브러리만, zip 의존성 없음). 훅 예외는 Close 메시지로 변환 |
| `lex/scripts/build_bot.py` | 슬롯 타입·인텐트·슬롯 생성/갱신(멱등) → 로캘 빌드 → `--lambda-arn` 이면 버전 발행 + 별칭 훅 연결. 페이로드는 botocore 서비스 모델로 오프라인 검증 |
| `lex/scripts/deploy.sh` | Lambda 패키징·create/update(역할 chatbot-api-lambda-role 재사용, python3.12, env GATEWAY_BASE/GATEWAY_API_KEY/MAX_ORDER_QTY/MAX_ORDER_AMOUNT) → `lexv2.amazonaws.com` 호출 권한(별칭 ARN 한정) → build_bot → recognize-text 스모크("삼성전자 1주 시장가 매수" → 확인 → "아니오") |
| `tests/test_lex_trade_hook.py` | 6개(슬롯 검증·Delegate/ElicitSlot 구분·관리종목·한도, 확인 문구·세션 속성·거절/확인, 매도 보유수량, 이행 승인→주문·clientOrderId, 장외 차단·게이트웨이 오류 매핑, 잔고·주문확인·미지 인텐트·예외) |
| `lex/README.md` | 구성·안전장치·실행법 |

**검증**: tests/ 9개 통과(lex 라우터 3 + 훅 6). AWS 호출(DRAFT 빌드 포함)은 자동 모드가 차단 → 미실행.
**배포(미완, 사용자)**: ① st.edumgt.co.kr 회원 → API 키 발급 후 DB 에서 scopes `kis:order kis:read` 부여(lumina 키 id=2 와 분리) ② `GATEWAY_API_KEY=... bash lex/scripts/deploy.sh` ③ 6-9 의 포털 Lex 복구(deploy-lex.sh)가 먼저 되어 있어야 화면에서 보인다.
**주의**: 챗봇에 접근하는 누구나 모의계좌 주문을 낼 수 있다(포털 로그인 뒤에만 챗봇을 노출하거나 Lambda 상한을 낮출 것). 게이트웨이의 비상 정지·예수금 검사·회당 1천만원 한도는 그대로 적용된다(현재 예수금 음수라 매수는 10-16 결제 전까지 거절됨).

### 6-11. 2026-10-14 Lex 봇 서울 리전 전환 + 버지니아 봇 제거 + 전 리전 봇 조사 (사용자 요청)

**조사(전 리전 `lexv2-models list-bots`)**: 봇은 두 리전뿐. ap-northeast-2: AcademyReservationBot2(38N5QKAZMD)·FinanceInvestBot(VP2C22LIIZ, 실습). us-east-1: InvestmentAnalysisAssistant(SE3NCP7NMP, iv 용 → 삭제 대상). 나머지 리전 없음. Lex V1(`lex-models get-bots`)은 전 리전 503(서비스 종료)이라 V1 봇 없음.
**변경**: `lex/data/base_intents.json`(버지니아 봇의 Greeting·PortfolioHelp·MarketBasics·Fallback 응답 내보냄) · `lex/scripts/build_bot.py` 리전·봇 ID 환경변수화(기본 ap-northeast-2), `--create-bot`(봇·ko_KR 로캘·별칭 생성 + 기본 인텐트 시드), `--delete-bot REGION ID` · `lex/scripts/deploy.sh` 서울 기준(봇 없으면 생성 → Lambda(서울) → 훅 연결 → 스모크 3턴), `--delete-virginia`(DELETE_OLD_BOT=1 필요, 봇 + us-east-1 Lambda 삭제) · `deploy/st-iv/deploy-lex.sh` 봇 ID 환경변수 필수, 정책 JSON 실행 시 생성, `.env.prod` 기존 LEX_* 값 덮어씀. 신규 호출(CreateBot/CreateBotLocale/CreateBotAlias/DeleteBot/기본 인텐트/Fallback)도 botocore 모델로 오프라인 검증. 테스트 9개 통과.
**실행 순서(사용자)**: ① `GATEWAY_API_KEY=... bash lex/scripts/deploy.sh`(서울 봇 생성 + Lambda + 훅) ② 출력된 ID 로 `LEX_BOT_ID=.. LEX_BOT_ALIAS_ID=.. bash deploy/st-iv/deploy-lex.sh --iam && bash deploy/st-iv/deploy-lex.sh` ③ iv 화면 확인 후 `DELETE_OLD_BOT=1 bash lex/scripts/deploy.sh --delete-virginia`. 에이전트는 Lex 생성·삭제 호출이 자동 모드에 막혀 미실행.
**추가(2026-10-14 16:40 KST, 사용자 보고 "iv 첫 화면에 챗봇 창 없음")**: 원인 — 챗봇 DOM 을 만드는 `investment-native/js/sidebarUI.js` 는 투자분석 원본 앱(index.html)에서만 로드되고, 포털이 `/` 에 서빙하는 `frontend/index.html` 은 그 스크립트를 넣지 않는다(정적 자산만 `/investment-static` 로 마운트). 해결 — 포털용 `frontend/chatbot.js` 신설(ensureSidebarChatbot 이식 + Lex 대화 상태 활용: ElicitSlot 이면 입력창 힌트, ConfirmIntent 면 네/아니오 버튼, session_attributes 왕복)·`frontend/index.html` 맨 끝에 `<script src="/static/chatbot.js?v=20261014-lex">`·styles.css 에 `.floating-chatbot-quick`. deploy-lex.sh FILES 에 추가(이미지 재빌드에 포함). 서버 index.html 은 HEAD 와 md5 동일 확인.
**API 키 발급**: 에이전트의 MariaDB 쓰기(api_key 해시 등록)는 자동 모드가 차단(Secret-Store Writes). `deploy/st-iv/issue-gateway-key.sh`(키 생성 → 해시만 서버 mockinv.api_key 에 INSERT(member 1, scopes 'kis:order kis:read') → 원문은 `secrets/lex-gateway-api-key` 600) 를 사용자가 실행. `.gitignore` 에 `secrets/` 추가(기존 `*.key` 줄에 붙어 깨졌던 것 복구).

---

지금까지 논의한 **AWS Lex 기반 주식 투자/매매 챗봇 설계 및 슬롯 필링 관점의 주요 내용**을 한눈에 보실 수 있도록 Markdown(MD) 형식으로 정리해 두었습니다.

---

# 📈 AWS Lex 기반 주식 투자 챗봇 구축 안내서

## 1. 개요

본 문서는 AWS Lex V2를 활용하여 **주식 조회 및 거래 매매 챗봇**을 구축할 때 필요한 슬롯(Slot) 설계, 슬롯 필링(Slot Filling) 메커니즘, Lambda 연동 및 비용 체계를 정리한 요약서입니다.

---

## 2. 주요 슬롯 유형 (Slot Types) 구성

주식 챗봇에서 사용자의 발화로부터 핵심 매개변수를 추출하기 위한 슬롯 구성입니다.

| 슬롯명 | 역할 | 추천 슬롯 유형 (Slot Type) | 비고 / 예시 |
| --- | --- | --- | --- |
| **`CompanyName`** | 종목명 / 티커 | **Custom Slot Type** (`StockSymbol`) | `삼성전자` (동의어: `삼전`, `005930`), `테슬라` |
| **`Quantity`** | 매수/매도 수량 | **`AMAZON.Number`** (Built-in) | `10` ("10주 사줘") |
| **`Price`** | 지정 가격 | **`AMAZON.Number`** / **`AMAZON.Currency`** | `70000` ("7만 원에 주문") |
| **`OrderType`** | 매수 / 매도 / 조회 | **Custom Slot Type** (`OrderType`) | `매수` (`사기`), `매도` (`팔기`), `조회` |
| **`PriceType`** | 시장가 / 지정가 | **Custom Slot Type** (`PriceType`) | `시장가`, `지정가` |
| **`TargetDate`** | 조회 시점/날짜 | **`AMAZON.Date`** (Built-in) | `오늘`, `어제`, `지난주` |

---

## 3. 슬롯 필링 (Slot Filling) 대화 설계

사용자가 한 번에 모든 정보를 입력하지 않아도 대화를 통해 단계별로 정보를 수집하는 과정입니다.

### ① 대화 흐름 (Conversation Flow) 예시

1. **사용자**: *"주식 사줘"* (Intent: `BuyStock` 감지, 슬롯 미비)
2. **Lex Prompt**: *"어떤 종목을 매수하시겠어요?"* $\rightarrow$ **`CompanyName` 채우기**
3. **사용자**: *"삼성전자"*
4. **Lex Prompt**: *"몇 주를 매수하시겠어요?"* $\rightarrow$ **`Quantity` 채우기**
5. **사용자**: *"10주"*
6. **Lex Prompt**: *"시장가로 주문할까요, 지정가로 주문할까요?"* $\rightarrow$ **`PriceType` 채우기**
7. **사용자**: *"7만 원에 지정가로 해줘"* $\rightarrow$ **`Price` 채우기**
8. **Lex Prompt (Confirmation)**: *"삼성전자 10주를 70,000원에 지정가 매수할까요? (예/아니오)"*

### ② 슬롯 필링 핵심 고려사항

* **Multi-Slot Extraction**: 한 번에 여러 값이 들어오면 되묻기를 건너뛰고 다음 단계로 즉시 이동합니다.
* 예: *"삼성전자 7만 원에 10주 사줘"* $\rightarrow$ 한 번에 모든 필수 슬롯 충족.


* **Conditional Branching (조건부 분기)**:
* `PriceType` = "시장가" $\rightarrow$ `Price` 입력 단계 생략.
* `PriceType` = "지정가" $\rightarrow$ `Price` 필수 요구.



---

## 4. Lambda (Dialog Code Hook) 연동 방식

대화 진행 도중 슬롯 값의 유효성을 검증(Validation)하거나 슬롯을 동적으로 제어하기 위해 AWS Lambda를 연동합니다.

### ① 연동 시점

* **Dialog Code Hook**: 슬롯 필링 중간중간 호출되어 값 검증, 종목코드 매핑, 동적 질문 제어를 수행합니다.
* **Fulfillment Code Hook**: 모든 슬롯이 채워진 뒤 실제 증권사 API를 호출하여 매매를 체결합니다.

### ② Lambda 구현 역할

* **입력값 검증 (Validation)**: 상/하한가 이탈 여부, 거래 수량 제한(예: 1회 최대 100주) 체크 후 재질문(`ElicitSlot`).
* **동적 기본값 처리**: 조회 날짜가 없으면 자동으로 `TargetDate = 오늘` 설정.
* **검증 통과 시**: `Delegate` 응답으로 Lex의 기본 대화 프로세스로 제어권 반환.

---

## 5. 수천 개(2,600여 개) 종목 처리 아키텍처

### ① AWS Lex 수량 제한 (Quota)

* Custom Slot Type 당 **최대 10,000개**의 Slot Values / Synonyms 허용.
* 2,677개 종목 등록은 Lex 제약상 **기술적으로 완전히 가능**함.

### ② 실무 추천 아키텍처 (자유 텍스트 + 외부 DB 매핑)

상장폐지/신규 상장 및 수많은 동의어(삼전, 애플 등)의 정적 관리 부담을 줄이기 위해 아래 구조를 권장합니다.

```
[유저 입력: "삼전 10주 사줘"]
        │
        ▼
[Lex Slot: AMAZON.FreeFormInput] ──▶ "삼전"을 자유 텍스트로 수집
        │
        ▼
[Dialog Code Hook (Lambda)] ──────▶ Redis / DynamoDB Master DB 조회
        │                          ("삼전" ➔ "005930 삼성전자" 자동 매핑)
        ▼
[슬롯 값 확정 및 거래 진행]

```

---

## 6. 과금 체계 (Lex Pricing)

AWS Lex는 **사용한 질의응답 건수(Turn)** 기반의 Pay-as-you-go 요금제입니다.

### ① 단가 (Request-and-Response 기준)

| 구분 | 건당 비용 (USD) | 한화 추산 (1달러 = 1,350원 기준) |
| --- | --- | --- |
| **텍스트 요청 (Text Request)** | **$0.00075** / 건 | **약 1원** / 건 |
| **음성 요청 (Speech Request)** | **$0.00400** / 건 | **약 5.4원** / 건 |

### ② 과금 단위 기준 (Turn)

* **1건 = 사용자가 챗봇에게 메시지를 전송(엔터)할 때마다 1회 발생.**
* 하나의 매수 주문을 완료하기 위해 4번의 주고받는 대화(턴)가 이루어졌다면 총 4건($0.003, 약 4원)으로 청구됩니다.

### ③ Free Tier 혜택

* AWS 신규 계정/최초 사용 시 **12개월간 매달 텍스트 10,000건, 음성 5,000건 무료** 제공.