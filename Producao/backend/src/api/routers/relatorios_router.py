"""Balancetes e demonstrações financeiras.

Só de leitura. Nota: NÃO usar `from __future__ import annotations` — slowapi.
"""

from datetime import date as Date
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlalchemy import select

from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.db.models.contabilidade import NotaTexto
from src.services import contabilidade as svc
from src.services import demonstracoes as dem

router = APIRouter(
    prefix="/api/relatorios",
    tags=["relatórios"],
    dependencies=[Depends(exigir_cap("contab.ver"))],
)


class NotaTextoPedido(BaseModel):
    texto: str


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


@router.get("/resumo")
def resumo(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    """Custos, proveitos e resultado — o resumo do painel."""
    return dem.resumo_resultado(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate
    )


@router.get("/evolucao-mensal")
def evolucao_mensal(
    empresa: EmpresaAtual, db: DB, exercicio_id: UUID | None = None
) -> list[dict]:
    """Proveitos, custos e resultado dos doze meses do exercício.

    Doze linhas e não mais: é o que o gráfico do painel desenha. Não pagina
    porque não cresce — um exercício tem sempre doze meses.
    """
    return dem.evolucao_mensal(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id
    )


# ---------------------------------------------------------------------------
# Notas às Contas
# ---------------------------------------------------------------------------
@router.get("/notas")
def notas(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    ate: Date | None = None,
    mes: str | None = None,
) -> list[dict]:
    """As 35 notas às contas, com a composição de cada rubrica e a análise
    textual. `editada` diz se o texto foi substituído manualmente; `automatico`
    traz sempre o texto gerado, para se poder reverter."""
    return dem.notas(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, ate=ate, mes=mes
    )


@router.put("/notas/{numero}", dependencies=[Depends(exigir_cap("contab.lancar"))])
def gravar_nota(
    request: Request,
    numero: str,
    dados: NotaTextoPedido,
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
) -> dict:
    """Substitui o texto automático de uma nota."""
    n = db.scalar(
        select(NotaTexto).where(
            NotaTexto.empresa_id == empresa.id,
            NotaTexto.numero == numero,
            NotaTexto.exercicio_id == exercicio_id,
        )
    )
    if n is None:
        n = NotaTexto(
            empresa_id=empresa.id, numero=numero, exercicio_id=exercicio_id,
            texto=dados.texto,
        )
        db.add(n)
    else:
        n.texto = dados.texto
    db.commit()
    return {"numero": numero, "texto": n.texto}


@router.delete(
    "/notas/{numero}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(exigir_cap("contab.lancar"))],
)
def limpar_nota(
    request: Request,
    numero: str,
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
) -> None:
    """Repõe o texto automático da nota."""
    n = db.scalar(
        select(NotaTexto).where(
            NotaTexto.empresa_id == empresa.id,
            NotaTexto.numero == numero,
            NotaTexto.exercicio_id == exercicio_id,
        )
    )
    if n is not None:
        db.delete(n)
        db.commit()


# ---------------------------------------------------------------------------
# Fluxos de caixa
# ---------------------------------------------------------------------------
@router.get("/fluxos-caixa")
def fluxos_caixa(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    """Demonstração de Fluxos de Caixa, construída a partir de todos os
    movimentos que tocam caixa (45) ou banco (43)."""
    return dem.demonstracao_fluxos(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate
    )


@router.get("/mapa-fluxos")
def mapa_fluxos(
    empresa: EmpresaAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> list[dict]:
    """Mapa pela tabela de rubricas de fluxo — só conta linhas com rubrica
    atribuída manualmente, ao contrário de `/fluxos-caixa`."""
    return dem.mapa_fluxos(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, de=de, ate=ate
    )
