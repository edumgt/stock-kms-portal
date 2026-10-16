#!/usr/bin/env bash
# 로컬 Qdrant 의 chatbot_docs 스냅샷을 만들어 rag/snapshots/ 로 내려받는다. 서버 복원은 deploy/st-iv/restore-rag-snapshot.sh.
set -euo pipefail
cd "$(dirname "$0")"
URL="${RAG_QDRANT_URL:-http://127.0.0.1:6333}"; COL="${RAG_COLLECTION:-chatbot_docs}"
NAME=$(curl -sf -X POST "$URL/collections/$COL/snapshots" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["name"])')
mkdir -p snapshots
curl -sf -o "snapshots/$NAME" "$URL/collections/$COL/snapshots/$NAME"
COUNT=$(curl -sf "$URL/collections/$COL" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["points_count"])')
echo "snapshot: rag/snapshots/$NAME ($(stat -c %s "snapshots/$NAME") bytes, points=$COUNT)"
echo "서버 복원: bash deploy/st-iv/restore-rag-snapshot.sh rag/snapshots/$NAME"
