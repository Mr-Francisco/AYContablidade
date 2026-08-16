"""Aplicação FastAPI.

Nota: NÃO usar `from __future__ import annotations` neste módulo nem em módulos
com rotas decoradas por `@limiter.limit` — o slowapi rebenta com
TypeError/ForwardRef com anotações adiadas (ver docs/LESSONS.md).
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from src.api.json import RespostaJSON
from src.core.config import get_settings
from src.auth.security import ErroPolitica
from src.services.contabilidade import ErroContabilistico

settings = get_settings()

# O limiter vive em `src/api/limites.py` para os routers o poderem importar
# sem fechar um ciclo — este módulo importa-os a eles.
from src.api.limites import limiter  # noqa: E402


def _limite_excedido(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Resposta ao limite de pedidos, em português e na chave certa.

    O tratador que vem com o slowapi devolve `{"error": "Rate limit exceeded:
    5 per 1 minute"}`. Duas coisas mal: está em inglês, e a interface lê a
    mensagem de `detail` — não encontrando nada, mostrava «Erro 429» e mais
    nada.

    Isto apanhava sobretudo quem estava às voltas com o segundo factor: ao fim
    de meia dúzia de tentativas o ecrã deixava de explicar o que quer que
    fosse, e a impressão que fica é a de um sistema avariado.
    """
    return JSONResponse(
        status_code=429,
        content={
            "detail": (
                "Demasiadas tentativas em pouco tempo. Aguarde um minuto e "
                "volte a tentar."
            )
        },
        headers={"Retry-After": "60"},
    )


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
    app.add_exception_handler(RateLimitExceeded, _limite_excedido)

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

    @app.exception_handler(ErroPolitica)
    def _erro_politica(request: Request, exc: ErroPolitica) -> JSONResponse:
        """Palavra-passe fora da política: é o pedido que está errado.

        REGRESSÃO CORRIGIDA: isto rebentava com 500 em cinco rotas — activar
        licença, criar utilizador, repor palavra-passe, alterar a própria e o
        registo. E um 500 por excepção não tratada sai sem os cabeçalhos de
        CORS: o browser bloqueia a resposta e mostra «não foi possível
        contactar o servidor», que manda a pessoa verificar a ligação à
        Internet por causa de uma palavra-passe curta.
        """
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    return app


app = criar_app()
