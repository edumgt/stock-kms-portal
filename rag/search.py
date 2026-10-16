"""로컬 Qdrant 검색 확인(서버 rag_search.py 와 같은 알고리즘):
  rag/.venv/bin/python rag/search.py "매도 대금 언제 들어와" [--limit 3] [--min -1.0] [--no-rerank]
dense top-k ∪ 어휘 top-k 후보 → 리랭커 점수로 정렬 → 임계값 미만 제거."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import COLLECTION, DENSE, DENSE_K, LEX, LEX_K, QDRANT_URL, RERANK_MIN, embed, lexical, rerank  # noqa: E402


def candidates(client, query: str, dense_k: int = DENSE_K, lex_k: int = LEX_K) -> list:
    from qdrant_client import models
    pts = list(client.query_points(COLLECTION, query=embed([query])[0], using=DENSE, limit=dense_k, with_payload=True).points)
    idx, vals = lexical.query_sparse(query)
    if idx:
        pts += list(client.query_points(COLLECTION, query=models.SparseVector(indices=idx, values=vals), using=LEX, limit=lex_k, with_payload=True).points)
    seen, out = set(), []
    for p in pts:
        if p.id not in seen:
            seen.add(p.id); out.append(p)
    return out


def search(query: str, limit: int = 3, min_score: float | None = RERANK_MIN, url: str = QDRANT_URL, use_rerank: bool = True) -> list[dict]:
    from qdrant_client import QdrantClient
    client = QdrantClient(url=url, check_compatibility=False)
    cands = candidates(client, query)
    if not cands:
        return []
    text = lambda p: f"{p.payload.get('section')}\n{p.payload.get('content')}"
    scores = rerank(query, [text(p) for p in cands]) if use_rerank else [float(p.score) for p in cands]
    ranked = sorted(zip(cands, scores), key=lambda t: -t[1])
    return [{"score": round(s, 3), **{k: p.payload.get(k) for k in ("title", "section", "doc_id", "content")}}
            for p, s in ranked if min_score is None or s >= min_score][:limit]


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("query"); ap.add_argument("--limit", type=int, default=3)
    ap.add_argument("--min", type=float, default=RERANK_MIN); ap.add_argument("--no-rerank", action="store_true")
    a = ap.parse_args()
    hits = search(a.query, a.limit, a.min, use_rerank=not a.no_rerank)
    if not hits:
        print("(임계값 이상 결과 없음)")
    for h in hits:
        print(f"{h['score']:+.3f}  {h['title']} / {h['section']}  ({h['doc_id']})")
        print("        " + h["content"][:120].replace("\n", " "))
