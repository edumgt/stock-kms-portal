#!/usr/bin/env bash
# 6-11 마무리 한 번에: ② Lambda 생성 + DRAFT(Built) 발행 + 운영 별칭 + 스모크 → ③ st 인스턴스 IAM 권한 + iv 포털 반영 → ④ (선택) 버지니아 옛 봇 삭제.
# stock-kms-portal 루트에서:  bash lex/scripts/finish.sh                  # ②+③
#                            DELETE_OLD_BOT=1 bash lex/scripts/finish.sh   # iv 화면 확인이 끝났으면 ④ 까지
# 전제: secrets/lex-gateway-api-key(issue-gateway-key.sh 로 발급) · 관리자 AWS 자격증명 · ../stock-coin-trade/pr-test.pem
#       (선택) secrets/anthropic-api-key — 있으면 FallbackIntent 를 Claude 도구 호출로 답한다(6-15). 없으면 명령 안내문.
set -euo pipefail
cd "$(dirname "$0")/../.."
export LEX_REGION="${LEX_REGION:-ap-northeast-2}" LEX_BOT_ID="${LEX_BOT_ID:-ZMCZPNJA6U}"
export GATEWAY_API_KEY="${GATEWAY_API_KEY:-$(cat secrets/lex-gateway-api-key)}"
export PUBLISH_ONLY="${PUBLISH_ONLY-1}"      # 기본 1: DRAFT 그대로 발행(재빌드 생략). 인텐트·슬롯을 고쳤으면 `PUBLISH_ONLY= bash lex/scripts/finish.sh` 로 비워 재빌드(약 25분)

echo "### ② Lambda + 버전 발행 + 별칭 + 스모크"
OUT=$(bash lex/scripts/deploy.sh | tee /dev/stderr)
eval "$(echo "$OUT" | grep '^export LEX_' | tail -1)"; export LEX_BOT_ID LEX_BOT_ALIAS_ID
# export 줄을 못 받았으면 운영 별칭 이름으로 조회
[ -n "${LEX_BOT_ALIAS_ID:-}" ] || LEX_BOT_ALIAS_ID=$(aws lexv2-models list-bot-aliases --region "$LEX_REGION" --bot-id "$LEX_BOT_ID" \
  --query "botAliasSummaries[?botAliasName=='investment-analysis-prod'].botAliasId | [0]" --output text 2>/dev/null | grep -v '^None$' || true)
export LEX_BOT_ALIAS_ID
[ -n "${LEX_BOT_ALIAS_ID:-}" ] || { echo "별칭 ID 를 얻지 못했습니다. 위 출력을 확인하세요."; exit 1; }

echo "### ③ st 인스턴스 역할 권한 + iv 포털 반영 (bot $LEX_BOT_ID alias $LEX_BOT_ALIAS_ID)"
bash deploy/st-iv/deploy-lex.sh --iam
bash deploy/st-iv/deploy-lex.sh

if [ "${DELETE_OLD_BOT:-}" = "1" ]; then
  echo "### ④ 버지니아 옛 봇 삭제"
  bash lex/scripts/deploy.sh --delete-virginia
else
  echo "iv.edumgt.co.kr 우측 하단 「AI 투자 도우미」 확인 후:  DELETE_OLD_BOT=1 bash lex/scripts/deploy.sh --delete-virginia"
fi
