"""Recursos Humanos: processamento salarial, pagamentos e honorários.

Transposto de `Piloto/assets/js/rh.js`. Cálculo de INSS e IRT de Angola.
"""

from datetime import date as Date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.rh import (
    IRT_VERSAO,
    SUBS_NAO_SUJEITOS,
    SUBS_SUJEITOS,
    cfg_rh_default,
    d,
)
from src.db.models.rh import (
    AlteracaoMensal,
    Colaborador,
    Honorario,
    Independente,
    MapaIrtLinha,
    PagamentoSalarial,
    ProcessamentoSalarial,
)
from src.db.models.tenancy import ConfigEmpresa
from src.services.contabilidade import (
    ErroContabilistico,
    conta_corrente,
    exercicio_efetivo,
    postar,
)

ZERO = Decimal("0")
CENT = Decimal("0.01")


def r2(v: Decimal) -> Decimal:
    """Arredonda a 2 casas com meio-para-cima, como o `round2()` do Piloto."""
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
def cfg_rh(db: Session, empresa_id: UUID) -> dict:
    """Configuração de RH da empresa, com migração da tabela do IRT.

    Se a tabela gravada for de uma versão anterior, é substituída pela oficial
    em vigor — o mesmo comportamento do Piloto. Sem isto, uma empresa criada
    antes de uma alteração da lei continuaria a reter pela tabela antiga.
    """
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa_id))
    base = cfg_rh_default()
    if cfg is None:
        return base

    guardada = (cfg.parametrizacoes or {}).get("rh") or {}
    merged = {**base, **guardada}
    if guardada.get("irt_versao") != IRT_VERSAO:
        merged["irt"] = base["irt"]
        merged["irt_versao"] = IRT_VERSAO
        params = dict(cfg.parametrizacoes or {})
        params["rh"] = merged
        cfg.parametrizacoes = params
        db.flush()
    return merged


def guardar_cfg_rh(db: Session, empresa_id: UUID, novo: dict) -> dict:
    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa_id))
    if cfg is None:
        cfg = ConfigEmpresa(
            empresa_id=empresa_id, modulos={}, parametrizacoes={}, agt={}
        )
        db.add(cfg)
        db.flush()
    params = dict(cfg.parametrizacoes or {})
    params["rh"] = {**cfg_rh_default(), **(params.get("rh") or {}), **novo}
    cfg.parametrizacoes = params
    db.flush()
    return params["rh"]


# ---------------------------------------------------------------------------
# IRT
# ---------------------------------------------------------------------------
def calc_irt(materia: Decimal, tabela: list[dict]) -> Decimal:
    """IRT = Parcela Fixa + Taxa × (matéria colectável − Excesso de).

    Percorre os escalões por ordem e usa o primeiro cujo tecto cubra a matéria.
    Um escalão com `ate` a None é o último e apanha tudo o que sobra.
    """
    for b in tabela:
        tecto = b.get("ate")
        if tecto is None or materia <= d(tecto):
            return r2(d(b.get("fixa")) + (materia - d(b.get("de"))) * d(b.get("taxa")) / 100)
    ultimo = tabela[-1] if tabela else {"fixa": 0, "taxa": 0, "de": 0}
    return r2(
        d(ultimo.get("fixa")) + (materia - d(ultimo.get("de"))) * d(ultimo.get("taxa")) / 100
    )


# ---------------------------------------------------------------------------
# Recibo e folha
# ---------------------------------------------------------------------------
def alteracao_de(
    db: Session,
    empresa_id: UUID,
    colaborador_id: UUID,
    mes: str,
    exercicio_id: UUID | None = None,
) -> AlteracaoMensal | None:
    ex = exercicio_efetivo(db, empresa_id, exercicio_id)
    return db.scalar(
        select(AlteracaoMensal).where(
            AlteracaoMensal.empresa_id == empresa_id,
            AlteracaoMensal.colaborador_id == colaborador_id,
            AlteracaoMensal.exercicio_id == ex,
            AlteracaoMensal.mes == mes,
        )
    )


