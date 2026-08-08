"""Camada intermédia: identifica os dados necessários, consulta e resume.

É esta camada que cumpre o requisito central de `docs/AI_INTEGRATION.md`: a IA
nunca toca na base de dados. Recebe apenas um pacote já filtrado pelo contexto e
período escolhidos, já agregado e já redigido.

Duas regras de desenho:

1. AGREGAR, não despejar. Um exercício pode ter dezenas de milhares de linhas de
   lançamento; enviá-las seria caro, lento e pior — o modelo perde-se no ruído.
   Vão totais, saldos e os N maiores de cada dimensão.
2. PSEUDONIMIZAR à saída. Nomes de pessoas e entidades passam a «Cliente A»,
   «Colaborador 1». O mapa fica no servidor e a resposta é reposta antes de
   chegar ao utilizador.
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.db.models.comercial import Venda
from src.db.models.contabilidade import Lancamento, LancamentoLinha
from src.db.models.rh import Colaborador, Independente
from src.db.models.terceiros import Terceiro
from src.db.models.tenancy import Empresa, Exercicio
from src.services import comercial as com_svc
from src.services import imobilizados as imo_svc
from src.services import logistica as log_svc
from src.services import rh as rh_svc
from src.services.apuramentos import apuramento_iva, mapa_retencoes
from src.services.contabilidade import analitica_mapa, contas_correntes
from src.services.demonstracoes import (
    balanco,
    demonstracao_resultados,
    resumo_resultado,
)
from src.services.ia.redaccao import Pseudonimizador, limpar_texto

ZERO = Decimal("0")
TOP = 15  # quantos itens por dimensão acompanham os totais

AMBITOS: tuple[dict, ...] = (
    {"id": "contabilidade", "nome": "Contabilidade", "modulo": "contabilidade",
     "descricao": "Balancete, Demonstração de Resultados e Balanço"},
    {"id": "contasCorrentes", "nome": "Contas Correntes", "modulo": "contasCorrentes",
     "descricao": "Saldos de clientes e fornecedores"},
    {"id": "comercial", "nome": "Comercial", "modulo": "comercial",
     "descricao": "Vendas, facturação e comissões"},
    {"id": "logistica", "nome": "Logística", "modulo": "logistica",
     "descricao": "Existências, valorização e movimentos de stock"},
    {"id": "rh", "nome": "Recursos Humanos", "modulo": "rh",
     "descricao": "Folha salarial, encargos e honorários"},
    {"id": "imobilizados", "nome": "Imobilizados", "modulo": "imobilizados",
     "descricao": "Activos e amortizações"},
    {"id": "fiscalidade", "nome": "Fiscalidade", "modulo": "fiscalidade",
     "descricao": "Apuramento do IVA e retenções na fonte"},
    {"id": "analitica", "nome": "Analítica", "modulo": "analitica",
     "descricao": "Custos e proveitos por centro de custo"},
)

_POR_ID = {a["id"]: a for a in AMBITOS}


def ambito_valido(ambito: str) -> dict | None:
    return _POR_ID.get(ambito)


def _dec(v) -> str:
    """Decimais viajam como string, pela mesma razão que na API: um float
    perderia cêntimos em valores grandes."""
    return str(v if v is not None else ZERO)


# ---------------------------------------------------------------------------
# Construtores por âmbito
# ---------------------------------------------------------------------------

def _registar_entidades(db: Session, empresa_id: UUID, ps: Pseudonimizador) -> None:
    """Carrega os nomes de terceiros e colaboradores da empresa.

    Faz-se ANTES de construir qualquer âmbito, porque o pseudonimizador precisa
    de saber que nomes são de entidades para decidir o que substituir nos
    campos ambíguos — como o nome de uma conta, que tanto pode ser «Vendas»
    como «AS Imagem, Lda.».

    São duas consultas de uma coluna só; o custo é irrelevante ao lado do resto
    do pacote, e a alternativa — adivinhar pelo código da conta — falharia
    assim que outro módulo passasse a criar contas por entidade.
    """
    ps.registar_entidades(
        db.scalars(select(Terceiro.nome).where(Terceiro.empresa_id == empresa_id)).all()
    )
    ps.registar_entidades(
        db.scalars(
            select(Colaborador.nome).where(Colaborador.empresa_id == empresa_id)
        ).all()
    )
    ps.registar_entidades(
        db.scalars(
            select(Independente.nome).where(Independente.empresa_id == empresa_id)
        ).all()
    )


def _ctx_contabilidade(db, empresa_id, exercicio_id, de, ate, mes, ps) -> dict:
    dr = demonstracao_resultados(
        db, empresa_id=empresa_id, exercicio_id=exercicio_id, de=de, ate=ate, mes=mes
    )
    bal = balanco(
        db, empresa_id=empresa_id, exercicio_id=exercicio_id, de=de, ate=ate, mes=mes
    )
    res = resumo_resultado(
        db, empresa_id=empresa_id, exercicio_id=exercicio_id, de=de, ate=ate
    )

    # Contas com mais movimento no período — dá contexto sem despejar o razão.
    q = (
        select(
            LancamentoLinha.conta_codigo,
            func.max(LancamentoLinha.conta_nome),
            func.sum(LancamentoLinha.debito),
            func.sum(LancamentoLinha.credito),
            func.count(),
        )
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
        .group_by(LancamentoLinha.conta_codigo)
        .order_by(func.sum(LancamentoLinha.debito + LancamentoLinha.credito).desc())
        .limit(TOP)
    )
    if exercicio_id:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if de:
        q = q.where(Lancamento.data >= de)
    if ate:
        q = q.where(Lancamento.data <= ate)

    return {
        "demonstracao_resultados": [
            {"designacao": l["designacao"], "valor": _dec(l["valor"]), "tipo": l["tipo"]}
            for l in dr["linhas"]
        ],
        "resultado_liquido": _dec(dr["liquido"]),
        "balanco": {
            "total_activo": _dec(bal["total_activo"]),
            "total_capital_proprio_e_passivo": _dec(bal["total_cp_passivo"]),
            "equilibrado": bal["equilibrado"],
            "activo": [
                {"designacao": l["designacao"], "valor": _dec(l["valor"])}
                for l in bal["activo"] if l["valor"] is not None
            ],
            "passivo": [
                {"designacao": l["designacao"], "valor": _dec(l["valor"])}
                for l in bal["passivo"] if l["valor"] is not None
            ],
        },
        "custos_proveitos": {
            "custos": _dec(res["custos"]), "proveitos": _dec(res["proveitos"]),
            "resultado": _dec(res["resultado"]),
        },
        # O `nome` passa pelo pseudonimizador: as subcontas de terceiros
        # chamam-se pelo nome da entidade («31121001 — AS Imagem, Lda.»), e sem
        # isto o nome do cliente saía pelo plano de contas enquanto os campos
        # `entidade` já iam pseudonimizados. Só os nomes que são de entidades
        # conhecidas são substituídos — «Vendas» e «Bancos» passam intactos.
        "contas_mais_movimentadas": [
            {"codigo": c, "nome": ps.pseudonimo_se_entidade(n, "Entidade"),
             "debito": _dec(d), "credito": _dec(cr), "movimentos": k}
            for c, n, d, cr, k in db.execute(q).all()
        ],
    }


def _ctx_contas_correntes(db, empresa_id, exercicio_id, de, ate, mes, ps) -> dict:
    cli = contas_correntes(
        db, empresa_id=empresa_id, prefixo="31", natureza="D",
        exercicio_id=exercicio_id, de=de, ate=ate,
    )
    forn = contas_correntes(
        db, empresa_id=empresa_id, prefixo="32", natureza="C",
        exercicio_id=exercicio_id, de=de, ate=ate,
    )

    def linhas(dados, categoria):
        ordenadas = sorted(dados["linhas"], key=lambda l: abs(l["saldo"]), reverse=True)
        return [
            {"entidade": ps.pseudonimo(l["entidade"] or l["nome"], categoria),
             "debito": _dec(l["debito"]), "credito": _dec(l["credito"]),
             "saldo": _dec(l["saldo"])}
            for l in ordenadas[:TOP]
        ]

    return {
        "clientes": {
            "total_a_receber": _dec(cli["totais"]["saldo"]),
            "contas_com_saldo": cli["com_saldo"],
            "maiores": linhas(cli, "Cliente"),
        },
        "fornecedores": {
            "total_a_pagar": _dec(forn["totais"]["saldo"]),
            "contas_com_saldo": forn["com_saldo"],
            "maiores": linhas(forn, "Fornecedor"),
        },
    }


def _ctx_comercial(db, empresa_id, exercicio_id, de, ate, mes, ps) -> dict:
    resumo = com_svc.resumo(db, empresa_id=empresa_id)

    q = select(Venda).where(Venda.empresa_id == empresa_id)
    if de:
        q = q.where(Venda.data >= de)
    if ate:
        q = q.where(Venda.data <= ate)
    vendas = db.scalars(q).all()

    por_tipo: dict[str, dict] = {}
    por_cliente: dict[str, Decimal] = {}
    for v in vendas:
        g = por_tipo.setdefault(v.tipo_doc, {"n": 0, "total": ZERO})
        g["n"] += 1
        g["total"] += v.total or ZERO
        if v.estado == "emitida" and v.cliente_nome:
            chave = ps.pseudonimo(v.cliente_nome, "Cliente")
            por_cliente[chave] = por_cliente.get(chave, ZERO) + (v.total or ZERO)

    return {
        "resumo": {k: (_dec(v) if isinstance(v, Decimal) else v)
                   for k, v in resumo.items()},
        "por_tipo_documento": [
            {"tipo": t, "documentos": g["n"], "total": _dec(g["total"])}
            for t, g in sorted(por_tipo.items(), key=lambda x: -x[1]["total"])
        ],
        "maiores_clientes": [
            {"cliente": c, "total": _dec(v)}
            for c, v in sorted(por_cliente.items(), key=lambda x: -x[1])[:TOP]
        ],
        "comissoes": [
            {"vendedor": ps.pseudonimo(c["vendedor"], "Vendedor"),
             "vendas": c["vendas"], "base": _dec(c["base"]),
             "comissao": _dec(c["comissao"])}
            for c in com_svc.comissoes(db, empresa_id=empresa_id)[:TOP]
        ],
    }


def _ctx_logistica(db, empresa_id, exercicio_id, de, ate, mes, ps) -> dict:
    ex = log_svc.existencias(db, empresa_id=empresa_id)
    por_valor = sorted(ex, key=lambda e: e["valor"], reverse=True)
    return {
        "valor_total_existencias": _dec(sum((e["valor"] for e in ex), ZERO)),
        "artigos": len(ex),
        "em_rutura": sum(1 for e in ex if e["rutura"]),
        "maiores_por_valor": [
            {"codigo": e["codigo"], "descricao": e["descricao"],
             "stock": _dec(e["stock"]), "custo_medio": _dec(e["custo_medio"]),
             "valor": _dec(e["valor"])}
            for e in por_valor[:TOP]
        ],
        "em_ruptura": [
            {"codigo": e["codigo"], "descricao": e["descricao"],
             "stock": _dec(e["stock"]), "minimo": _dec(e["stock_min"])}
            for e in ex if e["rutura"]
        ][:TOP],
    }


def _ctx_rh(db, empresa_id, exercicio_id, de, ate, mes, ps) -> dict:
    """RH é o âmbito mais sensível: são pessoas.

    Vão os totais da folha e, por colaborador, apenas pseudónimo e valores —
    nunca NIF, número de Segurança Social, IBAN ou morada.
    """
    f = rh_svc.folha(db, empresa_id=empresa_id, mes=mes, exercicio_id=exercicio_id)
    return {
        "periodo": mes,
        "totais": {k: _dec(v) for k, v in f["totais"].items()},
        "colaboradores": len(f["linhas"]),
        "detalhe": [
            {"colaborador": ps.pseudonimo(l["colaborador"], "Colaborador"),
             "base": _dec(l["base"]), "subsidios": _dec(l["subs"]),
             "bruto": _dec(l["bruto"]), "inss": _dec(l["inss"]),
             "irt": _dec(l["irt"]), "liquido": _dec(l["liquido"]),
             "faltas": _dec(l["faltas"])}
            for l in f["linhas"][:TOP]
        ],
    }


def _ctx_imobilizados(db, empresa_id, exercicio_id, de, ate, mes, ps) -> dict:
    m = imo_svc.mapa(db, empresa_id=empresa_id)
    return {
        "totais": {k: _dec(v) for k, v in m["totais"].items()},
        "activos": len(m["linhas"]),
        "detalhe": [
            {"codigo": l["codigo"], "designacao": l["designacao"],
             "valor_bruto": _dec(l["valor_bruto"]), "taxa": _dec(l["taxa"]),
             "metodo": l["metodo"],
             "amort_exercicio": _dec(l["amort_exercicio"]),
             "valor_liquido": _dec(l["valor_liquido"]), "estado": l["estado"]}
            for l in m["linhas"][:TOP]
        ],
    }


def _ctx_fiscalidade(db, empresa_id, exercicio_id, de, ate, mes, ps) -> dict:
    periodos = [mes] if mes else [f"{m:02d}" for m in range(1, 13)]
    iva = []
    for p in periodos:
        a = apuramento_iva(db, empresa_id=empresa_id, exercicio_id=exercicio_id, mes=p)
        if a["liquidado"] or a["dedutivel"] or a["regulariz"]:
            iva.append({
                "periodo": p, "liquidado": _dec(a["liquidado"]),
                "dedutivel": _dec(a["dedutivel"]),
                "regularizacoes": _dec(a["regulariz"]),
                "resultado": _dec(a["resultado"]),
                "a_pagar": _dec(a["a_pagar"]), "a_recuperar": _dec(a["a_recuperar"]),
            })
    ret = mapa_retencoes(db, empresa_id=empresa_id, exercicio_id=exercicio_id, mes=mes)
    return {
        "iva_por_periodo": iva,
        "retencoes": {
            "total": _dec(ret["total"]),
            "por_tipo": {k: _dec(v) for k, v in ret["por_tipo"].items()},
        },
    }


def _ctx_analitica(db, empresa_id, exercicio_id, de, ate, mes, ps) -> dict:
    m = analitica_mapa(
        db, empresa_id=empresa_id, exercicio_id=exercicio_id, de=de, ate=ate
    )
    return {
        "totais": {k: _dec(v) for k, v in m["totais"].items()},
        "centros": [
            {"codigo": l["codigo"], "nome": l["nome"], "debito": _dec(l["debito"]),
             "credito": _dec(l["credito"]), "saldo": _dec(l["saldo"]),
             "movimentos": l["n"]}
            for l in m["linhas"]
        ],
    }


_CONSTRUTORES = {
    "contabilidade": _ctx_contabilidade,
    "contasCorrentes": _ctx_contas_correntes,
    "comercial": _ctx_comercial,
    "logistica": _ctx_logistica,
    "rh": _ctx_rh,
    "imobilizados": _ctx_imobilizados,
    "fiscalidade": _ctx_fiscalidade,
    "analitica": _ctx_analitica,
}


# ---------------------------------------------------------------------------
def construir(
    db: Session,
    *,
    empresa_id: UUID,
    ambitos: list[str],
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    mes: str | None = None,
    incluir_diagnostico: bool = False,
) -> tuple[dict, Pseudonimizador]:
    """Constrói o pacote de dados que a IA vai receber.

    Devolve também o pseudonimizador, para a resposta poder ser reposta com os
    nomes reais.
    """
    ps = Pseudonimizador()
    _registar_entidades(db, empresa_id, ps)
    empresa = db.get(Empresa, empresa_id)
    ex = db.get(Exercicio, exercicio_id) if exercicio_id else None

    pacote: dict = {
        # A empresa em si não é dado pessoal e o nome é preciso para a resposta
        # fazer sentido. O NIF, esse, NÃO vai.
        "empresa": {
            "nome": empresa.nome if empresa else "",
            "moeda": empresa.moeda if empresa else "Kz",
            "regime_iva": str(empresa.regime) if empresa else "",
        },
        "periodo": {
            "exercicio": ex.nome if ex else None,
            "inicio": str(ex.inicio) if ex else (str(de) if de else None),
            "fim": str(ex.fim) if ex else (str(ate) if ate else None),
            "de": str(de) if de else None,
            "ate": str(ate) if ate else None,
            "mes": mes,
        },
        "dados": {},
    }

    for ambito in ambitos:
        construtor = _CONSTRUTORES.get(ambito)
        if construtor is None:
            continue
        pacote["dados"][ambito] = construtor(
            db, empresa_id, exercicio_id, de, ate, mes, ps
        )

    if incluir_diagnostico:
        from src.services.ia.diagnostico import diagnosticar

        d = diagnosticar(
            db, empresa_id=empresa_id, exercicio_id=exercicio_id,
            modulos=set(ambitos) or None,
        )
        # Os achados trazem nomes reais (são de uso interno) — passam pelo
        # pseudonimizador e pela limpeza antes de entrarem no pacote.
        pacote["diagnostico"] = {
            "resumo": d["resumo"],
            "achados": [
                {"gravidade": a["gravidade"], "modulo": a["modulo"],
                 "regra": a["regra"], "titulo": limpar_texto(a["titulo"]),
                 "detalhe": limpar_texto(a["detalhe"]),
                 "ocorrencias": len(a["itens"])}
                for a in d["achados"]
            ],
        }

    return pacote, ps
