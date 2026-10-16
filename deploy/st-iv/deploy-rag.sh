#!/usr/bin/env bash
# 챗봇 RAG 서버 쪽 반영(6-14): 검색 라우트·임베더·requirements(fastembed)·Dockerfile(모델 베이크)·compose env → api 이미지 재빌드·재기동.
#   bash deploy/st-iv/deploy-rag.sh
# 서버 /opt/stock-kms-portal 은 git 이 아닌 소스 복사본이라 바뀐 파일만 tar 로 올린다. 재빌드 중 MiniLM 모델(0.22GB)을 내려받으므로 2~5분 걸린다.
set -euo pipefail
cd "$(dirname "$0")/../.."
K=../stock-coin-trade/pr-test.pem; H=ubuntu@43.202.161.134
FILES="app/api/routes/rag_search.py app/services/embedder.py app/services/lexical.py app/core/config.py app/main.py requirements.txt Dockerfile deploy/st-iv/compose.yml deploy/st-iv/deploy-rag.sh deploy/st-iv/restore-rag-snapshot.sh tests/test_rag_search.py rag/common.py"
for f in $FILES; do [ -f "$f" ] || { echo "없는 파일: $f"; exit 1; }; done
tar czf - $FILES | ssh -i "$K" -o StrictHostKeyChecking=no "$H" "
  set -e; cd /opt/stock-kms-portal && tar xzf - && echo 'host source updated'
  sudo -n docker compose -p stock-kms-portal -f deploy/st-iv/compose.yml build api
  sudo -n docker compose -p stock-kms-portal -f deploy/st-iv/compose.yml up -d --no-deps api
  for i in \$(seq 1 30); do sudo -n docker exec stock-kms-portal-api-1 python -c 'import urllib.request;urllib.request.urlopen(\"http://127.0.0.1:8000/api/rag/status\",timeout=3)' 2>/dev/null && break; sleep 2; done
  sudo -n docker exec stock-kms-portal-api-1 python -c 'import urllib.request;print(urllib.request.urlopen(\"http://127.0.0.1:8000/api/rag/status\",timeout=10).read().decode())'
"
echo "== live"; curl -s -m 15 https://iv.edumgt.co.kr/api/rag/status; echo
echo "다음: bash rag/export_snapshot.sh → bash deploy/st-iv/restore-rag-snapshot.sh rag/snapshots/<file>"
