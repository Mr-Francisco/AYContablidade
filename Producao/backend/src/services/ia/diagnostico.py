"""Detector de erros e incoerências, por regras.

Corre INTEIRAMENTE no servidor, sem IA nenhuma — «o processamento do sistema é
local por defeito» (`docs/AI_INTEGRATION.md`). A IA pode depois ser usada para
explicar um achado, mas não é ela que o encontra: um diagnóstico contabilístico
tem de ser determinístico e reproduzível, não probabilístico.

Como estes resultados ficam dentro do sistema, trazem os nomes reais. É a
camada de IA que redige, quando e se algo for enviado para fora.
"""

from datetime import date as Date
from datetime import timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.db.models.comercial import Compra, Venda
from src.db.models.contabilidade import Conta, Lancamento, LancamentoLinha
from src.db.models.imobilizados import Ativo
from src.db.models.logistica import Artigo
from src.db.models.rh import Colaborador, PagamentoSalarial, ProcessamentoSalarial
from src.db.models.tenancy import Exercicio
from src.services import logistica as log_svc
from src.services.apuramentos import apuramento_iva
from src.services.contabilidade import contas_correntes, eh_movimento
from src.services.demonstracoes import balanco

ZERO = Decimal("0")

# Gravidade: "erro" trava o fecho de contas, "aviso" merece atenção,
# "sugestao" é oportunidade de melhoria.
GRAVIDADES = ("erro", "aviso", "sugestao")


def _achado(
    gravidade: str, modulo: str, regra: str, titulo: str, detalhe: str,
    itens: list | None = None, accao: str | None = None,
) -> dict:
    return {
        "gravidade": gravidade, "modulo": modulo, "regra": regra,
        "titulo": titulo, "detalhe": detalhe, "itens": itens or [],
        "accao": accao,
    }


def diagnosticar(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    modulos: set[str] | None = None,
) -> dict:
    """Corre todas as regras e devolve os achados, mais graves primeiro."""
    achados: list[dict] = []
    quer = lambda m: modulos is None or m in modulos  # noqa: E731

    ex = (
        db.scalar(
            select(Exercicio).where(
                Exercicio.id == exercicio_id, Exercicio.empresa_id == empresa_id
            )
        )
        if exercicio_id
        else None
    )

    # ---------------- Contabilidade ----------------
    if quer("contabilidade"):
        achados += _regras_contabilidade(db, empresa_id, exercicio_id, ex)

    # ---------------- Contas correntes ----------------
    if quer("contasCorrentes"):
        achados += _regras_contas_correntes(db, empresa_id, exercicio_id)

    # ---------------- Fiscalidade ----------------
    if quer("fiscalidade") or quer("contabilidade"):
        achados += _regras_iva(db, empresa_id, exercicio_id)

    # ---------------- Logística ----------------
    if quer("logistica"):
        achados += _regras_logistica(db, empresa_id)

    # ---------------- RH ----------------
    if quer("rh"):
        achados += _regras_rh(db, empresa_id, exercicio_id)

    # ---------------- Comercial ----------------
    if quer("comercial"):
        achados += _regras_comercial(db, empresa_id)

    # ---------------- Imobilizados ----------------
    if quer("imobilizados"):
        achados += _regras_imobilizados(db, empresa_id)

    ordem = {g: i for i, g in enumerate(GRAVIDADES)}
    achados.sort(key=lambda a: (ordem.get(a["gravidade"], 9), a["modulo"]))

    return {
        "achados": achados,
        "resumo": {
            g: sum(1 for a in achados if a["gravidade"] == g) for g in GRAVIDADES
        },
        "total": len(achados),
    }


