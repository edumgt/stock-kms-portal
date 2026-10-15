#!/usr/bin/env bash
# 정적 파일(frontend/*)만 빠르게 반영: 호스트 /opt/stock-kms-portal 사본 갱신 → 실행 중인 api 컨테이너에 docker cp (이미지 재빌드·재기동 없음, 즉시 서빙).
# 코드(app/)·requirements 가 바뀌었을 때는 쓰지 말고 deploy-lex.sh(이미지 재빌드)를 쓴다. 다음 이미지 재빌드 때 같은 파일이 다시 구워지므로 git 에도 반드시 남긴다.
#   bash deploy/st-iv/deploy-static.sh                                  # 기본: index.html style.css chatbot.js
#   FILES="frontend/style.css" bash deploy/st-iv/deploy-static.sh       # 특정 파일만
set -euo pipefail
cd "$(dirname "$0")/../.."
K=../stock-coin-trade/pr-test.pem; H=ubuntu@43.202.161.134; C=stock-kms-portal-api-1
FILES="${FILES:-frontend/index.html frontend/style.css frontend/chatbot.js}"
for f in $FILES; do [ -f "$f" ] || { echo "없는 파일: $f"; exit 1; }; done
tar czf - $FILES | ssh -i "$K" -o StrictHostKeyChecking=no "$H" "
  set -e; cd /opt/stock-kms-portal && tar xzf - && echo 'host source updated'
  for f in $FILES; do sudo -n docker cp \"\$f\" $C:/app/\"\$f\" && echo \"container updated: \$f\"; done
  for f in $FILES; do sudo -n docker exec $C ls -la /app/\"\$f\"; done
"
echo "== live check"
curl -s -m 10 https://iv.edumgt.co.kr/ | grep -o 'style.css?v=[^"]*\|chatbot.js?v=[^"]*' || true
curl -s -m 10 https://iv.edumgt.co.kr/static/style.css | grep -o '#screenCaptureFab.screen-capture-fab {[^}]*}' | head -1 || true
echo "done. 브라우저에서 강력 새로고침(Ctrl+Shift+R) 후 캡처 버튼이 좌측 하단인지 확인"
