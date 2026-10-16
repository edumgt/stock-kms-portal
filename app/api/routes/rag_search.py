"""챗봇 RAG 검색 API (6-14, 2026-10-16) — 읽기 전용.

PC 에서 `rag/indexer.py` 로 색인해 스냅샷으로 올린 컬렉션(`chatbot_docs`, named vectors: dense=MiniLM 384 · lex=한글 bigram BM25 희소)을 검색한다.
알고리즘(rag/search.py 와 동일): dense top-k ∪ 어휘 top-k 후보 → 다국어 리랭커(cross-encoder) 점수로 정렬 → `RAG_RERANK_MIN` 미만 제거.
2026-10-16 조사에서 임계값 없이 항상 top-k 를 돌려주던 것이 챗봇 환각의 직접 원인이었다(todo 6-13). 평가(rag/eval): 20/20 적중, 무관 질의 거절.

  GET /api/rag/search?q=매도 대금 언제 들어와&limit=3[&min_score=-0.5][&category=faq]
  GET /api/rag/status
"""
from __future__ import annotations

import logging
import threading
import time
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.services import lexical
from app.services.embedder import EmbeddingService

router = APIRouter(prefix="/api/rag", tags=["rag-search"])
DENSE, LEX = "dense", "lex"
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _embedder() -> EmbeddingService:
    return EmbeddingService(settings.embedding_model)


@lru_cache(maxsize=1)
def _client():
    from qdrant_client import QdrantClient
    return QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port, check_compatibility=False)


@lru_cache(maxsize=1)
def _reranker():
    import os
    from fastembed.rerank.cross_encoder import TextCrossEncoder
    return TextCrossEncoder(model_name=settings.rag_rerank_model, cache_dir=os.environ.get("FASTEMBED_CACHE_PATH") or None)


@router.on_event("startup")
def _warm_up() -> None:
    """임베더·리랭커를 기동 직후 백그라운드로 올려 첫 질의의 콜드 지연(EC2 실측 12초)을 없앤다."""
    def run():
        try:
            _embedder().embed_query("워밍업")
            if settings.rag_rerank_model:
                list(_reranker().rerank("워밍업", ["워밍업 문서"]))
            logger.info("rag models warmed up")
        except Exception as exc:                          # 모델이 없어도 서비스는 떠야 한다(hashing 모드 등)
            logger.warning("rag warm-up skipped: %s", exc)
    threading.Thread(target=run, name="rag-warmup", daemon=True).start()


def _collection_info() -> dict | None:
    client = _client()
    if not client.collection_exists(settings.rag_collection):
        return None
    info = client.get_collection(settings.rag_collection)
    vectors = info.config.params.vectors
    dense = vectors.get(DENSE) if isinstance(vectors, dict) else vectors          # 구(단일 벡터) 컬렉션도 상태는 보여 준다
    return {"points": info.points_count, "dim": dense.size if dense else None, "lex": LEX in (info.config.params.sparse_vectors or {})}


def _text(p) -> str:
    payload = p.payload or {}
    return f"{payload.get('section') or ''}\n{payload.get('content') or ''}"


@router.get("/status")
def rag_search_status() -> dict:
    try:
        info = _collection_info()
    except Exception as exc:                                  # Qdrant 연결 실패
        raise HTTPException(status_code=503, detail=f"Qdrant 에 연결하지 못했습니다: {exc.__class__.__name__}") from exc
    return {"collection": settings.rag_collection, "model": settings.embedding_model, "dim": settings.embedding_dim,
            "rerank_model": settings.rag_rerank_model or None, "rerank_min": settings.rag_rerank_min,
            "dense_k": settings.rag_dense_k, "lex_k": settings.rag_lex_k,
            "points": info["points"] if info else 0, "lex_index": bool(info and info["lex"]), "ready": bool(info and info["points"])}


@router.get("/search")
def rag_search(q: str = Query(min_length=1, max_length=300), limit: int = Query(3, ge=1, le=10),
               min_score: float | None = Query(None, ge=-20.0, le=20.0), category: str | None = Query(None, max_length=40)) -> dict:
    use_rerank = bool(settings.rag_rerank_model)
    threshold = (settings.rag_rerank_min if use_rerank else settings.rag_min_score) if min_score is None else min_score
    t0 = time.time()
    try:
        info = _collection_info()
        if not info or not info["points"]:
            return {"query": q, "hits": [], "min_score": threshold, "status": "empty"}
        if info["dim"] != settings.embedding_dim:
            raise HTTPException(status_code=500, detail=f"컬렉션 차원 {info['dim']} 과 임베딩 차원 {settings.embedding_dim} 이 다릅니다")
        from qdrant_client import models
        flt = models.Filter(must=[models.FieldCondition(key="category", match=models.MatchValue(value=category))]) if category else None
        client, col = _client(), settings.rag_collection
        pts = list(client.query_points(col, query=_embedder().embed_query(q), using=DENSE, limit=settings.rag_dense_k, with_payload=True, query_filter=flt).points)
        idx, vals = lexical.query_sparse(q)
        if idx and info["lex"]:
            pts += list(client.query_points(col, query=models.SparseVector(indices=idx, values=vals), using=LEX, limit=settings.rag_lex_k, with_payload=True, query_filter=flt).points)
        seen, cands = set(), []
        for p in pts:
            if p.id not in seen:
                seen.add(p.id); cands.append(p)
        scores = [float(s) for s in _reranker().rerank(q, [_text(p) for p in cands])] if (use_rerank and cands) else [float(p.score) for p in cands]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"검색에 실패했습니다: {exc.__class__.__name__}") from exc
    ranked = sorted(zip(cands, scores), key=lambda t: -t[1])
    hits = [{"score": round(s, 4), **{k: (p.payload or {}).get(k) for k in ("title", "section", "content", "source", "category", "updated", "doc_id")}}
            for p, s in ranked if s >= threshold][:limit]
    return {"query": q, "hits": hits, "min_score": threshold, "candidates": len(cands), "reranked": use_rerank,
            "elapsed_ms": int((time.time() - t0) * 1000), "status": "ok" if hits else "no_match"}
