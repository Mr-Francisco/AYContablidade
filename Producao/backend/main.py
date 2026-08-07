"""Ponto de entrada do backend.

Arrancar em desenvolvimento:
    cd Producao/backend && .venv/Scripts/uvicorn main:app --reload --port 8001
"""

from src.api.main import app

__all__ = ["app"]
