"""검색 품질 평가: 기대 문서가 top-k 안에 들고(히트), 무관 질문은 임계값 미만이어야(거절) 한다. 점수는 리랭커 점수(로짓).

  rag/.venv/bin/python rag/eval/run_eval.py [--min-score -1.0] [--k 3]
출력: 질의별 1위 점수·문서, 히트율, 무관 질문 거절률, 임계값 후보(관련 질의 최저 1위 점수 vs 무관 질의 최고 점수).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from search import search  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--min-score", type=float, default=-1.0); ap.add_argument("--k", type=int, default=3)
    a = ap.parse_args()
    rows = [json.loads(l) for l in (HERE / "queries.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    hits = rejected = 0; rel_top, irr_top = [], []
    for r in rows:
        res = search(r["query"], limit=a.k, min_score=None)
        top = res[0] if res else None
        docs = [h["doc_id"] for h in res]
        if r["expect_doc"]:
            ok = any(d in r["expect_doc"] for d in docs) and bool(top) and top["score"] >= a.min_score
            hits += ok; rel_top.append(top["score"] if top else 0)
            mark = "✔" if ok else "✘"
        else:
            ok = not top or top["score"] < a.min_score
            rejected += ok; irr_top.append(top["score"] if top else 0)
            mark = "✔" if ok else "✘"
        print(f"{mark} {top['score'] if top else 0:.3f}  {r['query'][:28]:30s} → {top['doc_id'] if top else '-'} / {top['section'] if top else '-'}")
    n_rel = sum(1 for r in rows if r["expect_doc"]); n_irr = len(rows) - n_rel
    print(f"\n관련 질의 히트 {hits}/{n_rel} · 무관 질의 거절 {rejected}/{n_irr} · 임계값 {a.min_score}")
    if rel_top and irr_top:
        print(f"관련 1위 점수 최저 {min(rel_top):.3f} / 무관 1위 점수 최고 {max(irr_top):.3f} → 임계값은 이 사이가 안전")
    return 0 if hits == n_rel and rejected == n_irr else 1


if __name__ == "__main__":
    raise SystemExit(main())
