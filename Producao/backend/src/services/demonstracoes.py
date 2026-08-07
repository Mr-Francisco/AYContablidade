"""Balancetes e demonstrações financeiras (PGC-Angola).

Transposto de `balanceteModelo()`, `balanceteRazao()`, `saldosAcum()`,
`demonstracaoResultados()` e `balanco()` de `Piloto/assets/js/contabilidade.js`.

Os prefixos de conta usados aqui são os do plano do Primavera — ver a nota em
`src/core/pgc.py`. Com o plano base estas funções devolvem zeros.
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.pgc import CLASSES, classe_de
from src.db.models.contabilidade import Conta, Lancamento, LancamentoLinha

ZERO = Decimal("0")


class _Bucket:
    """Acumulador por conta-folha: anterior ao período e dentro do período."""

    __slots__ = ("ant_d", "ant_c", "per_d", "per_c")

    def __init__(self) -> None:
        self.ant_d = self.ant_c = self.per_d = self.per_c = ZERO


def _finaliza(ant_d: Decimal, ant_c: Decimal, per_d: Decimal, per_c: Decimal) -> dict:
    return {
        "ant_d": ant_d,
        "ant_c": ant_c,
        "ant_s": ant_d - ant_c,
        "per_d": per_d,
        "per_c": per_c,
        "per_s": per_d - per_c,
        "acu_d": ant_d + per_d,
        "acu_c": ant_c + per_c,
        "acu_s": (ant_d + per_d) - (ant_c + per_c),
    }


def balancete_modelo(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    mes: str | None = None,
    excluir_apuramento: bool = False,
) -> dict:
    """Balancete no modelo Primavera: Anterior (< de) · Período ([de, ate]) ·
    Acumulado (<= ate), hierárquico, com subtotal por raiz de 2 dígitos.

    Os movimentos anteriores a `de` NÃO são excluídos — vão para a coluna
    "Anterior". É isso que faz do acumulado um saldo real e não só o do período.
    """
    q = (
        select(
            LancamentoLinha.conta_codigo,
            LancamentoLinha.debito,
            LancamentoLinha.credito,
            Lancamento.data,
        )
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if excluir_apuramento:
        q = q.where(Lancamento.origem != "apuramento")
    if mes is not None:
        # Períodos são strings de 2 dígitos: comparam-se por ordem alfabética,
        # que aqui coincide com a numérica. "até este período", cumulativo.
        q = q.where(Lancamento.mes <= mes)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)

    folhas: dict[str, _Bucket] = {}
    for codigo, debito, credito, data in db.execute(q):
        b = folhas.setdefault(codigo, _Bucket())
        if de is not None and data < de:
            b.ant_d += debito or ZERO
            b.ant_c += credito or ZERO
        else:
            b.per_d += debito or ZERO
            b.per_c += credito or ZERO

    codigos_folha = list(folhas)
    plano = {
        c.codigo: c.nome
        for c in db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all()
    }

    # Códigos a mostrar: as folhas com movimento, os seus ancestrais que existam
    # no plano, e sempre a raiz de 2 dígitos.
    mostrar: set[str] = set()
    for cod in codigos_folha:
        mostrar.add(cod)
        for i in range(2, len(cod)):
            pai = cod[:i]
            if pai in plano:
                mostrar.add(pai)
        if len(cod) >= 2:
            mostrar.add(cod[:2])

    def agg(cod: str) -> dict:
        ant_d = ant_c = per_d = per_c = ZERO
        for lc, b in folhas.items():
            if lc == cod or lc.startswith(cod):
                ant_d += b.ant_d
                ant_c += b.ant_c
                per_d += b.per_d
                per_c += b.per_c
        return _finaliza(ant_d, ant_c, per_d, per_c)

    codigos = sorted(mostrar)
    raizes = sorted({c[:2] for c in codigos})

    linhas: list[dict] = []
    for raiz in raizes:
        do_grupo = [c for c in codigos if c[:2] == raiz]
        for cod in do_grupo:
            valores = agg(cod)
            # Nível = quantos ancestrais também estão a ser mostrados.
            nivel = sum(1 for o in do_grupo if o != cod and cod.startswith(o))
            # Folha = ninguém a estende dentro do que está visível.
            eh_mov = not any(o != cod and o.startswith(cod) for o in do_grupo)
            linhas.append(
                {
                    "tipo": "conta",
                    "codigo": cod,
                    "nome": plano.get(cod, cod),
                    "nivel": nivel,
                    "eh_mov": eh_mov,
                    "classe": classe_de(cod),
                    **valores,
                }
            )
        linhas.append(
            {"tipo": "subtotal", "codigo": raiz, "nome": f"Sub Total {raiz}", **agg(raiz)}
        )

    total = _finaliza(
        sum((b.ant_d for b in folhas.values()), ZERO),
        sum((b.ant_c for b in folhas.values()), ZERO),
        sum((b.per_d for b in folhas.values()), ZERO),
        sum((b.per_c for b in folhas.values()), ZERO),
    )
    return {"linhas": linhas, "total": total, "de": de, "ate": ate}


def balancete_razao(db: Session, **opts) -> dict:
    """Contas do razão (2 dígitos) agrupadas por classe, com saldo devedor e
    credor por período."""
    mod = balancete_modelo(db, **opts)

    def dc(s: Decimal) -> dict:
        return {"d": s if s > 0 else ZERO, "c": -s if s < 0 else ZERO}

    razao = [
        {
            "codigo": l["codigo"],
            "nome": l["nome"],
            "classe": l["codigo"][0],
            "ant": dc(l["ant_s"]),
            "per": dc(l["per_s"]),
            "acu": dc(l["acu_s"]),
        }
        for l in mod["linhas"]
        if l["tipo"] == "conta" and len(l["codigo"]) == 2
    ]

    def soma_vazia() -> dict:
        return {p: {"d": ZERO, "c": ZERO} for p in ("ant", "per", "acu")}

    def acumula(dest: dict, c: dict) -> None:
        for p in ("ant", "per", "acu"):
            dest[p]["d"] += c[p]["d"]
            dest[p]["c"] += c[p]["c"]

    mapa: dict[str, dict] = {}
    for c in razao:
        g = mapa.setdefault(
            c["classe"],
            {
                "classe": c["classe"],
                "nome": CLASSES.get(c["classe"], ("", ""))[0],
                "contas": [],
                "soma": soma_vazia(),
            },
        )
        g["contas"].append(c)
        acumula(g["soma"], c)

    total = soma_vazia()
    for c in razao:
        acumula(total, c)

    return {"classes": [mapa[k] for k in sorted(mapa)], "total": total}


def saldos_acum(db: Session, **opts) -> dict[str, Decimal]:
    """Saldo líquido acumulado por conta de movimento — a base de todas as
    demonstrações financeiras."""
    mod = balancete_modelo(db, **opts)
    return {
        l["codigo"]: l["acu_s"]
        for l in mod["linhas"]
        if l["tipo"] == "conta" and l["eh_mov"]
    }


def soma_pref(saldos: dict[str, Decimal], *prefixos: str) -> Decimal:
    return sum(
        (v for cod, v in saldos.items() if cod.startswith(prefixos)), ZERO
    )


# ---------------------------------------------------------------------------
# Demonstração de Resultados
# ---------------------------------------------------------------------------
def demonstracao_resultados(db: Session, **opts) -> dict:
    """DR por naturezas.

    Exclui os lançamentos do próprio apuramento: a DR mostra sempre a actividade
    real do ano, mesmo depois de apurada. O fecho só se reflecte no balancete e
    no razão, não neste relatório.
    """
    sal = saldos_acum(db, **{**opts, "excluir_apuramento": True})

    def prov(*p: str) -> Decimal:
        return -soma_pref(sal, *p)  # crédito (proveito) -> positivo

    def cust(*p: str) -> Decimal:
        return soma_pref(sal, *p)  # débito (custo) -> positivo

    vendas = prov("61")
    servicos = prov("62")
    outros_prov = prov("63")
    variacoes = prov("64")
    trab_prop = prov("65")
    prov_oper = vendas + servicos + outros_prov + variacoes + trab_prop

    cmvmc = cust("71")
    pessoal = cust("72")
    amort = cust("73")
    outros_custos = cust("75")
    cust_oper = cmvmc + pessoal + amort + outros_custos

    res_oper = prov_oper - cust_oper
    res_fin = prov("66") - cust("76")
    res_filiais = prov("67") - cust("77")
    res_nao_oper = prov("68") - cust("78")
    antes_imp = res_oper + res_fin + res_filiais + res_nao_oper
    imposto = cust("87")
    res_extraord = prov("69") - cust("79")
    liquido = antes_imp - imposto + res_extraord

    def L(designacao, nota, valor, tipo="linha"):
        return {"designacao": designacao, "nota": nota or "", "valor": valor, "tipo": tipo}

    return {
        "linhas": [
            L("Vendas", 22, vendas),
            L("Prestação de Serviços", 23, servicos),
            L("Outros Proveitos Operacionais", 24, outros_prov),
            L("Variações nos Produtos Acabados e em Curso", 25, variacoes),
            L("Trabalhos para a Própria Empresa", 26, trab_prop),
            L("Custo das Mercad. Vendidas e Mat.-Primas Consumidas", 27, -cmvmc),
            L("Custos com o Pessoal", 28, -pessoal),
            L("Amortizações", 29, -amort),
            L("Outros Custos e Perdas Operacionais", 30, -outros_custos),
            L("RESULTADOS OPERACIONAIS", "", res_oper, "subtotal"),
            L("Resultados Financeiros", 31, res_fin),
            L("Resultados de Filiais e Associadas", 32, res_filiais),
            L("Resultados Não Operacionais", 33, res_nao_oper),
            L("RESULTADOS ANTES DE IMPOSTOS", "", antes_imp, "subtotal"),
            L("Imposto Sobre o Rendimento", 35, -imposto),
            L("Resultados Extraordinários", 34, res_extraord),
            L("RESULTADOS LÍQUIDOS DO EXERCÍCIO", "", liquido, "total"),
        ],
        "liquido": liquido,
    }


# ---------------------------------------------------------------------------
# Balanço
# ---------------------------------------------------------------------------
def balanco(db: Session, **opts) -> dict:
    """Balanço.

    A classe 3 (Terceiros) é repartida linha a linha entre a receber (saldo
    devedor) e a pagar (saldo credor) — a mesma conta pode estar de um lado ou
    do outro conforme o saldo. O mesmo para a classe 4: positivos são
    disponibilidades, negativos são descobertos bancários, que são passivo.
    """
    sal = saldos_acum(db, **opts)

    def p(*pr: str) -> Decimal:
        return soma_pref(sal, *pr)

    receber = pagar = ZERO
    for cod, v in sal.items():
        if cod.startswith("3"):
            if v >= 0:
                receber += v
            else:
                pagar += -v

    disp = descob = ZERO
    for cod, v in sal.items():
        if cod.startswith("4"):
            if v >= 0:
                disp += v
            else:
                descob += -v

    imob_corp = p("11") + p("181")
    imob_incorp = p("12") + p("182")
    investim = p("13")
    outros_nao_corr = p("14") + p("19")
    existencias = p("2")
    total_activo = (
        imob_corp + imob_incorp + investim + outros_nao_corr + existencias + receber + disp
    )

    capital = -p("51")
    reservas = -p("55", "57", "58")
    transitados = -p("56", "81")
    resultado = -p("6") - p("7")
    total_cp = capital + reservas + transitados + resultado

    emprestimos = -p("33")
    total_passivo = pagar + emprestimos + descob
    total_cp_passivo = total_cp + total_passivo

    def L(designacao, nota, valor, tipo="linha"):
        return {"designacao": designacao, "nota": nota or "", "valor": valor, "tipo": tipo}

    return {
        "activo": [
            L("ACTIVO", "", None, "cabecalho"),
            L("Activos Não Correntes", "", None, "grupo"),
            L("Imobilizações Corpóreas", 4, imob_corp),
            L("Imobilizações Incorpóreas", 5, imob_incorp),
            L("Investimentos Financeiros", 6, investim),
            L("Outros Activos Não Correntes", 7, outros_nao_corr),
            L("Activos Correntes", "", None, "grupo"),
            L("Existências", 8, existencias),
            L("Contas a Receber", 9, receber),
            L("Disponibilidades", 10, disp),
            L("TOTAL DO ACTIVO", "", total_activo, "total"),
        ],
        "passivo": [
            L("CAPITAL PRÓPRIO E PASSIVO", "", None, "cabecalho"),
            L("Capital Próprio", "", None, "grupo"),
            L("Capital", 12, capital),
            L("Reservas", 13, reservas),
            L("Resultados Transitados", 14, transitados),
            L("Resultado do Exercício", "", resultado),
            L("Total do Capital Próprio", "", total_cp, "subtotal"),
            L("Passivo", "", None, "grupo"),
            L("Empréstimos", 15, emprestimos),
            L("Contas a Pagar", 19, pagar),
            L("Descobertos Bancários / Outros", 20, descob),
            L("Total do Passivo", "", total_passivo, "subtotal"),
            L("TOTAL DO CAPITAL PRÓPRIO E PASSIVO", "", total_cp_passivo, "total"),
        ],
        "total_activo": total_activo,
        "total_cp_passivo": total_cp_passivo,
        "resultado": resultado,
        "equilibrado": total_activo == total_cp_passivo,
    }
