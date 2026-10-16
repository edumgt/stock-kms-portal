#!/usr/bin/env bash
# 14b 수신이 끝나면 발화·질의 생성을 14b 로 돌린다(6-16). 로그: rag/out/augment.log
cd "$(dirname "$0")/.."
for i in $(seq 1 360); do docker exec kms-rag-ollama-1 ollama list 2>/dev/null | grep -q "qwen2.5:14b" && break; sleep 10; done
docker exec kms-rag-ollama-1 ollama list | grep -q "qwen2.5:14b" || { echo "14b 수신 실패/시간 초과"; exit 1; }
LLM_LOCAL_MODEL=qwen2.5:14b bash rag/run_augment.sh all
PID=$(pgrep -f "rag/augment.py" | head -1); while [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; do sleep 30; done
echo "=== augment(14b) finished $(date +%H:%M) ==="; tail -n 25 rag/out/augment.log; wc -l rag/eval/generated_queries.jsonl
