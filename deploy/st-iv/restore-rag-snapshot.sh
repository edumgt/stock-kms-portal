#!/usr/bin/env bash
# PC 에서 만든 Qdrant 스냅샷(rag/export_snapshot.sh)을 st 서버의 stock-kms-portal-qdrant-1 에 복원한다 (6-14).
#   bash deploy/st-iv/restore-rag-snapshot.sh rag/snapshots/chatbot_docs-....snapshot
# 순서: scp → 호스트 /opt/stock-kms-portal/rag/snapshots/ 보관 → docker cp 로 qdrant 컨테이너 /qdrant/snapshots/ → recover API(api 컨테이너에서 호출) → 건수 확인.
# Qdrant 포트는 호스트에 노출돼 있지 않아 API 호출은 같은 compose 네트워크의 api 컨테이너(python) 안에서 한다.
set -euo pipefail
cd "$(dirname "$0")/../.."
SNAP="${1:?스냅샷 파일 경로를 주세요 (rag/snapshots/*.snapshot)}"; [ -f "$SNAP" ] || { echo "없는 파일: $SNAP"; exit 1; }
K=../stock-coin-trade/pr-test.pem; H=ubuntu@43.202.161.134; Q=stock-kms-portal-qdrant-1; API=stock-kms-portal-api-1
COL="${RAG_COLLECTION:-chatbot_docs}"; NAME=$(basename "$SNAP")
scp -i "$K" -o StrictHostKeyChecking=no "$SNAP" "$H:/tmp/$NAME"
ssh -i "$K" -o StrictHostKeyChecking=no "$H" "
  set -e; mkdir -p /opt/stock-kms-portal/rag/snapshots && mv /tmp/$NAME /opt/stock-kms-portal/rag/snapshots/$NAME
  sudo -n docker exec $Q mkdir -p /qdrant/snapshots/$COL
  sudo -n docker cp /opt/stock-kms-portal/rag/snapshots/$NAME $Q:/qdrant/snapshots/$COL/$NAME
  sudo -n docker exec -i $API python - <<PY
import json, urllib.request
b = 'http://kms-qdrant:6333'
req = urllib.request.Request(b + '/collections/$COL/snapshots/recover', method='PUT', headers={'Content-Type': 'application/json'},
                             data=json.dumps({'location': 'file:///qdrant/snapshots/$COL/$NAME', 'priority': 'snapshot'}).encode())
print('recover:', urllib.request.urlopen(req, timeout=120).read().decode()[:200])
info = json.loads(urllib.request.urlopen(b + '/collections/$COL', timeout=10).read())['result']
print('points:', info['points_count'], 'dim:', info['config']['params']['vectors']['size'], 'status:', info['status'])
PY
"
echo "== live check"; curl -s -m 15 "https://iv.edumgt.co.kr/api/rag/status"; echo
curl -s -m 20 "https://iv.edumgt.co.kr/api/rag/search?q=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("매도 대금 언제 들어와"))')&limit=2" | head -c 600; echo
echo "검색 API 가 404 면 먼저 bash deploy/st-iv/deploy-rag.sh (api 이미지 재빌드) 를 실행"
