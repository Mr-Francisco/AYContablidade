"""Imobilizados: activos fixos e amortizações.

Transposto de `Piloto/assets/js/imobilizados.js`.

Métodos: Quotas Constantes (base) e Quotas Decrescentes (simplificado, com
coeficiente por vida útil). O método decrescente aqui NÃO comuta para quotas
constantes no fim da vida útil — é a mesma simplificação do Piloto.
"""

from datetime import date as Date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models.imobilizados import Ativo, ProcessoAmortizacao
from src.db.models.tenancy import ConfigEmpresa
from src.services.notificacoes import notificar, resolver
from src.services.contabilidade import ErroContabilistico, postar

ZERO = Decimal("0")
CENT = Decimal("0.01")

METODOS = (("quotas", "Quotas Constantes"), ("degressivas", "Quotas Decrescentes"))


def r2(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def cfg_imob_default() -> dict:
    return {"diario": "71", "documento": "713"}


def cfg_imob(db: Session, empresa_id: UUID) -> dict:
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa_id))
    base = cfg_imob_default()
    if cfg is None:
        return base
    return {**base, **((cfg.parametrizacoes or {}).get("imob") or {})}


# ---------------------------------------------------------------------------
# Cálculo
# ---------------------------------------------------------------------------
def coef_degressivo(vida_util_anos: Decimal) -> Decimal:
    """Coeficiente das quotas decrescentes, por vida útil estimada."""
    if vida_util_anos <= 5:
        return Decimal("1.5")
    if vida_util_anos <= 6:
        return Decimal("2")
    return Decimal("2.5")


def valor_liquido(a: Ativo) -> Decimal:
    return r2((a.valor_aquisicao or ZERO) - (a.amort_acumulada or ZERO))


def amort_anual(a: Ativo) -> Decimal:
    """Quota anual.

    Nas quotas constantes incide sobre o VALOR DE AQUISIÇÃO; nas decrescentes
    sobre o valor líquido ainda por amortizar, multiplicado pelo coeficiente.
    """
    taxa = a.taxa or ZERO
    if a.metodo == "degressivas":
        vida_util = (Decimal("100") / taxa) if taxa > 0 else ZERO
        return r2(valor_liquido(a) * taxa / 100 * coef_degressivo(vida_util))
    return r2((a.valor_aquisicao or ZERO) * taxa / 100)


def amort_mensal(a: Ativo) -> Decimal:
    return r2(amort_anual(a) / 12)


def amort_exercicio(a: Ativo) -> Decimal:
    """Amortização anual a reconhecer, limitada ao que falta amortizar."""
    if a.estado == "abatido":
        return ZERO
    return r2(min(amort_anual(a), max(ZERO, valor_liquido(a))))


def amort_do_periodo(a: Ativo, mes: str) -> Decimal:
    """Quota do mês, limitada ao valor líquido restante.

    O período 00 (Abertura) não tem amortização — não é um mês.
    """
    if a.estado == "abatido" or mes == "00":
        return ZERO
    return r2(min(amort_mensal(a), max(ZERO, valor_liquido(a))))


def percent_amortizado(a: Ativo) -> int:
    v = a.valor_aquisicao or ZERO
    if not v:
        return 0
    return int(round((a.amort_acumulada or ZERO) / v * 100))


def proximo_codigo(db: Session, empresa_id: UUID) -> str:
    codigos = db.scalars(select(Ativo.codigo).where(Ativo.empresa_id == empresa_id)).all()
    maximo = 0
    for c in codigos:
        if c and c.startswith("IM-") and c[3:].isdigit():
            maximo = max(maximo, int(c[3:]))
    return f"IM-{maximo + 1:04d}"


# ---------------------------------------------------------------------------
# Mapas
# ---------------------------------------------------------------------------
def mapa(db: Session, *, empresa_id: UUID, so_ativos: bool = False) -> dict:
    """Mapa anual de amortizações."""
    q = select(Ativo).where(Ativo.empresa_id == empresa_id)
    if so_ativos:
        q = q.where(Ativo.estado == "activo")

    linhas = []
    for a in db.scalars(q.order_by(Ativo.codigo)).all():
        ae = amort_exercicio(a)
        linhas.append(
            {
                "id": a.id, "codigo": a.codigo, "designacao": a.designacao,
                "conta": a.conta_imob, "data_aquisicao": a.data_aquisicao,
                "valor_bruto": r2(a.valor_aquisicao), "taxa": a.taxa,
                "metodo": a.metodo,
                "amort_acumulada_ant": r2(a.amort_acumulada),
                "amort_exercicio": ae,
                "amort_acumulada": r2((a.amort_acumulada or ZERO) + ae),
                "valor_liquido": r2(valor_liquido(a) - ae),
                "estado": a.estado,
            }
        )
    chaves = ("valor_bruto", "amort_acumulada_ant", "amort_exercicio",
              "amort_acumulada", "valor_liquido")
    return {
        "linhas": linhas,
        "totais": {k: r2(sum((l[k] for l in linhas), ZERO)) for k in chaves},
    }


