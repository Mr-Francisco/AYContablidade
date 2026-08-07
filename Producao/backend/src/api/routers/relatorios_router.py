"""Balancetes e demonstrações financeiras.

Só de leitura. Nota: NÃO usar `from __future__ import annotations` — slowapi.
"""

from datetime import date as Date
from uuid import UUID

from fastapi import APIRouter, Depends

from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.services import contabilidade as svc
from src.services import demonstracoes as dem

router = APIRouter(
    prefix="/api/relatorios",
    tags=["relatórios"],
    dependencies=[Depends(exigir_cap("contab.ver"))],
)


@router.get("/balancete")
def balancete(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    ate_mes: str | None = None,
    excluir_apuramento: bool = False,
) -> dict:
    """Balancete simples: débito, crédito e saldo por conta."""
    return svc.balancete(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate,
        ate_mes=ate_mes, excluir_apuramento=excluir_apuramento,
    )


@router.get("/balancete-modelo")
def balancete_modelo(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    mes: str | None = None,
    excluir_apuramento: bool = False,
) -> dict:
    """Balancete no modelo Primavera: Anterior · Período · Acumulado,
    hierárquico e com subtotal por raiz."""
    return dem.balancete_modelo(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate,
        mes=mes, excluir_apuramento=excluir_apuramento,
    )


@router.get("/balancete-razao")
def balancete_razao(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    mes: str | None = None,
) -> dict:
    """Contas do razão (2 dígitos) agrupadas por classe."""
    return dem.balancete_razao(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate, mes=mes
    )


@router.get("/demonstracao-resultados")
def demonstracao_resultados(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    mes: str | None = None,
) -> dict:
    """Demonstração de Resultados por naturezas."""
    return dem.demonstracao_resultados(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate, mes=mes
    )


@router.get("/balanco")
def balanco(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    mes: str | None = None,
) -> dict:
    """Balanço. O campo `equilibrado` diz se o activo iguala capital próprio
    mais passivo — se vier `false`, há um problema nos dados, não no relatório."""
    return dem.balanco(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate, mes=mes
    )


@router.get("/saldos")
def saldos(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    ate: Date | None = None,
    mes: str | None = None,
) -> dict:
    """Saldos líquidos acumulados por conta de movimento — a base das
    demonstrações, útil para conferências."""
    return dem.saldos_acum(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, ate=ate, mes=mes
    )