# ---------------------------------------------------------------------------
def _regras_contabilidade(
    db: Session, empresa_id: UUID, exercicio_id: UUID | None, ex: Exercicio | None
) -> list[dict]:
    out: list[dict] = []

    # Lançamentos desequilibrados. Não deviam existir — o motor recusa-os — mas
    # uma importação ou uma correcção directa na base podem tê-los introduzido.
    q = (
        select(
            Lancamento.id, Lancamento.numero_op, Lancamento.data,
            func.sum(LancamentoLinha.debito).label("d"),
            func.sum(LancamentoLinha.credito).label("c"),
        )
        .join(LancamentoLinha, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id)
        .group_by(Lancamento.id, Lancamento.numero_op, Lancamento.data)
        .having(func.sum(LancamentoLinha.debito) != func.sum(LancamentoLinha.credito))
    )
    if exercicio_id:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    desiquilibrados = [
        {"numero_op": r.numero_op, "data": str(r.data), "debito": r.d, "credito": r.c}
        for r in db.execute(q).all()
    ]
    if desiquilibrados:
        out.append(_achado(
            "erro", "contabilidade", "lancamento_desequilibrado",
            f"{len(desiquilibrados)} lançamento(s) desequilibrado(s)",
            "Débitos e créditos não coincidem. A contabilidade não fecha enquanto "
            "existirem — provavelmente vieram de uma importação.",
            desiquilibrados[:20], "Corrigir ou anular os lançamentos indicados.",
        ))

    # Conta integradora com movimentos: quebra a hierarquia e faz o balancete
    # contar os mesmos valores duas vezes.
    todas = db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all()
    com_mov = set(
        db.scalars(
            select(LancamentoLinha.conta_codigo)
            .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
            .where(Lancamento.empresa_id == empresa_id)
            .distinct()
        ).all()
    )
    integradoras = [
        {"codigo": c.codigo, "nome": c.nome}
        for c in todas
        if c.codigo in com_mov and not eh_movimento(c, todas)
    ]
    if integradoras:
        out.append(_achado(
            "erro", "contabilidade", "integradora_com_movimentos",
            f"{len(integradoras)} conta(s) integradora(s) com movimentos",
            "Uma conta que agrega subcontas não pode ter movimentos próprios: o "
            "balancete soma-os duas vezes.",
            integradoras[:20],
            "Criar uma subconta de movimento — os movimentos migram automaticamente.",
        ))

    # Balanço desequilibrado.
    bal = balanco(db, empresa_id=empresa_id, exercicio_id=exercicio_id)
    if not bal["equilibrado"]:
        dif = bal["total_activo"] - bal["total_cp_passivo"]
        out.append(_achado(
            "erro", "contabilidade", "balanco_desequilibrado",
            "O Balanço não equilibra",
            f"Activo {bal['total_activo']} contra Capital Próprio + Passivo "
            f"{bal['total_cp_passivo']}, diferença de {dif}.",
            [], "Verificar os lançamentos do período e o plano de contas.",
        ))

    # Diferidos pendentes: não entram em nenhum relatório enquanto lá estiverem.
    q_dif = select(func.count()).select_from(Lancamento).where(
        Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(True)
    )
    if exercicio_id:
        q_dif = q_dif.where(Lancamento.exercicio_id == exercicio_id)
    n_dif = int(db.scalar(q_dif) or 0)
    if n_dif:
        out.append(_achado(
            "aviso", "contabilidade", "lancamentos_diferidos",
            f"{n_dif} lançamento(s) por integrar",
            "Lançamentos diferidos não entram no balancete, no razão, nos "
            "extractos nem nos apuramentos.",
            [], "Integrar em Movimentos, ou eliminar se já não fizerem sentido.",
        ))

    # Custos e proveitos por apurar no fim do exercício.
    if ex is not None and not ex.apuramento and ex.fim and ex.fim <= Date.today():
        out.append(_achado(
            "aviso", "contabilidade", "apuramento_por_fazer",
            f"O exercício {ex.nome} terminou e não foi apurado",
            "As contas de custos e proveitos continuam abertas e o resultado "
            "líquido não foi transferido.",
            [], "Correr o Apuramento de Resultados.",
        ))

    # Custos e proveitos sem centro de custo — a analítica fica incompleta.
    q_sc = (
        select(func.count())
        .select_from(LancamentoLinha)
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(
            Lancamento.empresa_id == empresa_id,
            Lancamento.diferido.is_(False),
            LancamentoLinha.centro_codigo.is_(None),
            func.substr(LancamentoLinha.conta_codigo, 1, 1).in_(("6", "7")),
        )
    )
    if exercicio_id:
        q_sc = q_sc.where(Lancamento.exercicio_id == exercicio_id)
    n_sc = int(db.scalar(q_sc) or 0)
    if n_sc:
        out.append(_achado(
            "sugestao", "analitica", "sem_centro_custo",
            f"{n_sc} linha(s) de custo/proveito sem centro de custo",
            "Estes valores aparecem em «(Sem centro)» no mapa da analítica.",
            [], "Atribuir centro de custo nos Movimentos.",
        ))
    return out