def recibo(
    db: Session,
    *,
    empresa_id: UUID,
    colaborador: Colaborador,
    mes: str | None = None,
    cfg: dict | None = None,
    exercicio_id: UUID | None = None,
) -> dict:
    """Recibo de vencimento de um colaborador.

    Duas subtilezas do Piloto que mudam o valor a pagar e são fáceis de perder:

    - O INSS incide só sobre o SALÁRIO BASE (já descontadas as faltas), não
      sobre o bruto. Subsídios e abonos não entram na base contributiva.
    - A matéria colectável do IRT é o bruto MENOS o INSS do trabalhador — a
      contribuição é dedutível.

    O desconto por faltas usa base 30 dias, independentemente do mês.
    """
    c2 = cfg or cfg_rh(db, empresa_id)
    base0 = r2(d(colaborador.salario_base))
    subs_base = r2(d(colaborador.subsidios))

    alt = (
        alteracao_de(db, empresa_id, colaborador.id, mes, exercicio_id)
        if mes
        else None
    )
    faltas = d(alt.faltas) if alt else ZERO
    desc_faltas = r2(base0 / 30 * faltas)
    abonos_extra = (
        r2(sum((d(x.get("valor")) for x in (alt.abonos or [])), ZERO)) if alt else ZERO
    )
    desc_extra = (
        r2(sum((d(x.get("valor")) for x in (alt.descontos or [])), ZERO)) if alt else ZERO
    )

    base = r2(base0 - desc_faltas)
    subs = r2(subs_base + abonos_extra)
    bruto = r2(base + subs)
    inss = r2(base * d(c2["inss_trab"]) / 100)
    materia = r2(bruto - inss)
    irt = calc_irt(materia, c2["irt"])
    liquido = r2(bruto - inss - irt - desc_extra)
    inss_empresa = r2(base * d(c2["inss_empr"]) / 100)

    return {
        "colaborador_id": colaborador.id,
        "colaborador": colaborador.nome,
        "base": base,
        "subs": subs,
        "bruto": bruto,
        "inss": inss,
        "materia": materia,
        "irt": irt,
        "desc_extra": desc_extra,
        "desc_faltas": desc_faltas,
        "faltas": faltas,
        "abonos_extra": abonos_extra,
        "liquido": liquido,
        "inss_empresa": inss_empresa,
    }


def folha(
    db: Session,
    *,
    empresa_id: UUID,
    mes: str | None = None,
    so_ativos: bool = True,
    exercicio_id: UUID | None = None,
) -> dict:
    """Folha de salários do mês."""
    c2 = cfg_rh(db, empresa_id)
    q = select(Colaborador).where(Colaborador.empresa_id == empresa_id)
    if so_ativos:
        q = q.where(Colaborador.estado == "activo")
    q = q.order_by(Colaborador.numero)

    linhas = [
        recibo(
            db, empresa_id=empresa_id, colaborador=c, mes=mes, cfg=c2,
            exercicio_id=exercicio_id,
        )
        for c in db.scalars(q).all()
    ]
    totais = {
        k: r2(sum((l[k] for l in linhas), ZERO))
        for k in ("bruto", "inss", "irt", "liquido", "inss_empresa")
    }
    return {"linhas": linhas, "totais": totais}


