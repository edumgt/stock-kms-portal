"""한글 문자 bigram 기반 어휘(BM25) 희소 벡터 — 표준 라이브러리만. 인덱서(rag/common.py)와 서버(rag_search.py)가 같은 코드를 쓴다.

왜: 다국어 MiniLM 은 "호가 단위", "PER", "캡처하기" 같은 짧은 전문용어 질의를 놓친다(2026-10-16 평가: dense 순위 15~21위).
bigram 은 조사가 붙어도("단위의"→"단위") 맞고, 형태소 분석기 없이 돌아간다. 문서 쪽 가중치에 IDF·길이 보정을 미리 넣고,
질의는 토큰당 1 로 보내면 Qdrant 희소 내적이 곧 BM25 점수가 된다. 희소 인덱스는 토큰 해시(blake2b 4바이트, u32).
"""
from __future__ import annotations

import hashlib
import math
import re
from collections import Counter

_RUN = re.compile(r"[가-힣]+|[a-zA-Z]+|\d+(?:[.,]\d+)?")
K1, B = 1.2, 0.75


def tokens(text: str) -> list[str]:
    out: list[str] = []
    for run in _RUN.findall(text.lower()):
        if "가" <= run[0] <= "힣":
            out.extend([run[i:i + 2] for i in range(len(run) - 1)] if len(run) > 1 else [run])
        else:
            out.append(run)
    return out


def token_index(tok: str) -> int:
    return int.from_bytes(hashlib.blake2b(tok.encode("utf-8"), digest_size=4).digest(), "big")


def query_sparse(text: str) -> tuple[list[int], list[float]]:
    """질의 희소 벡터: 고유 토큰마다 가중치 1."""
    idx = sorted({token_index(t) for t in tokens(text)})
    return idx, [1.0] * len(idx)


class Bm25Corpus:
    """색인 시 말뭉치 통계(df, 평균 길이)를 모아 문서별 BM25 가중치 희소 벡터를 만든다."""

    def __init__(self, docs: list[str]):
        self.tfs = [Counter(tokens(d)) for d in docs]
        self.n = len(docs)
        self.df = Counter(t for tf in self.tfs for t in tf)
        self.avgdl = (sum(sum(tf.values()) for tf in self.tfs) / self.n) if self.n else 1.0

    def idf(self, tok: str) -> float:
        return math.log(1 + (self.n - self.df[tok] + 0.5) / (self.df[tok] + 0.5))

    def doc_sparse(self, i: int) -> tuple[list[int], list[float]]:
        tf = self.tfs[i]
        dl = sum(tf.values())
        weights: dict[int, float] = {}
        for tok, f in tf.items():
            w = self.idf(tok) * f * (K1 + 1) / (f + K1 * (1 - B + B * dl / self.avgdl))
            weights[token_index(tok)] = weights.get(token_index(tok), 0.0) + w
        idx = sorted(weights)
        return idx, [round(weights[i], 6) for i in idx]