def processo_de(
    db: Session, empresa_id: UUID, exercicio_id: UUID, mes: str
) -> ProcessoAmortizacao | None:
    return db.scalar(
        select(ProcessoAmortizacao).where(
            ProcessoAmortizacao.empresa_id == empresa_id,
            ProcessoAmortizacao.exercicio_id == exercicio_id,
            ProcessoAmortizacao.mes == mes,
        )
    )


def mapa_periodo(
    db: Session, *, empresa_id: UUID, exercicio_id: UUID, mes: str,
    so_ativos: bool = False,
) -> dict:
    """Mapa do período: mostra o valor JÁ processado se o período estiver
    fechado, ou o valor A processar se ainda estiver por fazer."""
    batch = processo_de(db, empresa_id, exercicio_id, mes)
    itens_por_ativo = (
        {str(i["ativo_id"]): i for i in (batch.itens or [])} if batch else {}
    )

    q = select(Ativo).where(Ativo.empresa_id == empresa_id)
    if so_ativos:
        q = q.where(Ativo.estado == "activo")

    linhas = []
    for a in db.scalars(q.order_by(Ativo.codigo)).all():
        item = itens_por_ativo.get(str(a.id))
        valor = Decimal(str(item["valor"])) if item else amort_do_periodo(a, mes)
        linhas.append(
            {
                "id": a.id, "codigo": a.codigo, "designacao": a.designacao,
                "conta": a.conta_imob, "taxa": a.taxa, "metodo": a.metodo,
                "valor_bruto": r2(a.valor_aquisicao),
                "amort_acumulada_atual": r2(a.amort_acumulada),
                "valor_liquido_atual": valor_liquido(a),
                "valor_periodo": valor, "ja_processado": item is not None,
                "lancamento_id": item.get("lancamento_id") if item else None,
                "estado": a.estado,
            }
        )
    return {
        "linhas": linhas,
        "total_periodo": r2(sum((l["valor_periodo"] for l in linhas), ZERO)),
        "processado": batch is not None,
        # A DATA do processamento, e não só o facto. «Processado» sozinho não
        # diz de quando — e num mapa que se reabre e reprocessa, é a data que
        # diz se o que está no ecrã é o trabalho de ontem ou o de hoje.
        "processado_em": batch.data if batch else None,
    }


