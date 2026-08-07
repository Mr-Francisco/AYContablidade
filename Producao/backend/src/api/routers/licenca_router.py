"""Licenciamento: pedidos, aprovação e gestão de licenças.

Implementa o processo de entrada de uma empresa descrito em
`docs/TENANCY_AND_ACCESS.md`:
  1. a empresa submete o pedido a partir da página inicial (rota pública);
  2. o superadministrador valida e aprova;
  3. a aprovação cria a empresa, a licença, o administrador inicial e faz o
     seed do plano de contas — tudo numa transacção.

Nota: NÃO usar `from __future__ import annotations` aqui — slowapi
(docs/LESSONS.md).
"""

import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select

from src.api.deps import DB, UtilizadorAtual, exigir_superadmin
from src.auth.security import hash_password, validar_forca_password
from src.core.constants import (
    EstadoEmpresa,
    EstadoLicenca,
    EstadoPedidoLicenca,
    Perfil,
)
from src.db.base import agora
from src.db.models.tenancy import Empresa, Licenca, PedidoLicenca
from src.db.models.user import User
from src.db.schemas.licenca import (
    AprovarPedidoLicenca,
    EmpresaPublica,
    LicencaAtualizar,
    LicencaPublica,
    PedidoLicencaCriar,
    PedidoLicencaPublico,
    RecusarPedidoLicenca,
)
from src.services.seed import seed_empresa

# Rotas públicas (sem autenticação) — o pedido é submetido por quem ainda não
# tem conta. É a única parte do sistema fora da Regra 5, por definição.
router_publico = APIRouter(prefix="/api/licencas", tags=["licenciamento"])

# Rotas de administração da plataforma.
router = APIRouter(
    prefix="/api/licencas",
    tags=["licenciamento"],
    dependencies=[Depends(exigir_superadmin)],
)


def _gerar_chave(db: DB) -> str:
    """Chave de licença SGD-XXXX-XXXX-XXXX, garantidamente livre."""
    alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem I/O/0/1, para leitura humana
    for _ in range(20):
        grupos = [
            "".join(secrets.choice(alfabeto) for _ in range(4)) for _ in range(3)
        ]
        chave = "SGD-" + "-".join(grupos)
        if db.scalar(select(Licenca.id).where(Licenca.chave == chave)) is None:
            return chave
    raise HTTPException(
        status.HTTP_500_INTERNAL_SERVER_ERROR, "Não foi possível gerar a chave."
    )


# ---------------------------------------------------------------------------
# Público
# ---------------------------------------------------------------------------
@router_publico.post(
    "/pedidos", response_model=PedidoLicencaPublico, status_code=status.HTTP_201_CREATED
)
def submeter_pedido(
    request: Request, dados: PedidoLicencaCriar, db: DB
) -> PedidoLicencaPublico:
    """Submete um pedido de licença. Não requer autenticação."""
    nif = dados.nif.strip()

    if db.scalar(select(Empresa.id).where(Empresa.nif == nif)) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Já existe uma empresa registada com este NIF.",
        )
    pendente = db.scalar(
        select(PedidoLicenca.id).where(
            PedidoLicenca.nif == nif,
            PedidoLicenca.estado == EstadoPedidoLicenca.PENDENTE,
        )
    )
    if pendente is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Já existe um pedido pendente para este NIF. Aguarde a nossa resposta.",
        )

    pedido = PedidoLicenca(
        nome_empresa=dados.nome_empresa.strip(),
        nif=nif,
        email_contacto=dados.email_contacto.lower(),
        responsavel=dados.responsavel.strip(),
        telefone=(dados.telefone or "").strip() or None,
        plano_pretendido=dados.plano_pretendido,
        mensagem=dados.mensagem,
        estado=EstadoPedidoLicenca.PENDENTE,
    )
    db.add(pedido)
    db.commit()
    db.refresh(pedido)
    return PedidoLicencaPublico.model_validate(pedido)


# ---------------------------------------------------------------------------
# Superadministrador
# ---------------------------------------------------------------------------
@router.get("/pedidos", response_model=list[PedidoLicencaPublico])
def listar_pedidos(
    db: DB, estado: EstadoPedidoLicenca | None = None
) -> list[PedidoLicencaPublico]:
    q = select(PedidoLicenca).order_by(PedidoLicenca.criado_em.desc())
    if estado is not None:
        q = q.where(PedidoLicenca.estado == estado)
    return [PedidoLicencaPublico.model_validate(p) for p in db.scalars(q).all()]


