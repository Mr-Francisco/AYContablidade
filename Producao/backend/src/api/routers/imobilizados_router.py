"""Imobilizados: ficha de activos e amortizações.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from src.api.deps import DB, EmpresaAtual, UtilizadorAtual, exigir_cap
from src.db.models.imobilizados import Ativo, ProcessoAmortizacao
from src.services import imobilizados as svc

router = APIRouter(
    prefix="/api/imobilizados",
    tags=["imobilizados"],
    dependencies=[Depends(exigir_cap("imob.ver"))],
)

GERIR = Depends(exigir_cap("imob.gerir"))


class AtivoEntrada(BaseModel):
    designacao: str = Field(min_length=1, max_length=300)
    codigo: str | None = None
    conta_imob: str | None = None
    conta_amort_acum: str | None = None
    conta_custo_amort: str | None = None
    data_aquisicao: Date | None = None
    valor_aquisicao: Decimal = Decimal("0")
    taxa: Decimal = Decimal("0")
    metodo: str = Field(default="quotas", pattern="^(quotas|degressivas)$")
    amort_acumulada: Decimal = Decimal("0")
    fornecedor: str | None = None
    estado: str = "activo"


class ProcessarPedido(BaseModel):
    exercicio_id: UUID
    mes: str = Field(min_length=1, max_length=2)
    data: Date


def _ativo(db: DB, empresa_id: UUID, ativo_id: UUID) -> Ativo:
    a = db.scalar(
        select(Ativo).where(Ativo.id == ativo_id, Ativo.empresa_id == empresa_id)
    )
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activo não encontrado.")
    return a


@router.get("/metodos")
def metodos() -> list[dict]:
    return [{"cod": c, "nome": n} for c, n in svc.METODOS]


@router.get("/ativos")
def listar_ativos(empresa: EmpresaAtual, db: DB, so_ativos: bool = False) -> list[dict]:
    q = select(Ativo).where(Ativo.empresa_id == empresa.id)
    if so_ativos:
        q = q.where(Ativo.estado == "activo")
    return [
        {"id": a.id, "codigo": a.codigo, "designacao": a.designacao,
         "conta_imob": a.conta_imob, "conta_amort_acum": a.conta_amort_acum,
         "conta_custo_amort": a.conta_custo_amort,
         "data_aquisicao": a.data_aquisicao, "valor_aquisicao": a.valor_aquisicao,
         "taxa": a.taxa, "metodo": a.metodo, "amort_acumulada": a.amort_acumulada,
         "valor_liquido": svc.valor_liquido(a),
         "amort_anual": svc.amort_anual(a), "amort_mensal": svc.amort_mensal(a),
         "percent_amortizado": svc.percent_amortizado(a),
         "fornecedor": a.fornecedor, "estado": a.estado}
        for a in db.scalars(q.order_by(Ativo.codigo)).all()
    ]


@router.post("/ativos", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_ativo(
    request: Request, dados: AtivoEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    a = Ativo(
        empresa_id=empresa.id,
        codigo=dados.codigo or svc.proximo_codigo(db, empresa.id),
        **dados.model_dump(exclude={"codigo"}),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "codigo": a.codigo, "designacao": a.designacao}


@router.patch("/ativos/{ativo_id}", dependencies=[GERIR])
def atualizar_ativo(
    request: Request, ativo_id: UUID, dados: AtivoEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    a = _ativo(db, empresa.id, ativo_id)
    for campo, valor in dados.model_dump(exclude_unset=True, exclude={"codigo"}).items():
        setattr(a, campo, valor)
    db.commit()
    return {"id": a.id, "codigo": a.codigo}


@router.delete("/ativos/{ativo_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[GERIR])
def remover_ativo(
    request: Request, ativo_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    db.delete(_ativo(db, empresa.id, ativo_id))
    db.commit()


@router.get("/mapa")
def mapa(empresa: EmpresaAtual, db: DB, so_ativos: bool = False) -> dict:
    """Mapa anual de amortizações."""
    return svc.mapa(db, empresa_id=empresa.id, so_ativos=so_ativos)


@router.get("/mapa-periodo")
def mapa_periodo(
    empresa: EmpresaAtual, db: DB, exercicio_id: UUID, mes: str,
    so_ativos: bool = False,
) -> dict:
    """Mapa do período: valor já processado, ou o valor a processar."""
    return svc.mapa_periodo(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, mes=mes,
        so_ativos=so_ativos,
    )


@router.get("/processos")
def listar_processos(
    empresa: EmpresaAtual, db: DB, exercicio_id: UUID | None = None
) -> list[dict]:
    q = select(ProcessoAmortizacao).where(ProcessoAmortizacao.empresa_id == empresa.id)
    if exercicio_id:
        q = q.where(ProcessoAmortizacao.exercicio_id == exercicio_id)
    return [
        {"id": p.id, "exercicio_id": p.exercicio_id, "mes": p.mes, "data": p.data,
         "total_amort": p.total_amort, "itens": len(p.itens or []), "por": p.por,
         "criado_em": p.criado_em}
        for p in db.scalars(q.order_by(ProcessoAmortizacao.mes)).all()
    ]


@router.post("/processos", dependencies=[GERIR])
def processar(
    request: Request,
    dados: ProcessarPedido,
    empresa: EmpresaAtual,
    user: UtilizadorAtual,
    db: DB,
) -> dict:
    """Processa a amortização do período. Recusa períodos já processados —
    reabre primeiro."""
    r = svc.processar_periodo(
        db, empresa_id=empresa.id, exercicio_id=dados.exercicio_id, mes=dados.mes,
        data=dados.data, por=user.nome,
    )
    db.commit()
    return r


@router.delete("/processos", dependencies=[GERIR])
def reabrir(
    request: Request, exercicio_id: UUID, mes: str, empresa: EmpresaAtual, db: DB
) -> dict:
    """Desfaz o processamento: repõe as acumuladas e remove os lançamentos."""
    r = svc.reabrir_periodo(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, mes=mes
    )
    db.commit()
    return {"reaberto": r}
