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
    Conta,
    Diario,
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

    # --- Exercício: o indicado, senão o activo mais recente ---
    if exercicio_id is None:
        exercicio_id = db.scalar(
            select(Exercicio.id)
            .where(Exercicio.empresa_id == empresa_id, Exercicio.ativo.is_(True))
            .order_by(Exercicio.inicio.desc())
            .limit(1)
        )

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