# ---------------------------------------------------------------------------
# Processamento
# ---------------------------------------------------------------------------
def processar_mes(
    db: Session,
    *,
    empresa_id: UUID,
    mes: str,
    data: Date | None = None,
    exercicio_id: UUID | None = None,
    sem_lancamento: bool = False,
) -> dict:
    """Processa a folha do mês e lança na contabilidade.

    Um lançamento agregado: débito das remunerações pelo bruto total, crédito
    do valor a pagar na subconta PRÓPRIA de cada colaborador (criada
    automaticamente sob 36121), mais o IRT e o INSS retidos.

    Nota de fidelidade: o valor creditado a cada colaborador é
    `bruto − IRT − INSS`, sem descontar os `desc_extra`, mas o pagamento
    (`pagar_mes`) debita o líquido, que já os desconta. A diferença fica como
    saldo credor na conta do colaborador. É exactamente o que o Piloto faz e
    está preservado — ver a nota no relatório de migração.
    """
    c2 = cfg_rh(db, empresa_id)
    exercicio_id = exercicio_efetivo(db, empresa_id, exercicio_id)
    f = folha(
        db, empresa_id=empresa_id, mes=mes, so_ativos=True, exercicio_id=exercicio_id
    )
    if f["totais"]["bruto"] <= 0:
        raise ErroContabilistico("Sem valores a processar.")

    lancado = False
    lancamento_id = None
    if not sem_lancamento:
        linhas = [
            {
                "conta_codigo": c2["conta_custo"],
                "debito": f["totais"]["bruto"],
                "descricao": "Remunerações do pessoal",
            }
        ]
        for r in f["linhas"]:
            a_pagar = r2(r["bruto"] - r["irt"] - r["inss"])
            if a_pagar <= 0:
                continue
            conta = conta_corrente(db, empresa_id, c2["conta_pagar"], r["colaborador"])
            linhas.append(
                {
                    "conta_codigo": conta,
                    "credito": a_pagar,
                    "entidade": r["colaborador"],
                    "descricao": f"Líquido {r['colaborador']}",
                }
            )
        linhas.append(
            {"conta_codigo": c2["conta_irt"], "credito": f["totais"]["irt"],
             "descricao": "IRT retido"}
        )
        linhas.append(
            {"conta_codigo": c2["conta_inss"], "credito": f["totais"]["inss"],
             "descricao": f"INSS ({c2['inss_trab']}%)"}
        )
        lanc = postar(
            db, empresa_id=empresa_id, data=data or Date.today(),
            diario_codigo=c2["diario"], documento_codigo=c2["documento"], mes=mes,
            descricao=f"Processamento salarial — {mes}", documento_ref=f"SAL-{mes}",
            origem="rh", exercicio_id=exercicio_id, linhas=linhas,
        )
        lancado = True
        lancamento_id = lanc.id

    reg = db.scalar(
        select(ProcessamentoSalarial).where(
            ProcessamentoSalarial.empresa_id == empresa_id,
            ProcessamentoSalarial.exercicio_id == exercicio_id,
            ProcessamentoSalarial.mes == mes,
        )
    )
    totais_str = {k: str(v) for k, v in f["totais"].items()}
    if reg is None:
        reg = ProcessamentoSalarial(
            empresa_id=empresa_id, exercicio_id=exercicio_id, mes=mes,
            totais=totais_str, lancado=lancado, lancamento_id=lancamento_id,
        )
        db.add(reg)
    else:
        reg.totais = totais_str
        reg.lancado = lancado
        reg.lancamento_id = lancamento_id
    db.flush()

    return {
        "mes": mes,
        "totais": f["totais"],
        "colaboradores": len(f["linhas"]),
        "lancado": lancado,
        "lancamento_id": lancamento_id,
    }


def mes_processado(
    db: Session, empresa_id: UUID, mes: str, exercicio_id: UUID | None = None
) -> bool:
    ex = exercicio_efetivo(db, empresa_id, exercicio_id)
    return (
        db.scalar(
            select(ProcessamentoSalarial.id).where(
                ProcessamentoSalarial.empresa_id == empresa_id,
                ProcessamentoSalarial.exercicio_id == ex,
                ProcessamentoSalarial.mes == mes,
            )
        )
        is not None
    )


def mes_pago(
    db: Session, empresa_id: UUID, mes: str, exercicio_id: UUID | None = None
) -> bool:
    ex = exercicio_efetivo(db, empresa_id, exercicio_id)
    return (
        db.scalar(
            select(PagamentoSalarial.id).where(
                PagamentoSalarial.empresa_id == empresa_id,
                PagamentoSalarial.exercicio_id == ex,
                PagamentoSalarial.mes == mes,
            )
        )
        is not None
    )


