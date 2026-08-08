"""Licenciamento: geração pelo superadministrador e activação pela empresa.

O processo tem dois lados e só um deles é público:

  1. O superadministrador GERA uma licença para uma empresa que ainda não
     existe, indicando NIF, nome, duração e limites. A chave é mostrada uma
     única vez — a base guarda só o seu SHA-256.
  2. Quem recebe a chave tem 7 dias para a ACTIVAR. A activação cria a empresa,
     o administrador inicial e faz o seed do plano de contas, tudo numa
     transacção. A licença serve uma vez só.

A rota de activação é pública por definição: quem a usa ainda não tem conta.
É a única excepção à Regra 5, e leva por isso o limite de pedidos apertado —
uma chave é adivinhável por força bruta se se puderem tentar milhares por
minuto.

Nota: NÃO usar `from __future__ import annotations` aqui — slowapi
(docs/LESSONS.md).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select

from src.api.deps import DB, UtilizadorAtual, exigir_superadmin
from src.api.limites import LIMITE_LOGIN, limiter
from src.auth.security import hash_password, validar_forca_password
from src.core.constants import EstadoLicenca
from src.db.models.tenancy import Empresa, Licenca
from src.db.schemas.licenca import (
    ActivacaoPedido,
    ActivacaoResposta,
    EmpresaPublica,
    LicencaAtualizar,
    LicencaCriar,
    LicencaGerada,
    LicencaPublica,
)
from src.services import licenciamento as lic_svc
from src.services.licenciamento import ErroLicenca
from src.services.seed import seed_empresa

# Rota pública — quem activa ainda não tem conta.
router_publico = APIRouter(prefix="/api/licencas", tags=["licenciamento"])

# Administração da plataforma.
router = APIRouter(
    prefix="/api/licencas",
    tags=["licenciamento"],
    dependencies=[Depends(exigir_superadmin)],
)


# ---------------------------------------------------------------------------
# Público — activação
# ---------------------------------------------------------------------------
@router_publico.post("/activar", response_model=ActivacaoResposta)
@limiter.limit(LIMITE_LOGIN)
def activar(request: Request, dados: ActivacaoPedido, db: DB) -> ActivacaoResposta:
    """Activa uma licença, criando a empresa e o seu administrador.

    Rota pública e, por isso, limitada a poucos pedidos por minuto e por IP:
    sem esse travão, uma chave de 60 bits continuaria fora de alcance mas o
    endpoint ficaria aberto a ser martelado.
    """
    validar_forca_password(dados.admin_password)
    try:
        r = lic_svc.activar(
            db,
            chave=dados.chave,
            nif=dados.nif,
            nome_empresa=dados.nome_empresa or "",
            admin_nome=dados.admin_nome,
            admin_email=dados.admin_email,
            admin_password_hash=hash_password(dados.admin_password),
            telefone=dados.telefone,
        )
    except ErroLicenca as e:
        # A licença pode ter sido marcada como expirada dentro do serviço —
        # esse efeito tem de ficar gravado mesmo com o pedido a falhar.
        db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e

    empresa = db.get(Empresa, r["empresa_id"])
    # O seed corre na MESMA transacção que a criação: uma empresa sem plano de
    # contas não serviria para nada, e ficar a meio seria pior do que falhar.
    seed_empresa(db, empresa)
    db.commit()

    return ActivacaoResposta(
        empresa_id=r["empresa_id"],
        empresa_nome=r["empresa_nome"],
        codigo_empresa=r["codigo_empresa"],
        plano=r["plano"],
        validade=r["validade"],
    )


# ---------------------------------------------------------------------------
# Superadministrador
# ---------------------------------------------------------------------------
@router.post("", response_model=LicencaGerada, status_code=status.HTTP_201_CREATED)
def gerar(
    request: Request, dados: LicencaCriar, user: UtilizadorAtual, db: DB
) -> LicencaGerada:
    """Gera uma licença. A chave devolvida NÃO volta a ser recuperável."""
    try:
        lic, chave = lic_svc.gerar_licenca(
            db,
            nif=dados.nif,
            nome_empresa=dados.nome_empresa,
            titular=dados.titular or dados.nome_empresa,
            plano=dados.plano,
            duracao_meses=dados.duracao_meses,
            modulos_incluidos=dados.modulos_incluidos,
            limite_utilizadores=dados.limite_utilizadores,
            limite_tokens_mes=dados.limite_tokens_mes,
            limite_custo_mes=dados.limite_custo_mes,
            notas=dados.notas,
            criada_por_id=user.id,
        )
    except ErroLicenca as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e

    db.commit()
    db.refresh(lic)
    return LicencaGerada(
        id=lic.id,
        chave=chave,
        chave_prefixo=lic.chave_prefixo,
        nif_previsto=lic.nif_previsto,
        nome_previsto=lic.nome_previsto,
        plano=lic.plano,
        expira_activacao=lic.expira_activacao,
        dias_para_activar=lic_svc.DIAS_PARA_ACTIVAR,
    )


@router.get("", response_model=list[LicencaPublica])
def listar(db: DB, estado: str | None = None) -> list[LicencaPublica]:
    """Licenças da plataforma.

    Marca as pendentes fora de prazo antes de listar, para a lista dizer a
    verdade — a verificação que conta é a da activação, esta é arrumação.
    """
    lic_svc.caducar_pendentes(db)
    db.commit()

    q = select(Licenca)
    if estado:
        q = q.where(Licenca.estado == estado)
    return [
        LicencaPublica.model_validate(l)
        for l in db.scalars(q.order_by(Licenca.criado_em.desc())).all()
    ]


@router.get("/empresas", response_model=list[EmpresaPublica])
def empresas(db: DB) -> list[EmpresaPublica]:
    """Empresas da plataforma. Só o superadministrador as vê todas."""
    return [
        EmpresaPublica.model_validate(e)
        for e in db.scalars(select(Empresa).order_by(Empresa.nome)).all()
    ]


@router.patch("/{licenca_id}", response_model=LicencaPublica)
def atualizar(
    request: Request, licenca_id: UUID, dados: LicencaAtualizar, db: DB
) -> LicencaPublica:
    """Altera o contrato: plano, validade, estado e limites.

    A chave não está aqui de propósito. Trocar a chave de uma licença já
    activada não faz sentido — a empresa existe e já entra pelo login. Para
    emitir uma chave nova gera-se outra licença.
    """
    lic = db.get(Licenca, licenca_id)
    if lic is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Licença não encontrada.")

    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(lic, campo, valor)

    db.commit()
    db.refresh(lic)
    return LicencaPublica.model_validate(lic)


@router.delete("/{licenca_id}", status_code=status.HTTP_204_NO_CONTENT)
def revogar(request: Request, licenca_id: UUID, db: DB) -> None:
    """Revoga uma licença.

    Uma licença POR ACTIVAR é apagada — não chegou a servir para nada. Uma
    licença JÁ ACTIVADA passa a cancelada e fica: apagá-la deixaria a empresa
    sem registo do contrato que a criou, e o histórico de facturação depende
    disso.
    """
    lic = db.get(Licenca, licenca_id)
    if lic is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Licença não encontrada.")

    if lic.empresa_id is None:
        db.delete(lic)
    else:
        lic.estado = EstadoLicenca.CANCELADA
    db.commit()
