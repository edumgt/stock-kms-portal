#!/usr/bin/env bash
# 6-9/6-11 배포(서울 리전, 봇 ID 는 환경변수): iv.edumgt.co.kr 우측 「AI 투자 도우미」(Amazon Lex V2) 복구 — Lex 라우터를 포털 앱으로 이식(app/api/routes/lex.py).
# stock-kms-portal 루트에서 실행. 순서: ① IAM 권한(1회, --iam) → ② 서버 소스 갱신 + .env.prod 에 LEX_* 추가 → ③ api 이미지 재빌드·재기동 → ④ 확인.
# 서버 /opt/stock-kms-portal 은 git 이 아닌 소스 복사본이라 바뀐 파일만 tar 로 올린다. requirements.txt 에 boto3 가 추가돼 이미지 재빌드가 필요하다.
set -euo pipefail
cd "$(dirname "$0")/../.."
K=../stock-coin-trade/pr-test.pem; H=ubuntu@43.202.161.134
REGION="${LEX_REGION:-ap-northeast-2}"; BOT_ID="${LEX_BOT_ID:?LEX_BOT_ID=<서울 봇 ID> (lex/scripts/deploy.sh 출력)}"; ALIAS_ID="${LEX_BOT_ALIAS_ID:?LEX_BOT_ALIAS_ID=<별칭 ID>}"
# 정책 JSON 은 봇/별칭에 맞춰 실행 시 생성(운영 별칭 한 개에만 lex:RecognizeText)
cat > deploy/st-iv/lex-policy.json <<JSON
{"Version": "2012-10-17", "Statement": [{"Sid": "InvestmentAssistantLexRecognizeText", "Effect": "Allow", "Action": ["lex:RecognizeText"],
  "Resource": "arn:aws:lex:$REGION:086015456585:bot-alias/$BOT_ID/$ALIAS_ID"}]}
JSON

if [ "${1:-}" = "--iam" ]; then
  # ① st EC2 인스턴스 역할(StockCoinTradeSecretsReadRole)에 운영 별칭 한정 lex:RecognizeText 허용(추가 전용, 기존 정책 불변). 관리자 자격증명으로 1회.
  aws iam put-role-policy --role-name StockCoinTradeSecretsReadRole --policy-name InvestmentAssistantLexRecognizeText \
    --policy-document file://deploy/st-iv/lex-policy.json && echo "IAM inline policy attached"
  aws iam list-role-policies --role-name StockCoinTradeSecretsReadRole --output text
  exit 0
fi

FILES="app/api/routes/lex.py app/main.py requirements.txt tests/test_lex.py deploy/st-iv/deploy-lex.sh deploy/st-iv/lex-policy.json"
tar czf - $FILES | ssh -i "$K" -o StrictHostKeyChecking=no "$H" "
  set -e; cd /opt/stock-kms-portal && tar xzf - && echo 'host source updated'
  # ② .env.prod 에 Lex 설정(없을 때만 추가). 자격증명은 넣지 않는다 — 컨테이너가 EC2 인스턴스 역할(IMDS)로 받는다.
  for kv in LEX_REGION=$REGION LEX_BOT_ID=$BOT_ID LEX_BOT_ALIAS_ID=$ALIAS_ID LEX_LOCALE_ID=ko_KR; do
    k=\${kv%%=*}; if grep -q \"^\$k=\" .env.prod; then sed -i \"s|^\$k=.*|\$kv|\" .env.prod; else echo \"\$kv\" >> .env.prod; fi
  done; grep -E '^LEX_' .env.prod
  # ③ api 만 재빌드·재기동 (postgres/redis/qdrant 는 그대로)
  sudo -n docker compose -p stock-kms-portal -f deploy/st-iv/compose.yml build api
  sudo -n docker compose -p stock-kms-portal -f deploy/st-iv/compose.yml up -d --no-deps api
  sleep 20
  sudo -n docker exec stock-kms-portal-api-1 python -c 'import boto3; print(\"boto3\", boto3.__version__)'
  sudo -n docker logs --since 60s stock-kms-portal-api-1 2>&1 | grep -iE 'traceback|error' | tail -5 || true
"
# ④ 공개 주소로 확인: status 는 configured:true, chat 은 intent 와 메시지가 와야 한다
echo "== status"; curl -s -m 10 https://iv.edumgt.co.kr/api/lex/status; echo
echo "== chat";   curl -s -m 15 -H 'Content-Type: application/json' -d '{"message":"포트폴리오를 어떻게 구성해","session_id":"deploy-check-'"$(date +%s)"'"}' https://iv.edumgt.co.kr/api/lex/chat; echo
echo "done. 화면: https://iv.edumgt.co.kr (우측 하단 AI 투자 도우미)"
