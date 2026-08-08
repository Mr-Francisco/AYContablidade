"""Fiscalidade: catálogo de impostos, regimes, obrigações e calendário.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).

Tudo aqui é de leitura e não toca em dados da empresa: é referência legal. Ainda
assim exige sessão e a capacidade `contab.ver`, como todas as rotas de dados —
não há motivo para abrir uma excepção que depois é preciso lembrar.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.api.deps import EmpresaAtual, exigir_cap
from src.core import fiscalidade as fisc

router = APIRouter(
    prefix="/api/fiscalidade",
    tags=["fiscalidade"],
    dependencies=[Depends(exigir_cap("contab.ver"))],
)


class ObrigacoesPedido(BaseModel):
    forma: str = "lda"
    regime_iva: str = "geral"
    regime_ii: str = "geral"
    tem_empregados: bool = True
    paga_capitais: bool = False
    tem_imoveis_arrend: bool = False


class SimulacaoIva(BaseModel):
    regime: str = "geral"
    # Regime geral
    base_vendas: Decimal = Decimal("0")
    taxa: Decimal = Decimal("14")
    iva_dedutivel: Decimal = Decimal("0")
    # Regime simplificado
    recebimentos: Decimal = Decimal("0")
    iva_suportado: Decimal = Decimal("0")


@router.get("/catalogo")
def catalogo() -> dict:
    """Tudo o que as páginas de fiscalidade precisam, num pedido só."""
    return {
        "impostos": fisc.IMPOSTOS,
        "regimes_iva": fisc.REGIMES_IVA,
        "regimes_ii": fisc.REGIMES_II,
        "formas": fisc.FORMAS,
        "calendario": fisc.CALENDARIO,
        "fontes": fisc.FONTES,
        "categorias": sorted({i["categoria"] for i in fisc.IMPOSTOS}),
    }


@router.post("/obrigacoes")
def obrigacoes(dados: ObrigacoesPedido, empresa: EmpresaAtual) -> dict:
    """Obrigações a que a empresa está sujeita, dado o seu enquadramento."""
    cfg = dados.model_dump()
    return {
        "forma": fisc.forma_juridica(dados.forma),
        "regime_iva": fisc.regime_iva(dados.regime_iva),
        "regime_ii": next(
            (r for r in fisc.REGIMES_II if r["id"] == dados.regime_ii),
            fisc.REGIMES_II[0],
        ),
        "obrigacoes": fisc.obrigacoes(cfg),
    }


@router.post("/simular-iva")
def simular_iva(dados: SimulacaoIva, empresa: EmpresaAtual) -> dict:
    """Simulação do IVA a entregar, pelo regime escolhido."""
    if dados.regime == "simplificado":
        return {
            "regime": "simplificado",
            "liquidado": fisc.r2(dados.recebimentos * Decimal("0.07")),
            "dedutivel": fisc.r2(dados.iva_suportado * Decimal("0.10")),
            "a_entregar": fisc.calc_iva_simplificado(
                dados.recebimentos, dados.iva_suportado
            ),
        }
    return {
        "regime": "geral",
        "liquidado": fisc.r2(dados.base_vendas * dados.taxa / 100),
        "dedutivel": fisc.r2(dados.iva_dedutivel),
        "a_entregar": fisc.calc_iva_geral(
            dados.base_vendas, dados.taxa, dados.iva_dedutivel
        ),
    }
