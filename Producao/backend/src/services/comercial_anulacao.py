"""Anular um documento de venda, e quando é que isso obriga a nota de crédito.

A REGRA PEDIDA, nas palavras do cliente: «facturas emitidas dentro do mesmo
período podem ser eliminadas sem a emissão de nota de crédito» e «a
obrigatoriedade da nota de crédito surge pela anulação de documentos de períodos
diferentes». É a mesma regra vista dos dois lados, e faz sentido
contabilístico: um período já encerrado ou já declarado não se reescreve.

UMA COISA NÃO PODE SER FEITA COMO ESTÁ PEDIDA, e é preciso dizê-lo: um
documento emitido NÃO SE APAGA. Não é uma limitação nossa —

  1. o número dele vem de uma série, e a lei (DP 71/25, art. 10.º b) exige
     numeração **sequencial sem falhas**; apagar deixa um salto na sequência
     que a AGT vê;
  2. cada documento leva o resumo do anterior da mesma série, e apagar um pelo
     meio **parte a cadeia** — que é exactamente o que essa cadeia existe para
     tornar detectável.

O que se faz é ANULAR MANTENDO O NÚMERO. O documento continua na sequência, a
cadeia fica intacta, e passa a valer zero: no SAF-T vai com
`InvoiceStatus = A`, que é o estado que a própria norma prevê para isto. O
efeito para quem trabalha é o que se pediu — desfazer sem papelada e sem nota
de crédito —, e o número gasto não é um custo: é a prova de que não se apagou
nada às escondidas.

E o lançamento que a emissão criou é REVERTIDO. Anular o documento e deixar o
movimento na contabilidade seria pior do que não anular: os livros ficavam a
dizer uma coisa e o documento outra.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.base import agora
from src.db.models.comercial import Venda
from src.db.models.contabilidade import Lancamento, LancamentoLinha
from src.services.contabilidade import ErroContabilistico

ZERO = Decimal("0")

#: O que se escreve no SAF-T num documento anulado. Previsto pela norma.
ESTADO_SAFT_ANULADO = "A"


def periodo_do_documento(v: Venda) -> str:
    """O período contabilístico a que o documento pertence: `01`–`12`."""
    return f"{v.data.month:02d}"


def pode_anular_sem_nota_de_credito(
    db: Session, *, empresa_id: UUID, venda: Venda, hoje: date | None = None
) -> tuple[bool, str]:
    """Este documento pode ser anulado directamente? E, se não, porquê.

    Devolve `(pode, motivo)`. O motivo é para se mostrar a quem está no ecrã,
    por isso vem escrito para essa pessoa e não para quem lê o código.
    """
    hoje = hoje or date.today()
    periodo = periodo_do_documento(venda)

    # 1. Ano diferente é sempre período diferente, e não há aqui hipótese de
    #    dúvida: o exercício está fechado ou já foi declarado.
    if venda.data.year != hoje.year:
        return False, (
            f"Este documento é de {venda.data.year} e o exercício em curso é "
            f"{hoje.year}. Documentos de exercícios anteriores anulam-se com "
            "uma nota de crédito, para o histórico continuar a bater."
        )

    # 2. Mês diferente dentro do mesmo ano.
    if venda.data.month != hoje.month:
        return False, (
            f"Este documento é de {_mes(venda.data.month)} e estamos em "
            f"{_mes(hoje.month)}. Documentos de períodos já passados anulam-se "
            "com uma nota de crédito — o IVA desse período pode já ter sido "
            "apurado e entregue."
        )

    # 3. Mesmo período, mas o período pode estar fechado à mão. Um fecho
    #    explícito vale mais do que a data: quem fechou o mês fechou-o para
    #    tudo, e isto tem de o respeitar.
    from src.services.contabilidade import verificar_periodo_aberto

    lanc = db.get(Lancamento, venda.lancamento_id) if venda.lancamento_id else None
    if lanc is not None:
        try:
            verificar_periodo_aberto(
                db,
                empresa_id,
                exercicio_id=lanc.exercicio_id,
                diario_codigo=lanc.diario_codigo,
                mes=lanc.mes or periodo,
            )
        except ErroContabilistico as e:
            return False, (
                f"{e} Enquanto estiver fechado, este documento anula-se com "
                "uma nota de crédito."
            )

    return True, ""


def anular(
    db: Session,
    *,
    empresa_id: UUID,
    venda: Venda,
    motivo: str | None = None,
    hoje: date | None = None,
) -> dict:
    """Anula o documento, mantendo-lhe o número, e reverte o lançamento.

    Levanta `ErroContabilistico` quando o documento é de outro período — nesse
    caso o caminho é a nota de crédito, e a mensagem di-lo.
    """
    if venda.estado == "anulada":
        raise ErroContabilistico("Este documento já está anulado.")
    if venda.estado != "emitida":
        raise ErroContabilistico(
            "Só documentos emitidos se anulam. Um rascunho elimina-se."
        )

    pode, porque = pode_anular_sem_nota_de_credito(
        db, empresa_id=empresa_id, venda=venda, hoje=hoje
    )
    if not pode:
        raise ErroContabilistico(porque)

    revertido = _reverter_lancamento(db, empresa_id=empresa_id, venda=venda)

    venda.estado = "anulada"
    # O ESTADO QUE VAI PARA A AGT. Sem isto o documento seguia no SAF-T como
    # normal e a anulação existia só aqui dentro — a AGT continuaria a contar
    # com aquele valor.
    venda.estado_saft = ESTADO_SAFT_ANULADO
    venda.anulado_em = agora()
    # O motivo fica na venda. A coluna existe desde o início e nunca foi
    # escrita: um documento anulado sem motivo, meses depois, não explica nada
    # a quem for ver porque é que aquele número vale zero.
    if motivo:
        venda.motivo_anulacao = motivo.strip()[:200]

    db.flush()
    return {
        "numero": venda.numero,
        "estado": venda.estado,
        "lancamento_revertido": revertido,
    }


def _reverter_lancamento(db: Session, *, empresa_id: UUID, venda: Venda) -> bool:
    """Desfaz o movimento que a emissão criou.

    NÃO APAGA O LANÇAMENTO. Escreve o CONTRÁRIO dele — débitos onde havia
    créditos e ao contrário — com a data de hoje. É a diferença entre corrigir
    e esconder: apagar deixava o balancete certo e o histórico a mentir; o
    lançamento de sentido contrário deixa os dois certos e deixa rasto.
    """
    if not venda.lancamento_id:
        return False

    original = db.get(Lancamento, venda.lancamento_id)
    if original is None or original.empresa_id != empresa_id:
        return False

    from src.services.contabilidade import proximo_numero_lancamento

    contrario = Lancamento(
        empresa_id=empresa_id,
        numero=proximo_numero_lancamento(db, empresa_id),
        data=original.data,
        mes=original.mes,
        diario_codigo=original.diario_codigo,
        documento_codigo=original.documento_codigo,
        descricao=f"Anulação de {venda.numero}",
        documento_ref=venda.numero,
        origem="comercial",
        exercicio_id=original.exercicio_id,
    )
    db.add(contrario)
    db.flush()

    for l in original.linhas:
        db.add(
            LancamentoLinha(
                lancamento_id=contrario.id,
                ordem=l.ordem,
                conta_id=l.conta_id,
                conta_codigo=l.conta_codigo,
                conta_nome=l.conta_nome,
                descricao=f"Anulação de {venda.numero}",
                # O SENTIDO TROCADO. É isto que desfaz o movimento.
                debito=l.credito or ZERO,
                credito=l.debito or ZERO,
                entidade=l.entidade,
                tipo_entidade=l.tipo_entidade,
                centro_codigo=l.centro_codigo,
                fluxo_codigo=l.fluxo_codigo,
            )
        )

    db.flush()
    return True


_MESES = (
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
)


def _mes(n: int) -> str:
    return _MESES[n - 1] if 1 <= n <= 12 else str(n)