def _regras_contas_correntes(
    db: Session, empresa_id: UUID, exercicio_id: UUID | None
) -> list[dict]:
    out: list[dict] = []

    # Cliente com saldo credor = recebeu-se mais do que se facturou. Costuma ser
    # um recibo lançado sem a factura, ou um adiantamento na conta errada.
    cc = contas_correntes(
        db, empresa_id=empresa_id, prefixo="31", natureza="D", exercicio_id=exercicio_id
    )
    credores = [
        {"conta": l["codigo"], "entidade": l["entidade"] or l["nome"], "saldo": l["saldo"]}
        for l in cc["linhas"] if l["saldo"] < Decimal("-0.005")
    ]
    if credores:
        out.append(_achado(
            "aviso", "contasCorrentes", "cliente_saldo_credor",
            f"{len(credores)} cliente(s) com saldo credor",
            "Foi recebido mais do que o facturado. Normalmente é um recibo sem "
            "a factura correspondente, ou um adiantamento mal classificado.",
            credores[:20], "Conferir os documentos do cliente no extracto.",
        ))

    cf = contas_correntes(
        db, empresa_id=empresa_id, prefixo="32", natureza="C", exercicio_id=exercicio_id
    )
    devedores = [
        {"conta": l["codigo"], "entidade": l["entidade"] or l["nome"], "saldo": l["saldo"]}
        for l in cf["linhas"] if l["saldo"] < Decimal("-0.005")
    ]
    if devedores:
        out.append(_achado(
            "aviso", "contasCorrentes", "fornecedor_saldo_devedor",
            f"{len(devedores)} fornecedor(es) com saldo devedor",
            "Foi pago mais do que o facturado pelo fornecedor.",
            devedores[:20], "Conferir pagamentos e facturas em falta.",
        ))
    return out


def _regras_iva(db: Session, empresa_id: UUID, exercicio_id: UUID | None) -> list[dict]:
    out: list[dict] = []
    por_apurar = []
    for mes in [f"{m:02d}" for m in range(1, 13)]:
        a = apuramento_iva(
            db, empresa_id=empresa_id, exercicio_id=exercicio_id, mes=mes
        )
        if a["resultado"] != 0:
            por_apurar.append(
                {"mes": mes, "liquidado": a["liquidado"],
                 "dedutivel": a["dedutivel"], "resultado": a["resultado"]}
            )
    if por_apurar:
        out.append(_achado(
            "aviso", "fiscalidade", "iva_por_apurar",
            f"{len(por_apurar)} período(s) com IVA por apurar",
            "Há IVA liquidado ou dedutível que ainda não foi transferido para "
            "IVA a pagar / a recuperar. A declaração periódica é mensal, até ao "
            "último dia útil do mês seguinte.",
            por_apurar, "Correr o Apuramento do IVA de cada período.",
        ))
    return out


def _regras_logistica(db: Session, empresa_id: UUID) -> list[dict]:
    out: list[dict] = []
    existencias = log_svc.existencias(db, empresa_id=empresa_id)

    negativos = [
        {"codigo": e["codigo"], "descricao": e["descricao"], "stock": e["stock"]}
        for e in existencias if e["stock"] < 0
    ]
    if negativos:
        out.append(_achado(
            "erro", "logistica", "stock_negativo",
            f"{len(negativos)} artigo(s) com stock negativo",
            "Saíram mais unidades do que entraram. O valor das existências no "
            "Balanço fica errado.",
            negativos[:20], "Registar as entradas em falta ou fazer inventariação.",
        ))

    rutura = [
        {"codigo": e["codigo"], "descricao": e["descricao"],
         "stock": e["stock"], "minimo": e["stock_min"]}
        for e in existencias if e["rutura"] and e["stock"] >= 0 and e["stock_min"] > 0
    ]
    if rutura:
        out.append(_achado(
            "aviso", "logistica", "stock_minimo",
            f"{len(rutura)} artigo(s) no ou abaixo do stock mínimo",
            "Risco de ruptura.", rutura[:20], "Repor as existências.",
        ))

    sem_custo = [
        {"codigo": e["codigo"], "descricao": e["descricao"], "stock": e["stock"]}
        for e in existencias if e["stock"] > 0 and e["custo_medio"] == 0
    ]
    if sem_custo:
        out.append(_achado(
            "aviso", "logistica", "custo_medio_zero",
            f"{len(sem_custo)} artigo(s) com stock e custo médio zero",
            "Entraram sem custo indicado. Estas existências valem zero no "
            "Balanço e o CMVMC das vendas sai a zero.",
            sem_custo[:20], "Corrigir o custo das entradas ou fazer acerto.",
        ))
    return out


