"""dense(MiniLM) + 한글 문자 bigram BM25(어휘) 하이브리드(RRF) ± 리랭커 비교. 기대 문서의 dense 순위도 찍어 실패 원인을 본다."""
from __future__ import annotations
import json, math, re, sys, time
from collections import Counter
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent; sys.path.insert(0, str(HERE.parent))
from common import CACHE_DIR, load_docs  # noqa: E402
rows = [json.loads(l) for l in (HERE / "queries.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
chunks = load_docs(HERE.parent / "docs"); N = len(chunks)
text = lambda c: f"{c.section}\n{c.content}"

def lex_tokens(s: str) -> list[str]:
    toks = []
    for run in re.findall(r"[가-힣]+|[a-zA-Z]+|\d+(?:[.,]\d+)?", s.lower()):
        if re.match(r"[가-힣]", run):
            toks += [run[i:i+2] for i in range(len(run)-1)] if len(run) > 1 else [run]
        else:
            toks.append(run)
    return toks

docs_tf = [Counter(lex_tokens(text(c))) for c in chunks]; df = Counter(t for tf in docs_tf for t in tf)
avgdl = sum(sum(tf.values()) for tf in docs_tf) / N
def bm25(q: str, k1=1.2, b=0.75) -> np.ndarray:
    sc = np.zeros(N)
    for t in set(lex_tokens(q)):
        if t not in df: continue
        idf = math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5))
        for i, tf in enumerate(docs_tf):
            if t in tf:
                dl = sum(tf.values()); sc[i] += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * dl / avgdl))
    return sc

def rrf(*rankings, k=60):
    s = np.zeros(N)
    for r in rankings:
        for rank, i in enumerate(r): s[i] += 1 / (k + rank + 1)
    return s

def report(name, ranked_scores, k=3):
    hits = 0; rel, irr = [], []
    for r, (ranked, sc) in zip(rows, ranked_scores):
        docs = [chunks[i].doc_id for i in ranked[:k]]
        (rel if r["expect_doc"] else irr).append(sc[0])
        if r["expect_doc"]: hits += any(d in r["expect_doc"] for d in docs)
    print(f"{name}: hit@{k} {hits}/{len(rel)} · 관련 1위 최저 {min(rel):.3f} · 무관 1위 최고 {max(irr):.3f} · margin {min(rel)-max(irr):+.3f}")

from fastembed import TextEmbedding
emb = TextEmbedding("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", cache_dir=CACHE_DIR)
D = np.array(list(emb.embed([text(c) for c in chunks]))); D /= np.linalg.norm(D, axis=1, keepdims=True)
Q = np.array(list(emb.embed([r["query"] for r in rows]))); Q /= np.linalg.norm(Q, axis=1, keepdims=True)
dense = Q @ D.T
dense_r, lex_r, hyb_r = [], [], []
for qi, r in enumerate(rows):
    do = list(np.argsort(-dense[qi])); dense_r.append((do, [float(dense[qi][i]) for i in do]))
    ls = bm25(r["query"]); lo = list(np.argsort(-ls)); lex_r.append((lo, [float(ls[i]) for i in lo]))
    hs = rrf(do[:20], lo[:20]); ho = list(np.argsort(-hs)); hyb_r.append((ho, [float(hs[i]) for i in ho]))
    if r["expect_doc"]:
        exp_ranks = [do.index(i) + 1 for i in range(N) if chunks[i].doc_id in r["expect_doc"]]
        print(f"   {r['query'][:24]:26s} 기대문서 dense 최고순위 {min(exp_ranks):2d} · lex 최고순위 {min(lo.index(i)+1 for i in range(N) if chunks[i].doc_id in r['expect_doc']):2d}")
report("dense", dense_r); report("lex(bigram BM25)", lex_r); report("hybrid RRF", hyb_r)
from fastembed.rerank.cross_encoder import TextCrossEncoder
ce = TextCrossEncoder("jinaai/jina-reranker-v2-base-multilingual", cache_dir=CACHE_DIR)
for pool in (6, 10):
    t0 = time.time(); rr = []
    for qi, (ho, _) in enumerate(hyb_r):
        cand = ho[:pool]; sc = list(ce.rerank(rows[qi]["query"], [text(chunks[i]) for i in cand]))
        o2 = sorted(range(pool), key=lambda j: -sc[j]); rr.append(([cand[j] for j in o2], [float(sc[j]) for j in o2]))
    report(f"hybrid+rerank top{pool} ({(time.time()-t0)/len(rows):.2f}s/질의)", rr)
    if pool == 10:
        for r, (ranked, sc) in zip(rows, rr):
            ok = (not r["expect_doc"]) or chunks[ranked[0]].doc_id in r["expect_doc"]
            print(f"     {sc[0]:+.2f} {r['query'][:26]:28s} → {chunks[ranked[0]].doc_id}/{chunks[ranked[0]].section[:14]} {'' if ok else '✘'}")

print("\n=== 후보 = dense top5 ∪ lex top5 → 리랭크 (RRF 대신 합집합: 한쪽 채널에만 잡히는 문서를 버리지 않는다)")
for nd, nl in ((5, 5), (3, 5), (4, 6)):
    t0 = time.time(); rr = []
    for qi in range(len(rows)):
        cand = list(dict.fromkeys(dense_r[qi][0][:nd] + lex_r[qi][0][:nl]))
        sc = list(ce.rerank(rows[qi]["query"], [text(chunks[i]) for i in cand]))
        o2 = sorted(range(len(cand)), key=lambda j: -sc[j]); rr.append(([cand[j] for j in o2], [float(sc[j]) for j in o2]))
    report(f"union d{nd}+l{nl} + rerank ({(time.time()-t0)/len(rows):.2f}s/질의)", rr)
    if (nd, nl) == (5, 5):
        for r, (ranked, sc) in zip(rows, rr):
            ok = (not r["expect_doc"]) or chunks[ranked[0]].doc_id in r["expect_doc"]
            print(f"     {sc[0]:+.2f} {r['query'][:26]:28s} → {chunks[ranked[0]].doc_id}/{chunks[ranked[0]].section[:14]} {'' if ok else '✘'}")
