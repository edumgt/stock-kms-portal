"""임베딩 모델·텍스트 구성·리랭커 조합을 인메모리로 비교한다(Qdrant 불필요). 결과는 todo 6-14 에 기록.
  rag/.venv/bin/python rag/eval/experiment.py [--configs A,B,C,D,E]
지표: 관련 질의 hit@3(1위~3위 안에 기대 문서) · 관련 1위 점수 최저 · 무관 1위 점수 최고 · 둘의 차(margin, 클수록 임계값 설정이 쉬움)
"""
from __future__ import annotations

import argparse, json, sys, time
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent; sys.path.insert(0, str(HERE.parent))
from common import CACHE_DIR, load_docs  # noqa: E402

rows = [json.loads(l) for l in (HERE / "queries.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
chunks = load_docs(HERE.parent / "docs")
TEXT = {"title+section": lambda c: f"{c.title} — {c.section}\n{c.content}", "section": lambda c: f"{c.section}\n{c.content}", "content": lambda c: c.content}
CONFIGS = {
    "A": ("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "title+section", "", "", None),
    "B": ("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "section", "", "", None),
    "C": ("sentence-transformers/paraphrase-multilingual-mpnet-base-v2", "section", "", "", None),
    "D": ("intfloat/multilingual-e5-large", "section", "query: ", "passage: ", None),
    "E": ("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", "section", "", "", "jinaai/jina-reranker-v2-base-multilingual"),
    "F": ("sentence-transformers/paraphrase-multilingual-mpnet-base-v2", "section", "", "", "jinaai/jina-reranker-v2-base-multilingual"),
}


def report(name, scores_by_q, k=3):
    hits = 0; rel_top, irr_top = [], []
    for r, (ranked, top_scores) in zip(rows, scores_by_q):
        docs = [chunks[i].doc_id for i in ranked[:k]]
        if r["expect_doc"]:
            hits += any(d in r["expect_doc"] for d in docs); rel_top.append(top_scores[0])
        else:
            irr_top.append(top_scores[0])
    n_rel = len(rel_top)
    print(f"{name}: hit@{k} {hits}/{n_rel} · 관련 1위 최저 {min(rel_top):.3f} · 무관 1위 최고 {max(irr_top):.3f} · margin {min(rel_top)-max(irr_top):+.3f}")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--configs", default="A,B,C,D,E,F"); ap.add_argument("--pool", type=int, default=5); a = ap.parse_args()
    from fastembed import TextEmbedding
    for key in a.configs.split(","):
        model, text, qp, pp, rerank = CONFIGS[key]
        t0 = time.time(); emb = TextEmbedding(model_name=model, cache_dir=CACHE_DIR)
        docs = np.array(list(emb.embed([pp + TEXT[text](c) for c in chunks], batch_size=16)))
        qs = np.array(list(emb.embed([qp + r["query"] for r in rows], batch_size=16)))
        docs /= np.linalg.norm(docs, axis=1, keepdims=True); qs /= np.linalg.norm(qs, axis=1, keepdims=True)
        sims = qs @ docs.T
        results = []
        for qi in range(len(rows)):
            order = np.argsort(-sims[qi]); results.append((list(order), [float(sims[qi][i]) for i in order]))
        report(f"[{key}] {model.split('/')[-1]} · {text} ({time.time()-t0:.0f}s)", results)
        if rerank:
            from fastembed.rerank.cross_encoder import TextCrossEncoder
            t1 = time.time(); ce = TextCrossEncoder(model_name=rerank, cache_dir=CACHE_DIR); rr = []
            for qi, (order, _) in enumerate(results):
                cand = order[:a.pool]
                sc = list(ce.rerank(rows[qi]["query"], [TEXT[text](chunks[i]) for i in cand]))
                o2 = sorted(range(len(cand)), key=lambda j: -sc[j]); rr.append(([cand[j] for j in o2], [float(sc[j]) for j in o2]))
            report(f"[{key}+rerank] {rerank.split('/')[-1]} top{a.pool} ({time.time()-t1:.0f}s, {len(rows)} 질의)", rr)
            for r, (ranked, sc) in zip(rows, rr):
                print(f"     {sc[0]:+.2f} {r['query'][:26]:28s} → {chunks[ranked[0]].doc_id}/{chunks[ranked[0]].section[:14]} {'' if (not r['expect_doc']) or chunks[ranked[0]].doc_id in r['expect_doc'] else '✘'}")
            del ce
        del emb


if __name__ == "__main__":
    main()
