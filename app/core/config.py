from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Domain RAG MVP"
    app_env: str = "dev"
    investment_api_base: str = "http://investment-backend:8000"

    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection: str = "domain_docs"

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "ragdb"
    postgres_user: str = "raguser"
    postgres_password: str = "ragpass"

    redis_host: str = "localhost"
    redis_port: int = 6379

    embedding_model: str = "hashing-384"
    embedding_dim: int = 384

    # 챗봇 RAG(2026-10-16): PC 에서 색인한 컬렉션(rag/indexer.py). 유사도 임계값 미만이면 "자료 없음" — 환각 방지
    rag_collection: str = "chatbot_docs"
    # 검색 = dense top-k ∪ 어휘(bigram BM25) top-k 후보 → 다국어 리랭커 점수(로짓)로 정렬 → rag_rerank_min 미만 제거
    rag_dense_k: int = 3          # 2026-10-16 EC2 실측: 후보 10개 리랭크 7초(2 vCPU) → 3+4(≤7개)로 축소. 평가는 그대로 21/21·거절 4/4
    rag_lex_k: int = 4
    rag_rerank_model: str = "jinaai/jina-reranker-v2-base-multilingual"   # 빈 문자열이면 리랭크 없이 dense 점수·rag_min_score 사용
    rag_rerank_min: float = -1.0
    rag_min_score: float = 0.45          # 리랭커를 끈 경우에만 쓰는 dense 코사인 임계값

    llm_transport: str = "http"
    vllm_base_url: str = "http://localhost:8001/v1"
    vllm_model: str = "qwen2.5:3b"
    vllm_api_key: str = "EMPTY"

    upload_dir: str = "/app/data/uploads"
    chunk_size: int = 500
    chunk_overlap: int = 80
    top_k: int = 4

    # 하이브리드 검색: 벡터·키워드 결과 혼합 가중치 (0.0~1.0, 1.0=벡터만)
    hybrid_vector_weight: float = 0.6
    # 세션 단기 기억: 최근 대화 몇 턴을 컨텍스트에 포함할지
    session_memory_turns: int = 5
    # 장기 기억 pgvector 유사도 임계값 (코사인 거리 기준, 낮을수록 유사)
    long_term_memory_threshold: float = 0.4
    long_term_memory_top_k: int = 3

    # QuantConnect LEAN 실행기 선택.
    #   auto   : SSH 설정이 있으면 remote, 없으면 로컬 Docker 소켓이 보일 때 local
    #   local  : API 컨테이너에 마운트된 /var/run/docker.sock으로 같은 호스트의 Docker에서 LEAN 실행
    #   remote : SSH로 원격 서버의 Docker에서 LEAN 실행
    #   off    : 백테스트 비활성화
    lean_runner: str = "auto"
    # local 러너: API 컨테이너 안에서 보이는 작업 폴더와, 같은 폴더의 호스트 절대 경로.
    # docker run -v 는 호스트 데몬이 해석하므로 호스트 경로가 반드시 필요하다.
    lean_local_workdir: str = "/app/data/lean-workflows"
    lean_local_workdir_host: str = ""
    lean_docker_socket: str = "/var/run/docker.sock"

    # 원격 QuantConnect LEAN 실행기. 키 파일·호스트는 배포 환경에서만 설정한다.
    lean_ssh_host: str = ""
    lean_ssh_user: str = "ubuntu"
    lean_ssh_key_path: str = ""
    lean_remote_workdir: str = "/home/ubuntu/lean-workflows"
    lean_docker_image: str = "quantconnect/lean:latest"
    lean_timeout_seconds: int = 300
    # Local Ollama models on CPU need a longer generation window than vLLM/GPU.
    llm_timeout_seconds: int = 600

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