# ---------------------------------------------------------------------------
# Processamento
# ---------------------------------------------------------------------------
def processar_periodo(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID,
    mes: str,
    data: Date,
    por: str | None = None,
) -> dict:
    """Processa a amortização de um exercício e período.

    Idempotente por recusa: um período já processado tem de ser reaberto antes
    de correr outra vez. Reprocessar em cima do anterior duplicaria a
    amortização acumulada de cada activo.
    """
    if not exercicio_id:
        raise ErroContabilistico("Indica o exercício a processar.")
    if not mes:
        raise ErroContabilistico("Indica o período a processar.")
    # `amort_do_periodo` já devolve zero para o período 00, por isso processá-lo
    # não amortizava nada — mas gravava na mesma um registo de processamento e o
    # período passava a mostrar-se "processado". A Abertura não é um mês.
    if mes == "00":
        raise ErroContabilistico(
            "O período 00 é a Abertura e não tem amortização. Escolhe um "
            "período de 01 a 12."
        )
    if processo_de(db, empresa_id, exercicio_id, mes) is not None:
        raise ErroContabilistico(
            "Este período já foi processado — reabre-o antes de processar de novo."
        )

    c2 = cfg_imob(db, empresa_id)
    itens, lancamento_ids, erros = [], [], []

    for a in db.scalars(
        select(Ativo).where(Ativo.empresa_id == empresa_id).order_by(Ativo.codigo)
    ).all():
        valor = amort_do_periodo(a, mes)
        if valor <= 0:
            continue

        # A AMORTIZAÇÃO SÓ SE ESCREVE DEPOIS DE O LANÇAMENTO PASSAR.
        #
        # Antes escrevia-se primeiro e lançava-se a seguir. Se o lançamento
        # falhasse, o activo ficava amortizado na ficha e não nas contas — o
        # mapa de imobilizados a discordar do balanço, sem erro visível, até
        # ao fecho do exercício. E se o activo não tivesse contas de
        # amortização definidas, o lançamento nem era tentado: a divergência
        # nascia em silêncio absoluto.
        #
        # Agora, por activo: ou vai aos dois sítios, ou não vai a nenhum. Um
        # activo mal configurado deixa os outros passar — bloquear o mês
        # inteiro por causa de um seria trocar uma inconsistência por uma
        # paragem — mas fica na lista de erros e não é amortizado.
        if not a.conta_custo_amort or not a.conta_amort_acum:
            erros.append(
                f"{a.codigo}: sem contas de amortização na ficha "
                "(custo e amortizações acumuladas) — não foi amortizado."
            )
            continue

        try:
            lanc = postar(
                db, empresa_id=empresa_id, data=data, diario_codigo=c2["diario"],
                documento_codigo=c2["documento"], mes=mes, exercicio_id=exercicio_id,
                descricao=f"Amortização do período — {a.designacao or a.codigo}",
                documento_ref=a.codigo, origem="imobilizado",
                linhas=[
                    {"conta_codigo": a.conta_custo_amort, "debito": valor,
                     "descricao": a.designacao},
                    {"conta_codigo": a.conta_amort_acum, "credito": valor,
                     "descricao": a.designacao},
                ],
            )
        except ErroContabilistico as e:
            erros.append(f"{a.codigo}: {e} — não foi amortizado.")
            continue

        a.amort_acumulada = r2((a.amort_acumulada or ZERO) + valor)
        itens.append({
            "ativo_id": str(a.id), "codigo": a.codigo,
            "designacao": a.designacao, "valor": str(valor),
            "lancamento_id": str(lanc.id),
        })
        lancamento_ids.append(str(lanc.id))

    total = r2(sum((Decimal(i["valor"]) for i in itens), ZERO))
    batch = ProcessoAmortizacao(
        empresa_id=empresa_id, exercicio_id=exercicio_id, mes=mes, data=data,
        itens=itens, total_amort=total, por=por or "sistema",
    )
    db.add(batch)
    # Antes das notificações: sem isto, o `batch.id` que elas guardam como
    # alvo ainda não existe e a ligação fica a apontar para nada.
    db.flush()

    # A amortização processada ENTRA NA CONTABILIDADE — débito custo, crédito
    # amortizações acumuladas. Quem lança não é quem processa, e até aqui não
    # havia nada a dizê-lo a ninguém: o período ficava «processado» neste ecrã
    # e o movimento aparecia na contabilidade sem origem visível.
    #
    # A chave inclui o período: reabrir e voltar a processar não cria uma
    # segunda notificação, actualiza a que existe.
    if itens:
        notificar(
            db, empresa_id=empresa_id, capacidade="contab.ver",
            origem="imobilizado", tipo="info",
            chave=f"amort-processada:{exercicio_id}:{mes}",
            titulo=f"Amortizações de {mes} processadas",
            texto=(
                f"{len(itens)} activo(s), {total} lançado(s) na contabilidade "
                f"({len(lancamento_ids)} com movimento)."
            ),
            ligacao="/imobilizados/amortizacoes",
            alvo_tipo="processo_amortizacao", alvo_id=batch.id,
        )

    # Notificação 4. Os activos que falharam NÃO foram amortizados — isso já
    # está garantido acima. O que a notificação diz é que ficaram por
    # amortizar, e porquê: sem isto, o período aparece «processado» e ninguém
    # repara que faltaram activos lá dentro.
    if erros:
        notificar(
            db, empresa_id=empresa_id, capacidade="contab.lancar",
            origem="imobilizado",
            chave=f"amort-por-lancar:{exercicio_id}:{mes}",
            titulo=f"{len(erros)} activo(s) por amortizar em {mes}",
            texto=(
                "Estes activos não foram amortizados nem lançados: "
                + " · ".join(erros)
            ),
            ligacao="/imobilizados/amortizacoes",
            alvo_tipo="processo_amortizacao", alvo_id=batch.id,
        )

    db.flush()
    return {"processados": len(itens), "total_amort": total,
            "lancados": len(lancamento_ids), "erros": erros, "processo_id": batch.id}


def reabrir_periodo(
    db: Session, *, empresa_id: UUID, exercicio_id: UUID, mes: str
) -> bool:
    """Desfaz o processamento: repõe as amortizações acumuladas e remove os
    lançamentos gerados."""
    from src.db.models.contabilidade import Lancamento

    batch = processo_de(db, empresa_id, exercicio_id, mes)
    if batch is None:
        return False

    for item in batch.itens or []:
        a = db.get(Ativo, UUID(str(item["ativo_id"])))
        if a is not None and a.empresa_id == empresa_id:
            a.amort_acumulada = r2(
                (a.amort_acumulada or ZERO) - Decimal(str(item["valor"]))
            )
        lanc_id = item.get("lancamento_id")
        if lanc_id:
            lanc = db.get(Lancamento, UUID(str(lanc_id)))
            if lanc is not None and lanc.empresa_id == empresa_id:
                db.delete(lanc)

    db.delete(batch)
    # Reabrir desfaz o processamento inteiro: o que estava por amortizar
    # deixou de estar, porque já não há período processado nenhum.
    resolver(db, empresa_id=empresa_id, chave=f"amort-por-lancar:{exercicio_id}:{mes}")
    db.flush()
    return True
