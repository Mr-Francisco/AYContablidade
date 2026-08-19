"""Movimentos automáticos à espera de que se indique o fluxo de caixa.

O QUE SE PEDIU: cada factura, recebimento ou recibo continua a gerar o
movimento automaticamente, como já acontece. Mas a Contabilidade passa a ter uma
aba onde os vê, e é avisada de que aquele movimento está pendente de indicação
de fluxo de caixa.

PORQUE É QUE ISTO É UM PROBLEMA A SÉRIO, e não uma arrumação: a Demonstração de
Fluxos de Caixa é construída a partir do `fluxo_codigo` de cada linha que passa
por caixa ou por banco. Uma linha sem esse código não desaparece do balancete —
o dinheiro está lá — mas **desaparece da demonstração**. O mapa fecha com um
total que não bate com o movimento real de tesouraria, e quem o lê não tem como
saber o que ficou de fora.

O documento comercial não sabe classificar isto sozinho, e não deve adivinhar: o
mesmo recebimento pode ser actividade operacional ou de financiamento conforme
o que está por trás. Quem decide é quem faz a contabilidade. O que o sistema tem
de garantir é que **não se esquece**.

O QUE CONTA COMO PENDENTE: uma linha de um lançamento de origem automática, numa
conta de disponibilidades (classe 4 do PGC-AR — caixa, depósitos), sem
`fluxo_codigo`. Lançamentos feitos à mão ficam de fora: quem os escreveu já
decidiu, e avisá-lo do que decidiu é ruído.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.db.models.contabilidade import Lancamento, LancamentoLinha

#: Origens que geram movimentos sem intervenção de quem faz a contabilidade.
#: São estas que ficam a precisar de classificação; um lançamento manual não.
ORIGENS_AUTOMATICAS = ("comercial", "logistica", "rh", "imobilizado")

#: Prefixos das contas de DISPONIBILIDADES no PGC-AR — caixa e depósitos.
#: São as únicas que entram na Demonstração de Fluxos de Caixa, e por isso as
#: únicas onde a falta do código tem consequência.
#:
#: `43` depósitos à ordem, `45` caixa. Vem das contas por omissão das
#: parametrizações (`conta_caixa` 4511, `conta_banco` 43101), e é a razão de se
#: comparar por prefixo em vez de listar códigos: cada empresa tem as suas
#: subcontas e listá-las obrigaria a mexer aqui a cada plano novo.
PREFIXOS_DISPONIBILIDADES = ("43", "45")

#: A chave da notificação. Uma só, actualizada — não uma por documento: dez
#: facturas com o mesmo problema são um problema, não dez avisos.
CHAVE_NOTIFICACAO = "contabilidade.fluxo_por_indicar"


def _filtro_disponibilidades():
    """As linhas em contas de caixa ou de banco."""
    return or_(
        *[
            LancamentoLinha.conta_codigo.like(f"{p}%")
            for p in PREFIXOS_DISPONIBILIDADES
        ]
    )


def _consulta_base(empresa_id: UUID):
    return (
        select(Lancamento, LancamentoLinha)
        .join(LancamentoLinha, LancamentoLinha.lancamento_id == Lancamento.id)
        .where(
            Lancamento.empresa_id == empresa_id,
            Lancamento.origem.in_(ORIGENS_AUTOMATICAS),
            _filtro_disponibilidades(),
            # Vazio e nulo são a mesma coisa aqui: nenhum dos dois classifica
            # nada, e só verificar o nulo deixava passar as linhas que alguém
            # gravou com o campo em branco.
            or_(
                LancamentoLinha.fluxo_codigo.is_(None),
                LancamentoLinha.fluxo_codigo == "",
            ),
        )
    )


def contar(db: Session, empresa_id: UUID) -> int:
    """Quantas linhas estão à espera de classificação."""
    return int(
        db.scalar(
            select(func.count()).select_from(_consulta_base(empresa_id).subquery())
        )
        or 0
    )


def listar(
    db: Session, empresa_id: UUID, *, offset: int = 0, limite: int = 25
) -> dict:
    """As linhas pendentes, uma página de cada vez.

    Paginado porque isto cresce sem limite — é uma linha por cada recebimento
    que passe por caixa, e uma empresa activa faz muitos. A regra do projecto é
    clara: nenhum histórico é infinito no ecrã.
    """
    total = contar(db, empresa_id)

    filas = db.execute(
        _consulta_base(empresa_id)
        .order_by(Lancamento.data.desc(), Lancamento.numero.desc())
        .offset(offset)
        .limit(limite)
    ).all()

    return {
        "total": total,
        # `offset` e `limite` vão na resposta como em todas as rotas paginadas:
        # a barra de paginação lê-os de lá para dizer «1–25 de 812». Sem eles
        # dizia a página e não o total, que é um salto no escuro.
        "offset": offset,
        "limite": limite,
        "linhas": [
            {
                "lancamento_id": lanc.id,
                "linha_id": linha.id,
                "numero_op": lanc.numero_op,
                "numero": lanc.numero,
                "data": lanc.data,
                "mes": lanc.mes,
                "diario_codigo": lanc.diario_codigo,
                "descricao": lanc.descricao,
                "documento_ref": lanc.documento_ref,
                "origem": lanc.origem,
                "conta_codigo": linha.conta_codigo,
                "conta_nome": linha.conta_nome,
                "debito": linha.debito,
                "credito": linha.credito,
                # O que falta, dito por extenso: é este campo que a pessoa vem
                # aqui preencher.
                "fluxo_codigo": linha.fluxo_codigo or "",
            }
            for lanc, linha in filas
        ],
    }


def indicar_fluxo(
    db: Session, empresa_id: UUID, *, linha_id: UUID, fluxo_codigo: str
) -> None:
    """Classifica uma linha. Levanta `ValueError` com uma mensagem para o ecrã."""
    from src.db.models.contabilidade import Fluxo

    codigo = (fluxo_codigo or "").strip()
    if not codigo:
        raise ValueError(
            "Indique a rubrica de fluxo de caixa. Sem ela, este movimento "
            "continua a não aparecer na Demonstração de Fluxos de Caixa."
        )

    fluxo = db.scalar(
        select(Fluxo).where(Fluxo.empresa_id == empresa_id, Fluxo.codigo == codigo)
    )
    if fluxo is None:
        raise ValueError(
            f"A rubrica {codigo} não existe no plano de fluxos desta empresa. "
            "Escolha uma da lista."
        )
    # Uma rubrica intermédia ou de raiz agrega outras; imputar-lhe um movimento
    # fazia o mapa somar duas vezes o mesmo valor.
    if (fluxo.tipo or "M") != "M":
        raise ValueError(
            f"A rubrica {codigo} — {fluxo.descricao} — serve para agrupar "
            "outras e não recebe movimentos. Escolha uma rubrica de movimento."
        )

    linha = db.get(LancamentoLinha, linha_id)
    if linha is None:
        raise ValueError("A linha já não existe.")

    lanc = db.get(Lancamento, linha.lancamento_id)
    if lanc is None or lanc.empresa_id != empresa_id:
        raise ValueError("A linha não pertence a esta empresa.")

    linha.fluxo_codigo = codigo
    db.flush()


def avisar_se_houver(db: Session, empresa_id: UUID) -> None:
    """Avisa a contabilidade, ou levanta o aviso se já não houver nada.

    Chama-se DEPOIS de gerar um movimento automático. Não levanta excepção: um
    aviso que falhe não pode impedir a emissão de uma factura.
    """
    from src.services import notificacoes

    quantas = contar(db, empresa_id)

    if quantas == 0:
        notificacoes.resolver(db, empresa_id=empresa_id, chave=CHAVE_NOTIFICACAO)
        return

    notificacoes.notificar(
        db,
        empresa_id=empresa_id,
        # Quem trata disto é quem faz a contabilidade, não quem factura.
        capacidade="contab.lancar",
        origem="contabilidade",
        chave=CHAVE_NOTIFICACAO,
        titulo="Movimentos à espera do fluxo de caixa",
        texto=(
            f"{quantas} {'movimento' if quantas == 1 else 'movimentos'} "
            f"{'gerado' if quantas == 1 else 'gerados'} automaticamente "
            "ainda não têm a rubrica de fluxo de caixa indicada. Enquanto não "
            "tiverem, não aparecem na Demonstração de Fluxos de Caixa. "
            "Indique-a em Contabilidade → Diferidos."
        ),
        ligacao="/contabilidade/diferidos",
        tipo="aviso",
    )
