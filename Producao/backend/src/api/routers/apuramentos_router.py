"""Apuramentos de IVA e de Resultados, e mapa de retenções na fonte.

Nota: NÃO usar `from __future__ import annotations` — slowapi.
"""

from datetime import date as Date
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.services import apuramentos as ap

router = APIRouter(
    prefix="/api/apuramentos",
    tags=["apuramentos"],
    dependencies=[Depends(exigir_cap("contab.ver"))],
)

FECHAR = Depends(exigir_cap("contab.fechar"))


class ApurarIVAPedido(BaseModel):
    mes: str = Field(min_length=1, max_length=2)
    exercicio_id: UUID | None = None
    data: Date | None = None


class ApurarResultadosPedido(BaseModel):
    exercicio_id: UUID
    data: Date | None = None


# ---------------------------------------------------------------------------
# IVA
# ---------------------------------------------------------------------------
@router.get("/iva")
def consultar_iva(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    mes: str | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    """Apura o IVA do período sem lançar nada — simulação."""
    return ap.apuramento_iva(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, mes=mes, de=de, ate=ate
    )


@router.post("/iva", dependencies=[FECHAR])
def apurar_iva(
    request: Request, dados: ApurarIVAPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    """Apura o IVA e gera o lançamento que zera as contas do período."""
    r = ap.apurar_iva(
        db, empresa_id=empresa.id, exercicio_id=dados.exercicio_id,
        mes=dados.mes, data=dados.data,
    )
    db.commit()
    return r


# ---------------------------------------------------------------------------
# Resultados
# ---------------------------------------------------------------------------
@router.post("/resultados", dependencies=[FECHAR])
def apurar_resultados(
    request: Request, dados: ApurarResultadosPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    """Fecha custos e proveitos do exercício.

    Idempotente: reabre um apuramento anterior antes de gerar o novo, por isso
    pode ser corrido outra vez em segurança depois de correcções.
    """
    r = ap.apurar_resultados(
        db, empresa_id=empresa.id, exercicio_id=dados.exercicio_id, data=dados.data
    )
    db.commit()
    return r


@router.delete("/resultados/{exercicio_id}", dependencies=[FECHAR])
def reabrir_resultados(
    request: Request, exercicio_id: UUID, empresa: EmpresaAtual, db: DB
) -> dict:
    """Desfaz o apuramento, removendo os lançamentos que ele gerou."""
    reaberto = ap.reabrir_apuramento(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id
    )
    db.commit()
    return {"reaberto": reaberto}


# ---------------------------------------------------------------------------
# Retenções
# ---------------------------------------------------------------------------
@router.get("/retencoes")
def retencoes(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    mes: str | None = None,
) -> dict:
    """Retenções na fonte efectuadas no período, por tipo de imposto."""
    return ap.mapa_retencoes(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, mes=mes
    )
