"""인덱서·검색·서버가 공유하는 규약: 컬렉션 이름, 임베딩 모델, 청크 분할, 임베딩 입력 텍스트, 어휘(BM25) 희소 벡터.

서버(app/api/routes/rag_search.py)는 질의만 임베딩하므로 **모델·차원·텍스트 구성이 여기와 같아야** 점수가 맞는다.
검색 구성(2026-10-16 평가, rag/eval/experiment_hybrid.py): dense(MiniLM) top-k ∪ 어휘(bigram BM25) top-k 후보 → 다국어 리랭커 → 임계값.
  dense 만: hit@3 17/20, 무관 질의 구분 불가 · 어휘만: 19/20 · 합집합+리랭크: 20/20, 무관 질의 리랭크 점수 ≤ -0.72(임계값 -1.0).
"""
from __future__ import annotations

import importlib.util
import os
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path

COLLECTION = os.environ.get("RAG_COLLECTION", "chatbot_docs")
EMBED_MODEL = os.environ.get("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")   # 384차원, 다국어, 0.22GB
EMBED_DIM = int(os.environ.get("EMBEDDING_DIM", "384"))
QDRANT_URL = os.environ.get("RAG_QDRANT_URL", "http://127.0.0.1:6333")
CACHE_DIR = os.environ.get("FASTEMBED_CACHE_PATH", str(Path(__file__).resolve().parent / ".fastembed"))
MAX_CHUNK_CHARS = 900          # 한 섹션이 이보다 길면 문단 단위로 나눈다(MiniLM 은 128 토큰 이후를 잘라 쓰므로 짧게 유지)
NAMESPACE = uuid.UUID("3f2d6a1e-7c4b-4a4e-9d5e-2b1c0f8a9e11")
DENSE, LEX = "dense", "lex"                     # Qdrant named vectors
RERANK_MODEL = os.environ.get("RAG_RERANK_MODEL", "jinaai/jina-reranker-v2-base-multilingual")   # 1.1GB, 다국어 cross-encoder
RERANK_MIN = float(os.environ.get("RAG_RERANK_MIN", "-1.0"))
DENSE_K = int(os.environ.get("RAG_DENSE_K", "4")); LEX_K = int(os.environ.get("RAG_LEX_K", "6"))
THREADS = int(os.environ.get("RAG_THREADS", str(os.cpu_count() or 4)))   # PC 색인·평가는 전 스레드(6-16)

# 서버와 같은 어휘 코드(app/services/lexical.py)를 app 패키지 의존성 없이 파일로 읽어 쓴다
_spec = importlib.util.spec_from_file_location("kms_lexical", Path(__file__).resolve().parents[1] / "app" / "services" / "lexical.py")
lexical = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(lexical)


@dataclass
class Chunk:
    doc_id: str          # 문서 경로(docs/ 기준, 확장자 제외) 예: faq/account
    title: str
    section: str
    content: str
    source: str          # docs/faq/account.md
    category: str
    updated: str
    chunk_index: int
    chunk_id: str = field(init=False)
    point_id: str = field(init=False)

    def __post_init__(self) -> None:
        self.chunk_id = f"{self.doc_id}#{self.chunk_index}"
        self.point_id = str(uuid.uuid5(NAMESPACE, self.chunk_id))

    def embed_text(self) -> str:
        """임베딩·어휘·리랭크에 넣는 텍스트: 소제목 + 본문. 제목까지 붙이면 짧은 청크가 제목 단어에 끌려가 hit@3 이 14→17 로 떨어졌다(2026-10-16)."""
        return f"{self.section}\n{self.content}"

    def payload(self) -> dict:
        return {"chunk_id": self.chunk_id, "doc_id": self.doc_id, "title": self.title, "section": self.section, "content": self.content,
                "source": self.source, "category": self.category, "updated": self.updated, "chunk_index": self.chunk_index}


def parse_front_matter(text: str) -> tuple[dict, str]:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, text[m.end():]


def split_markdown(doc_id: str, source: str, text: str) -> list[Chunk]:
    """`## 소제목` 단위로 나누고, 긴 섹션은 빈 줄 기준 문단으로 다시 나눈다. 소제목이 없으면 문서 전체가 한 섹션."""
    meta, body = parse_front_matter(text)
    title = meta.get("title") or doc_id
    category = meta.get("category") or doc_id.split("/")[0]
    updated = meta.get("updated") or ""
    parts = re.split(r"^##\s+", body.strip(), flags=re.M)
    sections: list[tuple[str, str]] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if "\n" in part:
            head, rest = part.split("\n", 1)
        else:
            head, rest = part, ""
        if part is parts[0] and not body.strip().startswith("##"):
            head, rest = "개요", part
        rest = rest.strip()
        if not rest:
            continue
        if len(rest) <= MAX_CHUNK_CHARS:
            sections.append((head.strip(), rest))
            continue
        buf = ""
        for para in re.split(r"\n\s*\n", rest):
            if buf and len(buf) + len(para) + 2 > MAX_CHUNK_CHARS:
                sections.append((head.strip(), buf.strip())); buf = ""
            buf += para + "\n\n"
        if buf.strip():
            sections.append((head.strip(), buf.strip()))
    return [Chunk(doc_id, title, sec, content, source, category, updated, i) for i, (sec, content) in enumerate(sections)]


def load_docs(root: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    for path in sorted(root.rglob("*.md")):
        rel = path.relative_to(root)
        doc_id = str(rel.with_suffix("")).replace(os.sep, "/")
        chunks.extend(split_markdown(doc_id, f"docs/{rel.as_posix()}", path.read_text(encoding="utf-8")))
    return chunks


_model = None


def embedder():
    """fastembed TextEmbedding(지연 로딩). 모델은 FASTEMBED_CACHE_PATH 에 캐시된다(첫 실행 시 다운로드)."""
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(model_name=EMBED_MODEL, cache_dir=CACHE_DIR, threads=THREADS)
    return _model


def embed(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in embedder().embed(texts, batch_size=32)]


_reranker = None


def reranker():
    global _reranker
    if _reranker is None:
        from fastembed.rerank.cross_encoder import TextCrossEncoder
        _reranker = TextCrossEncoder(model_name=RERANK_MODEL, cache_dir=CACHE_DIR, threads=THREADS)
    return _reranker


def rerank(query: str, texts: list[str]) -> list[float]:
    return [float(s) for s in reranker().rerank(query, texts)]
