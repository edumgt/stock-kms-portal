"""임베딩 서비스.

- `EMBEDDING_MODEL=hashing-384`(기존): 의존성 없는 문자 n-gram 해시 임베딩. 키워드 유사도만 잡히고 의미 검색은 안 된다.
- 그 외(예: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, 2026-10-16 챗봇 RAG): fastembed(onnx) 문장 임베딩.
  rag/common.py 의 인덱서와 **같은 모델·차원**이어야 서버 질의 임베딩이 PC 에서 만든 인덱스와 맞는다. 모델은 FASTEMBED_CACHE_PATH 에 캐시(Dockerfile 이 이미지에 구움).
"""

import hashlib
import math
import os
import re

from app.core.config import settings


class EmbeddingService:
    def __init__(self, model_name: str):
        # 기존 설정 호환을 위해 model_name은 받되, 해시 임베딩에서는 사용하지 않는다.
        self.model_name = model_name
        self.dimension = settings.embedding_dim
        self._model = None

    @property
    def is_hashing(self) -> bool:
        return self.model_name.startswith("hashing")

    def _fastembed(self):
        if self._model is None:
            from fastembed import TextEmbedding   # 지연 import: 해시 모드에서는 fastembed 가 없어도 된다
            self._model = TextEmbedding(model_name=self.model_name, cache_dir=os.environ.get("FASTEMBED_CACHE_PATH") or None)
        return self._model

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if self.is_hashing:
            return [self._embed(text) for text in texts]
        return [v.tolist() for v in self._fastembed().embed(texts, batch_size=32)]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimension
        normalized = re.sub(r"\s+", " ", text.lower()).strip()
        if not normalized:
            return vector

        # 단어와 문자 2·3-gram을 함께 사용해 한국어 조사 변화와 영문 형태 변화를 완화한다.
        tokens = re.findall(r"[\w가-힣]+", normalized)
        features = list(tokens)
        compact = re.sub(r"\s+", "", normalized)
        for size in (2, 3):
            features.extend(compact[index:index + size] for index in range(max(0, len(compact) - size + 1)))

        for feature in features:
            digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
            value = int.from_bytes(digest, byteorder="big")
            index = value % self.dimension
            vector[index] += 1.0 if value & 1 else -1.0

        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector
