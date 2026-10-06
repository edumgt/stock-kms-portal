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

## 7. 사용자 의사결정 필요 항목

| # | 결정할 것 | 선택지와 영향 | 에이전트 권고 |
|---|-----------|---------------|---------------|
| K1 | 배포 대상 서버·compose 방식 | 현재 `cd.yml` 은 `-p domain-rag-lab -f docker-compose.prod.yml`(자체 Caddy 80/443). ① fd 서버(43.201.229.188)에 올리면 pr 스택(프로젝트명 `domain-rag-lab`)과 **충돌**. ② st 서버(43.202.161.134)는 nginx+certbot·에이전트 SSH 불가·50GB. ③ 별도 EC2 | fd 서버 + pr-edumgt 방식(`deploy/<name>/compose.yml`, 호스트 포트 없음, shared-net alias, Caddy 블록 추가, `-p stock-kms-portal`). 결정 후 `EC2_HOST`/`EC2_APP_DIR` 등록·`cd.yml` compose 명령 교체 |
| K2 | 레거시 `/api/*` 프록시 대상 investment-backend(MongoDB 필요) | 컨테이너 정의 없음 → 별도 compose 작성 vs 해당 메뉴 제거 | 과제 범위면 제거, 운영이면 compose 추가 |
| K3 | 새 호스트명 DNS | 미등록. 도메인 결정 필요 | fd Caddy 블록 추가 시점에 A 레코드 등록 |
| K4 | domain-rag-lab 변경 추적 | 포크 이후 upstream 과 분기(`lean_reference_data` 등 누락). 주기적 머지 vs 독립 | 통합 포털 목적이면 독립, LEAN 기능 쓰면 `lean_reference_data` 만 가져오기 |
| K5 | 변경분 커밋 | 6-1 변경 4경로 미커밋 | 기능 단위 커밋 |

## 8. 운영 배포

| 항목 | 상태(2026-10-06) |
|------|------|
| origin/main | `25d97ba` (Enhance lesson page styles…, 2026-09-22). 10-06 fetch/pull 로컬=원격 |
| 로컬 미커밋 | `cd.yml`(헬스체크 `--retry-connrefused`), `todo.md`(신규), `test.md`(작업 메모 → todo.md 이동). 에이전트 커밋·푸시는 분류기 거부 → 사용자 수행 |
| 워크플로 | `CI — Lint & Test` dfaa7e1 성공. `CD — Deploy to EC2` dfaa7e1(사용자 푸시) 는 `EC2_HOST` 비어 있어 ssh-keyscan 단계에서 **의도대로 실패**(배포 안 함). ECR disable·파일 삭제 완료(a8c9b8c). 10-06 추가 수정(미커밋): 헬스체크 curl 에 `--retry-connrefused`(domain-rag-lab 과 동일 원인 선반영) |
| 배포 서버 | **없음**. K1 결정 전까지 미배포 |
| 참고 | 2026-10-02 판단(메모리/domain-rag-lab 8절): fd 권고, st 부적합 |