def _regras_rh(db: Session, empresa_id: UUID, exercicio_id: UUID | None) -> list[dict]:
    out: list[dict] = []

    q_proc = select(ProcessamentoSalarial).where(
        ProcessamentoSalarial.empresa_id == empresa_id
    )
    q_pag = select(PagamentoSalarial.mes).where(PagamentoSalarial.empresa_id == empresa_id)
    if exercicio_id:
        q_proc = q_proc.where(ProcessamentoSalarial.exercicio_id == exercicio_id)
        q_pag = q_pag.where(PagamentoSalarial.exercicio_id == exercicio_id)
    pagos = set(db.scalars(q_pag).all())
    por_pagar = [
        {"mes": p.mes, "totais": p.totais}
        for p in db.scalars(q_proc).all() if p.mes not in pagos
    ]
    if por_pagar:
        out.append(_achado(
            "aviso", "rh", "salarios_por_pagar",
            f"{len(por_pagar)} mês(es) processado(s) mas não pago(s)",
            "A folha foi processada e os líquidos continuam por pagar — os "
            "colaboradores têm saldo credor na conta corrente.",
            por_pagar, "Registar o pagamento em RH → Pagamentos.",
        ))

    # Sem NIF ou nº de Segurança Social, o Mapa de Remunerações A2.1 não pode
    # ser entregue à AGT.
    incompletos = [
        {"numero": c.numero, "nome": c.nome,
         "falta": ", ".join(
             f for f, v in (("NIF", c.nif), ("nº Segurança Social", c.num_ss)) if not v
         )}
        for c in db.scalars(
            select(Colaborador).where(
                Colaborador.empresa_id == empresa_id, Colaborador.estado == "activo"
            )
        ).all()
        if not c.nif or not c.num_ss
    ]
    if incompletos:
        out.append(_achado(
            "aviso", "rh", "colaborador_sem_identificacao",
            f"{len(incompletos)} colaborador(es) activo(s) sem identificação completa",
            "O Mapa de Remunerações — Modelo IRT A2.1 exige NIF e número de "
            "Segurança Social de cada trabalhador.",
            incompletos[:20], "Completar a ficha em RH → Funcionários.",
        ))
    return out


def _regras_comercial(db: Session, empresa_id: UUID) -> list[dict]:
    out: list[dict] = []
    limite = Date.today() - timedelta(days=30)

    rascunhos = db.scalars(
        select(Venda).where(
            Venda.empresa_id == empresa_id,
            Venda.estado == "rascunho",
            Venda.data < limite,
        )
    ).all()
    if rascunhos:
        out.append(_achado(
            "aviso", "comercial", "vendas_rascunho_antigas",
            f"{len(rascunhos)} documento(s) de venda em rascunho há mais de 30 dias",
            "Documentos em rascunho não estão facturados nem contabilizados: o "
            "proveito não aparece na Demonstração de Resultados.",
            [{"data": str(v.data), "cliente": v.cliente_nome, "total": v.total}
             for v in rascunhos[:20]],
            "Emitir ou eliminar.",
        ))

    compras_rasc = db.scalars(
        select(Compra).where(
            Compra.empresa_id == empresa_id,
            Compra.estado == "rascunho",
            Compra.data < limite,
        )
    ).all()
    if compras_rasc:
        out.append(_achado(
            "aviso", "logistica", "compras_rascunho_antigas",
            f"{len(compras_rasc)} compra(s) em rascunho há mais de 30 dias",
            "A mercadoria não entrou em stock e a factura do fornecedor não "
            "está contabilizada.",
            [{"data": str(c.data), "fornecedor": c.fornecedor_nome, "total": c.total}
             for c in compras_rasc[:20]],
            "Emitir ou eliminar.",
        ))
    return out


def _regras_imobilizados(db: Session, empresa_id: UUID) -> list[dict]:
    out: list[dict] = []
    ativos = db.scalars(select(Ativo).where(Ativo.empresa_id == empresa_id)).all()

    sem_contas = [
        {"codigo": a.codigo, "designacao": a.designacao}
        for a in ativos
        if a.estado == "activo" and not (a.conta_custo_amort and a.conta_amort_acum)
    ]
    if sem_contas:
        out.append(_achado(
            "aviso", "imobilizados", "ativo_sem_contas",
            f"{len(sem_contas)} activo(s) sem contas de amortização",
            "Sem conta de custo e de amortizações acumuladas, o activo é "
            "processado mas NÃO gera lançamento — a amortização não chega à "
            "contabilidade.",
            sem_contas[:20], "Preencher as contas na ficha do activo.",
        ))

    esgotados = [
        {"codigo": a.codigo, "designacao": a.designacao,
         "valor": a.valor_aquisicao, "acumulada": a.amort_acumulada}
        for a in ativos
        if a.estado == "activo"
        and a.valor_aquisicao
        and (a.amort_acumulada or ZERO) >= a.valor_aquisicao
    ]
    if esgotados:
        out.append(_achado(
            "sugestao", "imobilizados", "ativo_totalmente_amortizado",
            f"{len(esgotados)} activo(s) totalmente amortizado(s) ainda activo(s)",
            "Já não geram amortização. Continuam no mapa a ocupar espaço.",
            esgotados[:20], "Abater os que já não estejam em uso.",
        ))

    sem_taxa = [
        {"codigo": a.codigo, "designacao": a.designacao}
        for a in ativos if a.estado == "activo" and not a.taxa
    ]
    if sem_taxa:
        out.append(_achado(
            "aviso", "imobilizados", "ativo_sem_taxa",
            f"{len(sem_taxa)} activo(s) sem taxa de amortização",
            "Com taxa a zero nunca amortizam.",
            sem_taxa[:20], "Definir a taxa anual na ficha.",
        ))
    return out