def estado_mes(
    db: Session, empresa_id: UUID, mes: str, exercicio_id: UUID | None = None
) -> str:
    if mes_pago(db, empresa_id, mes, exercicio_id):
        return "pago"
    if mes_processado(db, empresa_id, mes, exercicio_id):
        return "processado"
    return "por_processar"


def pagar_mes(
    db: Session,
    *,
    empresa_id: UUID,
    mes: str,
    conta: str | None = None,
    data: Date | None = None,
    exercicio_id: UUID | None = None,
    sem_lancamento: bool = False,
) -> dict:
    """Paga os líquidos do mês a partir do banco.

    A ordem é obrigatória: processar antes de pagar, e uma vez por mês. Pagar
    sem processar deixaria a conta do colaborador a descoberto, porque nunca
    teria sido creditada.
    """
    exercicio_id = exercicio_efetivo(db, empresa_id, exercicio_id)
    if mes_pago(db, empresa_id, mes, exercicio_id):
        raise ErroContabilistico("Este mês já foi pago.")
    if not mes_processado(db, empresa_id, mes, exercicio_id):
        raise ErroContabilistico("Processa a folha deste mês antes de pagar.")

    c2 = cfg_rh(db, empresa_id)
    f = folha(
        db, empresa_id=empresa_id, mes=mes, so_ativos=True, exercicio_id=exercicio_id
    )
    liquido = f["totais"]["liquido"]
    if liquido <= 0:
        raise ErroContabilistico("Sem líquido a pagar.")

    conta_pag = conta or c2["conta_banco"]
    lancado = False
    lancamento_id = None
    numero_op = None

    if not sem_lancamento:
        linhas = []
        for r in f["linhas"]:
            if r["liquido"] <= 0:
                continue
            cc = conta_corrente(db, empresa_id, c2["conta_pagar"], r["colaborador"])
            linhas.append(
                {"conta_codigo": cc, "debito": r["liquido"], "entidade": r["colaborador"],
                 "descricao": f"Pagamento {r['colaborador']}"}
            )
        linhas.append(
            {"conta_codigo": conta_pag, "credito": liquido,
             "descricao": "Pagamento a partir de banco/caixa"}
        )
        lanc = postar(
            db, empresa_id=empresa_id, data=data or Date.today(),
            diario_codigo=c2["diario_pag"], documento_codigo=c2["documento_pag"],
            mes=mes, descricao=f"Pagamento de salários — {mes}",
            documento_ref=f"PAG-{mes}", origem="rh", exercicio_id=exercicio_id,
            linhas=linhas,
        )
        lancado = True
        lancamento_id = lanc.id
        numero_op = lanc.numero_op

    db.add(
        PagamentoSalarial(
            empresa_id=empresa_id, exercicio_id=exercicio_id, mes=mes,
            valor=liquido, conta=conta_pag,
            lancado=lancado, lancamento_id=lancamento_id, numero_op=numero_op,
        )
    )
    db.flush()
    return {"mes": mes, "valor": liquido, "lancado": lancado,
            "lancamento_id": lancamento_id, "numero_op": numero_op}


# ---------------------------------------------------------------------------
# Honorários a independentes
# ---------------------------------------------------------------------------
def recibo_independente(ind: Independente, valor: Decimal, cfg: dict) -> dict:
    bruto = r2(d(valor))
    taxa = d(ind.taxa_ret) if ind is not None and ind.taxa_ret is not None else d(cfg["taxa_ret_hon"])
    retencao = r2(bruto * taxa / 100)
    return {"bruto": bruto, "taxa": taxa, "retencao": retencao,
            "liquido": r2(bruto - retencao)}


