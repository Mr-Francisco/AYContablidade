"""Consumo de IA por empresa: custo, quotas e travões.

A plataforma paga a OpenAI e revende o acesso. Sem um travão por empresa, uma
única empresa com um automatismo mal feito consome o orçamento de todas — por
isso o limite é verificado ANTES de cada chamada, e não depois.

Duas grandezas, e a distinção importa:

- TOKENS: medem-se ao certo, vêm na resposta da API. É o que se conta.
- CUSTO: é uma ESTIMATIVA. Sai dos tokens multiplicados por uma tabela de
  preços que vive aqui e que tem de ser confirmada contra a facturação real da
  OpenAI. Serve para dar previsibilidade, não para fechar contas.

O limite é verificado contra o consumo JÁ REGISTADO, porque não há forma de
saber quanto custará uma chamada antes de a fazer. A consequência é que a
última consulta pode passar ligeiramente do limite — o travão impede a
continuação, não o último passo. É o compromisso certo: bloquear a meio de uma
resposta já paga não devolveria o dinheiro.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.core.constants import EstadoLicenca
from src.db.models.ia import ConsultaIA
from src.db.models.tenancy import Licenca

ZERO = Decimal("0")
CENT = Decimal("0.0001")

#: Preço por 1 000 000 de tokens, em dólares (entrada, saída).
#:
#: TEM DE SER CONFIRMADO contra os preços em vigor. Um preço desactualizado aqui
#: não parte nada — o consumo continua a ser medido em tokens, que é exacto —
#: mas faz o custo estimado divergir da factura.
PRECOS: dict[str, tuple[Decimal, Decimal]] = {
    "gpt-4o": (Decimal("2.50"), Decimal("10.00")),
    "gpt-4o-mini": (Decimal("0.15"), Decimal("0.60")),
    "gpt-4.1": (Decimal("2.00"), Decimal("8.00")),
    "gpt-4.1-mini": (Decimal("0.40"), Decimal("1.60")),
}
#: Usado quando o modelo não está na tabela. Deliberadamente o mais CARO dos
#: conhecidos: um modelo desconhecido deve sobrestimar o custo, nunca
#: subestimá-lo — subestimar é que deixa passar consumo a mais.
PRECO_POR_OMISSAO = (Decimal("2.50"), Decimal("10.00"))

#: A partir de que percentagem do limite se avisa quem consulta.
LIMIAR_AVISO = 80


def custo_de(modelo: str | None, tokens_entrada: int | None,
             tokens_saida: int | None) -> Decimal:
    """Custo estimado de uma consulta, em dólares."""
    entrada, saida = PRECOS.get(str(modelo or ""), PRECO_POR_OMISSAO)
    total = (
        Decimal(tokens_entrada or 0) * entrada
        + Decimal(tokens_saida or 0) * saida
    ) / Decimal("1000000")
    return total.quantize(CENT, rounding=ROUND_HALF_UP)


def _inicio_do_mes(hoje: date | None = None) -> date:
    d = hoje or date.today()
    return date(d.year, d.month, 1)


def consumo_do_mes(
    db: Session, *, empresa_id: UUID, mes: date | None = None
) -> dict:
    """Tokens, custo e número de consultas da empresa no mês corrente.

    Conta as consultas que CHEGARAM a ser feitas — as que falharam antes de
    chamar a API não têm tokens e não somam nada, o que é o correcto: não
    custaram nada.
    """
    inicio = _inicio_do_mes(mes)
    linha = db.execute(
        select(
            func.coalesce(func.sum(ConsultaIA.tokens_entrada), 0),
            func.coalesce(func.sum(ConsultaIA.tokens_saida), 0),
            func.coalesce(func.sum(ConsultaIA.custo), 0),
            func.count(ConsultaIA.id),
        ).where(
            ConsultaIA.empresa_id == empresa_id,
            ConsultaIA.criado_em >= inicio,
            ConsultaIA.tokens_entrada.isnot(None),
        )
    ).one()
    entrada, saida, custo, n = linha
    return {
        "mes": inicio.isoformat()[:7],
        "tokens_entrada": int(entrada),
        "tokens_saida": int(saida),
        "tokens": int(entrada) + int(saida),
        "custo": Decimal(custo or 0),
        "consultas": int(n),
    }


def estado_quota(db: Session, *, empresa_id: UUID) -> dict:
    """Consumo do mês face aos limites da licença.

    Sem licença ou sem limites definidos, devolve `sem_limite`. Não bloqueia:
    uma empresa sem limite contratado é uma decisão comercial, não uma falha de
    configuração a corrigir com um bloqueio.
    """
    consumo = consumo_do_mes(db, empresa_id=empresa_id)
    lic = db.scalar(
        select(Licenca)
        .where(
            Licenca.empresa_id == empresa_id,
            Licenca.estado == EstadoLicenca.ACTIVA,
        )
        .order_by(Licenca.criado_em.desc())
        .limit(1)
    )

    limite_tokens = lic.limite_tokens_mes if lic else None
    limite_custo = lic.limite_custo_mes if lic else None

    def percentagem(usado, limite) -> int | None:
        if not limite:
            return None
        return int(min(999, Decimal(usado) / Decimal(limite) * 100))

    pc_tokens = percentagem(consumo["tokens"], limite_tokens)
    pc_custo = percentagem(consumo["custo"], limite_custo)
    pc = max([p for p in (pc_tokens, pc_custo) if p is not None], default=None)

    excedeu_tokens = bool(limite_tokens) and consumo["tokens"] >= limite_tokens
    excedeu_custo = bool(limite_custo) and consumo["custo"] >= Decimal(limite_custo)

    return {
        **consumo,
        "plano": lic.plano if lic else None,
        "limite_tokens": limite_tokens,
        "limite_custo": Decimal(limite_custo) if limite_custo else None,
        "percentagem": pc,
        "sem_limite": limite_tokens is None and limite_custo is None,
        "excedido": excedeu_tokens or excedeu_custo,
        "a_avisar": pc is not None and pc >= LIMIAR_AVISO,
        "motivo": (
            "tokens" if excedeu_tokens else "custo" if excedeu_custo else None
        ),
    }


def verificar_quota(db: Session, *, empresa_id: UUID) -> dict:
    """Levanta `QuotaExcedida` se a empresa já esgotou o limite do mês.

    Chamado ANTES de contactar a API: depois da chamada o custo já foi feito, e
    recusar a resposta seria pagar sem entregar nada.
    """
    estado = estado_quota(db, empresa_id=empresa_id)
    if not estado["excedido"]:
        return estado

    if estado["motivo"] == "tokens":
        detalhe = (
            f"{estado['tokens']:,} de {estado['limite_tokens']:,} tokens"
        ).replace(",", " ")
    else:
        detalhe = f"{estado['custo']} de {estado['limite_custo']} USD"

    raise QuotaExcedida(
        f"O limite mensal de utilização de IA foi atingido ({detalhe}). "
        "O contador reinicia no início do mês seguinte; para aumentar o "
        "limite, contacte o administrador da plataforma."
    )


class QuotaExcedida(Exception):
    """Limite de IA da empresa esgotado. O router traduz para 402."""


def consumo_por_empresa(db: Session, *, mes: date | None = None) -> list[dict]:
    """Consumo de todas as empresas no mês — vista do superadministrador.

    Serve para ver, de relance, quem está a consumir o quê e quem está perto do
    limite. É a informação de que a plataforma precisa para ter previsibilidade
    de custo e margem.
    """
    from src.db.models.tenancy import Empresa

    inicio = _inicio_do_mes(mes)
    por_empresa = {
        e.id: {"empresa_id": e.id, "empresa": e.nome, "codigo": e.codigo}
        for e in db.scalars(select(Empresa).order_by(Empresa.nome)).all()
    }

    linhas = db.execute(
        select(
            ConsultaIA.empresa_id,
            func.coalesce(func.sum(ConsultaIA.tokens_entrada), 0),
            func.coalesce(func.sum(ConsultaIA.tokens_saida), 0),
            func.coalesce(func.sum(ConsultaIA.custo), 0),
            func.count(ConsultaIA.id),
        )
        .where(ConsultaIA.criado_em >= inicio, ConsultaIA.tokens_entrada.isnot(None))
        .group_by(ConsultaIA.empresa_id)
    ).all()
    consumos = {
        eid: {"tokens": int(e) + int(s), "custo": Decimal(c or 0), "consultas": int(n)}
        for eid, e, s, c, n in linhas
    }

    licencas = {
        l.empresa_id: l
        for l in db.scalars(
            select(Licenca).where(Licenca.estado == EstadoLicenca.ACTIVA)
        ).all()
    }

    saida = []
    for eid, base in por_empresa.items():
        c = consumos.get(eid, {"tokens": 0, "custo": ZERO, "consultas": 0})
        lic = licencas.get(eid)
        limite_tokens = lic.limite_tokens_mes if lic else None
        limite_custo = lic.limite_custo_mes if lic else None
        pc = None
        if limite_tokens:
            pc = int(min(999, Decimal(c["tokens"]) / Decimal(limite_tokens) * 100))
        if limite_custo:
            pc_c = int(min(999, c["custo"] / Decimal(limite_custo) * 100))
            pc = pc_c if pc is None else max(pc, pc_c)
        saida.append(
            {
                **base, **c,
                "plano": lic.plano if lic else None,
                "limite_tokens": limite_tokens,
                "limite_custo": Decimal(limite_custo) if limite_custo else None,
                "percentagem": pc,
                "excedido": pc is not None and pc >= 100,
            }
        )
    saida.sort(key=lambda x: x["custo"], reverse=True)
    return saida
