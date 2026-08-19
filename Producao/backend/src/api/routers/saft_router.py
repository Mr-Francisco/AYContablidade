"""Exportação do SAF-T (AO) e gestão das séries de numeração.

Nota: NÃO usar `from __future__ import annotations` — slowapi.

Quem pode: `contab.fechar`. Exportar o SAF-T não é uma consulta — é preparar o
que se entrega à AGT, e quem o faz é quem responde pelo fecho.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.db.models.comercial import SerieDocumento
from src.services import certificacao as svc_certificacao
from src.services.facturacao import saft
from src.services.facturacao import series as svc_series

router = APIRouter(prefix="/api/saft", tags=["saft"])

FECHAR = Depends(exigir_cap("contab.fechar"))
VER = Depends(exigir_cap("contab.ver"))


class PedidoSaft(BaseModel):
    de: date
    ate: date
    #: Os TRÊS ficheiros que a AGT pede. São o mesmo `AuditFile` com blocos
    #: diferentes preenchidos: `facturacao` e `compras` são mensais (dia 20 do
    #: mês seguinte), `contabilidade` é anual (10 de Abril do ano seguinte).
    tipo: str = Field(
        default="facturacao", pattern="^(facturacao|compras|contabilidade)$"
    )
    # NÃO HÁ AQUI UM `numero_validacao`, E É DE PROPÓSITO.
    #
    # Havia, e era o maior buraco desta rota: quem exportasse podia mandar no
    # pedido o número de certificação que lhe apetecesse — o de um concorrente,
    # um inventado — e o ficheiro saía com ele. O esquema do SAF-T só verifica
    # o FORMATO do número, nunca a quem pertence, por isso passava na validação
    # e chegava à AGT com uma certificação que não era daquela empresa.
    #
    # O número vem agora da ficha da empresa, escrito só pela plataforma. Se o
    # cliente enviar o campo, é ignorado — não existe no modelo.


def _gerar(db, empresa, dados: "PedidoSaft") -> bytes:
    """O ficheiro do tipo pedido. Um sítio só a decidir qual — três ramos
    espalhados pelas rotas seriam três hipóteses de divergirem."""
    gerador = {
        "compras": saft.gerar_compras,
        "contabilidade": saft.gerar_contabilidade,
    }.get(dados.tipo, saft.gerar)

    # O NÚMERO VEM DO RESOLVEDOR, não do campo da empresa: uma empresa sem
    # número próprio herda o da plataforma, e é esse que tem de sair no
    # ficheiro. Ler o campo directamente fazia-a declarar «não certificado»
    # tendo a plataforma certificação.
    return gerador(
        db, empresa=empresa, de=dados.de, ate=dados.ate,
        numero_validacao=svc_certificacao.efectiva(db, empresa),
    )


@router.post("/prever", dependencies=[FECHAR])
def prever(dados: PedidoSaft, empresa: EmpresaAtual, db: DB) -> dict:
    """Gera e valida SEM descarregar — para se ver o que sai antes de entregar.

    Existe por uma razão prática: um ficheiro recusado pela AGT descobre-se
    tarde, e o prazo é o dia 20. Aqui vê-se o número de documentos, o total e
    os erros de validação, se houver, antes de se gastar a submissão.
    """
    try:
        xml = _gerar(db, empresa, dados)
    except saft.ErroSaft as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e

    valido, erros = saft.validar(xml)
    # O ficheiro de contabilidade não tem facturas nenhumas: o que ali se conta
    # são lançamentos. Contar `<Invoice>` dizia «0 documentos» num ficheiro
    # correcto com um exercício inteiro lá dentro — e quem lê isso não entrega.
    marcador = b"<Transaction>" if dados.tipo == "contabilidade" else b"<Invoice>"
    return {
        "valido": valido,
        # O QUE VAI PARA O ECRÃ É A TRADUÇÃO, não o que o validador diz. Quem
        # exporta é um contabilista com um prazo, e «No match found for
        # key-sequence ['4321'] of keyref …» não lhe diz o que corrigir. O
        # texto original segue em `detalhe`, para quem der apoio.
        "erros": saft.explicar(erros),
        "bytes": len(xml),
        "documentos": xml.count(marcador),
        "periodo": {"de": dados.de, "ate": dados.ate},
    }


@router.post("/exportar", dependencies=[FECHAR])
def exportar(dados: PedidoSaft, empresa: EmpresaAtual, db: DB) -> Response:
    """O ficheiro XML, pronto a submeter no Portal do Contribuinte.

    RECUSA-SE A DESCARREGAR UM FICHEIRO INVÁLIDO. Deixar sair um ficheiro que
    não passa no esquema seria deixar alguém tentar entregar e ser recusado —
    e descobri-lo do lado da AGT, com o prazo a correr.
    """
    try:
        xml = _gerar(db, empresa, dados)
    except saft.ErroSaft as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e

    valido, erros = saft.validar(xml)
    if not valido:
        explicados = saft.explicar(erros)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "O ficheiro não pode ser entregue à AGT tal como está e por isso "
            "não foi descarregado. "
            + " ".join(e["mensagem"] for e in explicados[:2]),
        )

    # O de contabilidade é anual e leva só o ano no nome: um `202601` num
    # ficheiro que cobre o exercício inteiro fazia-o parecer de Janeiro.
    marca = {"compras": "AQ", "contabilidade": "CT"}.get(dados.tipo, "FT")
    quando = (
        f"{dados.de:%Y}" if dados.tipo == "contabilidade" else f"{dados.de:%Y%m}"
    )
    nome = f"SAFT_{marca}_{empresa.nif}_{quando}.xml"
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


# ---------------------------------------------------------------------------
# Séries
# ---------------------------------------------------------------------------
@router.get("/series", dependencies=[VER])
def listar_series(empresa: EmpresaAtual, db: DB) -> list[dict]:
    """As séries de numeração da empresa, da mais recente para a mais antiga."""
    series = db.scalars(
        select(SerieDocumento)
        .where(SerieDocumento.empresa_id == empresa.id)
        .order_by(SerieDocumento.ano.desc(), SerieDocumento.tipo_doc)
    ).all()
    return [svc_series.descrever(s) for s in series]


class PedidoSerie(BaseModel):
    tipo_doc: str = Field(min_length=2, max_length=4)
    ano: int = Field(ge=2000, le=2100)
    sufixo: str = Field(default="1", min_length=1, max_length=10)


@router.post("/series", status_code=status.HTTP_201_CREATED, dependencies=[FECHAR])
def criar_serie(dados: PedidoSerie, empresa: EmpresaAtual, db: DB) -> dict:
    """Abre uma série. Normalmente não é preciso — a primeira factura do ano
    cria a sua —, mas uma empresa com dois postos de venda precisa de as
    separar, e isso decide-se antes de facturar."""
    if not svc_series.pode_emitir(dados.tipo_doc):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{dados.tipo_doc} não é um documento fiscal e não leva série de "
            "numeração.",
        )
    serie = svc_series.obter_ou_criar(
        db,
        empresa_id=empresa.id,
        tipo_doc=dados.tipo_doc,
        ano=dados.ano,
        sufixo=dados.sufixo,
    )
    db.commit()
    return svc_series.descrever(serie)
