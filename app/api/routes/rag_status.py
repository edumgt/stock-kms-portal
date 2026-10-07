"""Small, dependency-free runtime status for the RAG landing view."""

from __future__ import annotations

import threading
from urllib.parse import urlparse

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/rag", tags=["rag"])

_cpu_lock = threading.Lock()
_previous_cpu: tuple[int, int] | None = None


def _cpu_snapshot() -> tuple[int, int]:
    with open("/proc/stat", encoding="utf-8") as stat_file:
        parts = stat_file.readline().split()[1:]
    values = [int(value) for value in parts]
    total = sum(values)
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    return total, idle


def _cpu_percent() -> float | None:
    global _previous_cpu
    current = _cpu_snapshot()
    with _cpu_lock:
        previous = _previous_cpu
        _previous_cpu = current
    if not previous:
        return None
    total_delta = current[0] - previous[0]
    idle_delta = current[1] - previous[1]
    if total_delta <= 0:
        return None
    return round(max(0.0, min(100.0, (1 - idle_delta / total_delta) * 100)), 1)


@router.get("/status")
def rag_status():
    """Expose the local model configuration and sampled host CPU utilization."""
    endpoint = urlparse(settings.vllm_base_url)
    provider = "Ollama (로컬)" if "ollama" in (endpoint.hostname or "") else "OpenAI 호환 API"
    if settings.llm_transport == "ssh":
        provider = "Docker Ollama (사설 SSH)"
    return {
        "provider": provider,
        "model": settings.vllm_model,
        "cpu_percent": _cpu_percent(),
        "sample_seconds": 5,
    }
