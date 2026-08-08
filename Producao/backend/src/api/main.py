"""Aplicação FastAPI.

Nota: NÃO usar `from __future__ import annotations` neste módulo nem em módulos
com rotas decoradas por `@limiter.limit` — o slowapi rebenta com
TypeError/ForwardRef com anotações adiadas (ver docs/LESSONS.md).
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.api.json import RespostaJSON
from src.core.config import get_settings
from src.services.contabilidade import ErroContabilistico

settings = get_settings()

# O limiter vive em `src/api/limites.py` para os routers o poderem importar
# sem fechar um ciclo — este módulo importa-os a eles.
from src.api.limites import limiter  # noqa: E402


def criar_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="API do ERP de Contabilidade AYContabilidade.",
        version="0.1.0",
        docs_url="/docs" if settings.AMBIENTE != "producao" else None,
        redoc_url=None,
        # Valores monetários viajam como string — ver src/api/json.py.
        default_response_class=RespostaJSON,
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

    # Um router por domínio (src/api/routers/). Regra 5: nenhum expõe dados sem
    # Depends de autenticação — a única excepção do sistema é /api/health e a
    # submissão pública de pedido de licença, que por definição é feita por quem
    # ainda não tem conta.
    from src.api.routers import ROUTERS

    for r in ROUTERS:
        app.include_router(r)

    @app.exception_handler(ErroContabilistico)
    def _erro_contabilistico(request: Request, exc: ErroContabilistico) -> JSONResponse:
        """Uma violação de regra contabilística é um erro do pedido, não do
        servidor: devolve 422 com a mensagem, em vez de um 500 opaco."""
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    return app


app = criar_app()
