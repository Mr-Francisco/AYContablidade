"""Apuramentos: Resultados, IVA e mapa de retenções na fonte.

Transposto de `apurarResultados()`, `apuramentoIVA()`, `apurarIVA()` e
`mapaRetencoes()` de `Piloto/assets/js/contabilidade.js`.

Todos os códigos de conta aqui são do plano do Primavera — ver a nota em
`src/core/pgc.py`.
"""

from datetime import date as Date
from decimal import Decimal
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.pgc import periodo_label
from src.db.base import agora
from src.db.models.contabilidade import Conta, Lancamento, LancamentoLinha
from src.db.models.tenancy import Exercicio
from src.services.contabilidade import ErroContabilistico, postar
from src.services.demonstracoes import saldos_acum

ZERO = Decimal("0")


# ---------------------------------------------------------------------------
# Apuramento de Resultados
# ---------------------------------------------------------------------------
class CategoriaApuramento(NamedTuple):
    chave: str
    nome: str
    documento: str
    destino88: str
    prefixos: tuple[str, ...]


APURAMENTO_CATS: tuple[CategoriaApuramento, ...] = (
    CategoriaApuramento("op", "Resultados Operacionais", "811", "881",
                        ("61", "62", "63", "64", "65", "71", "72", "73", "75")),
    CategoriaApuramento("fin", "Resultados Financeiros", "812", "882", ("66", "76")),
    CategoriaApuramento("fil", "Resultados de Filiais e Associadas", "816", "883",
                        ("67", "77")),
    CategoriaApuramento("nop", "Resultados Não Operacionais", "817", "884",
                        ("68", "78")),
    CategoriaApuramento("ext", "Resultados Extraordinários", "814", "886",
                        ("69", "79")),
)


def _fecho_linha(codigo: str, v: Decimal, descricao: str) -> dict:
    """Linha que anula um saldo: um saldo devedor fecha-se a crédito e
    vice-versa."""
    if v > 0:
        return {"conta_codigo": codigo, "debito": ZERO, "credito": v, "descricao": descricao}
    return {"conta_codigo": codigo, "debito": -v, "credito": ZERO, "descricao": descricao}


def _exigir_conta(db: Session, empresa_id: UUID, codigo: str) -> None:
    existe = db.scalar(
        select(Conta.id).where(Conta.empresa_id == empresa_id, Conta.codigo == codigo)
    )
    if existe is None:
        raise ErroContabilistico(
            f"A conta {codigo} (Resultados) não existe no plano — verifica o "
            "plano de contas antes de apurar."
        )


def reabrir_apuramento(db: Session, *, empresa_id: UUID, exercicio_id: UUID) -> bool:
    """Remove os lançamentos de um apuramento anterior, para poder apurar de novo."""
    ex = db.scalar(
        select(Exercicio).where(
            Exercicio.id == exercicio_id, Exercicio.empresa_id == empresa_id
        )
    )
    if ex is None or not ex.apuramento:
        return False

    for lanc_id in ex.apuramento.get("lancamento_ids", []):
        lanc = db.get(Lancamento, UUID(str(lanc_id)))
        if lanc is not None and lanc.empresa_id == empresa_id:
            db.delete(lanc)

    ex.apuramento = None
    db.flush()
    return True


