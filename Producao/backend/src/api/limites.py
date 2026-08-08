"""Limitação de pedidos por IP.

Vive num módulo próprio e não no `main` porque o `main` importa os routers: se
o limiter estivesse lá, qualquer router que o quisesse usar fecharia um ciclo
de importação.

O `Limiter` tem um limite geral que cobre todas as rotas. As rotas onde uma
tentativa falhada tem valor para quem ataca — entrar, activar uma licença —
levam por cima um limite muito mais apertado, porque 120 tentativas por minuto
contra um formulário de entrada não é protecção nenhuma.

Nota: NÃO usar `from __future__ import annotations` em módulos com rotas
decoradas por `@limiter.limit` — o slowapi rebenta com ForwardRef
(docs/LESSONS.md).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from src.core.config import get_settings

settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_GERAL],
)

#: Limite das rotas de autenticação e activação. Aplicado por IP.
LIMITE_LOGIN = settings.RATE_LIMIT_LOGIN
