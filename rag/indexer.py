"""rag/docs/*.md → 청크 → fastembed → 로컬 Qdrant(chatbot_docs) 업서트.

  rag/.venv/bin/python rag/indexer.py            # 전체 재색인(멱등: 같은 청크는 같은 ID 로 덮어씀)
  rag/.venv/bin/python rag/indexer.py --prune    # 문서에서 사라진 청크도 삭제
  rag/.venv/bin/python rag/indexer.py --dry-run  # 청크 목록만 출력(임베딩·Qdrant 없이)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import COLLECTION, DENSE, EMBED_DIM, EMBED_MODEL, LEX, QDRANT_URL, embed, lexical, load_docs  # noqa: E402

DOCS = Path(__file__).resolve().parent / "docs"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prune", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--url", default=QDRANT_URL)
    ap.add_argument("--recreate", action="store_true", help="컬렉션을 지우고 다시 만든다(벡터 구성이 바뀌었을 때)")
    args = ap.parse_args()
    chunks = load_docs(DOCS)
    print(f"docs={len({c.doc_id for c in chunks})} chunks={len(chunks)} model={EMBED_MODEL} collection={COLLECTION}")
    for c in chunks:
        print(f"  {c.chunk_id:40s} {len(c.content):4d}자  {c.title} / {c.section}")
    if args.dry_run:
        return 0
    from qdrant_client import QdrantClient, models
    client = QdrantClient(url=args.url, check_compatibility=False)
    if args.recreate and client.collection_exists(COLLECTION):
        client.delete_collection(COLLECTION); print("deleted collection", COLLECTION)
    if not client.collection_exists(COLLECTION):
        client.create_collection(COLLECTION, vectors_config={DENSE: models.VectorParams(size=EMBED_DIM, distance=models.Distance.COSINE)},
                                 sparse_vectors_config={LEX: models.SparseVectorParams()})
        print("created collection", COLLECTION, "(dense + lex)")
    else:
        cfg = client.get_collection(COLLECTION).config.params
        size = (cfg.vectors or {}).get(DENSE).size if isinstance(cfg.vectors, dict) else None
        if size != EMBED_DIM or LEX not in (cfg.sparse_vectors or {}):
            print(f"컬렉션 벡터 구성이 다릅니다(dense={size}, sparse={list((cfg.sparse_vectors or {}).keys())}). --recreate 로 다시 만드세요."); return 1
    client.create_payload_index(COLLECTION, "category", models.PayloadSchemaType.KEYWORD)
    texts = [c.embed_text() for c in chunks]
    vectors = embed(texts)
    corpus = lexical.Bm25Corpus(texts)
    points = []
    for i, (c, v) in enumerate(zip(chunks, vectors, strict=True)):
        idx, vals = corpus.doc_sparse(i)
        points.append(models.PointStruct(id=c.point_id, vector={DENSE: v, LEX: models.SparseVector(indices=idx, values=vals)}, payload=c.payload()))
    client.upsert(COLLECTION, points=points)
    keep = {c.point_id for c in chunks}
    if args.prune:
        stale, offset = [], None
        while True:
            recs, offset = client.scroll(COLLECTION, limit=256, offset=offset, with_payload=False, with_vectors=False)
            stale += [str(r.id) for r in recs if str(r.id) not in keep]
            if offset is None:
                break
        if stale:
            client.delete(COLLECTION, points_selector=models.PointIdsList(points=stale)); print("pruned", len(stale))
    print("points:", client.count(COLLECTION, exact=True).count)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