def apurar_resultados(
    db: Session, *, empresa_id: UUID, exercicio_id: UUID, data: Date | None = None
) -> dict:
    """Fecha custos e proveitos por categoria para as contas 88x e, no fim,
    transfere o Resultado Líquido para 8111.

    Idempotente: reabre um apuramento anterior do mesmo exercício antes de
    gerar o novo, para poder ser corrido outra vez em segurança após correcções.

    O período contabilístico é sempre 14 (Apuramento de Resultados), qualquer
    que seja a data escolhida — a data diz *quando* se apurou, o período diz
    *o que* é o lançamento.
    """
    ex = db.scalar(
        select(Exercicio).where(
            Exercicio.id == exercicio_id, Exercicio.empresa_id == empresa_id
        )
    )
    if ex is None:
        raise ErroContabilistico("Exercício não encontrado.")

    reabrir_apuramento(db, empresa_id=empresa_id, exercicio_id=exercicio_id)

    ate = data or ex.fim
    if ate is None:
        raise ErroContabilistico(
            "Indica uma data de apuramento válida (ou define o fim do exercício "
            "em Configurações)."
        )

    sal = saldos_acum(db, empresa_id=empresa_id, exercicio_id=exercicio_id, ate=ate)
    gerados: list[dict] = []
    saldos88: dict[str, Decimal] = {}

    for cat in APURAMENTO_CATS:
        linhas: list[dict] = []
        soma_cat = ZERO
        for cod, v in sal.items():
            if not cod.startswith(cat.prefixos) or not v:
                continue
            linhas.append(_fecho_linha(cod, v, "Apuramento — fecho do exercício"))
            soma_cat += v
        if not linhas:
            continue

        _exigir_conta(db, empresa_id, cat.destino88)
        linhas.append(_fecho_linha(cat.destino88, -soma_cat, cat.nome))
        saldos88[cat.destino88] = saldos88.get(cat.destino88, ZERO) + soma_cat

        lanc = postar(
            db, empresa_id=empresa_id, data=ate, diario_codigo="81",
            documento_codigo=cat.documento, mes="14",
            descricao=f"Apuramento de Resultados — {cat.nome}",
            documento_ref=f"APUR-{cat.chave.upper()}", origem="apuramento",
            exercicio_id=exercicio_id, linhas=linhas,
        )
        gerados.append(
            {"categoria": cat.chave, "nome": cat.nome,
             "lancamento_id": str(lanc.id), "resultado": -soma_cat}
        )

    # Imposto sobre os Resultados: 871 + 872 -> 885
    linhas_imp: list[dict] = []
    soma_imp = ZERO
    for cod in ("871", "872"):
        v = sal.get(cod)
        if not v:
            continue
        linhas_imp.append(_fecho_linha(cod, v, "Apuramento — fecho do exercício"))
        soma_imp += v
    if linhas_imp:
        _exigir_conta(db, empresa_id, "885")
        linhas_imp.append(_fecho_linha("885", -soma_imp, "Imposto sobre os Resultados"))
        saldos88["885"] = saldos88.get("885", ZERO) + soma_imp
        lanc = postar(
            db, empresa_id=empresa_id, data=ate, diario_codigo="81",
            documento_codigo="821", mes="14",
            descricao="Apuramento de Resultados — Imposto sobre os Resultados",
            documento_ref="APUR-IMP", origem="apuramento",
            exercicio_id=exercicio_id, linhas=linhas_imp,
        )
        gerados.append(
            {"categoria": "imp", "nome": "Imposto sobre os Resultados",
             "lancamento_id": str(lanc.id), "resultado": -soma_imp}
        )

    # Fecho final: soma das 88x -> 8111 (Resultado Líquido do Exercício)
    resultado_liquido = ZERO
    chaves88 = [k for k, v in saldos88.items() if v]
    if chaves88:
        linhas_liq: list[dict] = []
        liquido_dc = ZERO
        for cod in chaves88:
            v = saldos88[cod]
            linhas_liq.append(_fecho_linha(cod, v, "Apuramento — fecho do exercício"))
            liquido_dc += v
        _exigir_conta(db, empresa_id, "8111")
        linhas_liq.append(
            _fecho_linha("8111", -liquido_dc, "Resultado Líquido do Exercício")
        )
        resultado_liquido = -liquido_dc
        lanc = postar(
            db, empresa_id=empresa_id, data=ate, diario_codigo="81",
            documento_codigo="822", mes="14",
            descricao="Apuramento de Resultados — Resultado Líquido do Exercício",
            documento_ref="APUR-LIQ", origem="apuramento",
            exercicio_id=exercicio_id, linhas=linhas_liq,
        )
        gerados.append(
            {"categoria": "liq", "nome": "Resultado Líquido do Exercício",
             "lancamento_id": str(lanc.id), "resultado": resultado_liquido}
        )

    if not gerados:
        raise ErroContabilistico(
            "Sem movimentos de custos/proveitos para apurar neste exercício."
        )

    ex.apuramento = {
        "em": agora().isoformat(),
        "ate": str(ate),
        "resultado": str(resultado_liquido),
        "lancamento_ids": [g["lancamento_id"] for g in gerados],
        "detalhe": [{**g, "resultado": str(g["resultado"])} for g in gerados],
    }
    db.flush()
    return ex.apuramento