def processar_honorario(
    db: Session,
    *,
    empresa_id: UUID,
    independente_id: UUID,
    valor: Decimal,
    data: Date | None = None,
    mes: str | None = None,
    descricao: str | None = None,
    ref: str | None = None,
    exercicio_id: UUID | None = None,
    sem_lancamento: bool = False,
) -> dict:
    """Paga honorários a um independente, com retenção na fonte."""
    c2 = cfg_rh(db, empresa_id)
    ind = db.scalar(
        select(Independente).where(
            Independente.id == independente_id, Independente.empresa_id == empresa_id
        )
    )
    if ind is None:
        raise ErroContabilistico("Trabalhador independente não encontrado.")

    r = recibo_independente(ind, valor, c2)
    if r["bruto"] <= 0:
        raise ErroContabilistico("Indica um valor válido.")

    data = data or Date.today()
    mes = mes or f"{data.month:02d}"
    lancado = False
    lancamento_id = None
    numero_op = None

    if not sem_lancamento:
        conta_pag = conta_corrente(db, empresa_id, c2["conta_pagar_hon"], ind.nome)
        linhas = [
            {"conta_codigo": c2["conta_custo_hon"], "debito": r["bruto"],
             "entidade": ind.nome, "descricao": descricao or "Honorários"},
            {"conta_codigo": conta_pag, "credito": r["liquido"],
             "entidade": ind.nome, "descricao": "Líquido a pagar"},
        ]
        if r["retencao"] > 0:
            linhas.append(
                {"conta_codigo": c2["conta_irt_hon"], "credito": r["retencao"],
                 "descricao": "IRT retido (independentes)"}
            )
        lanc = postar(
            db, empresa_id=empresa_id, data=data, diario_codigo=c2["diario_hon"],
            documento_codigo=c2["documento_hon"], mes=mes,
            descricao=f"Honorários — {ind.nome}", documento_ref=ref or "HON",
            origem="rh", exercicio_id=exercicio_id, linhas=linhas,
        )
        lancado = True
        lancamento_id = lanc.id
        numero_op = lanc.numero_op

    h = Honorario(
        empresa_id=empresa_id, independente_id=ind.id, nome=ind.nome, data=data,
        mes=mes, descricao=descricao, bruto=r["bruto"], taxa=r["taxa"],
        retencao=r["retencao"], liquido=r["liquido"], lancado=lancado,
        lancamento_id=lancamento_id, numero_op=numero_op,
    )
    db.add(h)
    db.flush()
    return {**r, "id": h.id, "lancado": lancado, "numero_op": numero_op}


# ---------------------------------------------------------------------------
# Mapa de Remunerações — Modelo IRT A2.1 (AGT)
# ---------------------------------------------------------------------------
def mapa_irt_linha(
    db: Session,
    *,
    empresa_id: UUID,
    colaborador: Colaborador,
    mes: str,
    exercicio_id: UUID | None = None,
) -> dict:
    """Linha itemizada do mapa, com arranque a partir da ficha do colaborador.

    Se ainda não houver itemização gravada, distribui o que a ficha já tem:
    subsídio de férias e de Natal nas rubricas próprias, e o resto dos
    subsídios em "outros sujeitos". O utilizador reclassifica depois.
    """
    exercicio_id = exercicio_efetivo(db, empresa_id, exercicio_id)
    gravada = db.scalar(
        select(MapaIrtLinha).where(
            MapaIrtLinha.empresa_id == empresa_id,
            MapaIrtLinha.colaborador_id == colaborador.id,
            MapaIrtLinha.exercicio_id == exercicio_id,
            MapaIrtLinha.mes == mes,
        )
    )
    if gravada is not None:
        return {
            **{k: d(getattr(gravada, k)) for k in SUBS_NAO_SUJEITOS + SUBS_SUJEITOS},
            "calc_manual_excesso": gravada.calc_manual_excesso,
            "excesso_subsidios_nao_sujeitos": d(gravada.excesso_subsidios_nao_sujeitos),
            "registo_manual_ss": gravada.registo_manual_ss,
            "base_tributavel_ss_manual": d(gravada.base_tributavel_ss_manual),
            "nao_sujeito_ss": gravada.nao_sujeito_ss,
            "isento_irt": gravada.isento_irt,
        }

    r = recibo(
        db, empresa_id=empresa_id, colaborador=colaborador, mes=mes,
        exercicio_id=exercicio_id,
    )
    base = {k: ZERO for k in SUBS_NAO_SUJEITOS + SUBS_SUJEITOS}
    base["outros_nao_sujeitos"] = r2(d(colaborador.subs_nao_sujeitos))
    base["sub_ferias"] = r2(d(colaborador.subsidio_ferias))
    base["sub_natal"] = r2(d(colaborador.subsidio_natal))
    base["outros_sujeitos"] = r2(
        max(
            ZERO,
            d(colaborador.subsidios) - base["sub_ferias"] - base["sub_natal"],
        )
        + r["abonos_extra"]
    )
    return {
        **base,
        "calc_manual_excesso": False,
        "excesso_subsidios_nao_sujeitos": ZERO,
        "registo_manual_ss": False,
        "base_tributavel_ss_manual": ZERO,
        "nao_sujeito_ss": False,
        "isento_irt": False,
    }


