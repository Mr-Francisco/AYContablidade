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
from src.db.models.tenancy import ConfigEmpresa, Exercicio
from src.services.notificacoes import notificar, resolver
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


def periodo_de(mes: str | None) -> str | None:
    """`AAAA-MM` (o que a API recebe) → período de dois dígitos (o que se grava).

    As tabelas de RH guardam o PERÍODO contabilístico, não o mês com o ano: o
    ano vem do exercício. Foi essa a decisão que tornou possível uma empresa
    ter um segundo ano — no Piloto o mês era único em toda a história e o ano
    seguinte deixava de poder ser processado.

    A API continua a falar `AAAA-MM` porque é uma chave que não se presta a
    enganos do lado de quem chama; a tradução faz-se aqui, à entrada, e não em
    cada sítio que grava.
    """
    if not mes:
        return mes
    texto = str(mes).strip()
    if len(texto) == 7 and texto[4] == "-":
        return texto[5:7]
    return texto.zfill(2)[:2]


def _mes_e_exercicio(
    db: Session, empresa_id: UUID, mes: str | None, exercicio_id: UUID | None
) -> tuple[str | None, UUID | None]:
    """Resolve o par (período, exercício) a partir do mês vindo da API.

    Se o ano indicado não for o do exercício resolvido, é erro e não conversão
    silenciosa: uma vez gravado, o período `08` do exercício errado é
    indistinguível do certo, e quem o gravou não teria como saber.
    """
    ex = exercicio_efetivo(db, empresa_id, exercicio_id)
    periodo = periodo_de(mes)

    if mes and len(str(mes).strip()) == 7 and ex is not None:
        ano = str(mes).strip()[:4]
        exercicio = db.scalar(
            select(Exercicio).where(
                Exercicio.id == ex, Exercicio.empresa_id == empresa_id
            )
        )
        if exercicio is not None and not (
            exercicio.inicio.year <= int(ano) <= exercicio.fim.year
        ):
            raise ErroContabilistico(
                f"O mês {mes} não pertence ao exercício {exercicio.nome} "
                f"({exercicio.inicio:%d-%m-%Y} a {exercicio.fim:%d-%m-%Y}). "
                "Escolhe o exercício certo antes de processar."
            )
    return periodo, ex


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
    mes, ex = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
    return db.scalar(
        select(AlteracaoMensal).where(
            AlteracaoMensal.empresa_id == empresa_id,
            AlteracaoMensal.colaborador_id == colaborador_id,
            AlteracaoMensal.exercicio_id == ex,
            AlteracaoMensal.mes == mes,
        )
    )



def guardar_alteracao(
    db: Session,
    *,
    empresa_id: UUID,
    colaborador_id: UUID,
    mes: str,
    faltas: Decimal,
    abonos: list[dict],
    descontos: list[dict],
    exercicio_id: UUID | None = None,
) -> AlteracaoMensal:
    """Grava as alterações de um colaborador num mês.

    Vive aqui e não no router porque o par (período, exercício) tem de ser o
    MESMO na escrita e na leitura. Escrito no router, o `mes` ia com o ano e o
    `exercicio_id` ficava nulo — o registo entrava na base e a leitura, que
    filtra pelo exercício, nunca mais lhe punha a vista em cima.
    """
    mes, exercicio_id = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
    a = db.scalar(
        select(AlteracaoMensal).where(
            AlteracaoMensal.empresa_id == empresa_id,
            AlteracaoMensal.colaborador_id == colaborador_id,
            AlteracaoMensal.exercicio_id == exercicio_id,
            AlteracaoMensal.mes == mes,
        )
    )
    if a is None:
        a = AlteracaoMensal(
            empresa_id=empresa_id,
            colaborador_id=colaborador_id,
            exercicio_id=exercicio_id,
            mes=mes,
        )
        db.add(a)

    a.faltas = faltas
    a.abonos = [
        {"desc": x.get("desc", ""), "valor": str(x.get("valor", 0))}
        for x in abonos
        if x.get("desc") or x.get("valor")
    ]
    a.descontos = [
        {"desc": x.get("desc", ""), "valor": str(x.get("valor", 0))}
        for x in descontos
        if x.get("desc") or x.get("valor")
    ]
    db.flush()
    return a


def listar_alteracoes(
    db: Session, *, empresa_id: UUID, mes: str, exercicio_id: UUID | None = None
) -> list[AlteracaoMensal]:
    mes, exercicio_id = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
    return list(
        db.scalars(
            select(AlteracaoMensal).where(
                AlteracaoMensal.empresa_id == empresa_id,
                AlteracaoMensal.exercicio_id == exercicio_id,
                AlteracaoMensal.mes == mes,
            )
        ).all()
    )


def linha_mapa_irt_para_gravar(
    db: Session,
    *,
    empresa_id: UUID,
    colaborador_id: UUID,
    mes: str,
    exercicio_id: UUID | None = None,
) -> MapaIrtLinha:
    """Devolve a linha do mapa a editar, criando-a se ainda não existir.

    Mesma razão de `guardar_alteracao`: escrita e leitura têm de concordar no
    par (período, exercício).
    """
    mes, exercicio_id = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
    linha = db.scalar(
        select(MapaIrtLinha).where(
            MapaIrtLinha.empresa_id == empresa_id,
            MapaIrtLinha.colaborador_id == colaborador_id,
            MapaIrtLinha.exercicio_id == exercicio_id,
            MapaIrtLinha.mes == mes,
        )
    )
    if linha is None:
        linha = MapaIrtLinha(
            empresa_id=empresa_id,
            colaborador_id=colaborador_id,
            exercicio_id=exercicio_id,
            mes=mes,
        )
        db.add(linha)
    return linha


