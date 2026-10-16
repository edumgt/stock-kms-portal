FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# docker CLI only (no daemon): the LEAN local runner talks to the host's Docker through
# a mounted /var/run/docker.sock and starts quantconnect/lean containers with `docker run`.
ARG DOCKER_CLI_VERSION=27.5.1
RUN arch="$(uname -m)" \
    && curl -fsSL "https://download.docker.com/linux/static/stable/${arch}/docker-${DOCKER_CLI_VERSION}.tgz" \
       | tar -xz -C /usr/local/bin --strip-components=1 docker/docker \
    && docker --version

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 챗봇 RAG 질의 임베딩 모델(MiniLM 다국어 384, 약 0.22GB)을 이미지에 구워 기동 시 다운로드를 없앤다 (rag/common.py 와 동일 모델)
ENV FASTEMBED_CACHE_PATH=/app/.fastembed
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', cache_dir='/app/.fastembed')"
# 다국어 리랭커(1.1GB): dense ∪ 어휘 후보를 재정렬하고 임계값 미만을 버린다 — 환각 방지의 핵심(2026-10-16 평가 20/20)
RUN python -c "from fastembed.rerank.cross_encoder import TextCrossEncoder; TextCrossEncoder('jinaai/jina-reranker-v2-base-multilingual', cache_dir='/app/.fastembed')"

COPY app/ ./app/
COPY frontend/ ./frontend/
COPY data/ ./data/
COPY streamlit_app.py .

RUN mkdir -p /app/data/uploads

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
