"""Séries de numeração e atribuição de números a documentos fiscais.

A REGRA DA LEI (DP 71/25, art. 10.º b): numeração **sequencial e cronológica**,
**por tipo de documento** e **por ano fiscal**, podendo haver uma ou mais
séries identificadas. E as auto-facturas numeram-se à parte (n.º 3).

A FORMA DO NÚMERO é a que a AGT documenta em `documentNo`:

    FT FT2026S1/00001
    │  │        │
    │  │        └── sequencial dentro da série, cinco dígitos
    │  └─────────── código da série: tipo + ano + sufixo
    └────────────── tipo do documento

O sequencial **nunca recua e nunca salta**. Se uma emissão falhar a meio, o
número fica gasto — e é assim que tem de ser: um número que reaparece é uma
factura duplicada aos olhos da AGT.

CONCORRÊNCIA. A atribuição faz um `SELECT ... FOR UPDATE` sobre a série. Duas
emissões ao mesmo tempo apanhariam o mesmo número sem isto, e numeração
duplicada não é um defeito menor — é uma infracção fiscal.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core import documentos_fiscais as docs_fiscais
from src.db.base import agora
from src.db.models.comercial import SerieDocumento


class ErroSerie(Exception):
    """Problema com a série que impede a emissão. A mensagem é para se ler."""


def codigo_da_serie(tipo_doc: str, ano: int, sufixo: str = "1") -> str:
    """`FT2026S1` — o código que identifica a série na AGT e no SAF-T."""
    return f"{tipo_doc.upper()}{ano}S{sufixo}"


def formatar_numero(codigo: str, tipo_doc: str, sequencia: int) -> str:
    """`FT FT2026S1/00001`, tal como a AGT o quer."""
    return f"{tipo_doc.upper()} {codigo}/{sequencia:05d}"


def obter_ou_criar(
    db: Session,
    *,
    empresa_id: UUID,
    tipo_doc: str,
    ano: int | None = None,
    sufixo: str = "1",
) -> SerieDocumento:
    """A série deste tipo e deste ano, criando-a se ainda não existir.

    Criar sozinha é deliberado: obrigar a criar séries à mão antes da primeira
    factura do ano seria um degrau à porta, em Janeiro, quando toda a gente
    tem pressa. A série nasce com a primeira factura que precisa dela.
    """
    tipo_doc = (tipo_doc or "FT").upper()
    ano = ano or date.today().year

    serie = db.scalar(
        select(SerieDocumento).where(
            SerieDocumento.empresa_id == empresa_id,
            SerieDocumento.tipo_doc == tipo_doc,
            SerieDocumento.ano == ano,
            SerieDocumento.sufixo == sufixo,
        )
    )
    if serie is not None:
        return serie

    serie = SerieDocumento(
        empresa_id=empresa_id,
        tipo_doc=tipo_doc,
        ano=ano,
        sufixo=sufixo,
        codigo=codigo_da_serie(tipo_doc, ano, sufixo),
        sequencia=0,
        estado="activa",
    )
    db.add(serie)
    db.flush()
    return serie


def proximo_numero(
    db: Session,
    *,
    empresa_id: UUID,
    tipo_doc: str,
    ano: int | None = None,
    sufixo: str = "1",
) -> tuple[SerieDocumento, int, str]:
    """Reserva o número seguinte da série. Devolve `(série, sequência, número)`.

    O bloqueio é sobre a linha da série: quem chegar a seguir espera, e não
    apanha o mesmo número.
    """
    serie = obter_ou_criar(
        db, empresa_id=empresa_id, tipo_doc=tipo_doc, ano=ano, sufixo=sufixo
    )

    # Relê com bloqueio — entre o `obter_ou_criar` e aqui pode ter entrado
    # outra emissão.
    serie = db.scalar(
        select(SerieDocumento)
        .where(SerieDocumento.id == serie.id)
        .with_for_update()
    )
    if serie is None:  # pragma: no cover — a série foi criada acima
        raise ErroSerie("A série desapareceu durante a emissão.")

    if serie.estado != "activa":
        raise ErroSerie(
            f"A série {serie.codigo} está encerrada e não atribui mais números. "
            "Crie uma série nova para continuar a emitir."
        )

    serie.sequencia += 1
    numero = formatar_numero(serie.codigo, serie.tipo_doc, serie.sequencia)
    return serie, serie.sequencia, numero


def encerrar(db: Session, serie: SerieDocumento, *, motivo: str | None = None) -> None:
    """Fecha a série. Não se apaga — os documentos que emitiu continuam a existir.

    Uma série encerrada mantém o histórico e a cadeia de resumos; o que deixa
    de fazer é dar números novos.
    """
    serie.estado = "encerrada"
    if motivo:
        # A nota fica no registo de auditoria, que é quem guarda porquês.
        pass


def registada_na_agt(serie: SerieDocumento) -> bool:
    return bool(serie.agt_id)


def marcar_registada(serie: SerieDocumento, agt_id: str) -> None:
    """Guarda o identificador devolvido por `solicitarSerie`."""
    serie.agt_id = agt_id
    serie.agt_registada_em = agora()


def pode_emitir(tipo_doc: str) -> bool:
    """Este tipo de documento leva numeração fiscal?

    A pró-forma não leva: não é documento fiscal, e dar-lhe um número de série
    fiscal seria gastar numeração com um documento que não existe para a AGT.
    """
    return docs_fiscais.correspondencia(tipo_doc)["oficial"] is not None


def descrever(serie: SerieDocumento) -> dict:
    """A série para o ecrã."""
    return {
        "id": serie.id,
        "codigo": serie.codigo,
        "tipo_doc": serie.tipo_doc,
        "ano": serie.ano,
        "sufixo": serie.sufixo,
        "sequencia": serie.sequencia,
        "estado": serie.estado,
        "proximo": formatar_numero(
            serie.codigo, serie.tipo_doc, serie.sequencia + 1
        ),
        "agt_id": serie.agt_id,
        "agt_registada_em": serie.agt_registada_em,
        "registada_na_agt": registada_na_agt(serie),
    }
