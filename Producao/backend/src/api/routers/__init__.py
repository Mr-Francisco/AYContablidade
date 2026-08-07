"""Routers da API, um por domínio.

Cada área tem o seu ficheiro — `auth_router`, `user_router`, `licenca_router`,
`empresa_router` — e é aqui que ficam agregados para o `main` os registar.
"""

from src.api.routers import auth_router, empresa_router, licenca_router, user_router

# Ordem de registo na aplicação.
ROUTERS = (
    auth_router.router,
    user_router.router,
    empresa_router.router,
    licenca_router.router_publico,
    licenca_router.router,
)

__all__ = ["ROUTERS", "auth_router", "empresa_router", "licenca_router", "user_router"]
