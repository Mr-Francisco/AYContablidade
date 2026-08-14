"""Balancetes e demonstrações financeiras (PGC-Angola).

Transposto de `balanceteModelo()`, `balanceteRazao()`, `saldosAcum()`,
`demonstracaoResultados()` e `balanco()` de `Piloto/assets/js/contabilidade.js`.

Os prefixos de conta usados aqui são os do plano do Primavera — ver a nota em
`src/core/pgc.py`. Com o plano base estas funções devolvem zeros.
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
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


def resumo_resultado(db: Session, **opts) -> dict:
    """Custos, proveitos e resultado do exercício, para o painel.

    Exclui o apuramento nos custos e proveitos: o painel mostra a actividade
    real do ano. A contagem e o total movimentado NÃO o excluem — são «quantos
    lançamentos há e quanto passou por eles», e o apuramento também passou.
    """
    from src.services.contabilidade import balancete

    b = balancete(db, **{**opts, "excluir_apuramento": True})
    custos = proveitos = ZERO
    for g in b["linhas"]:
        if g["classe"] == "7":
            custos += g["debito"] - g["credito"]
        elif g["classe"] == "6":
            proveitos += g["credito"] - g["debito"]

    quantos, movimentado = _quanto_se_lancou(db, **opts)
    return {
        "custos": custos,
        "proveitos": proveitos,
        "resultado": proveitos - custos,
        "lancamentos": quantos,
        "movimentado": movimentado,
    }


def _quanto_se_lancou(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> tuple[int, Decimal]:
    """Quantos lançamentos e quanto somam os seus débitos — o KPI «Lançamentos»
    do painel do Piloto, que diz o número e, por baixo, «Movimentado X»."""
    def filtrar(q):
        q = q.where(
            Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False)
        )
        if exercicio_id is not None:
            q = q.where(Lancamento.exercicio_id == exercicio_id)
        if de is not None:
            q = q.where(Lancamento.data >= de)
        if ate is not None:
            q = q.where(Lancamento.data <= ate)
        return q

    quantos = filtrar(select(func.count()).select_from(Lancamento))
    # O total é a soma dos débitos: numa partida dobrada equilibrada os débitos
    # já são o valor do lançamento — somar os dois lados contava tudo a dobrar.
    total = filtrar(
        select(func.coalesce(func.sum(LancamentoLinha.debito), 0)).join(
            Lancamento, Lancamento.id == LancamentoLinha.lancamento_id
        )
    )
    return db.scalar(quantos) or 0, db.scalar(total) or ZERO


# ---------------------------------------------------------------------------
# Notas às Contas
# ---------------------------------------------------------------------------
# sinal: 1 = saldo devedor positivo (activos/custos)
#       -1 = saldo credor positivo (proveitos/capital/passivo)
#        0 = resultado (proveito positivo, custo negativo)
NOTAS_DEF: tuple[dict, ...] = (
    {"n": 1, "grupo": "BL", "titulo": "Identificação da Empresa e Atividade", "texto": "empresa"},
    {"n": 2, "grupo": "BL", "titulo": "Referencial Contabilístico de Preparação", "texto": "referencial"},
    {"n": 3, "grupo": "BL", "titulo": "Principais Políticas Contabilísticas", "texto": "politicas"},
    {"n": 4, "grupo": "BL", "titulo": "Imobilizações Corpóreas", "prefixos": ("11",), "amort": ("181",), "sinal": 1},
    {"n": 5, "grupo": "BL", "titulo": "Imobilizações Incorpóreas", "prefixos": ("12",), "amort": ("182",), "sinal": 1},
    {"n": 6, "grupo": "BL", "titulo": "Investimentos em Subsidiárias e Associadas", "prefixos": ("13",), "sinal": 1},
    {"n": 7, "grupo": "BL", "titulo": "Outros Activos Financeiros", "prefixos": ("14", "19"), "sinal": 1},
    {"n": 8, "grupo": "BL", "titulo": "Existências", "prefixos": ("21", "22", "23", "24", "25", "26", "27"), "sinal": 1},
    {"n": 9, "grupo": "BL", "titulo": "Contas a Receber", "prefixos": ("31",), "sinal": 1, "so_positivos": True},
    {"n": 10, "grupo": "BL", "titulo": "Disponibilidades", "prefixos": ("41", "42", "43", "44", "45"), "sinal": 1},
    {"n": 11, "grupo": "BL", "titulo": "Outros Activos Correntes", "prefixos": ("28", "34", "35", "38"), "sinal": 1, "so_positivos": True},
    {"n": 12, "grupo": "BL", "titulo": "Capital", "prefixos": ("51",), "sinal": -1},
    {"n": 13, "grupo": "BL", "titulo": "Reservas", "prefixos": ("55", "57", "58"), "sinal": -1},
    {"n": 14, "grupo": "BL", "titulo": "Resultados Transitados", "prefixos": ("56", "81"), "sinal": -1},
    {"n": 15, "grupo": "BL", "titulo": "Empréstimos de Médio e Longo Prazo", "prefixos": ("33",), "sinal": -1},
    {"n": 16, "grupo": "BL", "titulo": "Impostos Diferidos", "prefixos": ("276",), "sinal": -1},
    {"n": 17, "grupo": "BL", "titulo": "Provisões para Pensões", "prefixos": ("291",), "sinal": -1},
    {"n": 18, "grupo": "BL", "titulo": "Provisões para Outros Riscos e Encargos", "prefixos": ("39",), "sinal": -1},
    {"n": 19, "grupo": "BL", "titulo": "Contas a Pagar (Fornecedores e Outros)", "prefixos": ("32", "37"), "sinal": -1, "so_negativos": True},
    {"n": 20, "grupo": "BL", "titulo": "Empréstimos de Curto Prazo", "prefixos": ("331",), "sinal": -1},
    {"n": 21, "grupo": "BL", "titulo": "Outros Passivos Correntes", "prefixos": ("34", "36", "38"), "sinal": -1, "so_negativos": True},
    {"n": 22, "grupo": "DR", "titulo": "Vendas", "prefixos": ("61",), "sinal": -1},
    {"n": 23, "grupo": "DR", "titulo": "Prestações de Serviços", "prefixos": ("62",), "sinal": -1},
    {"n": 24, "grupo": "DR", "titulo": "Outros Proveitos Operacionais", "prefixos": ("63",), "sinal": -1},
    {"n": 25, "grupo": "DR", "titulo": "Variações nos Produtos Acabados e em Curso", "prefixos": ("64",), "sinal": -1},
    {"n": 26, "grupo": "DR", "titulo": "Trabalhos para a Própria Empresa", "prefixos": ("65",), "sinal": -1},
    {"n": 27, "grupo": "DR", "titulo": "Custo das Mercadorias Vendidas e Matérias Consumidas", "prefixos": ("71",), "sinal": 1},
    {"n": 28, "grupo": "DR", "titulo": "Custos com o Pessoal", "prefixos": ("72",), "sinal": 1},
    {"n": 29, "grupo": "DR", "titulo": "Amortizações", "prefixos": ("73",), "sinal": 1},
    {"n": 30, "grupo": "DR", "titulo": "Outros Custos e Perdas Operacionais", "prefixos": ("75",), "sinal": 1},
    {"n": 31, "grupo": "DR", "titulo": "Resultados Financeiros", "prefixos": ("66", "76"), "sinal": 0},
    {"n": 32, "grupo": "DR", "titulo": "Resultados de Filiais e Associadas", "prefixos": ("67", "77"), "sinal": 0},
    {"n": 33, "grupo": "DR", "titulo": "Resultados Não Operacionais", "prefixos": ("68", "78"), "sinal": 0},
    {"n": 34, "grupo": "DR", "titulo": "Resultados Extraordinários", "prefixos": ("69", "79"), "sinal": 0},
    {"n": 35, "grupo": "DR", "titulo": "Imposto Sobre o Rendimento", "prefixos": ("87",), "sinal": 1},
)


def _categoria_nota(defn: dict) -> str:
    """Categoria da nota, que define o tom da análise textual."""
    if defn["grupo"] == "BL":
        if defn.get("sinal") == 1:
            return "activo"
        if 12 <= defn["n"] <= 14:
            return "capital"
        return "passivo"
    if defn.get("sinal") == -1:
        return "proveito"
    if defn.get("sinal") == 1:
        return "custo"
    return "resultado"


_VERBO = {
    "activo": "representa o valor dos activos afectos a esta rubrica",
    "capital": "traduz os fundos próprios da empresa nesta rubrica",
    "passivo": "reflecte as responsabilidades da empresa nesta rubrica",
    "proveito": "reflecte os proveitos reconhecidos no exercício",
    "custo": "reflecte os custos incorridos no exercício",
    "resultado": "apura o resultado líquido desta natureza",
}


def _fmt_moeda(v: Decimal, moeda: str) -> str:
    """Formata à portuguesa: milhares com espaço fino, decimais com vírgula."""
    inteiro, _, dec = f"{abs(v):.2f}".partition(".")
    grupos = []
    while len(inteiro) > 3:
        grupos.insert(0, inteiro[-3:])
        inteiro = inteiro[:-3]
    grupos.insert(0, inteiro)
    return f"{' '.join(grupos)},{dec} {moeda}"


def _gerar_analise(
    defn: dict, rubricas: list[dict], total: Decimal, moeda: str, ano: str
) -> str:
    """Comentário que acompanha a tabela da nota. Vazio se não houver valores."""
    reais = [r for r in rubricas if not r.get("amort")]
    if not reais or total == 0:
        return ""

    cat = _categoria_nota(defn)
    t = (
        f"No exercício de {ano}, a rubrica «{defn['titulo']}» {_VERBO[cat]}, "
        f"ascendendo a {_fmt_moeda(total, moeda)}."
    )

    ord_ = sorted(reais, key=lambda r: abs(r["valor"]), reverse=True)
    denom = abs(total) or Decimal("1")
    if len(ord_) == 1:
        r = ord_[0]
        conta = f" (conta {r['codigo']})" if r["codigo"] else ""
        t += f" Este montante corresponde integralmente a {r['nome']}{conta}."
    else:
        top = [
            f"{r['nome']} com {_fmt_moeda(r['valor'], moeda)} "
            f"({round(abs(r['valor']) / denom * 100)}%)"
            for r in ord_[:3]
        ]
        t += " Decompõe-se essencialmente em " + "; ".join(top)
        t += ", entre outras contas." if len(ord_) > 3 else "."
        maior = ord_[0]
        pct = round(abs(maior["valor"]) / denom * 100)
        if pct >= 60:
            t += f" A rubrica {maior['nome']} concentra a maior parte do saldo ({pct}%)."

    amort = next((r for r in rubricas if r.get("amort")), None)
    if amort:
        bruto = sum((r["valor"] for r in reais), ZERO) + abs(amort["valor"])
        pct = round(abs(amort["valor"]) / (bruto or Decimal("1")) * 100)
        t += (
            f" O valor líquido resulta de um custo de aquisição de "
            f"{_fmt_moeda(bruto, moeda)}, deduzido de amortizações acumuladas de "
            f"{_fmt_moeda(amort['valor'], moeda)} ({pct}% de depreciação)."
        )
    if cat == "proveito":
        t += " Não existe comparativo do exercício anterior."
    return t


def notas(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    ate: Date | None = None,
    mes: str | None = None,
) -> list[dict]:
    """Notas às Contas: composição de cada rubrica do Balanço e da DR.

    As notas do Balanço usam os saldos COM apuramento (reflectem o fecho) e as
    da DR usam os saldos SEM apuramento (mostram a actividade real do ano) —
    é a mesma distinção que separa o balancete da demonstração de resultados.

    Um texto gravado manualmente sobrepõe-se ao automático, mas o automático
    continua a ser devolvido em `automatico`, para o utilizador poder voltar
    atrás.
    """
    from src.db.models.contabilidade import NotaTexto
    from src.db.models.tenancy import Empresa, Exercicio

    base = {"empresa_id": empresa_id, "exercicio_id": exercicio_id, "ate": ate, "mes": mes}
    sal = saldos_acum(db, **base)
    sal_dr = saldos_acum(db, **base, excluir_apuramento=True)

    emp = db.get(Empresa, empresa_id)
    moeda = (emp.moeda if emp else None) or "Kz"
    ano = ""
    if exercicio_id is not None:
        ex = db.scalar(
            select(Exercicio).where(
                Exercicio.id == exercicio_id, Exercicio.empresa_id == empresa_id
            )
        )
        if ex is not None:
            ano = str(ex.inicio.year)

    overrides = {
        n.numero: n.texto
        for n in db.scalars(
            select(NotaTexto).where(
                NotaTexto.empresa_id == empresa_id,
                NotaTexto.exercicio_id == exercicio_id,
            )
        ).all()
    }

    nomes = {
        c.codigo: c.nome
        for c in db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all()
    }

    textos_fixos = {
        "empresa": lambda: (
            f"{(emp.nome if emp else None) or 'A empresa'} "
            f"(NIF {(emp.nif if emp else None) or '—'}), com sede em "
            f"{(emp.morada if emp else None) or (emp.localizacao if emp else None) or 'Angola'}, "
            "tem por atividade principal a atividade comercial e de prestação de "
            f"serviços. As presentes demonstrações financeiras são expressas em {moeda}."
        ),
        "referencial": lambda: (
            "As demonstrações financeiras foram preparadas de acordo com o Plano "
            "Geral de Contabilidade de Angola (PGC-AR), no pressuposto da "
            "continuidade das operações e segundo o regime do acréscimo "
            "(especialização dos exercícios)."
        ),
        "politicas": lambda: (
            "As imobilizações são registadas ao custo de aquisição e amortizadas "
            "pelo método das quotas constantes. As existências são valorizadas ao "
            "custo. As contas a receber e a pagar são registadas pelo valor "
            "nominal. Os proveitos e custos são reconhecidos no período a que "
            "respeitam."
        ),
    }

    resultado: list[dict] = []
    for defn in NOTAS_DEF:
        if "texto" in defn:
            auto = textos_fixos[defn["texto"]]()
            nota = {
                "n": defn["n"], "grupo": defn["grupo"], "titulo": defn["titulo"],
                "texto": auto, "rubricas": [], "total": ZERO, "narrativa": True,
                "automatico": auto, "editada": False,
            }
            if defn["n"] in overrides:
                nota["texto"] = overrides[defn["n"]]
                nota["editada"] = True
            resultado.append(nota)
            continue

        sal_nota = sal_dr if defn["grupo"] == "DR" else sal
        prefixos = defn["prefixos"]
        amort_pref = defn.get("amort")

        rubricas: list[dict] = []
        for cod in sorted(sal_nota):
            if not cod.startswith(prefixos):
                continue
            if amort_pref and cod.startswith(amort_pref):
                continue  # tratada à parte, abaixo
            net = sal_nota[cod]
            if defn.get("so_positivos") and net < 0:
                continue
            if defn.get("so_negativos") and net >= 0:
                continue
            valor = net if defn["sinal"] == 1 else -net
            if valor == 0:
                continue
            rubricas.append({"codigo": cod, "nome": nomes.get(cod, cod), "valor": valor})

        if amort_pref:
            amort = -sum(
                (v for cod, v in sal.items() if cod.startswith(amort_pref)), ZERO
            )
            if amort:
                rubricas.append(
                    {"codigo": "", "nome": "Amortizações acumuladas",
                     "valor": -amort, "amort": True}
                )

        total = sum((r["valor"] for r in rubricas), ZERO)
        auto = _gerar_analise(defn, rubricas, total, moeda, ano)
        nota = {
            "n": defn["n"], "grupo": defn["grupo"], "titulo": defn["titulo"],
            "rubricas": rubricas, "total": total, "analise": auto,
            "automatico": auto, "editada": False,
        }
        if defn["n"] in overrides:
            nota["analise"] = overrides[defn["n"]]
            nota["editada"] = True
        resultado.append(nota)

    return resultado


# ---------------------------------------------------------------------------
# Demonstração de Fluxos de Caixa
# ---------------------------------------------------------------------------
def _eh_monetaria(codigo: str) -> bool:
    """Conta de caixa (45) ou de banco (43)."""
    return codigo.startswith(("43", "45"))


def categoria_fluxo(codigo: str) -> dict:
    """Categoriza um movimento pela conta da contraparte.

    A ordem dos testes importa: 18/19 (amortizações e provisões) têm de ser
    apanhados antes do "1" genérico, senão cairiam em investimentos financeiros.
    """
    c = str(codigo or "")
    if c[:2] in {"10", "11", "12", "13", "14", "15", "16", "17"}:
        return {"grupo": "Investimento", "rubrica": "Aquisição de imobilizado"}
    if c.startswith(("18", "19")):
        return {"grupo": "Investimento", "rubrica": "Amortizações/Provisões"}
    if c.startswith("1"):
        return {"grupo": "Investimento", "rubrica": "Investimentos financeiros"}
    if c.startswith("33"):
        return {"grupo": "Financiamento", "rubrica": "Empréstimos"}
    if c.startswith("5"):
        return {"grupo": "Financiamento", "rubrica": "Capital / Suprimentos"}
    if c.startswith("31"):
        return {"grupo": "Operacional", "rubrica": "Recebimentos de clientes"}
    if c.startswith("32"):
        return {"grupo": "Operacional", "rubrica": "Pagamentos a fornecedores"}
    if c.startswith("36"):
        return {"grupo": "Operacional", "rubrica": "Pagamentos ao pessoal"}
    if c.startswith("34"):
        return {"grupo": "Operacional", "rubrica": "Impostos e Estado"}
    if c.startswith("6"):
        return {"grupo": "Operacional", "rubrica": "Recebimentos de exploração"}
    if c.startswith("7"):
        return {"grupo": "Operacional", "rubrica": "Pagamentos de exploração"}
    if c.startswith("2"):
        return {"grupo": "Operacional", "rubrica": "Existências / compras"}
    return {"grupo": "Operacional", "rubrica": "Outros recebimentos/pagamentos"}


def categoria_fluxo_de(db: Session, empresa_id: UUID, fluxo_codigo: str) -> dict | None:
    """Categoria a partir da rubrica de fluxo indicada manualmente na linha.

    O grupo vem do 1.º dígito do código: 1 Operacional, 2 Investimento,
    3 Financiamento — como em FLUXOS_DEFAULT.
    """
    from src.db.models.contabilidade import Fluxo

    f = db.scalar(
        select(Fluxo).where(Fluxo.empresa_id == empresa_id, Fluxo.codigo == fluxo_codigo)
    )
    if f is None:
        return None
    grupo = (
        "Investimento" if f.codigo[0] == "2"
        else "Financiamento" if f.codigo[0] == "3"
        else "Operacional"
    )
    return {"grupo": grupo, "rubrica": f.descricao}


def mapa_fluxos(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> list[dict]:
    """Mapa pela tabela de Fluxos: só conta linhas com rubrica atribuída
    manualmente. Entradas positivas, saídas negativas."""
    from src.db.models.contabilidade import Fluxo

    q = (
        select(
            LancamentoLinha.fluxo_codigo,
            LancamentoLinha.debito,
            LancamentoLinha.credito,
        )
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(
            Lancamento.empresa_id == empresa_id,
            Lancamento.diferido.is_(False),
            LancamentoLinha.fluxo_codigo.is_not(None),
        )
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if de is not None:
        q = q.where(Lancamento.data >= de)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)

    valores: dict[str, Decimal] = {}
    for codigo, debito, credito in db.execute(q):
        valores[codigo] = valores.get(codigo, ZERO) + (debito or ZERO) - (credito or ZERO)

    lista = db.scalars(
        select(Fluxo).where(Fluxo.empresa_id == empresa_id).order_by(Fluxo.codigo)
    ).all()

    def valor_de(f) -> Decimal:
        if f.tipo == "M":
            return valores.get(f.codigo, ZERO)
        # Intermédio ou raiz: soma só os filhos de movimento, para não duplicar.
        return sum(
            (valores.get(o.codigo, ZERO)
             for o in lista
             if o.codigo != f.codigo and o.codigo.startswith(f.codigo) and o.tipo == "M"),
            ZERO,
        )

    return [
        {"codigo": f.codigo, "descricao": f.descricao, "tipo": f.tipo, "valor": valor_de(f)}
        for f in lista
    ]


def saldo_monetario(
    db: Session, *, empresa_id: UUID, ate: Date | None = None,
    exercicio_id: UUID | None = None,
) -> Decimal:
    """Saldo de caixa e bancos até uma data."""
    q = (
        select(LancamentoLinha.conta_codigo, LancamentoLinha.debito, LancamentoLinha.credito)
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)
    return sum(
        ((d or ZERO) - (c or ZERO) for cod, d, c in db.execute(q) if _eh_monetaria(cod)),
        ZERO,
    )


def demonstracao_fluxos(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    """Demonstração de Fluxos de Caixa, construída automaticamente.

    Todo o movimento que toque em caixa (45) ou banco (43) alimenta o mapa,
    categorizado pela contraparte. Entrada = débito na conta monetária.

    A rubrica indicada manualmente na linha tem prioridade sobre a
    categorização automática — esta serve de reserva para lançamentos antigos
    ou gerados por módulos que ainda não a preenchem.
    """
    from datetime import timedelta

    q = (
        select(Lancamento)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
        .order_by(Lancamento.data)
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if de is not None:
        q = q.where(Lancamento.data >= de)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)

    grupos: dict[str, dict[str, Decimal]] = {
        "Operacional": {}, "Investimento": {}, "Financiamento": {}
    }
    variacao = ZERO

    for lanc in db.scalars(q).all():
        linhas = list(lanc.linhas)
        cash = [x for x in linhas if _eh_monetaria(x.conta_codigo)]
        if not cash:
            continue
        # Contrapartida dominante: a linha de maior valor fora de caixa/banco.
        contra = sorted(
            (x for x in linhas if not _eh_monetaria(x.conta_codigo)),
            key=lambda x: (x.debito or ZERO) + (x.credito or ZERO),
            reverse=True,
        )
        for cx in cash:
            val = (cx.debito or ZERO) - (cx.credito or ZERO)
            if not val:
                continue
            variacao += val
            cat = None
            if cx.fluxo_codigo:
                cat = categoria_fluxo_de(db, empresa_id, cx.fluxo_codigo)
            if cat is None:
                cat = (
                    categoria_fluxo(contra[0].conta_codigo) if contra
                    else {"grupo": "Operacional", "rubrica": "Outros recebimentos/pagamentos"}
                )
            g = grupos[cat["grupo"]]
            g[cat["rubrica"]] = g.get(cat["rubrica"], ZERO) + val

    saldo_inicial = (
        saldo_monetario(
            db, empresa_id=empresa_id, ate=de - timedelta(days=1),
            exercicio_id=exercicio_id,
        )
        if de is not None
        else ZERO
    )
    subtotais = {g: sum(v.values(), ZERO) for g, v in grupos.items()}
    return {
        "grupos": grupos,
        "subtotais": subtotais,
        "variacao": variacao,
        "saldo_inicial": saldo_inicial,
        "saldo_final": saldo_inicial + variacao,
    }
