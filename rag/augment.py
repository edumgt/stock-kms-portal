"""로컬 LLM(Docker Ollama, PC 16스레드)으로 Lex 발화 후보와 RAG 평가 질의를 생성한다 — "학습 → 인텐트 반영 → 대화검증" 루프의 학습(데이터 생성) 단계 (6-16).

  lex/.venv/bin/python rag/augment.py --what utterances        # 인텐트별 발화 후보 → rag/out/utterances_<날짜>.json (사용자 검토 후 build_bot.py 에 반영)
  lex/.venv/bin/python rag/augment.py --what queries           # 문서 청크별 사용자 질문 → rag/eval/generated_queries.jsonl (run_eval.py --queries 로 평가)
  lex/.venv/bin/python rag/augment.py --what all --model qwen2.5:7b --per-intent 15 --per-chunk 3
API 비용 0, 운영 서버 부하 0. 생성물은 초안이다 — 발화는 사람이 고르고, 질의는 검색 평가에 그대로 쓴다(틀린 기대 문서는 평가에서 드러난다).
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "rag"))
from common import load_docs  # noqa: E402

OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
THREADS = int(os.environ.get("LLM_THREADS", str(os.cpu_count() or 8)))
SLOTS = {"{Ticker}", "{Side}", "{Quantity}", "{OrderType}", "{Price}", "{OrderNo}", "{Currency}"}


def chat(model: str, prompt: str, num_predict: int = 400, timeout: int = 600) -> str:
    body = {"model": model, "stream": False, "messages": [{"role": "user", "content": prompt}],
            "options": {"num_thread": THREADS, "num_ctx": 4096, "num_predict": num_predict, "temperature": 0.8, "top_p": 0.95}, "keep_alive": "30m"}
    req = urllib.request.Request(f"{OLLAMA}/api/chat", data=json.dumps(body, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode()).get("message", {}).get("content", "")


def lines_of(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        s = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip().strip('"“”\'')
        s = re.sub(r"\s+", " ", s)
        braces_ok = all(m in SLOTS for m in re.findall(r"\{[^{}]*\}", s)) and s.count("{") == s.count("}")   # 슬롯 표기({Ticker})만 허용
        if 2 <= len(s) <= 60 and not s.endswith(":") and braces_ok:
            out.append(s)
    return out


def intent_specs() -> list[dict]:
    spec = importlib.util.spec_from_file_location("build_bot", ROOT / "lex" / "scripts" / "build_bot.py")
    bb = importlib.util.module_from_spec(spec); spec.loader.exec_module(bb)
    ids = {s["slotTypeName"]: "X" for s in bb.slot_type_defs()}
    return bb.intent_defs(ids)


def gen_utterances(model: str, per_intent: int, out_dir: Path) -> Path:
    result = {"model": model, "generated": dt.datetime.now().isoformat(timespec="seconds"), "intents": {}}
    for d in intent_specs():
        name = d["intentName"]; desc = d.get("description", "")
        samples = [u["utterance"] for u in d["sampleUtterances"]]
        shown = "\n".join(f"- {s}" for s in samples[:25])
        prompt = (f"당신은 한국 주식 챗봇의 발화 데이터를 만드는 사람입니다. 인텐트 '{name}' ({desc}).\n기존 예시 발화:\n{shown}\n\n"
                  f"위와 같은 뜻으로 실제 사용자가 챗봇에 칠 법한 **새로운** 한국어 발화 {per_intent}개를 만드세요. 조건: 구어체·반말·존댓말 섞기, 오타 없이, "
                  f"기존 예시와 겹치지 않게, 한 줄에 하나, 번호나 설명 없이 발화만. 중괄호 슬롯 표기({{Ticker}} 등)는 기존 예시에 있을 때만 같은 이름으로 쓰세요.")
        t0 = time.time()
        try:
            text = chat(model, prompt, num_predict=60 * per_intent)
        except Exception as exc:  # noqa: BLE001
            print(f"  {name}: 실패 {exc}"); continue
        existing = {s.replace(" ", "") for s in samples}
        cands = [c for c in dict.fromkeys(lines_of(text)) if c.replace(" ", "") not in existing]
        result["intents"][name] = {"existing": len(samples), "candidates": cands}
        print(f"  {name}: 후보 {len(cands)}개 ({time.time() - t0:.0f}s)", flush=True)
    path = out_dir / f"utterances_{dt.date.today():%Y%m%d}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


def gen_queries(model: str, per_chunk: int, out_path: Path) -> Path:
    chunks = load_docs(ROOT / "rag" / "docs")
    rows = []
    for c in chunks:
        prompt = (f"다음은 주식 투자 챗봇 안내 문서의 한 부분입니다.\n제목: {c.title} / 소제목: {c.section}\n내용: {c.content}\n\n"
                  f"이 내용을 알고 싶은 사용자가 챗봇에 실제로 칠 법한 짧은 한국어 질문 {per_chunk}개를 만드세요. 문서의 단어를 그대로 베끼지 말고 "
                  f"일상 표현으로 바꾸세요(예: '매도 대금 언제 들어와?'). 한 줄에 하나, 번호·설명 없이.")
        t0 = time.time()
        try:
            text = chat(model, prompt, num_predict=50 * per_chunk)
        except Exception as exc:  # noqa: BLE001
            print(f"  {c.chunk_id}: 실패 {exc}"); continue
        qs = list(dict.fromkeys(lines_of(text)))[:per_chunk]
        rows += [{"query": q, "expect_doc": [c.doc_id], "chunk": c.chunk_id, "generated_by": model} for q in qs]
        print(f"  {c.chunk_id}: {len(qs)}개 ({time.time() - t0:.0f}s)", flush=True)
    out_path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--what", choices=["utterances", "queries", "all"], default="all")
    ap.add_argument("--model", default=os.environ.get("LLM_LOCAL_MODEL", "qwen2.5:7b"))
    ap.add_argument("--per-intent", type=int, default=15); ap.add_argument("--per-chunk", type=int, default=3)
    a = ap.parse_args()
    print(f"ollama={OLLAMA} model={a.model} threads={THREADS}")
    out_dir = ROOT / "rag" / "out"; out_dir.mkdir(exist_ok=True)
    t0 = time.time()
    if a.what in ("utterances", "all"):
        print("→", gen_utterances(a.model, a.per_intent, out_dir))
    if a.what in ("queries", "all"):
        print("→", gen_queries(a.model, a.per_chunk, ROOT / "rag" / "eval" / "generated_queries.jsonl"))
    print(f"done in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
