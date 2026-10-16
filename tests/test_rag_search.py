"""챗봇 RAG(6-14): 청크 분할 규약(rag/common.py)·어휘 희소 벡터(app/services/lexical.py)·검색 API(dense ∪ lex 후보 → 리랭크 → 임계값)."""
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("rag_common", ROOT / "rag" / "common.py")
common = importlib.util.module_from_spec(_spec); sys.modules["rag_common"] = common; _spec.loader.exec_module(common)

from app.api.routes import rag_search  # noqa: E402
from app.services import lexical  # noqa: E402


def test_split_markdown_sections_and_stable_ids():
    text = "---\ntitle: 테스트 문서\ncategory: faq\nupdated: 2026-10-16\n---\n\n## 첫 절\n내용 하나.\n\n## 둘째 절\n" + ("문단. " * 200) + "\n\n" + ("둘째 문단. " * 50)
    chunks = common.split_markdown("faq/test", "docs/faq/test.md", text)
    assert [c.section for c in chunks][:2] == ["첫 절", "둘째 절"] and len(chunks) >= 3        # 긴 절은 문단으로 분할
    assert all(len(c.content) <= common.MAX_CHUNK_CHARS for c in chunks)
    assert chunks[0].title == "테스트 문서" and chunks[0].category == "faq" and chunks[0].embed_text() == "첫 절\n내용 하나."
    again = common.split_markdown("faq/test", "docs/faq/test.md", text)
    assert [c.point_id for c in again] == [c.point_id for c in chunks]                         # 같은 입력 → 같은 point id(멱등 업서트)
    assert len({c.point_id for c in chunks}) == len(chunks)


def test_curated_docs_parse_without_empty_sections():
    chunks = common.load_docs(ROOT / "rag" / "docs")
    assert len(chunks) >= 30 and all(c.content and c.section and c.title for c in chunks)
    hours = next(c for c in chunks if c.doc_id == "market/hours" and c.section == "동시호가")
    assert "08:30~09:00" in hours.content and "15:20~15:30" in hours.content                   # 시드 문서 오류(09:00~09:10) 재발 방지


def test_lexical_bigrams_match_despite_particles_and_bm25_weights():
    assert lexical.tokens("호가 단위의 배수 PER 2,000원") == ["호가", "단위", "위의", "배수", "per", "2,000", "원"]
    q_idx, q_val = lexical.query_sparse("호가 단위 알려줘")
    assert q_val == [1.0] * len(q_idx) and q_idx == sorted(q_idx) and lexical.token_index("호가") in q_idx
    corpus = lexical.Bm25Corpus(["주문 가격은 호가 단위의 배수여야 합니다.", "예수금이 음수이면 매수 주문은 거절됩니다.", "장 시간은 09:00~15:30 입니다."])
    d0, d1 = dict(zip(*corpus.doc_sparse(0))), dict(zip(*corpus.doc_sparse(1)))
    score = lambda d: sum(d.get(i, 0.0) for i in q_idx)                                        # 희소 내적 = BM25
    assert score(d0) > 0 and score(d1) == 0 and lexical.token_index("단위") in d0                       # '단위의' 문서가 '단위' 질의에 맞는다
    assert d0[lexical.token_index("호가")] > d0[lexical.token_index("주문")]                     # 드문 토큰(호가)이 흔한 토큰(주문)보다 무겁다


def _app():
    app = FastAPI(); app.include_router(rag_search.router); return TestClient(app)


def _pt(pid, score, doc_id, section, content="x", category="faq"):
    return SimpleNamespace(id=pid, score=score, payload={"title": doc_id, "section": section, "content": content, "source": f"docs/{doc_id}.md", "category": category, "updated": "2026-10-16", "doc_id": doc_id})


def _fake_client(dense, lex, exists=True, dim=384, with_lex=True):
    class C:
        calls = []
        def collection_exists(self, name): return exists
        def get_collection(self, name):
            vectors = {"dense": SimpleNamespace(size=dim)}
            return SimpleNamespace(points_count=len(dense) + len(lex) or 3, config=SimpleNamespace(params=SimpleNamespace(vectors=vectors, sparse_vectors={"lex": object()} if with_lex else {})))
        def query_points(self, name, query, using, limit, with_payload, query_filter=None):
            C.calls.append(using); return SimpleNamespace(points=(dense if using == "dense" else lex)[:limit])
    return C()


def _rerank_by_doc(scores: dict):
    return SimpleNamespace(rerank=lambda q, texts: [scores.get(t.split("\n", 1)[0], -3.0) for t in texts])


def _patched(client, reranker):
    return (patch.object(rag_search, "_client", lambda: client), patch.object(rag_search, "_embedder", lambda: SimpleNamespace(embed_query=lambda q: [0.0] * 384)),
            patch.object(rag_search, "_reranker", lambda: reranker))


def test_search_unions_channels_reranks_and_applies_threshold():
    dense = [_pt("a", 0.52, "market/hours", "정규장"), _pt("b", 0.50, "faq/account", "예수금")]
    lex = [_pt("c", 9.1, "market/order-basics", "호가 단위"), _pt("a", 3.0, "market/hours", "정규장")]      # 'a' 는 양쪽에 → 한 번만
    client = _fake_client(dense, lex); rr = _rerank_by_doc({"호가 단위": -0.09, "정규장": -1.8, "예수금": -2.2})
    p1, p2, p3 = _patched(client, rr)
    with p1, p2, p3:
        c = _app()
        r = c.get("/api/rag/search", params={"q": "호가 단위 알려줘", "limit": 3}).json()
        assert r["status"] == "ok" and r["candidates"] == 3 and r["reranked"] is True and r["min_score"] == -1.0
        assert [h["doc_id"] for h in r["hits"]] == ["market/order-basics"] and r["hits"][0]["score"] == -0.09   # dense 가 놓친 문서를 어휘 채널이 살리고, 임계값 미만은 제외
        assert client.calls == ["dense", "lex"]
        r = c.get("/api/rag/search", params={"q": "오늘 점심 뭐 먹지", "min_score": 0.5}).json()
        assert r["status"] == "no_match" and r["hits"] == []
        s = c.get("/api/rag/status").json()
        assert s["ready"] and s["lex_index"] and s["rerank_model"].startswith("jinaai/") and s["collection"] == "chatbot_docs"
    p1, p2, p3 = _patched(_fake_client([], [], exists=False), rr)
    with p1, p2, p3:
        r = _app().get("/api/rag/search", params={"q": "아무거나"}).json()
        assert r["status"] == "empty" and r["hits"] == []                                        # 스냅샷 복원 전
    p1, p2, p3 = _patched(_fake_client(dense, lex, dim=768), rr)
    with p1, p2, p3:
        assert _app().get("/api/rag/search", params={"q": "차원 불일치"}).status_code == 500      # 인덱서와 서버 모델이 다르면 명확히 실패


def test_embedder_keeps_hashing_mode_without_fastembed():
    from app.services.embedder import EmbeddingService
    e = EmbeddingService("hashing-384")
    v = e.embed_query("삼성전자 주가")
    assert e.is_hashing and len(v) == 384 and abs(sum(x * x for x in v) - 1) < 1e-6
    assert not EmbeddingService("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2").is_hashing