def listar_honorarios(
    db: Session,
    *,
    empresa_id: UUID,
    mes: str | None = None,
    exercicio_id: UUID | None = None,
) -> list[Honorario]:
    q = select(Honorario).where(Honorario.empresa_id == empresa_id)
    if mes:
        periodo, ex = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
        q = q.where(Honorario.mes == periodo, Honorario.exercicio_id == ex)
    return list(db.scalars(q.order_by(Honorario.data.desc())).all())


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
    alt = (
        alteracao_de(db, empresa_id, colaborador.id, mes, exercicio_id)
        if mes
        else None
    )
    return recibo_com(
        colaborador,
        cfg=c2,
        faltas=d(alt.faltas) if alt else ZERO,
        abonos=(alt.abonos or []) if alt else [],
        descontos=(alt.descontos or []) if alt else [],
    )


def recibo_com(
    colaborador: Colaborador,
    *,
    cfg: dict,
    faltas: Decimal = ZERO,
    abonos: list[dict] | None = None,
    descontos: list[dict] | None = None,
) -> dict:
    """O recibo a partir de alterações que podem ainda não estar gravadas.

    Isolado do `recibo` para que a pré-visualização — «como fica o líquido se
    eu meter dois dias de falta?» — use exactamente a mesma fórmula do
    processamento. O Piloto tinha-a escrita duas vezes, uma no recibo e outra
    na janela das alterações; bastava mexer numa para o número que o
    utilizador via deixar de ser o que ia ser pago.
    """
    base0 = r2(d(colaborador.salario_base))
    subs_base = r2(d(colaborador.subsidios))

    desc_faltas = r2(base0 / 30 * faltas)
    abonos_extra = r2(sum((d(x.get("valor")) for x in (abonos or [])), ZERO))
    desc_extra = r2(sum((d(x.get("valor")) for x in (descontos or [])), ZERO))

    base = r2(base0 - desc_faltas)
    subs = r2(subs_base + abonos_extra)
    bruto = r2(base + subs)
    inss = r2(base * d(cfg["inss_trab"]) / 100)
    materia = r2(bruto - inss)
    irt = calc_irt(materia, cfg["irt"])
    liquido = r2(bruto - inss - irt - desc_extra)
    inss_empresa = r2(base * d(cfg["inss_empr"]) / 100)

    return {
        "colaborador_id": colaborador.id,
        # O número, como no Piloto: é por ele que o RH procura na folha
        # impressa, e dois colaboradores podem ter o mesmo nome.
        "numero": colaborador.numero,
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
    # Guardado antes de normalizar: o `mes` passa a ser o período de dois
    # dígitos, mas a descrição e a referência do lançamento têm de mostrar o
    # ano — `SAL-08` de 2026 e de 2027 seriam indistinguíveis no diário.
    rotulo = str(mes)
    mes, exercicio_id = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)

    # Reprocessar o mesmo mês lançava OUTRA vez o custo com pessoal: o registo
    # do processamento é actualizado no sítio, mas o lançamento anterior fica,
    # e passavam a existir dois. A folha ficava contada a dobrar na
    # contabilidade e o registo só apontava para o último — não havia como dar
    # por isso a olhar para o RH. Corrigir uma folha faz-se com um lançamento
    # de rectificação, não repetindo o processamento.
    if mes_processado(db, empresa_id, mes, exercicio_id):
        raise ErroContabilistico(
            f"A folha de {rotulo} já foi processada. Para a corrigir, lança a "
            "rectificação na contabilidade — reprocessar duplicaria o custo."
        )

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
            descricao=f"Processamento salarial — {rotulo}",
            documento_ref=f"SAL-{rotulo}",
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

    # Notificação 5. Processado e por lançar quer dizer que o custo com
    # pessoal do mês não está nas contas. O registo fica com `lancado` a
    # falso e mais nada acontece — é preciso alguém saber.
    chave = f"salarios-por-lancar:{exercicio_id}:{mes}"
    if lancado:
        resolver(db, empresa_id=empresa_id, chave=chave)
    else:
        notificar(
            db, empresa_id=empresa_id, capacidade="contab.lancar",
            origem="rh", chave=chave,
            titulo=f"Salários de {rotulo} processados e por lançar",
            texto=(
                "O processamento está fechado mas não foi lançado. O custo "
                "com pessoal do mês não está na contabilidade."
            ),
            ligacao="/rh/processamento",
            alvo_tipo="processamento_salarial", alvo_id=reg.id,
        )

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
    mes, ex = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
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
    mes, ex = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
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
    rotulo = str(mes)
    mes, exercicio_id = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
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
            mes=mes, descricao=f"Pagamento de salários — {rotulo}",
            documento_ref=f"PAG-{rotulo}", origem="rh", exercicio_id=exercicio_id,
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
    mes, exercicio_id = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
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
        exercicio_id=exercicio_id,
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
    mes, exercicio_id = _mes_e_exercicio(db, empresa_id, mes, exercicio_id)
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
