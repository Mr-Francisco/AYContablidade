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
from src.services.facturacao import saft
from src.services.facturacao import series as svc_series

router = APIRouter(prefix="/api/saft", tags=["saft"])

FECHAR = Depends(exigir_cap("contab.fechar"))
VER = Depends(exigir_cap("contab.ver"))


class PedidoSaft(BaseModel):
    de: date
    ate: date
    #: `facturacao` ou `compras` — os dois ficheiros mensais que a AGT pede.
    #: São o mesmo `AuditFile` com blocos diferentes preenchidos.
    tipo: str = Field(default="facturacao", pattern="^(facturacao|compras)$")
    #: Número de validação do software atribuído pela AGT (`141/AGT/2026`), ou
    #: `0` enquanto não houver certificação.
    numero_validacao: str = Field(min_length=1, max_length=30)


def _gerar(db, empresa, dados: "PedidoSaft") -> bytes:
    """O ficheiro do tipo pedido. Um sítio só a decidir qual — dois ramos
    espalhados pelas rotas seriam duas hipóteses de divergirem."""
    if dados.tipo == "compras":
        return saft.gerar_compras(
            db, empresa=empresa, de=dados.de, ate=dados.ate,
            numero_validacao=dados.numero_validacao,
        )
    return saft.gerar(
        db, empresa=empresa, de=dados.de, ate=dados.ate,
        numero_validacao=dados.numero_validacao,
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
    return {
        "valido": valido,
        "erros": erros,
        "bytes": len(xml),
        "documentos": xml.count(b"<Invoice>"),
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
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "O ficheiro gerado não passa no esquema oficial da AGT e por isso "
            "não é descarregado — seria recusado na entrega. "
            + " | ".join(erros[:3]),
        )

    marca = "FT" if dados.tipo == "facturacao" else "AQ"
    nome = f"SAFT_{marca}_{empresa.nif}_{dados.de:%Y%m}.xml"
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
