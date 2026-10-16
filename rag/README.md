# rag/ — 챗봇 RAG 파이프라인 (PC 에서 색인, 서버는 검색만) · todo 6-14

**역할 분담**: 문서 큐레이션·임베딩·색인·평가는 **PC(Docker Qdrant + rag/.venv)** 에서 하고, 결과는 **Qdrant 스냅샷** 한 파일로
st 서버(`stock-kms-portal-qdrant-1`)에 복원한다. 서버는 질의 임베딩·어휘 토큰화·리랭크만 하므로 운영 서버(평균 CPU 45%, 크레딧 0)에
색인 부하를 주지 않는다. 실시간 데이터(잔고·시세·주문)는 RAG 가 아니라 Lambda 도구 호출 영역이다.

## 구성
| 경로 | 역할 |
|---|---|
| `docs/{faq,market,service}/*.md` | 큐레이션 문서. front matter(title·category·updated) + `## 소제목` 단위가 한 청크. **사실 검증된 내용만**(동시호가 08:30~09:00 등) |
| `common.py` | 규약: 컬렉션 `chatbot_docs`, dense=MiniLM 다국어 384(`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`), 어휘 희소 벡터 `lex`, 청크 분할, 리랭커(`jinaai/jina-reranker-v2-base-multilingual`) |
| `../app/services/lexical.py` | 한글 문자 bigram BM25 희소 벡터(표준 라이브러리). 인덱서와 서버가 같은 파일을 쓴다 |
| `indexer.py` | docs → 청크 → dense 임베딩 + BM25 희소 → 로컬 Qdrant 업서트(멱등). `--recreate`(벡터 구성 변경 시) `--prune`(삭제된 청크 정리) `--dry-run` |
| `search.py` | 로컬 검색 확인. 서버 `app/api/routes/rag_search.py` 와 같은 알고리즘 |
| `eval/queries.jsonl` · `eval/run_eval.py` | 관련 질의(기대 문서)·무관 질의 세트와 평가. 문서를 고치면 반드시 다시 돌린다 |
| `eval/experiment*.py` | 모델·텍스트 구성·채널 조합 비교 실험(2026-10-16 결과는 아래) |
| `compose.yml` | 로컬 Qdrant v1.15.1(서버와 같은 버전 — 스냅샷 호환) |
| `export_snapshot.sh` | 로컬 컬렉션 스냅샷 → `snapshots/` (gitignore) |
| `../deploy/st-iv/deploy-rag.sh` | 서버 api 이미지 재빌드(검색 라우트·fastembed·모델 베이크) — 사용자 실행 |
| `../deploy/st-iv/restore-rag-snapshot.sh <snapshot>` | 스냅샷을 st Qdrant 에 복원 — 사용자 실행 |

## 검색 알고리즘(왜 이렇게 했나)
dense top-4 ∪ 어휘 top-6 후보 → 리랭커 점수(로짓)로 정렬 → `RAG_RERANK_MIN`(-1.0) 미만 제거 → 상위 limit.
2026-10-16 평가(관련 21·무관 4 질의, 40 청크):
- dense(MiniLM)만: hit@3 17/20, 관련 1위 최저 0.44 vs 무관 1위 최고 0.57 → **임계값으로 구분 불가**(환각의 원인 구조)
- 어휘(bigram BM25)만: hit@3 19/20 — "호가 단위"·"PER"·"캡처하기" 처럼 dense 가 15~21위로 놓치는 전문용어를 1위로 잡는다
- RRF 융합: 한쪽 채널에만 잡히는 문서가 밀려 17/20 → **합집합 후보**로 바꿈
- 합집합 + 리랭크: **hit@3 20/20**, 무관 질의 리랭크 점수 ≤ -1.6(임계값 -1.0 에서 모두 거절), 관련 최저 -0.96
- 큰 dense 모델(mpnet 768)은 hit@3 18/20 이지만 구분력은 더 나빠 채택하지 않음. 임베딩 텍스트에 문서 제목을 붙이면 14/20 로 하락 → 소제목+본문만 사용

## 실행
```bash
docker compose -p kms-rag -f rag/compose.yml up -d           # 로컬 Qdrant
uv venv rag/.venv -p 3.11 && uv pip install -p rag/.venv/bin/python -r rag/requirements.txt
rag/.venv/bin/python rag/indexer.py --prune                  # 색인(첫 실행 시 모델 0.22GB 다운로드)
rag/.venv/bin/python rag/eval/run_eval.py                    # 20/20 · 무관 거절 확인(리랭커 1.1GB 다운로드)
rag/.venv/bin/python rag/search.py "매도 대금 언제 들어와"
bash rag/export_snapshot.sh                                  # → rag/snapshots/chatbot_docs-*.snapshot
bash deploy/st-iv/deploy-rag.sh                              # (1회·코드 변경 시) 서버 api 재빌드
bash deploy/st-iv/restore-rag-snapshot.sh rag/snapshots/chatbot_docs-*.snapshot
curl "https://iv.edumgt.co.kr/api/rag/search?q=매도%20대금%20언제%20들어와&limit=2"
```
문서를 바꾸는 루프: docs 수정 → `indexer.py --prune` → `run_eval.py`(필요하면 queries.jsonl 에 질의 추가) → `export_snapshot.sh` → `restore-rag-snapshot.sh`.

## 서버 자원
api 이미지에 MiniLM(0.22GB)+리랭커(1.1GB)를 굽는다(+약 1.4GB, st 디스크 여유 16GB). 리랭크는 질의당 후보 ≤10쌍, PC(16스레드) 1.0~1.3초 → st(2 vCPU) 수 초 예상. 메모리는 api 컨테이너 +약 1.5GB(st 가용 5.5GB).
