#!/usr/bin/env bash
# 6-10/6-11 배포(서울 리전): Lex 봇 생성·갱신 + 코드 훅 Lambda. stock-kms-portal 루트에서 실행. 관리자 AWS 자격증명 필요.
#   GATEWAY_API_KEY=sk_... bash lex/scripts/deploy.sh                 # ① 서울에 봇 없으면 생성(+기본 인텐트) ② Lambda 생성/갱신 ③ Lex 호출 권한 ④ 거래 인텐트·빌드·버전·별칭 훅 ⑤ 스모크
#   LEX_BOT_ID=... LEX_BOT_ALIAS_ID=... GATEWAY_API_KEY=... bash lex/scripts/deploy.sh   # 이미 만든 봇 갱신
#   PUBLISH_ONLY=1 LEX_BOT_ID=... GATEWAY_API_KEY=... bash lex/scripts/deploy.sh      # DRAFT 가 이미 Built 면 재빌드 없이 발행만(약 1~2분)
#   DELETE_OLD_BOT=1 bash lex/scripts/deploy.sh --delete-virginia      # 서울 전환 확인 후 옛 버지니아 봇(us-east-1 SE3NCP7NMP) 삭제
# GATEWAY_API_KEY 는 st.edumgt.co.kr 회원 → API 키에서 발급(scopes "kis:order kis:read" 는 운영자가 DB 에서 부여). lumina 전용 키(id=2)와 분리 권장.
set -euo pipefail
cd "$(dirname "$0")/../.."
export LEX_REGION="${LEX_REGION:-ap-northeast-2}"
REGION=$LEX_REGION; FN=iv-lex-trade-hook; ACCOUNT=086015456585
ROLE_ARN="${LAMBDA_ROLE_ARN:-arn:aws:iam::$ACCOUNT:role/chatbot-api-lambda-role}"   # lambda.amazonaws.com 신뢰 + 기본 실행 정책(기존 역할 재사용)
# boto3 가 있는 파이썬 선택: PYTHON 환경변수 → 시스템 python3 → lumina venv → lex/.venv(없으면 만들고 boto3 설치)
pick_python() {
  for c in "${PYTHON:-}" python3 /home/ubuntu/lumina-invest/.venv/bin/python lex/.venv/bin/python; do
    [ -n "$c" ] && [ -x "$(command -v "$c" 2>/dev/null || echo "$c")" ] && "$c" -c "import boto3" 2>/dev/null && { echo "$c"; return; }
  done
  python3 -m venv lex/.venv >&2 && lex/.venv/bin/pip install -q boto3 >&2 && echo lex/.venv/bin/python
}
PY=$(pick_python); [ -n "$PY" ] || { echo "boto3 가 있는 파이썬을 찾지 못했습니다(pip install boto3)"; exit 1; }
echo "python: $PY ($($PY -c 'import boto3; print("boto3", boto3.__version__)'))"

if [ "${1:-}" = "--delete-virginia" ]; then
  [ "${DELETE_OLD_BOT:-}" = "1" ] || { echo "DELETE_OLD_BOT=1 을 함께 주세요(되돌릴 수 없음)"; exit 1; }
  $PY -u lex/scripts/build_bot.py --delete-bot us-east-1 SE3NCP7NMP
  aws lambda delete-function --region us-east-1 --function-name $FN 2>/dev/null && echo "deleted lambda $FN in us-east-1" || true
  exit 0
fi

: "${GATEWAY_API_KEY:?GATEWAY_API_KEY=<stock-coin-trade Open API 키> 를 환경변수로 주세요}"
GATEWAY_BASE="${GATEWAY_BASE:-https://st.edumgt.co.kr}"; MAX_ORDER_QTY="${MAX_ORDER_QTY:-100}"; MAX_ORDER_AMOUNT="${MAX_ORDER_AMOUNT:-5000000}"

# ① 봇(없으면 생성 + 기본 인텐트). 별칭은 ④ 에서 버전 발행 뒤 만들어진다.
if [ -z "${LEX_BOT_ID:-}" ]; then
  OUT=$($PY -u lex/scripts/build_bot.py --create-bot --skip-build | tee /dev/stderr)   # 빌드는 ③ 에서 한 번만
  eval "$(echo "$OUT" | grep '^export LEX_')"; export LEX_BOT_ID
fi
echo "bot: $LEX_REGION $LEX_BOT_ID"

# ② Lambda
ZIP=$(mktemp -d)/trade_hook.zip
$PY - "$ZIP" <<'PYZIP'    # zip 명령 없이 파이썬으로 패키징 (handler.py + tickers.json, 최상위에 배치)
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for name in ("handler.py", "tickers.json"):
        z.write(f"lex/lambda/trade_hook/{name}", name)
