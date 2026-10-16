#!/usr/bin/env bash
# PC 자원으로 발화·질의 생성(6-16)을 백그라운드로 돌린다. 메모리에 맞는 로컬 모델을 고른다(14b ≥ 11GB, 7b ≥ 6GB, 그 외 3b).
#   bash rag/run_augment.sh [all|utterances|queries]      # 로그: rag/out/augment.log, 끝나면 터미널 벨
set -euo pipefail
cd "$(dirname "$0")/.."
AVAIL_MB=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
if [ -n "${LLM_LOCAL_MODEL:-}" ]; then MODEL=$LLM_LOCAL_MODEL
elif [ "$AVAIL_MB" -ge 11000 ]; then MODEL=qwen2.5:14b
elif [ "$AVAIL_MB" -ge 6000 ]; then MODEL=qwen2.5:7b
else MODEL=qwen2.5:3b; fi
docker exec kms-rag-ollama-1 ollama list | grep -q "^${MODEL}" || { echo "모델 $MODEL 이 없어 받습니다"; docker exec kms-rag-ollama-1 ollama pull "$MODEL" >/dev/null; }
echo "available=${AVAIL_MB}MB model=$MODEL threads=$(nproc) what=${1:-all}" | tee rag/out/augment.log
nohup lex/.venv/bin/python rag/augment.py --what "${1:-all}" --model "$MODEL" >> rag/out/augment.log 2>&1 &
echo "pid $! — 진행: tail -f rag/out/augment.log"