# ---------------------------------------------------------------------------
# Apuramento do IVA
# ---------------------------------------------------------------------------
class CfgIVA(NamedTuple):
    pref_liquidado: str = "3453"
    pref_dedutivel: str = "3452"
    pref_regulariz: str = "3454"
    conta_apuramento: str = "34551"
    conta_a_pagar: str = "34561"
    conta_recuperar: str = "34571"
    diario: str = "34"
    documento: str = "341"


CFG_IVA = CfgIVA()


def apuramento_iva(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    mes: str | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    """Apura o IVA do período, sem lançar nada.

    IVA liquidado é credor (crédito − débito) e o dedutível é devedor
    (débito − crédito) — trocar os sinais inverteria o resultado.
    """
    q = (
        select(
            LancamentoLinha.conta_codigo,
            LancamentoLinha.conta_nome,
            LancamentoLinha.debito,
            LancamentoLinha.credito,
        )
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if mes is not None:
        q = q.where(Lancamento.mes == mes)
    if de is not None:
        q = q.where(Lancamento.data >= de)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)

    liq: dict[str, dict] = {}
    ded: dict[str, dict] = {}
    reg: dict[str, dict] = {}
    liquidado = dedutivel = regulariz = ZERO

    for cod, nome, debito, credito in db.execute(q):
        d = debito or ZERO
        c = credito or ZERO
        if cod.startswith(CFG_IVA.pref_liquidado):
            v = c - d
            liquidado += v
            g = liq.setdefault(cod, {"codigo": cod, "nome": nome or cod, "valor": ZERO})
            g["valor"] += v
        elif cod.startswith(CFG_IVA.pref_dedutivel):
            v = d - c
            dedutivel += v
            g = ded.setdefault(cod, {"codigo": cod, "nome": nome or cod, "valor": ZERO})
            g["valor"] += v
        elif cod.startswith(CFG_IVA.pref_regulariz):
            v = c - d
            regulariz += v
            g = reg.setdefault(cod, {"codigo": cod, "nome": nome or cod, "valor": ZERO})
            g["valor"] += v

    resultado = liquidado + regulariz - dedutivel
    return {
        "mes": mes,
        "liquidado": liquidado,
        "dedutivel": dedutivel,
        "regulariz": regulariz,
        "resultado": resultado,
        "a_pagar": resultado if resultado > 0 else ZERO,
        "a_recuperar": -resultado if resultado < 0 else ZERO,
        "liquidado_linhas": list(liq.values()),
        "dedutivel_linhas": list(ded.values()),
        "regulariz_linhas": list(reg.values()),
    }


def apurar_iva(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    mes: str | None = None,
    data: Date | None = None,
) -> dict:
    """Apura o IVA e gera o lançamento que zera as contas do período,
    transferindo o saldo para IVA a pagar ou a recuperar."""
    a = apuramento_iva(db, empresa_id=empresa_id, exercicio_id=exercicio_id, mes=mes)
    if a["liquidado"] == 0 and a["dedutivel"] == 0 and a["regulariz"] == 0:
        raise ErroContabilistico("Sem IVA no período.")

    linhas: list[dict] = []
    for g in a["liquidado_linhas"]:
        if g["valor"]:
            linhas.append({"conta_codigo": g["codigo"],
                           "debito": g["valor"] if g["valor"] > 0 else ZERO,
                           "credito": -g["valor"] if g["valor"] < 0 else ZERO,
                           "descricao": "Apuramento IVA liquidado"})
    for g in a["dedutivel_linhas"]:
        if g["valor"]:
            linhas.append({"conta_codigo": g["codigo"],
                           "debito": -g["valor"] if g["valor"] < 0 else ZERO,
                           "credito": g["valor"] if g["valor"] > 0 else ZERO,
                           "descricao": "Apuramento IVA dedutível"})
    for g in a["regulariz_linhas"]:
        if g["valor"]:
            linhas.append({"conta_codigo": g["codigo"],
                           "debito": g["valor"] if g["valor"] > 0 else ZERO,
                           "credito": -g["valor"] if g["valor"] < 0 else ZERO,
                           "descricao": "Apuramento regularizações"})

    if a["resultado"] > 0:
        linhas.append({"conta_codigo": CFG_IVA.conta_a_pagar, "debito": ZERO,
                       "credito": a["resultado"], "descricao": "IVA a pagar (apuramento)"})
    elif a["resultado"] < 0:
        linhas.append({"conta_codigo": CFG_IVA.conta_recuperar, "debito": -a["resultado"],
                       "credito": ZERO, "descricao": "IVA a recuperar (apuramento)"})

    lanc = postar(
        db, empresa_id=empresa_id, data=data or Date.today(),
        diario_codigo=CFG_IVA.diario, documento_codigo=CFG_IVA.documento,
        mes=mes or "13",
        descricao=f"Apuramento do IVA — {periodo_label(mes) if mes else ''}".strip(),
        documento_ref=f"IVA-{mes or ''}", origem="apuramento",
        exercicio_id=exercicio_id, linhas=linhas,
    )
    return {"apuramento": a, "lancamento_id": lanc.id, "numero_op": lanc.numero_op}


# ---------------------------------------------------------------------------
# Retenções na fonte
# ---------------------------------------------------------------------------
CONTAS_RETENCAO: dict[str, str] = {
    "3413": "Imposto Industrial / IAC",
    "3431": "IRT",
    "3432": "IRT (Lei 7/97)",
    "3471": "Imposto de Selo",
}


def mapa_retencoes(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    mes: str | None = None,
) -> dict:
    """Retenções efectuadas no período.

    Só conta linhas que CREDITAM uma conta de retenção — um débito nessas contas
    é a entrega do imposto ao Estado, não uma retenção nova.
    """
    q = (
        select(Lancamento, LancamentoLinha)
        .join(LancamentoLinha, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
        .order_by(Lancamento.data)
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if mes is not None:
        q = q.where(Lancamento.mes == mes)

    linhas: list[dict] = []
    por_tipo: dict[str, Decimal] = {}
    for lanc, linha in db.execute(q):
        cod = linha.conta_codigo or ""
        tipo_cod = next((k for k in CONTAS_RETENCAO if cod.startswith(k)), None)
        if tipo_cod is None:
            continue
        valor = (linha.credito or ZERO) - (linha.debito or ZERO)
        if valor <= 0:
            continue
        tipo = CONTAS_RETENCAO[tipo_cod]
        linhas.append(
            {
                "data": lanc.data,
                "numero_op": lanc.numero_op or "",
                "tipo": tipo,
                "conta": cod,
                "entidade": linha.entidade or "",
                "descricao": linha.descricao or lanc.descricao,
                "valor": valor,
                "lancamento_id": lanc.id,
            }
        )
        por_tipo[tipo] = por_tipo.get(tipo, ZERO) + valor

    return {
        "linhas": linhas,
        "total": sum(por_tipo.values(), ZERO),
        "por_tipo": por_tipo,
    }