def mapa_irt_calcular(
    db: Session,
    *,
    empresa_id: UUID,
    colaborador: Colaborador,
    mes: str,
    exercicio_id: UUID | None = None,
) -> dict:
    """Linha completa do mapa: identificação, itemizado e apuramentos.

    A base de Segurança Social é o salário base menos faltas (NÃO inclui
    subsídios), e a base de IRT é salário base − faltas + subsídios sujeitos
    + excesso − contribuição para a SS.
    """
    c2 = cfg_rh(db, empresa_id)
    it = mapa_irt_linha(
        db, empresa_id=empresa_id, colaborador=colaborador, mes=mes,
        exercicio_id=exercicio_id,
    )
    r = recibo(
        db, empresa_id=empresa_id, colaborador=colaborador, mes=mes, cfg=c2,
        exercicio_id=exercicio_id,
    )

    sub_nao_suj = r2(sum((it[k] for k in SUBS_NAO_SUJEITOS), ZERO))
    sub_suj = r2(sum((it[k] for k in SUBS_SUJEITOS), ZERO))
    salario_base = r2(d(colaborador.salario_base))
    descontos_falta = r["desc_faltas"]

    excesso = it["excesso_subsidios_nao_sujeitos"] if it["calc_manual_excesso"] else ZERO
    salario_iliquido = r2(salario_base - descontos_falta + sub_suj + sub_nao_suj)
    base_ss = (
        it["base_tributavel_ss_manual"]
        if it["registo_manual_ss"]
        else r2(salario_base - descontos_falta)
    )
    contrib_ss = ZERO if it["nao_sujeito_ss"] else r2(base_ss * d(c2["inss_trab"]) / 100)
    base_irt = (
        ZERO
        if it["isento_irt"]
        else r2(max(ZERO, salario_base - descontos_falta + sub_suj + excesso - contrib_ss))
    )
    irt = ZERO if it["isento_irt"] else calc_irt(base_irt, c2["irt"])

    return {
        **it,
        "colaborador_id": colaborador.id,
        "nif": colaborador.nif or "",
        "nome": colaborador.nome,
        "num_ss": colaborador.num_ss or "",
        "provincia": colaborador.provincia or "",
        "municipio": colaborador.municipio or "",
        "salario_base": salario_base,
        "descontos_falta": descontos_falta,
        "sub_nao_suj": sub_nao_suj,
        "sub_suj": sub_suj,
        "salario_iliquido": salario_iliquido,
        "base_ss": base_ss,
        "contrib_ss": contrib_ss,
        "base_irt": base_irt,
        "irt": irt,
    }


def mapa_irt(
    db: Session,
    *,
    empresa_id: UUID,
    mes: str,
    so_ativos: bool = True,
    exercicio_id: UUID | None = None,
) -> list[dict]:
    q = select(Colaborador).where(Colaborador.empresa_id == empresa_id)
    if so_ativos:
        q = q.where(Colaborador.estado == "activo")
    return [
        mapa_irt_calcular(
            db, empresa_id=empresa_id, colaborador=c, mes=mes,
            exercicio_id=exercicio_id,
        )
        for c in db.scalars(q.order_by(Colaborador.numero)).all()
    ]
