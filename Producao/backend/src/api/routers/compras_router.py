"""Compras: fornecedores e documentos de compra.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from src.api.mestres import aplicar, obter_da_empresa, recusar_se_usado
from src.api.deps import DB, EmpresaAtual, exigir_cap
from src.api.paginacao import LIMITE_OMISSAO, pagina
from src.db.models.comercial import Compra, CompraLinha
from src.api.routers.comercial_router import (
    TerceiroAtualizar,
    TerceiroEntrada,
    _categoria_valida,
    _terceiro_publico,
)
from src.db.models.terceiros import Terceiro
from src.services import comercial as svc_com
from src.services import compras as svc

router = APIRouter(
    prefix="/api/compras",
    tags=["compras"],
    dependencies=[Depends(exigir_cap("logistica.ver"))],
)

GERIR = Depends(exigir_cap("logistica.gerir"))


class LinhaEntrada(BaseModel):
    artigo_id: UUID
    descricao: str | None = None
    unidade: str | None = None
    qtd: Decimal
    preco: Decimal


class CompraEntrada(BaseModel):
    data: Date
    documento_codigo: str = Field(min_length=1, max_length=10)
    fornecedor_id: UUID | None = None
    fornecedor_nome: str | None = None
    armazem_id: UUID
    iva_perc: Decimal = Decimal("0")
    linhas: list[LinhaEntrada] = Field(min_length=1)


#: A ficha do fornecedor é a MESMA do cliente — no Piloto é literalmente o
#: mesmo componente sobre a mesma tabela. Reaproveitam-se os esquemas em vez de
#: os duplicar: dois esquemas para a mesma tabela divergem à primeira alteração
#: que só um deles receba, e foi assim que o fornecedor ficou com nove campos
#: enquanto o cliente tinha dez.
FornecedorEntrada = TerceiroEntrada
FornecedorAtualizar = TerceiroAtualizar


class EmitirPedido(BaseModel):
    exercicio_id: UUID | None = None


def _compra(db: DB, empresa_id: UUID, compra_id: UUID) -> Compra:
    c = db.scalar(
        select(Compra).where(Compra.id == compra_id, Compra.empresa_id == empresa_id)
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Documento não encontrado.")
    return c


@router.get("/fornecedores")
def listar_fornecedores(
    empresa: EmpresaAtual, db: DB, procura: str | None = None
) -> list[dict]:
    q = select(Terceiro).where(
        Terceiro.empresa_id == empresa.id, Terceiro.tipo == "fornecedor"
    )
    if procura:
        termo = f"%{procura}%"
        q = q.where(Terceiro.nome.ilike(termo) | Terceiro.nif.ilike(termo))
    return [
        _terceiro_publico(f) for f in db.scalars(q.order_by(Terceiro.numero)).all()
    ]


@router.post("/fornecedores", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_fornecedor(
    request: Request, dados: FornecedorEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    numeros = db.scalars(
        select(Terceiro.numero).where(
            Terceiro.empresa_id == empresa.id, Terceiro.tipo == "fornecedor"
        )
    ).all()
    proximo = f"{max((int(n) for n in numeros if n and n.isdigit()), default=0) + 1:03d}"
    f = Terceiro(
        empresa_id=empresa.id, tipo="fornecedor",
        tipo_terceiro=dados.tipo_terceiro or "Fornecedor",
        numero=dados.numero or proximo,
        **dados.model_dump(exclude={"numero", "tipo_terceiro"}),
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return {"id": f.id, "numero": f.numero, "nome": f.nome}



class FornecedorRapido(BaseModel):
    """O mínimo para criar um fornecedor sem sair do documento de compra.

    O ESPELHO DO QUE JÁ EXISTE NAS VENDAS. O caso é o mesmo: descobre-se a meio
    de uma compra que o fornecedor não está registado, e mandar a pessoa a
    Logística → Fornecedores é fazê-la perder o documento que estava a
    preencher.
    """

    nome: str = Field(min_length=1, max_length=200)
    nif: str | None = Field(default=None, max_length=20)
    telefone: str | None = Field(default=None, max_length=40)
    #: O país da ficha. Decide entre nacional e estrangeiro quando não se
    #: escolhe categoria.
    pais: str = Field(default="Angola", max_length=60)
    #: `nacional`, `estrangeiro` ou `outros` — decide a conta-mãe da conta
    #: corrente: `32121`, `32221` ou `3792 Outros Credores`.
    categoria_conta: str | None = Field(default=None, max_length=20)


@router.post(
    "/fornecedores/rapido",
    status_code=status.HTTP_201_CREATED,
    dependencies=[GERIR],
)
def criar_fornecedor_rapido(
    dados: FornecedorRapido, empresa: EmpresaAtual, db: DB
) -> dict:
    """Cria o fornecedor E a sua conta corrente, sem sair da compra.

    Igual ao lado dos clientes, e pelas mesmas razões: número sequencial por
    empresa, e conta corrente criada JÁ — não só na primeira compra. Um
    fornecedor que existisse nas compras e não existisse na contabilidade até
    alguém lhe comprar alguma coisa não aparecia a quem fosse ver o plano de
    contas.
    """
    nome = dados.nome.strip()
    if db.scalar(
        select(Terceiro.id).where(
            Terceiro.empresa_id == empresa.id,
            Terceiro.tipo == "fornecedor",
            func.lower(Terceiro.nome) == nome.lower(),
        )
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Já existe um fornecedor com o nome «{nome}». Procure-o na lista "
            "em vez de criar outro — dois fornecedores com o mesmo nome acabam "
            "com os movimentos repartidos entre os dois.",
        )

    numeros = db.scalars(
        select(Terceiro.numero).where(
            Terceiro.empresa_id == empresa.id, Terceiro.tipo == "fornecedor"
        )
    ).all()
    proximo = f"{max((int(n) for n in numeros if n and n.isdigit()), default=0) + 1:03d}"

    f = Terceiro(
        empresa_id=empresa.id,
        tipo="fornecedor",
        tipo_terceiro="Fornecedor",
        numero=proximo,
        nome=nome,
        nif=(dados.nif or "").strip() or None,
        telefone=(dados.telefone or "").strip() or None,
        pais=dados.pais.strip() or "Angola",
        categoria_conta=_categoria_valida(dados.categoria_conta),
        estado="activo",
    )
    db.add(f)
    db.flush()

    conta = svc_com.conta_corrente_fornecedor(
        db, empresa.id, f, svc_com.cfg_com(db, empresa.id)
    )
    db.commit()
    db.refresh(f)

    return {
        "id": f.id,
        "numero": f.numero,
        "nome": f.nome,
        "nif": f.nif,
        "pais": f.pais,
        "conta": conta,
        "categoria_conta": svc_com.categoria_do_terceiro(f),
    }


@router.patch("/fornecedores/{fornecedor_id}", dependencies=[GERIR])
def actualizar_fornecedor(
    request: Request, fornecedor_id: UUID, dados: FornecedorAtualizar,
    empresa: EmpresaAtual, db: DB,
) -> dict:
    f = obter_da_empresa(db, Terceiro, fornecedor_id, empresa.id,
                         nome="Fornecedor")
    if f.tipo != "fornecedor":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fornecedor não encontrado.")
    aplicar(f, dados)
    db.commit()
    db.refresh(f)
    return {"id": f.id, "numero": f.numero, "nome": f.nome, "estado": f.estado}


@router.delete("/fornecedores/{fornecedor_id}",
               status_code=status.HTTP_204_NO_CONTENT, dependencies=[GERIR])
def remover_fornecedor(fornecedor_id: UUID, empresa: EmpresaAtual, db: DB) -> None:
    """Um fornecedor com compras não se apaga."""
    from src.db.models.comercial import Compra

    f = obter_da_empresa(db, Terceiro, fornecedor_id, empresa.id,
                         nome="Fornecedor")
    if f.tipo != "fornecedor":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fornecedor não encontrado.")
    recusar_se_usado(
        db,
        [(select(Compra.id).where(Compra.fornecedor_id == f.id),
          "documentos de compra")],
        o_que=f"O fornecedor {f.numero}",
    )
    db.delete(f)
    db.commit()


@router.get("/documentos")
def documentos_disponiveis(empresa: EmpresaAtual, db: DB) -> list[dict]:
    """Tipos de documento de compra — os documentos do diário de entradas."""
    return [
        {"codigo": d.codigo, "descricao": d.descricao, "diario_codigo": d.diario_codigo}
        for d in svc.documentos_compra(db, empresa.id)
    ]


@router.get("")
def listar_compras(
    empresa: EmpresaAtual,
    db: DB,
    estado: str | None = None,
    procura: str | None = None,
    fornecedor_id: UUID | None = None,
    de: Date | None = None,
    ate: Date | None = None,
    valor_min: Decimal | None = None,
    valor_max: Decimal | None = None,
    offset: int = 0,
    limite: int = LIMITE_OMISSAO,
) -> dict:
    """Compras, uma página de cada vez.

    `{linhas, total, offset, limite}`. O ecrã pedia mil de uma vez e mostrava
    quarenta — os outros novecentos e sessenta atravessavam a rede para
    ninguém os ler.
    """
    q = select(Compra).where(Compra.empresa_id == empresa.id)
    if estado:
        q = q.where(Compra.estado == estado)
    if procura and procura.strip():
        termo = f"%{procura.strip()}%"
        q = q.where(
            or_(
                Compra.numero.ilike(termo),
                Compra.fornecedor_nome.ilike(termo),
                Compra.documento_nome.ilike(termo),
            )
        )
    # Os filtros do separador «Consultas» do Piloto: fornecedor, intervalo de
    # datas e intervalo de valor. Vão ao servidor porque a lista é paginada —
    # filtrar o que já veio procurava dentro de vinte e cinco linhas.
    if fornecedor_id is not None:
        q = q.where(Compra.fornecedor_id == fornecedor_id)
    if de is not None:
        q = q.where(Compra.data >= de)
    if ate is not None:
        q = q.where(Compra.data <= ate)
    if valor_min is not None:
        q = q.where(Compra.total >= valor_min)
    if valor_max is not None:
        q = q.where(Compra.total <= valor_max)

    return pagina(
        db,
        q.order_by(Compra.data.desc(), Compra.criado_em.desc()),
        offset=offset,
        limite=limite,
        formatar=lambda c: {
            "id": c.id, "numero": c.numero,
            "documento_codigo": c.documento_codigo,
            "documento_nome": c.documento_nome, "data": c.data,
            "fornecedor_id": c.fornecedor_id,
            "fornecedor_nome": c.fornecedor_nome,
            "subtotal": c.subtotal, "iva": c.iva, "total": c.total,
            "estado": c.estado,
        },
    )


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_compra(
    request: Request, dados: CompraEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    linhas = [l.model_dump() for l in dados.linhas]
    t = svc.calc_totais_compra(linhas, dados.iva_perc)

    fornecedor_nome = dados.fornecedor_nome
    if dados.fornecedor_id:
        f = db.get(Terceiro, dados.fornecedor_id)
        if f is None or f.empresa_id != empresa.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Fornecedor não encontrado.")
        fornecedor_nome = f.nome

    c = Compra(
        empresa_id=empresa.id, data=dados.data,
        documento_codigo=dados.documento_codigo, fornecedor_id=dados.fornecedor_id,
        fornecedor_nome=fornecedor_nome, armazem_id=dados.armazem_id,
        iva_perc=dados.iva_perc, subtotal=t["subtotal"], iva=t["iva"],
        total=t["total"], estado="rascunho",
        linhas=[
            CompraLinha(
                ordem=i, artigo_id=l["artigo_id"], descricao=l["descricao"],
                unidade=l["unidade"], qtd=l["qtd"], preco=l["preco"],
                total=Decimal(str(l["qtd"])) * Decimal(str(l["preco"])),
            )
            for i, l in enumerate(linhas)
        ],
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "estado": c.estado, "total": c.total}


@router.post("/{compra_id}/emitir", dependencies=[GERIR])
def emitir_compra(
    request: Request, compra_id: UUID, dados: EmitirPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    """Emite a compra: cada linha entra em armazém, e é essa entrada que
    contabiliza a factura do fornecedor."""
    c = _compra(db, empresa.id, compra_id)
    r = svc.emitir_compra(
        db, empresa_id=empresa.id, compra=c, exercicio_id=dados.exercicio_id
    )
    db.commit()
    return r


@router.delete("/{compra_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[GERIR])
def remover_compra(
    request: Request, compra_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    c = _compra(db, empresa.id, compra_id)
    if c.estado == "emitida":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Uma compra emitida já movimentou stock e contabilidade — não pode "
            "ser eliminada.",
        )
    db.delete(c)
    db.commit()


@router.get("/resumo")
def resumo(empresa: EmpresaAtual, db: DB) -> dict:
    return svc.resumo_compras(db, empresa_id=empresa.id)