@router.post("/pedidos/{pedido_id}/aprovar", response_model=EmpresaPublica)
def aprovar_pedido(
    request: Request,
    pedido_id: UUID,
    dados: AprovarPedidoLicenca,
    atual: UtilizadorAtual,
    db: DB,
) -> EmpresaPublica:
    """Aprova um pedido: cria empresa, licença, administrador inicial e seed.

    Tudo numa transacção — uma empresa criada sem licença, sem administrador ou
    sem plano de contas ficaria inutilizável e sem forma de ser corrigida pelo
    próprio cliente.
    """
    pedido = db.get(PedidoLicenca, pedido_id)
    if pedido is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    if pedido.estado != EstadoPedidoLicenca.PENDENTE:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"O pedido já foi {pedido.estado}."
        )

    validar_forca_password(dados.admin_password)

    if db.scalar(select(Empresa.id).where(Empresa.nif == pedido.nif)) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe uma empresa com este NIF."
        )
    if (
        db.scalar(
            select(User.id).where(func.lower(User.email) == dados.admin_email.lower())
        )
        is not None
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Já existe uma conta com o e-mail indicado para o administrador.",
        )

    empresa = Empresa(
        nome=pedido.nome_empresa,
        nif=pedido.nif,
        email=pedido.email_contacto,
        telefone=pedido.telefone,
        regime=dados.regime,
        estado=EstadoEmpresa.ACTIVA,
    )
    db.add(empresa)
    db.flush()

    db.add(
        Licenca(
            empresa_id=empresa.id,
            chave=_gerar_chave(db),
            titular=pedido.nome_empresa,
            plano=dados.plano,
            validade=dados.validade,
            estado=EstadoLicenca.ACTIVA,
            modulos_incluidos=dados.modulos_incluidos,
            limite_utilizadores=dados.limite_utilizadores,
            aprovada_por_id=atual.id,
            aprovada_em=agora(),
            notas=dados.notas,
        )
    )

    # Administrador inicial: já nasce aprovado, senão não haveria ninguém para
    # o aprovar.
    db.add(
        User(
            empresa_id=empresa.id,
            nome=dados.admin_nome.strip(),
            email=dados.admin_email.lower(),
            password_hash=hash_password(dados.admin_password),
            perfil=Perfil.ADMIN,
            ativo=True,
            aprovado=True,
            aprovado_por_id=atual.id,
            aprovado_em=agora(),
            permissoes_extra=[],
            permissoes_accao={},
        )
    )

    seed_empresa(db, empresa)

    pedido.estado = EstadoPedidoLicenca.APROVADO
    pedido.decidido_por_id = atual.id
    pedido.decidido_em = agora()
    pedido.empresa_id = empresa.id

    db.commit()
    db.refresh(empresa)
    return EmpresaPublica.model_validate(empresa)


@router.post("/pedidos/{pedido_id}/recusar", response_model=PedidoLicencaPublico)
def recusar_pedido(
    request: Request,
    pedido_id: UUID,
    dados: RecusarPedidoLicenca,
    atual: UtilizadorAtual,
    db: DB,
) -> PedidoLicencaPublico:
    pedido = db.get(PedidoLicenca, pedido_id)
    if pedido is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pedido não encontrado.")
    if pedido.estado != EstadoPedidoLicenca.PENDENTE:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"O pedido já foi {pedido.estado}."
        )

    pedido.estado = EstadoPedidoLicenca.REJEITADO
    pedido.motivo_recusa = dados.motivo
    pedido.decidido_por_id = atual.id
    pedido.decidido_em = agora()

    db.commit()
    db.refresh(pedido)
    return PedidoLicencaPublico.model_validate(pedido)


@router.get("", response_model=list[LicencaPublica])
def listar_licencas(db: DB) -> list[LicencaPublica]:
    licencas = db.scalars(select(Licenca).order_by(Licenca.criado_em.desc())).all()
    return [LicencaPublica.model_validate(l) for l in licencas]


@router.get("/empresas", response_model=list[EmpresaPublica])
def listar_empresas(db: DB) -> list[EmpresaPublica]:
    """Todas as empresas da plataforma — o ecrã de gestão do superadmin."""
    empresas = db.scalars(select(Empresa).order_by(Empresa.nome)).all()
    return [EmpresaPublica.model_validate(e) for e in empresas]


@router.patch("/{licenca_id}", response_model=LicencaPublica)
def atualizar_licenca(
    request: Request, licenca_id: UUID, dados: LicencaAtualizar, db: DB
) -> LicencaPublica:
    """Altera plano, validade, estado, módulos ou limite de utilizadores."""
    licenca = db.get(Licenca, licenca_id)
    if licenca is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Licença não encontrada.")

    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(licenca, campo, valor)

    db.commit()
    db.refresh(licenca)
    return LicencaPublica.model_validate(licenca)
