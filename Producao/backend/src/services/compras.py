"""Compras: documentos de compra e entrada em armazém.

Transposto de `Piloto/assets/js/compras.js`.

Detalhe estrutural do Piloto que é preciso perceber: NÃO existe um lançamento de
factura de compra em separado. A entrada em armazém É a contabilização — uma só
operação que debita as Existências, credita a conta corrente do fornecedor e,
havendo IVA, debita o IVA Dedutível. Lançar a factura à parte duplicaria tudo.

É por isso que todas as linhas de uma compra têm de estar ligadas a um artigo.
"""

from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.base import agora
from src.db.models.comercial import Compra
from src.db.models.contabilidade import DocumentoContabilistico
from src.services.contabilidade import ErroContabilistico
from src.services.comercial import proximo_numero
from src.services.notificacoes import notificar
from src.services.logistica import cfg_log, registar_movimento

ZERO = Decimal("0")
CENT = Decimal("0.01")


def r2(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def documentos_compra(db: Session, empresa_id: UUID) -> list[DocumentoContabilistico]:
    """Tipos de documento disponíveis para uma compra.

    São os documentos contabilísticos do diário de entradas — a mesma tabela
    gerida em Diários e Documentos, não uma lista à parte.
    """
    diario = cfg_log(db, empresa_id).get("diario_entrada") or "21"
    return db.scalars(
        select(DocumentoContabilistico)
        .where(
            DocumentoContabilistico.empresa_id == empresa_id,
            DocumentoContabilistico.diario_codigo == diario,
            DocumentoContabilistico.ativo.is_(True),
        )
        .order_by(DocumentoContabilistico.codigo)
    ).all()


def calc_totais_compra(linhas: list[dict], iva_perc: Decimal) -> dict:
    subtotal = r2(
        sum(
            (Decimal(str(l.get("qtd") or 0)) * Decimal(str(l.get("preco") or 0))
             for l in linhas),
            ZERO,
        )
    )
    iva = r2(subtotal * (iva_perc or ZERO) / 100)
    return {"subtotal": subtotal, "iva": iva, "total": r2(subtotal + iva)}


def emitir_compra(
    db: Session, *, empresa_id: UUID, compra: Compra, exercicio_id: UUID | None = None
) -> dict:
    """Emite a compra: cada linha gera uma entrada de stock que contabiliza."""
    if compra.estado == "emitida":
        raise ErroContabilistico("Documento já emitido.")
    if (compra.total or ZERO) <= 0:
        raise ErroContabilistico("Documento sem valor.")
    if not compra.fornecedor_id and not compra.fornecedor_nome:
        raise ErroContabilistico("Indica o fornecedor.")
    if compra.armazem_id is None:
        raise ErroContabilistico("Indica o armazém de entrada.")
    if not compra.documento_codigo:
        raise ErroContabilistico("Indica o tipo de documento.")

    doc = db.scalar(
        select(DocumentoContabilistico).where(
            DocumentoContabilistico.empresa_id == empresa_id,
            DocumentoContabilistico.codigo == compra.documento_codigo,
        )
    )
    if doc is None:
        raise ErroContabilistico(
            f"O documento {compra.documento_codigo} já não existe — escolhe outro."
        )

    linhas = [l for l in compra.linhas if (l.qtd or ZERO) > 0]
    if not linhas:
        raise ErroContabilistico("Adiciona pelo menos uma linha.")
    if any(l.artigo_id is None for l in linhas):
        raise ErroContabilistico(
            "Todas as linhas têm de estar ligadas a um artigo — a compra tem de "
            "movimentar o stock."
        )

    if not compra.numero:
        compra.numero = proximo_numero(
            db, empresa_id, compra.documento_codigo, compra.data.year
        )

    movimentos, lancamentos, erros = [], [], []
    for l in linhas:
        try:
            m = registar_movimento(
                db, empresa_id=empresa_id, tipo="entrada", artigo_id=l.artigo_id,
                armazem_id=compra.armazem_id, qtd=l.qtd, custo_unit=l.preco,
                iva_perc=compra.iva_perc, data=compra.data, documento=compra.numero,
                entidade=compra.fornecedor_nome, descricao=f"Compra {compra.numero}",
                diario_contab=doc.diario_codigo, documento_contab=doc.codigo,
                exercicio_id=exercicio_id,
            )
            movimentos.append(m.id)
            if m.lancamento_id:
                lancamentos.append(m.lancamento_id)
        except ErroContabilistico as e:
            erros.append(f"{l.descricao or 'artigo'}: {e}")

    if not movimentos:
        raise ErroContabilistico(
            "Não foi possível movimentar o stock: " + " · ".join(erros)
        )

    compra.estado = "emitida"
    compra.documento_nome = doc.descricao
    compra.emitido_em = agora()

    # Notificação 3. Alguma linha entrou, por isso o documento é dado por
    # emitido — mas a mercadoria das linhas que falharam não está no
    # inventário nem nas contas, e o documento diz «emitida».
    if erros:
        notificar(
            db, empresa_id=empresa_id, capacidade="logistica.gerir",
            origem="compras", chave=f"compra-linhas-falhadas:{compra.id}",
            titulo=f"Compra {compra.numero}: {len(erros)} linha(s) não entraram em stock",
            texto=(
                "O documento foi emitido, mas estas linhas falharam: "
                + " · ".join(erros)
                + ". A mercadoria não está no inventário."
            ),
            ligacao="/logistica/compras",
            alvo_tipo="compra", alvo_id=compra.id,
        )

    db.flush()
    return {
        "compra_id": compra.id, "numero": compra.numero,
        "movimentos": movimentos, "lancamentos": lancamentos, "erros": erros,
    }


def resumo_compras(db: Session, *, empresa_id: UUID) -> dict:
    cs = db.scalars(select(Compra).where(Compra.empresa_id == empresa_id)).all()
    emit = [c for c in cs if c.estado == "emitida"]
    return {
        "total_compras": r2(sum((c.total or ZERO for c in cs), ZERO)),
        "total_rececionado": r2(sum((c.total or ZERO for c in emit), ZERO)),
        "n_compras": len(cs),
        "n_emitidas": len(emit),
        "por_emitir": r2(sum((c.total or ZERO for c in cs if c.estado != "emitida"), ZERO)),
    }
