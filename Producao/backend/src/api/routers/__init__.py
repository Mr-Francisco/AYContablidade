"""Routers da API, um por domínio.

Cada área tem o seu ficheiro — `auth_router`, `user_router`, `licenca_router`,
`empresa_router` — e é aqui que ficam agregados para o `main` os registar.
"""

from src.api.routers import (
    apuramentos_router,
    auth_router,
    contabilidade_router,
    empresa_router,
    licenca_router,
    relatorios_router,
    user_router,
)

# Ordem de registo na aplicação.
ROUTERS = (
    auth_router.router,
    user_router.router,
    empresa_router.router,
    licenca_router.router_publico,
    licenca_router.router,
    contabilidade_router.router,
    relatorios_router.router,
    apuramentos_router.router,
)

__all__ = [
    "ROUTERS",
    "apuramentos_router",
    "auth_router",
    "contabilidade_router",
    "empresa_router",
    "licenca_router",
    "relatorios_router",
    "user_router",
]
