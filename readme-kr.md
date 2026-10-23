# 투자 분석 포털 · 금융 학습 RAG

금융 학습, 시장·차트 분석, 투자 실습과 문서 기반 RAG를 하나의 웹 포털로 제공하는 FastAPI 기반 애플리케이션입니다. 기존의 포트 80 웹앱과 분석 모듈을 단일 사용자 경험으로 정리하는 것이 이 저장소의 역할입니다.

> 교육·분석 보조용 서비스입니다. 화면의 시뮬레이션·백테스트·RAG 답변은 매매 신호나 투자 권유가 아니며, 투자 판단의 책임은 사용자에게 있습니다.

## 제공 기능

- **대시보드·시장 정보**: 시장 현황, 종목 정보, 분봉/과거 가격 차트와 데이터 시각화
- **드로잉 차트·분석 도구**: 차트 주석과 기술적 분석 화면
- **통합 학습**: 법인·세무·거시경제·주식·거래전략·LEAN·펀드/ETF/채권·자산배분을 10개 단원으로 재구성한 학습 화면
- **투자 실습**: 포트폴리오 구성, 시장 충격 시나리오, 자산배분 시뮬레이션 및 QuantConnect LEAN 백테스트
- **RAG 채팅**: 학습·금융 문서를 근거로 검색하고 답변하는 대화형 도우미
- **회원 기능·화면 캡처**: 포털 공통 UI에서 제공하는 인증 및 캡처 기능

## 서비스 구조

```text
브라우저
  └─ FastAPI 단일 웹 원점 (:80 또는 프록시 :443)
       ├─ Vanilla JavaScript 포털 UI
       │   ├─ GNB / LNB / 오프캔버스
       │   ├─ 학습 01~10 정적 페이지
       │   └─ 차트·시각화·시뮬레이션 화면
       ├─ FastAPI API
       │   ├─ RAG / 문서 수집 / 상태
       │   ├─ 시장 데이터 / 시뮬레이션 / LEAN 백테스트
       │   └─ 인증
       ├─ Qdrant: 문서 청크 임베딩 및 유사도 검색
       ├─ PostgreSQL + pgvector: 서비스 데이터·대화·장기 기억
       ├─ Redis: 캐시 및 확장용 인프라
       └─ Ollama 또는 OpenAI 호환 LLM API: 답변 생성
```

레거시 투자 분석 API가 아직 분리 배포된 환경에서는 `INVESTMENT_API_BASE`를 통해 `/api/*` 요청을 같은 포털 원점에서 중계합니다. 프런트엔드는 iframe을 사용하지 않고 모듈·정적 자산 단위로 포털에 편입합니다.

## 기술 스택

| 구분 | 사용 기술 | 용도 |
| --- | --- | --- |
| 프런트엔드 | HTML5, CSS3, Vanilla JavaScript(ES Modules) | 단일 포털 UI, 학습 화면, 차트·실습 화면 |
| UI·시각화 | ApexCharts, Mermaid, Font Awesome, html2canvas | 데이터 차트, 다이어그램, 아이콘, 화면 캡처 |
| 백엔드 | Python 3, FastAPI, Uvicorn, Pydantic | REST API, 정적 파일 제공, 설정 검증 |
| 데이터 | PostgreSQL 16, SQLAlchemy, pgvector | 사용자·시장 데이터, 대화 로그, 장기 기억 |
| 검색 | Qdrant, 하이브리드 검색(RRF) | 벡터 검색과 키워드 검색 결합 |
| RAG·LLM | 문서 청킹, 임베딩, Ollama 또는 OpenAI 호환 Chat API | 근거 문서 검색 및 답변 생성 |
| 금융 분석 | yfinance, QuantConnect LEAN | 가격 데이터, 교육용 전략 백테스트 |
| 운영 | Docker Compose, Caddy(운영), AWS EC2 | 컨테이너 실행, TLS 역방향 프록시, 배포 |

