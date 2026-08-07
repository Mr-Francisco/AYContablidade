"""Logística: artigos, armazéns, movimentos de stock e existências.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.db.models.logistica import Armazem, Artigo, MovimentoStock
from src.services import logistica as svc

router = APIRouter(
    prefix="/api/logistica",
    tags=["logística"],
    dependencies=[Depends(exigir_cap("logistica.ver"))],
)

GERIR = Depends(exigir_cap("logistica.gerir"))


class ArtigoEntrada(BaseModel):
    descricao: str = Field(min_length=1, max_length=300)
    codigo: str | None = Field(default=None, max_length=20)
    familia: str | None = None
    unidade: str | None = None
    tipo_artigo: str | None = None
    preco_venda: Decimal = Decimal("0")
    preco_compra: Decimal = Decimal("0")
    taxa_iva: Decimal = Decimal("0")
    stock_min: Decimal = Decimal("0")
    conta_existencia: str | None = None
    conta_custo: str | None = None
    estado: str = "activo"


class ArmazemEntrada(BaseModel):
    codigo: str = Field(min_length=1, max_length=20)
    nome: str = Field(min_length=1, max_length=200)
    localizacao: str | None = None


class MovimentoEntrada(BaseModel):
    tipo: str = Field(pattern="^(entrada|saida|transferencia|ajuste)$")
    artigo_id: UUID
    armazem_id: UUID
    qtd: Decimal
    data: Date | None = None
    armazem_destino_id: UUID | None = None
    custo_unit: Decimal | None = None
    iva_perc: Decimal | None = None
    documento: str | None = None
    descricao: str | None = None
    entidade: str | None = None
    exercicio_id: UUID | None = None


@router.get("/artigos")
def listar_artigos(empresa: EmpresaAtual, db: DB, so_ativos: bool = False) -> list[dict]:
    q = select(Artigo).where(Artigo.empresa_id == empresa.id)
    if so_ativos:
        q = q.where(Artigo.estado == "activo")
    return [
        {"id": a.id, "codigo": a.codigo, "descricao": a.descricao, "familia": a.familia,
         "unidade": a.unidade, "tipo_artigo": a.tipo_artigo,
         "preco_venda": a.preco_venda, "preco_compra": a.preco_compra,
         "taxa_iva": a.taxa_iva, "stock_min": a.stock_min, "estado": a.estado}
        for a in db.scalars(q.order_by(Artigo.codigo)).all()
    ]


@router.post("/artigos", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_artigo(
    request: Request, dados: ArtigoEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    a = Artigo(
        empresa_id=empresa.id,
        codigo=dados.codigo or svc.proximo_codigo_artigo(db, empresa.id),
        **dados.model_dump(exclude={"codigo"}),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "codigo": a.codigo, "descricao": a.descricao}


@router.get("/armazens")
def listar_armazens(empresa: EmpresaAtual, db: DB) -> list[dict]:
    return [
        {"id": w.id, "codigo": w.codigo, "nome": w.nome, "localizacao": w.localizacao}
        for w in db.scalars(
            select(Armazem).where(Armazem.empresa_id == empresa.id).order_by(Armazem.codigo)
        ).all()
    ]


@router.post("/armazens", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_armazem(
    request: Request, dados: ArmazemEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    w = Armazem(empresa_id=empresa.id, **dados.model_dump())
    db.add(w)
    db.commit()
    db.refresh(w)
    return {"id": w.id, "codigo": w.codigo, "nome": w.nome}


@router.get("/movimentos")
def listar_movimentos(
    empresa: EmpresaAtual,
    db: DB,
    artigo_id: UUID | None = None,
    armazem_id: UUID | None = None,
    tipo: str | None = None,
    limite: int = 200,
) -> list[dict]:
    q = select(MovimentoStock).where(MovimentoStock.empresa_id == empresa.id)
    if artigo_id:
        q = q.where(MovimentoStock.artigo_id == artigo_id)
    if armazem_id:
        q = q.where(MovimentoStock.armazem_id == armazem_id)
    if tipo:
        q = q.where(MovimentoStock.tipo == tipo)
    return [
        {"id": m.id, "numero": m.numero, "tipo": m.tipo, "data": m.data,
         "artigo_id": m.artigo_id, "artigo_desc": m.artigo_desc,
         "armazem_id": m.armazem_id, "armazem_destino_id": m.armazem_destino_id,
         "qtd": m.qtd, "unidade": m.unidade, "custo_unit": m.custo_unit,
         "valor": m.valor, "documento": m.documento, "entidade": m.entidade,
         "numero_op": m.numero_op}
        for m in db.scalars(
            q.order_by(MovimentoStock.data.desc(), MovimentoStock.criado_em.desc())
            .limit(limite)
        ).all()
    ]


@router.post("/movimentos", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_movimento(
    request: Request, dados: MovimentoEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    """Recepção, Expedição, Transferência ou Inventariação.

    Em saídas e transferências o custo unitário é ignorado — usa-se sempre o
    custo médio corrente do armazém de origem.
    """
    m = svc.registar_movimento(db, empresa_id=empresa.id, **dados.model_dump())
    db.commit()
    return {"id": m.id, "numero": m.numero, "custo_unit": m.custo_unit,
            "valor": m.valor, "numero_op": m.numero_op}


@router.get("/existencias")
def listar_existencias(
    empresa: EmpresaAtual, db: DB, armazem_id: UUID | None = None,
    so_ativos: bool = False,
) -> dict:
    linhas = svc.existencias(
        db, empresa_id=empresa.id, armazem_id=armazem_id, so_ativos=so_ativos
    )
    return {
        "linhas": linhas,
        "valor_total": sum((l["valor"] for l in linhas), Decimal("0")),
        "em_rutura": sum(1 for l in linhas if l["rutura"]),
    }


@router.get("/stock/{artigo_id}")
def obter_stock(
    artigo_id: UUID, empresa: EmpresaAtual, db: DB, armazem_id: UUID | None = None
) -> dict:
    if db.scalar(
        select(Artigo.id).where(Artigo.id == artigo_id, Artigo.empresa_id == empresa.id)
    ) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Artigo não encontrado.")
    return {
        "artigo_id": artigo_id,
        "stock": svc.stock(db, empresa_id=empresa.id, artigo_id=artigo_id,
                           armazem_id=armazem_id),
        "custo_medio": svc.custo_medio(db, empresa_id=empresa.id, artigo_id=artigo_id,
                                       armazem_id=armazem_id),
    }


@router.get("/tipos-movimento")
def tipos_movimento() -> list[dict]:
    return [{"cod": t["cod"], "nome": t["nome"]} for t in svc.TIPOS_MOV]


@router.get("/config")
def obter_config(empresa: EmpresaAtual, db: DB) -> dict:
    return svc.cfg_log(db, empresa.id)


@router.put("/config", dependencies=[GERIR])
def gravar_config(request: Request, dados: dict, empresa: EmpresaAtual, db: DB) -> dict:
    r = svc.guardar_cfg_log(db, empresa.id, dados)
    db.commit()
    return r
