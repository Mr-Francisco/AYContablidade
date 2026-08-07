"""Motor de lançamentos contabilísticos.

Transposto de `saveLancamento()` / `postar()` de `Piloto/assets/js/contabilidade.js`.
As sete validações do Piloto são preservadas integralmente — são elas que
garantem que a contabilidade fecha.
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.core.pgc import natureza_conta, periodo_label
from src.db.models.contabilidade import (
    CentroCusto,
    Conta,
    DiarioFecho,
    Lancamento,
    LancamentoLinha,
    SequenciaDocumento,
)
from src.db.models.tenancy import Exercicio


class ErroContabilistico(Exception):
    """Violação de uma regra contabilística. Mapeia para HTTP 422 na API."""


# ---------------------------------------------------------------------------
# Contas
# ---------------------------------------------------------------------------
def eh_movimento(conta: Conta, todas: list[Conta] | None = None) -> bool:
    """Uma conta é de movimento (folha) se o plano o disser explicitamente
    (`tipo == "M"`, como no Primavera) ou, na falta de tipo, se nenhuma outra
    conta estender o seu código.
    """
    if conta.tipo:
        return conta.tipo == "M"
    if todas is None:
        raise ValueError("Sem tipo definido, é preciso a lista de contas para inferir.")
    return not any(
        o.id != conta.id
        and len(o.codigo) > len(conta.codigo)
        and o.codigo.startswith(conta.codigo)
        for o in todas
    )


def proxima_subconta(db: Session, empresa_id: UUID, codigo_mae: str) -> str:
    """Próximo código sequencial de subconta (…001, …002)."""
    n = len(codigo_mae)
    directos = db.scalars(
        select(Conta.codigo).where(
            Conta.empresa_id == empresa_id,
            Conta.codigo.like(f"{codigo_mae}%"),
            func.length(Conta.codigo) == n + 3,
        )
    ).all()
    maximo = 0
    for cod in directos:
        sufixo = cod[n:]
        if sufixo.isdigit():
            maximo = max(maximo, int(sufixo))
    return f"{codigo_mae}{maximo + 1:03d}"


def mover_movimentos(db: Session, empresa_id: UUID, de: str, para: str) -> int:
    """Move todas as linhas de lançamento de uma conta para outra."""
    nome_para = db.scalar(
        select(Conta.nome).where(Conta.empresa_id == empresa_id, Conta.codigo == para)
    )
    conta_para = db.scalar(
        select(Conta).where(Conta.empresa_id == empresa_id, Conta.codigo == para)
    )
    linhas = db.scalars(
        select(LancamentoLinha)
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, LancamentoLinha.conta_codigo == de)
    ).all()
    for linha in linhas:
        linha.conta_codigo = para
        if conta_para is not None:
            linha.conta_id = conta_para.id
        if nome_para:
            linha.conta_nome = nome_para
    if linhas:
        db.flush()
    return len(linhas)


def criar_subconta(
    db: Session, empresa_id: UUID, parent_codigo: str, codigo: str, nome: str
) -> dict:
    """Cria uma subconta ao estilo Primavera.

    A PRIMEIRA subconta transforma a mãe em integradora e herda todos os
    movimentos dela. As seguintes são apenas contas de movimento novas.

    Sem esta transferência, a mãe ficaria integradora com movimentos — o estado
    exacto que a validação do lançamento proíbe, e o balancete passaria a contar
    esses valores duas vezes (na mãe e na agregação dos filhos).
    """
    parent = db.scalar(
        select(Conta).where(Conta.empresa_id == empresa_id, Conta.codigo == parent_codigo)
    )
    if parent is None:
        raise ErroContabilistico(f"Conta-mãe {parent_codigo} não existe.")
    if not codigo.startswith(parent_codigo) or len(codigo) <= len(parent_codigo):
        sugestao = proxima_subconta(db, empresa_id, parent_codigo)
        raise ErroContabilistico(
            f"A subconta tem de estender o código {parent_codigo} (ex.: {sugestao})."
        )
    if db.scalar(
        select(Conta.id).where(Conta.empresa_id == empresa_id, Conta.codigo == codigo)
    ):
        raise ErroContabilistico(f"Já existe a conta {codigo}.")

    sem_filhos = (
        db.scalar(
            select(Conta.id).where(
                Conta.empresa_id == empresa_id,
                Conta.codigo != parent_codigo,
                Conta.codigo.startswith(parent_codigo),
            ).limit(1)
        )
        is None
    )

    nova = Conta(
        empresa_id=empresa_id, codigo=codigo,
        nome=nome or (parent.nome if sem_filhos else f"{parent.nome} {codigo[len(parent_codigo):]}"),
        tipo="M", natureza=parent.natureza, ativa=True,
    )
    db.add(nova)
    db.flush()

    if sem_filhos:
        movidos = mover_movimentos(db, empresa_id, parent_codigo, codigo)
        parent.tipo = "I"
        db.flush()
        return {"criada": codigo, "tornou_integradora": True, "movidos": movidos}
    return {"criada": codigo, "tornou_integradora": False, "movidos": 0}


def criar_conta(
    db: Session, empresa_id: UUID, codigo: str, nome: str, natureza: str | None = None
) -> dict:
    """Regra geral de criação de conta.

    Se o código estende uma conta de MOVIMENTO existente, essa mãe passa a
    integradora e os movimentos dela migram para a nova — assim uma integradora
    nunca fica com movimentos. Caso contrário cria uma conta de movimento normal.
    """
    codigo = (codigo or "").strip()
    if not codigo:
        raise ErroContabilistico("Código obrigatório.")
    if db.scalar(
        select(Conta.id).where(Conta.empresa_id == empresa_id, Conta.codigo == codigo)
    ):
        raise ErroContabilistico(f"Já existe a conta {codigo}.")

    todas = db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all()
    candidatos = [
        c for c in todas
        if codigo.startswith(c.codigo)
        and len(c.codigo) < len(codigo)
        and eh_movimento(c, todas)
    ]
    if candidatos:
        mae = max(candidatos, key=lambda c: len(c.codigo))
        return criar_subconta(db, empresa_id, mae.codigo, codigo, nome)

    db.add(
        Conta(
            empresa_id=empresa_id, codigo=codigo, nome=nome,
            natureza=natureza or natureza_conta(codigo), tipo="M", ativa=True,
        )
    )
    db.flush()
    return {"criada": codigo, "tornou_integradora": False, "movidos": 0}


def conta_corrente(db: Session, empresa_id: UUID, base: str, nome: str) -> str:
    """Devolve (criando se preciso) a subconta de movimento de uma entidade.

    Reutiliza a que já existir com o mesmo nome — é o que faz com que processar
    salários duas vezes não crie duas contas para o mesmo colaborador.
    """
    base_conta = db.scalar(
        select(Conta).where(Conta.empresa_id == empresa_id, Conta.codigo == base)
    )
    if base_conta is None:
        return base

    alvo = (nome or "").strip().lower()
    todas = db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all()
    for c in todas:
        if (
            c.codigo != base
            and c.codigo.startswith(base)
            and (c.nome or "").strip().lower() == alvo
            and eh_movimento(c, todas)
        ):
            return c.codigo

    codigo = proxima_subconta(db, empresa_id, base)
    try:
        criar_subconta(db, empresa_id, base, codigo, nome or f"Conta {codigo}")
    except ErroContabilistico:
        try:
            criar_conta(db, empresa_id, codigo, nome, natureza_conta(base))
        except ErroContabilistico:
            return base
    return codigo


# ---------------------------------------------------------------------------
# Equilíbrio
# ---------------------------------------------------------------------------
def soma_linhas(linhas: list[LancamentoLinha]) -> tuple[Decimal, Decimal]:
    debito = sum((l.debito or Decimal("0")) for l in linhas) or Decimal("0")
    credito = sum((l.credito or Decimal("0")) for l in linhas) or Decimal("0")
    return Decimal(debito), Decimal(credito)


def esta_equilibrado(linhas: list[LancamentoLinha]) -> bool:
    d, c = soma_linhas(linhas)
    return d == c and d > 0


# ---------------------------------------------------------------------------
# Numeração
# ---------------------------------------------------------------------------
def proximo_numero_doc(
    db: Session, empresa_id: UUID, documento_codigo: str, exercicio_id: UUID | None
) -> int:
    """Incrementa e devolve a sequência do documento no exercício.

    Feito com INSERT ... ON CONFLICT DO UPDATE numa só instrução: é atómico ao
    nível da base de dados. O contador em memória do Piloto daria o mesmo número
    a dois lançamentos simultâneos.
    """
    stmt = (
        pg_insert(SequenciaDocumento)
        .values(
            empresa_id=empresa_id,
            documento_codigo=documento_codigo,
            exercicio_id=exercicio_id,
            valor=1,
        )
        .on_conflict_do_update(
            constraint="sequencia_documento",
            set_={"valor": SequenciaDocumento.__table__.c.valor + 1},
        )
        .returning(SequenciaDocumento.__table__.c.valor)
    )
    return int(db.execute(stmt).scalar_one())


def proximo_numero_lancamento(db: Session, empresa_id: UUID) -> int:
    """Sequência global do lançamento dentro da empresa (nextNum no Piloto)."""
    maximo = db.scalar(
        select(func.coalesce(func.max(Lancamento.numero), 0)).where(
            Lancamento.empresa_id == empresa_id
        )
    )
    return int(maximo or 0) + 1


def numero_operacao(mes: str, documento_codigo: str, sequencia: int) -> str:
    """Nº da operação no formato PP/DOC.NNN."""
    return f"{mes or '00'}/{documento_codigo}.{sequencia:03d}"


def exercicio_efetivo(
    db: Session, empresa_id: UUID, exercicio_id: UUID | None = None
) -> UUID | None:
    """Exercício a usar: o indicado ou, na falta dele, o activo mais recente.

    Tem de ser usado por TODA a gente que trabalhe com exercícios — lançar,
    fechar um diário, apurar. Se o fecho gravar `exercicio_id` nulo e o
    lançamento resolver para o exercício activo, o período dá-se por fechado
    mas continua a aceitar movimentos, e ninguém dá por isso.
    """
    if exercicio_id is not None:
        return exercicio_id
    return db.scalar(
        select(Exercicio.id)
        .where(Exercicio.empresa_id == empresa_id, Exercicio.ativo.is_(True))
        .order_by(Exercicio.inicio.desc())
        .limit(1)
    )


# ---------------------------------------------------------------------------
# Postar
# ---------------------------------------------------------------------------
def postar(
    db: Session,
    *,
    empresa_id: UUID,
    data: Date,
    diario_codigo: str,
    documento_codigo: str,
    linhas: list[dict],
    mes: str | None = None,
    descricao: str | None = None,
    documento_ref: str | None = None,
    origem: str = "manual",
    exercicio_id: UUID | None = None,
    diferido: bool = False,
    criado_por: str | None = None,
) -> Lancamento:
    """Grava um lançamento em partidas dobradas.

    Cada linha é um dict com pelo menos `conta_codigo` e `debito`/`credito`.
    Aceita ainda descricao, entidade, centro_codigo, fluxo_codigo, iva_perc.

    Levanta ErroContabilistico se violar qualquer regra do Piloto.
    """
    if not diario_codigo:
        raise ErroContabilistico("Indica o diário do movimento.")
    if not documento_codigo:
        raise ErroContabilistico("Indica o documento do movimento.")

    mes = mes or (f"{data.month:02d}" if data else "00")

    exercicio_id = exercicio_efetivo(db, empresa_id, exercicio_id)

    if exercicio_id is not None:
        ex = db.get(Exercicio, exercicio_id)
        if ex is not None and ex.estado == "fechado":
            raise ErroContabilistico(
                f"O exercício {ex.nome} está fechado — reabre-o em Configurações "
                "antes de lançar."
            )

    # --- Diário fechado para o período ---
    fechado = db.scalar(
        select(DiarioFecho.id).where(
            DiarioFecho.empresa_id == empresa_id,
            DiarioFecho.diario_codigo == diario_codigo,
            DiarioFecho.exercicio_id == exercicio_id,
            DiarioFecho.mes == mes,
        )
    )
    if fechado is not None:
        raise ErroContabilistico(
            f"O diário {diario_codigo} está fechado para o período {mes} "
            f"({periodo_label(mes)}) — reabre-o em Diários antes de lançar."
        )

    # --- Resolver contas e construir as linhas ---
    codigos = [str(l.get("conta_codigo") or "").strip() for l in linhas]
    contas = {
        c.codigo: c
        for c in db.scalars(
            select(Conta).where(Conta.empresa_id == empresa_id, Conta.codigo.in_(codigos))
        ).all()
    }
    todas: list[Conta] | None = None

    objs: list[LancamentoLinha] = []
    for i, l in enumerate(linhas):
        codigo = str(l.get("conta_codigo") or "").strip()
        debito = Decimal(str(l.get("debito") or "0"))
        credito = Decimal(str(l.get("credito") or "0"))
        # O Piloto descarta linhas sem conta ou sem valor em vez de rejeitar.
        if not codigo or (debito == 0 and credito == 0):
            continue

        conta = contas.get(codigo)
        if conta is None:
            raise ErroContabilistico(f"A conta {codigo} não existe no plano.")

        # Uma conta integradora NUNCA recebe lançamentos.
        if conta.tipo is None and todas is None:
            todas = db.scalars(select(Conta).where(Conta.empresa_id == empresa_id)).all()
        if not eh_movimento(conta, todas):
            raise ErroContabilistico(
                f"A conta {codigo} é integradora — só contas de movimento "
                "recebem lançamentos."
            )

        objs.append(
            LancamentoLinha(
                ordem=i,
                conta_id=conta.id,
                conta_codigo=conta.codigo,
                conta_nome=conta.nome,
                descricao=l.get("descricao"),
                debito=debito,
                credito=credito,
                entidade=l.get("entidade"),
                tipo_entidade=l.get("tipo_entidade"),
                iva_perc=Decimal(str(l.get("iva_perc") or "0")),
                perc_nao_ded=Decimal(str(l.get("perc_nao_ded") or "0")),
                iva_autoliq=Decimal(str(l.get("iva_autoliq") or "0")),
                moeda=l.get("moeda") or "AKZ",
                cambio=Decimal(str(l.get("cambio") or "1")),
                centro_codigo=l.get("centro_codigo"),
                fluxo_codigo=l.get("fluxo_codigo"),
            )
        )

    if len(objs) < 2:
        raise ErroContabilistico(
            "Um lançamento precisa de pelo menos duas linhas (débito e crédito)."
        )

    if not esta_equilibrado(objs):
        d, c = soma_linhas(objs)
        raise ErroContabilistico(
            f"Lançamento não equilibrado: débito {d:,.2f} ≠ crédito {c:,.2f}."
        )

    seq = proximo_numero_doc(db, empresa_id, documento_codigo, exercicio_id)

    lanc = Lancamento(
        empresa_id=empresa_id,
        numero=proximo_numero_lancamento(db, empresa_id),
        doc_num=seq,
        numero_op=numero_operacao(mes, documento_codigo, seq),
        data=data,
        mes=mes,
        diario_codigo=diario_codigo,
        documento_codigo=documento_codigo,
        descricao=descricao,
        documento_ref=documento_ref or documento_codigo,
        origem=origem,
        exercicio_id=exercicio_id,
        diferido=diferido,
        criado_por=criado_por,
        linhas=objs,
    )
    db.add(lanc)
    db.flush()
    return lanc


def integrar(db: Session, lancamento: Lancamento, por: str | None = None) -> Lancamento:
    """Integra um lançamento diferido: passa a contar no balancete, razão,
    extracto, fluxos, apuramentos e contas correntes."""
    if not lancamento.diferido:
        return lancamento
    from src.db.base import agora

    lancamento.diferido = False
    lancamento.integrado_em = agora()
    lancamento.integrado_por = por or "sistema"
    db.flush()
    return lancamento


# ---------------------------------------------------------------------------
# Balancete
# ---------------------------------------------------------------------------
def balancete(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    ate_mes: str | None = None,
    excluir_apuramento: bool = False,
) -> dict:
    """Balancete por conta. Só conta lançamentos integrados (não diferidos),
    exactamente como o `lancamentos()` do Piloto por omissão."""
    q = (
        select(
            LancamentoLinha.conta_codigo,
            func.max(LancamentoLinha.conta_nome).label("nome"),
            func.sum(LancamentoLinha.debito).label("debito"),
            func.sum(LancamentoLinha.credito).label("credito"),
        )
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
        .group_by(LancamentoLinha.conta_codigo)
        .order_by(LancamentoLinha.conta_codigo)
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if de is not None:
        q = q.where(Lancamento.data >= de)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)
    if ate_mes is not None:
        q = q.where(Lancamento.mes <= ate_mes)
    if excluir_apuramento:
        q = q.where(Lancamento.origem != "apuramento")

    linhas = []
    tot_d = tot_c = tot_sd = tot_sc = Decimal("0")
    for codigo, nome, debito, credito in db.execute(q):
        debito = debito or Decimal("0")
        credito = credito or Decimal("0")
        liquido = debito - credito
        saldo_devedor = liquido if liquido > 0 else Decimal("0")
        saldo_credor = -liquido if liquido < 0 else Decimal("0")
        linhas.append(
            {
                "codigo": codigo,
                "nome": nome,
                "debito": debito,
                "credito": credito,
                "saldo_devedor": saldo_devedor,
                "saldo_credor": saldo_credor,
                "classe": codigo[:1],
                "natureza": natureza_conta(codigo),
            }
        )
        tot_d += debito
        tot_c += credito
        tot_sd += saldo_devedor
        tot_sc += saldo_credor

    return {
        "linhas": linhas,
        "totais": {
            "debito": tot_d,
            "credito": tot_c,
            "saldo_devedor": tot_sd,
            "saldo_credor": tot_sc,
        },
    }


# ---------------------------------------------------------------------------
# Razão / Extracto
# ---------------------------------------------------------------------------
def _contraparte(linhas: list[LancamentoLinha], atual: LancamentoLinha) -> str:
    """Conta do outro lado do lançamento — "Diversas" se houver mais do que uma.

    Só conta o lado oposto: para uma linha a débito, as contrapartidas são as
    linhas a crédito.
    """
    outras = [
        x
        for x in linhas
        if x is not atual and (x.credito > 0 if atual.debito > 0 else x.debito > 0)
    ]
    if not outras:
        return ""
    return outras[0].conta_codigo if len(outras) == 1 else "Diversas"


def razao(
    db: Session,
    *,
    empresa_id: UUID,
    conta_codigo: str,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    incluir_subcontas: bool = False,
    entidade: str | None = None,
) -> dict:
    """Movimentos de uma conta com saldo corrido.

    O saldo acumula na natureza da conta: numa conta credora, um crédito faz
    subir o saldo. Mostrar sempre débito-menos-crédito daria saldos negativos em
    todas as contas de proveitos e de capital.
    """
    q = (
        select(Lancamento, LancamentoLinha)
        .join(LancamentoLinha, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
        .order_by(Lancamento.data, Lancamento.numero)
    )
    if incluir_subcontas:
        q = q.where(LancamentoLinha.conta_codigo.startswith(conta_codigo))
    else:
        q = q.where(LancamentoLinha.conta_codigo == conta_codigo)
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if de is not None:
        q = q.where(Lancamento.data >= de)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)
    if entidade:
        q = q.where(LancamentoLinha.entidade.ilike(f"%{entidade}%"))

    natureza_d = natureza_conta(conta_codigo) != "C"
    linhas: list[dict] = []
    saldo = tot_d = tot_c = Decimal("0")

    for lanc, linha in db.execute(q):
        debito = linha.debito or Decimal("0")
        credito = linha.credito or Decimal("0")
        saldo += (debito - credito) if natureza_d else (credito - debito)
        tot_d += debito
        tot_c += credito
        linhas.append(
            {
                "lancamento_id": lanc.id,
                "numero": lanc.numero,
                "numero_op": lanc.numero_op or "",
                "data": lanc.data,
                "diario": lanc.diario_codigo,
                "documento": lanc.documento_codigo,
                "documento_ref": lanc.documento_ref or "",
                "descricao": linha.descricao or lanc.descricao,
                "entidade": linha.entidade or "",
                "contraparte": _contraparte(list(lanc.linhas), linha),
                "iva_perc": linha.iva_perc,
                "debito": debito,
                "credito": credito,
                "saldo": saldo,
            }
        )

    return {
        "codigo": conta_codigo,
        "linhas": linhas,
        "total_debito": tot_d,
        "total_credito": tot_c,
        "saldo_final": saldo,
        "natureza": "D" if natureza_d else "C",
    }


# ---------------------------------------------------------------------------
# Contas correntes
# ---------------------------------------------------------------------------
def contas_correntes(
    db: Session,
    *,
    empresa_id: UUID,
    prefixo: str,
    natureza: str = "D",
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    """Contas de movimento sob um prefixo, com débito, crédito e saldo.

    `natureza`: "D" = a receber (clientes, 31…), "C" = a pagar (fornecedores, 32…).
    """
    q = (
        select(
            LancamentoLinha.conta_codigo,
            LancamentoLinha.conta_nome,
            LancamentoLinha.debito,
            LancamentoLinha.credito,
            LancamentoLinha.entidade,
        )
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(
            Lancamento.empresa_id == empresa_id,
            Lancamento.diferido.is_(False),
            LancamentoLinha.conta_codigo.startswith(prefixo),
        )
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if de is not None:
        q = q.where(Lancamento.data >= de)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)

    nat_d = natureza != "C"
    grupos: dict[str, dict] = {}
    for codigo, nome, debito, credito, entidade in db.execute(q):
        g = grupos.setdefault(
            codigo,
            {
                "codigo": codigo,
                "nome": nome or "",
                "debito": Decimal("0"),
                "credito": Decimal("0"),
                "mov": 0,
                "_ents": set(),
            },
        )
        g["debito"] += debito or Decimal("0")
        g["credito"] += credito or Decimal("0")
        g["mov"] += 1
        if entidade:
            g["_ents"].add(entidade)

    linhas = []
    for g in sorted(grupos.values(), key=lambda x: x["codigo"]):
        g["saldo"] = (
            g["debito"] - g["credito"] if nat_d else g["credito"] - g["debito"]
        )
        g["entidade"] = ", ".join(sorted(g.pop("_ents")))
        linhas.append(g)

    totais = {
        "debito": sum((l["debito"] for l in linhas), Decimal("0")),
        "credito": sum((l["credito"] for l in linhas), Decimal("0")),
        "saldo": sum((l["saldo"] for l in linhas), Decimal("0")),
    }
    # Meio cêntimo de tolerância, como no Piloto: evita contar como "com saldo"
    # contas fechadas que ficaram com resíduo de arredondamento.
    com_saldo = sum(1 for l in linhas if abs(l["saldo"]) > Decimal("0.005"))

    return {
        "linhas": linhas,
        "totais": totais,
        "natureza": "D" if nat_d else "C",
        "com_saldo": com_saldo,
    }


# ---------------------------------------------------------------------------
# Contabilidade analítica
# ---------------------------------------------------------------------------
SEM_CENTRO = "—"


def analitica_mapa(
    db: Session,
    *,
    empresa_id: UUID,
    exercicio_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
) -> dict:
    """Custos e proveitos por centro de custo.

    Só entram as classes 6 e 7. As linhas dessas classes sem centro atribuído
    caem em "(Sem centro)" em vez de desaparecerem — é o que dá visibilidade
    sobre o que falta classificar.
    """
    q = (
        select(
            LancamentoLinha.conta_codigo,
            LancamentoLinha.centro_codigo,
            LancamentoLinha.debito,
            LancamentoLinha.credito,
        )
        .join(Lancamento, Lancamento.id == LancamentoLinha.lancamento_id)
        .where(Lancamento.empresa_id == empresa_id, Lancamento.diferido.is_(False))
    )
    if exercicio_id is not None:
        q = q.where(Lancamento.exercicio_id == exercicio_id)
    if de is not None:
        q = q.where(Lancamento.data >= de)
    if ate is not None:
        q = q.where(Lancamento.data <= ate)

    nomes = {
        c.codigo: c.nome
        for c in db.scalars(
            select(CentroCusto).where(CentroCusto.empresa_id == empresa_id)
        ).all()
    }

    grupos: dict[str, dict] = {}
    for conta_codigo, centro, debito, credito in db.execute(q):
        if not conta_codigo or conta_codigo[0] not in ("6", "7"):
            continue
        cod = centro or SEM_CENTRO
        g = grupos.setdefault(
            cod,
            {
                "codigo": cod,
                "nome": "(Sem centro)" if cod == SEM_CENTRO else nomes.get(cod, cod),
                "debito": Decimal("0"),
                "credito": Decimal("0"),
                "n": 0,
            },
        )
        g["debito"] += debito or Decimal("0")
        g["credito"] += credito or Decimal("0")
        g["n"] += 1

    linhas = []
    for g in sorted(
        grupos.values(), key=lambda x: (x["codigo"] == SEM_CENTRO, x["codigo"])
    ):
        g["saldo"] = g["debito"] - g["credito"]
        linhas.append(g)

    totais = {
        "debito": sum((l["debito"] for l in linhas), Decimal("0")),
        "credito": sum((l["credito"] for l in linhas), Decimal("0")),
        "saldo": sum((l["saldo"] for l in linhas), Decimal("0")),
    }
    return {"linhas": linhas, "totais": totais}
