"""Dependências partilhadas pelos routers.

Regra 5: nenhuma rota de dados existe sem uma destas dependências. A única
excepção do sistema é `/api/health`.

As três camadas de `docs/TENANCY_AND_ACCESS.md` são aplicadas aqui, para que
nenhum router se possa esquecer de uma:
  1. utilizador autenticado, activo, aprovado e com token da versão corrente;
  2. licença da empresa válida;
  3. capacidade / permissão de acção.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.permissions import licenca_valida, pode, pode_accao
from src.auth.security import TokenInvalido, descodificar_token
from src.core.constants import Accao, EstadoEmpresa, Modulo, Perfil
from src.db.base import get_db
from src.db.models.tenancy import Empresa, Licenca
from src.db.models.user import User

# Nome próprio da aplicação. Cookies em localhost são partilhados entre PORTAS,
# por isso um nome genérico como "access_token" colide com outra app na mesma
# máquina e provoca logouts sem qualquer 401 nos registos (docs/LESSONS.md).
COOKIE_SESSAO = "aycontab_access_token"


def _nao_autenticado(detalhe: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detalhe,
        headers={"WWW-Authenticate": "Bearer"},
    )


def obter_token(
    authorization: Annotated[str | None, Header()] = None,
    aycontab_access_token: Annotated[str | None, Cookie()] = None,
) -> str:
    """Lê o token do cabeçalho Authorization ou do cookie da sessão."""
    if authorization:
        esquema, _, valor = authorization.partition(" ")
        if esquema.lower() != "bearer" or not valor:
            raise _nao_autenticado("Cabeçalho Authorization mal formado.")
        return valor
    if aycontab_access_token:
        return aycontab_access_token
    raise _nao_autenticado("Sessão não iniciada.")


def utilizador_atual(
    token: Annotated[str, Depends(obter_token)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Valida o token e devolve o utilizador."""
    try:
        payload = descodificar_token(token)
    except TokenInvalido as e:
        raise _nao_autenticado(str(e)) from e

    try:
        user_id = UUID(str(payload.get("sub")))
    except (TypeError, ValueError) as e:
        raise _nao_autenticado("Token inválido.") from e

    user = db.get(User, user_id)
    if user is None:
        raise _nao_autenticado("Utilizador inexistente.")

    # A versão do token tem de bater com a do utilizador: qualquer mudança de
    # palavra-passe, perfil ou estado incrementa-a e invalida sessões abertas.
    if int(payload.get("tv", -1)) != user.token_version:
        raise _nao_autenticado("Sessão revogada. Volte a iniciar sessão.")

    if not user.aprovado:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Conta pendente de aprovação. Aguarde a validação de um Administrador.",
        )
    if not user.ativo:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Conta desativada. Contacte o administrador."
        )
    return user


UtilizadorAtual = Annotated[User, Depends(utilizador_atual)]
DB = Annotated[Session, Depends(get_db)]


def licenca_da_empresa(db: Session, empresa_id: UUID) -> Licenca | None:
    """Licença activa mais recente de uma empresa."""
    return db.scalar(
        select(Licenca)
        .where(Licenca.empresa_id == empresa_id, Licenca.estado == "activa")
        .order_by(Licenca.criado_em.desc())
        .limit(1)
    )


def empresa_atual(user: UtilizadorAtual, db: DB) -> Empresa:
    """Empresa do utilizador, com licença e estado validados.

    O superadmin da plataforma não tem empresa — as rotas de dados de negócio
    não se aplicam a ele, e é isso que este 400 diz.
    """
    if user.empresa_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "O superadmin da plataforma não está associado a nenhuma empresa.",
        )

    empresa = db.get(Empresa, user.empresa_id)
    if empresa is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa inexistente.")
    if empresa.estado != EstadoEmpresa.ACTIVA:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"A empresa está {empresa.estado}. Contacte o suporte.",
        )

    if not licenca_valida(licenca_da_empresa(db, empresa.id)):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "A licença da empresa não está activa ou expirou.",
        )
    return empresa


EmpresaAtual = Annotated[Empresa, Depends(empresa_atual)]


def exigir_cap(acao: str):
    """Fábrica de dependência: exige uma capacidade da matriz CAPS.

    Uso:  @router.post(..., dependencies=[Depends(exigir_cap("contab.lancar"))])
    """

    def _verificar(user: UtilizadorAtual) -> User:
        if not pode(user, acao):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Sem permissão para esta operação ({acao}).",
            )
        return user

    return _verificar


def exigir_accao(modulo: Modulo, accao: Accao):
    """Fábrica de dependência: exige uma acção sobre um módulo."""

    def _verificar(user: UtilizadorAtual) -> User:
        if not pode_accao(user, modulo, accao):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Sem permissão para {accao} em {modulo}.",
            )
        return user

    return _verificar


def exigir_perfil(*perfis: Perfil):
    """Fábrica de dependência: restringe a rota a perfis concretos.

    Segue a regra do Piloto (`perfilPermitido`): o superadmin passa sempre onde
    o admin passa.
    """
    permitidos = set(perfis)

    def _verificar(user: UtilizadorAtual) -> User:
        perfil = Perfil(user.perfil)
        if perfil in permitidos:
            return user
        if perfil == Perfil.SUPERADMIN and Perfil.ADMIN in permitidos:
            return user
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Perfil sem acesso a esta operação."
        )

    return _verificar


def exigir_superadmin(user: UtilizadorAtual) -> User:
    """Só o operador da plataforma: gestão de licenças e de empresas."""
    if Perfil(user.perfil) != Perfil.SUPERADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Operação reservada ao superadministrador."
        )
    return user
