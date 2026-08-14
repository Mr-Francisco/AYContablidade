"""Routers da API, um por domínio.

Cada área tem o seu ficheiro e é aqui que ficam agregados para o `main` os
registar. Regra 5: nenhum expõe dados sem Depends de autenticação — as únicas
excepções são `/api/health` e a submissão pública de pedido de licença, que por
definição é feita por quem ainda não tem conta.
"""

from src.api.routers import (
    apuramentos_router,
    auth_router,
    comercial_router,
    compras_router,
    contabilidade_router,
    empresa_router,
    fiscalidade_router,
    ia_router,
    imobilizados_router,
    licenca_router,
    logistica_router,
    relatorios_router,
    rh_router,
    totp_router,
    user_router,
)

# Ordem de registo na aplicação.
ROUTERS = (
    auth_router.router,
    totp_router.router,
    # ANTES do router de administração: este tem `/{user_id}`, que casa com
    # `/metadados` e o mandava para o guarda de administrador.
    user_router.router_vocabulario,
    user_router.router,
    empresa_router.router,
    empresa_router.router_cartao,
    licenca_router.router_publico,
    licenca_router.router,
    contabilidade_router.router,
    relatorios_router.router,
    apuramentos_router.router,
    rh_router.router,
    logistica_router.router,
    comercial_router.router,
    compras_router.router,
    imobilizados_router.router,
    fiscalidade_router.router,
    ia_router.router,
)

__all__ = [
    "ROUTERS",
    "apuramentos_router",
    "auth_router",
    "comercial_router",
    "compras_router",
    "contabilidade_router",
    "empresa_router",
    "fiscalidade_router",
    "ia_router",
    "imobilizados_router",
    "licenca_router",
    "logistica_router",
    "relatorios_router",
    "rh_router",
    "totp_router",
    "user_router",
]
