#!/usr/bin/env bash
# 6-10: Lex 코드 훅 Lambda 용 stock-coin-trade Open API 키 발급(운영자). stock-kms-portal 루트에서 실행.
# 키 원문은 로컬 secrets/lex-gateway-api-key(600, git 제외)에만 남기고 서버 MariaDB(mockinv.api_key)에는 SHA-256 해시만 넣는다.
# scopes 는 셀프 발급 API 가 없어 DB 에서만 부여(kis_autotrade.require_scope: 'kis:order'). 기존 lumina 키(id=1, member 1)와 분리.
set -euo pipefail
cd "$(dirname "$0")/../.."
K=../stock-coin-trade/pr-test.pem; H=ubuntu@43.202.161.134
LABEL="${1:-iv-lex-trade-hook}"; MEMBER_ID="${MEMBER_ID:-1}"
mkdir -p secrets
RAW="eduapi_live_$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
HASH=$(printf "%s" "$RAW" | sha256sum | cut -d' ' -f1); PREFIX=${RAW:0:16}
ssh -i "$K" -o StrictHostKeyChecking=no "$H" "sudo -n docker exec -i crypto-mock-mariadb sh -c 'mariadb -u\$MARIADB_USER -p\$MARIADB_PASSWORD \$MARIADB_DATABASE 2>&1 | grep -v Warning'" <<SQL
INSERT INTO api_key (member_id, label, key_prefix, key_hash, is_active, scopes) VALUES ($MEMBER_ID, '$LABEL', '$PREFIX', '$HASH', 1, 'kis:order kis:read');
SELECT api_key_id, member_id, label, key_prefix, is_active, scopes, created_at FROM api_key ORDER BY api_key_id;
SQL
umask 077; printf "%s\n" "$RAW" > secrets/lex-gateway-api-key
echo "발급 완료: prefix $PREFIX · 원문은 secrets/lex-gateway-api-key (이 파일만 보관, 저장소에 넣지 말 것)"
echo "다음: GATEWAY_API_KEY=\$(cat secrets/lex-gateway-api-key) bash lex/scripts/deploy.sh"
