"""Rotas de autenticação.

Transposto de `login()`, `registar()` e `requireAuth()` de
`Piloto/assets/js/app.js`, com as mensagens de erro preservadas.

Nota: NÃO usar `from __future__ import annotations` neste ficheiro — o
`@limiter.limit` do slowapi rebenta com anotações adiadas (docs/LESSONS.md).
"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from src.api.deps import DB, UtilizadorAtual, licenca_da_empresa
from src.auth.permissions import licenca_valida
from src.auth.security import (
    criar_access_token,
    descodificar_token,
    hash_password,
    validar_forca_password,
    verificar_password,
)
from src.core.config import get_settings
from src.core.constants import PERFIS_REGISTO, EstadoEmpresa, Perfil
from src.db.base import agora
from src.db.models.tenancy import Empresa
from src.db.models.user import User
from src.db.schemas.auth import (
    AlterarPasswordPedido,
    LoginPedido,
    RegistoPedido,
    TokenResposta,
    UtilizadorPublico,
)

router = APIRouter(prefix="/api/auth", tags=["autenticação"])
settings = get_settings()


def _token_para(user: User, expira_absoluto: datetime | None = None) -> TokenResposta:
    token, absoluto = criar_access_token(
        user_id=user.id,
        empresa_id=user.empresa_id,
        perfil=str(user.perfil),
        token_version=user.token_version,
        expira_absoluto=expira_absoluto,
    )
    return TokenResposta(
        access_token=token,
        expira_absoluto=absoluto,
        utilizador=UtilizadorPublico.model_validate(user),
    )


@router.post("/login", response_model=TokenResposta)
def login(request: Request, dados: LoginPedido, db: DB) -> TokenResposta:
    """Inicia sessão.

    A mensagem é deliberadamente igual para e-mail inexistente e palavra-passe
    errada, para não revelar que contas existem.
    """
    user = db.scalar(select(User).where(func.lower(User.email) == dados.email.lower()))

    if user is None or not verificar_password(dados.password, user.password_hash):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "E-mail ou palavra-passe inválidos."
        )
    if not user.aprovado:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Conta pendente de aprovação. Aguarde a validação de um Administrador.",
        )
    if not user.ativo:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Conta desativada. Contacte o administrador."
        )

    # O superadmin da plataforma não tem empresa nem licença que validar.
    if user.empresa_id is not None:
        empresa = db.get(Empresa, user.empresa_id)
        if empresa is None or empresa.estado != EstadoEmpresa.ACTIVA:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "A empresa não está activa. Contacte o suporte.",
            )
        if not licenca_valida(licenca_da_empresa(db, empresa.id)):
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "A licença da empresa não está activa ou expirou.",
            )

    user.ultimo_login = agora()
    db.commit()
    db.refresh(user)
    return _token_para(user)


@router.post("/refresh", response_model=TokenResposta)
def refresh(request: Request, user: UtilizadorAtual, db: DB) -> TokenResposta:
    """Renova o token sem prolongar a sessão.

    A expiração absoluta do token actual é reaproveitada, por isso renovar
    indefinidamente não mantém a sessão viva para além do limite fixado no login.
    """
    from src.api.deps import obter_token  # local: evita import circular

    token = obter_token(
        authorization=request.headers.get("authorization"),
        aycontab_access_token=request.cookies.get("aycontab_access_token"),
    )
    payload = descodificar_token(token)

    absoluto = payload.get("sa")
    expira_absoluto = (
        datetime.fromtimestamp(int(absoluto), tz=UTC) if absoluto else None
    )
    if expira_absoluto is not None and expira_absoluto <= agora():
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "A sessão atingiu o limite máximo. Volte a iniciar sessão.",
        )
    return _token_para(user, expira_absoluto=expira_absoluto)


@router.post("/registar", response_model=UtilizadorPublico, status_code=status.HTTP_201_CREATED)
def registar(request: Request, dados: RegistoPedido, db: DB) -> UtilizadorPublico:
    """Auto-registo numa empresa existente.

    Preserva o fluxo do Piloto — a conta nasce por aprovar e um administrador
    valida-a — acrescentando só o que a multiempresa exige: saber a que empresa
    o registo se destina, indicada pelo NIF.
    """
    validar_forca_password(dados.password)

    if dados.perfil not in PERFIS_REGISTO:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Perfil não disponível para registo.",
        )

    empresa = db.scalar(select(Empresa).where(Empresa.nif == dados.nif_empresa.strip()))
    # Mensagem neutra: não confirma que NIFs estão registados na plataforma.
    if empresa is None or empresa.estado != EstadoEmpresa.ACTIVA:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Não foi encontrada nenhuma empresa activa com esse NIF.",
        )

    ja_existe = db.scalar(
        select(User.id).where(func.lower(User.email) == dados.email.lower())
    )
    if ja_existe is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe uma conta com este e-mail."
        )

    user = User(
        empresa_id=empresa.id,
        nome=dados.nome.strip(),
        email=dados.email.lower(),
        password_hash=hash_password(dados.password),
        perfil=dados.perfil,
        telefone=(dados.telefone or "").strip() or None,
        ativo=True,
        aprovado=False,  # como no Piloto: espera aprovação
        permissoes_extra=[],
        permissoes_accao={},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UtilizadorPublico.model_validate(user)


@router.get("/me", response_model=UtilizadorPublico)
def me(user: UtilizadorAtual) -> UtilizadorPublico:
    """Utilizador da sessão actual."""
    return UtilizadorPublico.model_validate(user)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def alterar_password(
    request: Request, dados: AlterarPasswordPedido, user: UtilizadorAtual, db: DB
) -> None:
    """Altera a própria palavra-passe.

    Incrementa a `token_version`, o que revoga imediatamente todas as sessões
    abertas — incluindo a que fez o pedido. A interface tem de pedir novo login.
    """
    if not verificar_password(dados.password_atual, user.password_hash):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "A palavra-passe actual não está correcta."
        )
    validar_forca_password(dados.password_nova)

    user.password_hash = hash_password(dados.password_nova)
    user.token_version += 1
    db.commit()
