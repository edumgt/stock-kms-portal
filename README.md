# Investment Learning Portal · Financial Learning RAG

[Korean version](readme-kr.md)

This FastAPI application brings financial education, market and chart analysis, investment practice, and document-grounded RAG into one web portal. The repository combines the existing port 80 web app and analysis modules into a unified experience.

> This service is for education and analytical support. Simulations, backtests, and RAG answers shown in the portal are neither trading signals nor investment advice. Users are responsible for their own investment decisions.

## Features

- **Dashboard and market data:** Market overviews, stock information, intraday and historical price charts, and data visualizations
- **Drawing charts and analysis tools:** Chart annotations and technical analysis views
- **Integrated lessons:** Ten lessons covering corporations, taxation, macroeconomics, stocks, trading strategies, LEAN, funds, ETFs, bonds, and asset allocation
- **Investment practice:** Portfolio construction, market shock scenarios, asset allocation simulations, and QuantConnect LEAN backtests
- **RAG chat:** A conversational assistant that retrieves and cites learning and financial documents
- **Accounts and screen capture:** Authentication and capture tools in the shared portal interface

## Architecture

```text
Browser
  └─ Single-origin FastAPI app (:80 or behind a :443 proxy)
       ├─ Vanilla JavaScript portal UI
       │   ├─ GNB / LNB / off-canvas navigation
       │   ├─ Static lesson pages 01–10
       │   └─ Charts, visualizations, and simulations
       ├─ FastAPI API
       │   ├─ RAG / document ingestion / health
       │   ├─ Market data / simulations / LEAN backtests
       │   └─ Authentication
       ├─ Qdrant: document chunk embeddings and similarity search
       ├─ PostgreSQL + pgvector: service data, conversations, and long-term memory
       ├─ Redis: caching and supporting infrastructure
       └─ Ollama or an OpenAI-compatible LLM API: answer generation
```

When the legacy investment analysis API is deployed separately, `INVESTMENT_API_BASE` lets the portal proxy `/api/*` requests through the same origin. The frontend is integrated through modules and static assets instead of iframes.

## Tech stack

| Area | Technology | Purpose |
| --- | --- | --- |
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES Modules) | Portal UI, lessons, charts, and practice views |
| UI and visualization | ApexCharts, Mermaid, Font Awesome, html2canvas | Data charts, diagrams, icons, and screen capture |
| Backend | Python 3, FastAPI, Uvicorn, Pydantic | REST API, static file serving, and configuration validation |
| Data | PostgreSQL 16, SQLAlchemy, pgvector | User and market data, conversation logs, and long-term memory |
| Search | Qdrant, hybrid search (RRF) | Combined vector and keyword search |
| RAG and LLM | Document chunking, embeddings, Ollama or an OpenAI-compatible Chat API | Source retrieval and answer generation |
| Financial analysis | yfinance, QuantConnect LEAN | Price data and educational strategy backtests |
| Operations | Docker Compose, Caddy (production), AWS EC2 | Containers, TLS reverse proxy, and deployment |

The default Qdrant collection is `domain_docs`. Learning materials and other imported documents are indexed there. `pgvector` supports vector search over relational service data such as conversations and long-term memory; Qdrant remains the document search store.

## Main directories

```text
app/
  api/routes/           # RAG, market, simulation, backtest, and authentication APIs
  services/             # Search, embeddings, LLM, LEAN execution, and memory services
  ops/                  # Indexing, reindexing, and price-data backfill tasks
frontend/
  index.html            # Portal shell
  app.js, style.css     # Shared UI and view rendering
  lessons/              # 01.html through 10.html and the shared lesson frame
  investment-native/    # Analysis view modules and visualization components
data/                   # Learning materials, uploaded documents, and working data
DATA-ROOT/              # Labeled learning corpus for indexing
docker-compose.yml      # Local development configuration
docker-compose.prod.yml # Production configuration
```

## Quick start

### Prerequisites

- Docker Engine and the Docker Compose plugin
- An Ollama or OpenAI-compatible LLM endpoint for answer generation
- Docker execution permissions and sufficient storage if you plan to run LEAN backtests

### Local development

```bash
cp .env.local.example .env.local
# Set the LLM endpoint, model, and other values in .env.local for your environment.
docker compose --env-file .env.local -f docker-compose.yml up --build -d
```

| Service | URL |
| --- | --- |
| Portal / FastAPI | http://localhost |
| API documentation | http://localhost/docs |
| Health check | http://localhost/health |
| Streamlit companion UI | http://localhost:8290 |
| Qdrant dashboard | http://localhost:6335/dashboard |

Check service status:

```bash
docker compose --env-file .env.local -f docker-compose.yml ps
curl http://localhost/health
```

### Production deployment

Production uses `docker-compose.prod.yml` and `.env.prod`. Caddy forwards traffic on ports 80 and 443 to the API container. PostgreSQL, Redis, and Qdrant stay inside the Docker network.

```bash
cp .env.prod.example .env.prod
# Set passwords, the LLM endpoint and model, and LEAN connection values for production.
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

Do not commit PEM keys, `.env` files, API keys, database passwords, or volume data to Git.

For `iv.edumgt.co.kr`, the [EC2 deployment workflow](.github/workflows/cd.yml) runs after CI succeeds on `main` and can also be started manually. It syncs the repository to `/opt/stock-kms-portal` and rebuilds the `api` service with `deploy/st-iv/compose.yml`, preserving the server's `.env.prod`, `secrets/`, and runtime data. The workflow requires GitHub Actions secrets `EC2_HOST`, `EC2_USER`, `EC2_APP_DIR`, and `EC2_SSH_PRIVATE_KEY`. The current dedicated deployment key expires on November 23, 2026 and must be rotated before then.

## RAG data operations

After changing documents, reindex them into Qdrant's `domain_docs` collection. For example, run this in the deployment environment:

```bash
docker compose exec api python -m app.ops.reindex_vector_store
```

Use `app/ops/ingest_legacy_learning_pages.py` to ingest older learning materials and `app/ops/merge_legacy_investment_vectors.py` to merge a legacy collection. Check the target collection and back up existing data before running either script.

## Development principles

- Portal views use the same origin and shared GNB/LNB frame.
- Integrate external analysis views through their source code, static assets, and API modules rather than iframes.
- Ground RAG answers in retrieved sources, and show connection status and errors clearly when the LLM is unavailable.
- Do not use educational financial data or simulation results for real-time investment decisions.