기본 Qdrant 컬렉션은 `domain_docs`입니다. 학습 원문과 통합 대상 문서는 이 컬렉션을 기준으로 인덱싱합니다. `pgvector`는 Qdrant를 대체하는 문서 검색 저장소가 아니라 대화·장기 기억 등 관계형 서비스 데이터의 벡터 검색에 사용합니다.

## 주요 디렉터리

```text
app/
  api/routes/          # RAG, 시장, 시뮬레이션, 백테스트, 인증 API
  services/            # 검색, 임베딩, LLM, LEAN 실행, 메모리 서비스
  ops/                 # 인덱싱·재인덱싱·가격 데이터 백필 작업
frontend/
  index.html           # 포털 셸
  app.js, style.css    # 공통 UI와 화면 렌더링
  lessons/             # 01.html ~ 10.html 및 공통 학습 프레임
  investment-native/   # 분석 화면 모듈과 시각화 컴포넌트
data/                  # 학습 원문, 업로드 문서, 작업 데이터
DATA-ROOT/             # 인덱싱용 라벨링/학습 코퍼스
docker-compose.yml     # 로컬 개발용 구성
docker-compose.prod.yml# 운영용 구성
```

## 빠른 시작

### 사전 조건

- Docker Engine 및 Docker Compose 플러그인
- 답변 생성을 위한 Ollama 또는 OpenAI 호환 LLM 엔드포인트
- LEAN 백테스트를 사용할 경우 Docker 실행 권한과 충분한 저장 공간

### 로컬 개발

```bash
cp .env.local.example .env.local
# .env.local에서 LLM 주소·모델 등 환경에 맞는 값을 설정
docker compose --env-file .env.local -f docker-compose.yml up --build -d
```

| 서비스 | 주소 |
| --- | --- |
| 포털 / FastAPI | http://localhost |
| API 문서 | http://localhost/docs |
| 상태 확인 | http://localhost/health |
| Streamlit 보조 UI | http://localhost:8290 |
| Qdrant 대시보드 | http://localhost:6335/dashboard |

상태 확인:

```bash
docker compose --env-file .env.local -f docker-compose.yml ps
curl http://localhost/health
```

### 운영 배포

운영 설정은 `docker-compose.prod.yml`과 `.env.prod`를 사용합니다. Caddy가 80/443 요청을 API 컨테이너로 전달하며 PostgreSQL·Redis·Qdrant는 Docker 네트워크 내부에 둡니다.

```bash
cp .env.prod.example .env.prod
# 비밀번호, LLM 주소, 모델명, LEAN 연결값을 운영 환경에 맞게 설정
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

PEM 키, `.env` 파일, API 키, DB 비밀번호와 볼륨 데이터는 Git에 커밋하지 않습니다.

## RAG 데이터 운영

문서 변경 뒤에는 재인덱싱하여 Qdrant의 `domain_docs`에 반영합니다. 운영 컨테이너에서 실행하는 예시는 다음과 같습니다.

```bash
docker compose exec api python -m app.ops.reindex_vector_store
```

통합 이전 학습 문서를 추가 적재하거나 레거시 컬렉션을 병합할 때는 `app/ops/ingest_legacy_learning_pages.py`, `app/ops/merge_legacy_investment_vectors.py`를 사용합니다. 실행 전 대상 컬렉션과 기존 데이터 백업 여부를 확인해야 합니다.

## 개발 원칙

- 포털 화면은 같은 원점과 공통 GNB/LNB 프레임을 사용합니다.
- 외부 분석 화면을 iframe으로 연결하지 않고, 소스·정적 자산·API 모듈을 통합합니다.
- RAG 답변에는 검색 근거를 우선하며, LLM 연결 실패 시에는 상태와 오류를 명확히 표시합니다.
- 교육용 금융 데이터·시뮬레이션 결과는 실시간 투자 판단용으로 사용하지 않습니다.
