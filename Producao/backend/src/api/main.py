"""Aplicação FastAPI.

Nota: NÃO usar `from __future__ import annotations` neste módulo nem em módulos
com rotas decoradas por `@limiter.limit` — o slowapi rebenta com
TypeError/ForwardRef com anotações adiadas (ver docs/LESSONS.md).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from src.core.config import get_settings

settings = get_settings()

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_GERAL])


def criar_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="API do ERP de Contabilidade AYContabilidade.",
        version="0.1.0",
        docs_url="/docs" if settings.AMBIENTE != "producao" else None,
        redoc_url=None,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", tags=["sistema"])
    def health() -> dict[str, str]:
        """Sonda de disponibilidade. Única rota sem autenticação."""
        return {"estado": "ok", "ambiente": settings.AMBIENTE}

    # Os routers de dados são registados aqui à medida que os módulos forem
    # migrados. Regra 5: nenhum deles pode ser exposto sem Depends de autenticação.

    return app


app = criar_app()