PYZIP
echo "packaged: $ZIP ($(stat -c %s "$ZIP") bytes)"
ENV="Variables={GATEWAY_BASE=$GATEWAY_BASE,GATEWAY_API_KEY=$GATEWAY_API_KEY,MAX_ORDER_QTY=$MAX_ORDER_QTY,MAX_ORDER_AMOUNT=$MAX_ORDER_AMOUNT}"
if aws lambda get-function --region $REGION --function-name $FN >/dev/null 2>&1; then
  aws lambda update-function-code --region $REGION --function-name $FN --zip-file "fileb://$ZIP" >/dev/null
  aws lambda wait function-updated --region $REGION --function-name $FN
  aws lambda update-function-configuration --region $REGION --function-name $FN --environment "$ENV" --timeout 30 >/dev/null
  echo "lambda updated: $FN ($REGION)"
else
  aws lambda create-function --region $REGION --function-name $FN --runtime python3.12 --handler handler.handler --role "$ROLE_ARN" \
    --zip-file "fileb://$ZIP" --timeout 30 --memory-size 256 --environment "$ENV" --description "iv.edumgt.co.kr Lex 코드 훅: 주식 대화 → KIS 모의 주문(stock-coin-trade 게이트웨이)" >/dev/null
  echo "lambda created: $FN ($REGION)"
fi
aws lambda wait function-updated --region $REGION --function-name $FN
ARN=$(aws lambda get-function --region $REGION --function-name $FN --query 'Configuration.FunctionArn' --output text)

# ③ 거래 인텐트·빌드 → 버전 발행 → 운영 별칭 생성/갱신(새 버전 + 코드 훅). 끝에 export 줄을 찍는다.
# PUBLISH_ONLY=1 이면 인텐트 갱신·재빌드(약 25분)를 건너뛰고 Built 상태의 DRAFT 를 그대로 발행한다(인텐트·슬롯 정의를 바꾸지 않았을 때).
OUT=$($PY -u lex/scripts/build_bot.py --lambda-arn "$ARN" ${LEX_BOT_ALIAS_ID:+--alias-id "$LEX_BOT_ALIAS_ID"} ${PUBLISH_ONLY:+--publish-only} | tee /dev/stderr)
eval "$(echo "$OUT" | grep '^export LEX_')"; export LEX_BOT_ID LEX_BOT_ALIAS_ID
echo "bot: $LEX_REGION $LEX_BOT_ID alias $LEX_BOT_ALIAS_ID"

# ④ 이 봇 별칭만 Lambda 를 부를 수 있게 (별칭이 생긴 뒤에 걸어야 source-arn 이 맞는다)
aws lambda add-permission --region $REGION --function-name $FN --statement-id "lex-alias-$LEX_BOT_ALIAS_ID" --action lambda:InvokeFunction \
  --principal lexv2.amazonaws.com --source-arn "arn:aws:lex:$REGION:$ACCOUNT:bot-alias/$LEX_BOT_ID/$LEX_BOT_ALIAS_ID" >/dev/null 2>&1 || echo "(lex invoke permission already present)"

# ⑤ 스모크: 기본 인텐트 1회 + 슬롯 필링 → 확인 프롬프트까지 (주문은 보내지 않는다: '아니오')
S="deploy-smoke-$(date +%s)"
for t in "포트폴리오를 어떻게 구성해" "삼성전자 1주 시장가 매수" "아니오"; do
  echo "> $t"; aws lexv2-runtime recognize-text --region $REGION --bot-id $LEX_BOT_ID --bot-alias-id $LEX_BOT_ALIAS_ID --locale-id ko_KR --session-id "$S" --text "$t" \
    --query '{intent:sessionState.intent.name,action:sessionState.dialogAction.type,slot:sessionState.dialogAction.slotToElicit,msg:messages[0].content}' --output json; done
cat <<MSG
done. 다음 단계:
  1) 포털 .env.prod / 인스턴스 역할 정책: LEX_REGION=$REGION LEX_BOT_ID=$LEX_BOT_ID LEX_BOT_ALIAS_ID=$LEX_BOT_ALIAS_ID 로
     LEX_REGION=$REGION LEX_BOT_ID=$LEX_BOT_ID LEX_BOT_ALIAS_ID=$LEX_BOT_ALIAS_ID bash deploy/st-iv/deploy-lex.sh --iam && bash deploy/st-iv/deploy-lex.sh
  2) iv.edumgt.co.kr 에서 확인 후 옛 버지니아 봇 삭제: DELETE_OLD_BOT=1 bash lex/scripts/deploy.sh --delete-virginia
MSG
