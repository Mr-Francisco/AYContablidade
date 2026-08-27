"""Imobilizados: ficha de activos e amortizações.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from src.api.deps import DB, EmpresaAtual, UtilizadorAtual, exigir_cap
from src.db.models.imobilizados import (
    Ativo,
    ItemImobilizado,
    ProcessoAmortizacao,
)
from src.services import imobilizados as svc
from src.services.contabilidade import ErroContabilistico
from src.services.auditoria import auditar

router = APIRouter(
    prefix="/api/imobilizados",
    tags=["imobilizados"],
    dependencies=[Depends(exigir_cap("imob.ver"))],
)

GERIR = Depends(exigir_cap("imob.gerir"))


class AtivoEntrada(BaseModel):
    designacao: str = Field(min_length=1, max_length=300)
    codigo: str | None = None
    conta_imob: str | None = None
    conta_amort_acum: str | None = None
    conta_custo_amort: str | None = None
    data_aquisicao: Date | None = None
    valor_aquisicao: Decimal = Decimal("0")
    taxa: Decimal = Decimal("0")
    metodo: str = Field(default="quotas", pattern="^(quotas|degressivas)$")
    amort_acumulada: Decimal = Decimal("0")
    fornecedor: str | None = None
    estado: str = "activo"

    #: `corporeo` | `incorporeo` | `financeiro`. Decide as contas.
    tipo_imobilizado: str | None = Field(default=None, max_length=20)
    #: Um activo que não amortiza — os terrenos são o exemplo.
    nao_amortizavel: bool = False
    #: Condições especiais, o que dizem, e sobre que valor a amortização incide.
    condicoes_especiais: bool = False
    condicoes_texto: str | None = None
    valor_sujeito_amortizacao: Decimal | None = None
    #: Nasce em curso — acumula itens e não amortiza até ser transferido.
    em_curso: bool = False

    @field_validator("tipo_imobilizado")
    @classmethod
    def _tipo_conhecido(cls, v: str | None) -> str | None:
        """Recusa um tipo que não exista, em vez de o guardar.

        Guardado tal e qual, um tipo inventado não dava erro: o activo ficava
        sem conta em curso e sem classe de destino, e só ao fechar a obra é que
        alguém descobria — com a obra pronta e o dinheiro gasto.
        """
        if v is None or not v.strip():
            return None
        limpo = v.strip().lower()
        if limpo not in svc.TIPOS_IMOBILIZADO:
            raise ValueError(
                "Tipo de imobilizado desconhecido. Escolha corpóreo, "
                "incorpóreo ou investimento financeiro."
            )
        return limpo


class ItemEntrada(BaseModel):
    """Um custo somado a um imobilizado em curso."""

    data: Date
    descricao: str = Field(min_length=1, max_length=300)
    valor: Decimal
    fornecedor: str | None = Field(default=None, max_length=200)
    documento: str | None = Field(default=None, max_length=60)


class FecharPedido(BaseModel):
    """O fecho da obra e a transferência para o património."""

    #: A conta de imobilizado de destino — dentro de `11`, `12` ou `13`,
    #: conforme o tipo do activo.
    conta_destino: str = Field(min_length=1, max_length=20)
    data: Date
    exercicio_id: UUID | None = None


class ProcessarPedido(BaseModel):
    exercicio_id: UUID
    mes: str = Field(min_length=1, max_length=2)
    data: Date


def _ativo(db: DB, empresa_id: UUID, ativo_id: UUID) -> Ativo:
    a = db.scalar(
        select(Ativo).where(Ativo.id == ativo_id, Ativo.empresa_id == empresa_id)
    )
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Activo não encontrado.")
    return a


class ConfigImob(BaseModel):
    """Diário e documento usados ao lançar as amortizações."""

    diario: str = Field(min_length=1, max_length=10)
    documento: str = Field(min_length=1, max_length=10)


@router.get("/config")
def obter_config(empresa: EmpresaAtual, db: DB) -> dict:
    """O diário e o documento com que as amortizações são lançadas.

    Estavam a ser lidos do `parametrizacoes.imob` da empresa e não havia
    maneira de os ver nem de os mudar sem ir às Configurações gerais — o
    Piloto tem-nos aqui, ao lado do botão que processa, que é onde interessam.
    """
    return svc.cfg_imob(db, empresa.id)


@router.put("/config", dependencies=[GERIR])
def gravar_config(
    request: Request, dados: ConfigImob, empresa: EmpresaAtual,
    user: UtilizadorAtual, db: DB,
) -> dict:
    """Grava o diário e o documento das amortizações.

    Não valida se o diário existe: o lançamento é que recusa, com a mensagem
    do plano. Validar aqui duplicaria a regra em dois sítios, e é a do
    lançamento que manda.
    """
    from src.db.models.tenancy import ConfigEmpresa

    cfg = db.scalar(
        select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa.id)
    )
    if cfg is None:
        cfg = ConfigEmpresa(
            empresa_id=empresa.id, modulos={}, parametrizacoes={}, agt={}
        )
        db.add(cfg)
        db.flush()

    # Cópia e reatribuição: o SQLAlchemy não dá pela alteração de um JSONB
    # mexido no sítio, e a gravação passava sem gravar nada.
    params = dict(cfg.parametrizacoes or {})
    params["imob"] = {"diario": dados.diario, "documento": dados.documento}
    cfg.parametrizacoes = params

    auditar(
        db, actor=user, accao="imobilizado.config", request=request,
        alvo_tipo="empresa", alvo_id=empresa.id, alvo_desc=empresa.nome,
        empresa_id=empresa.id, detalhes=params["imob"],
    )
    db.commit()
    return svc.cfg_imob(db, empresa.id)


@router.get("/metodos")
def metodos() -> list[dict]:
    return [{"cod": c, "nome": n} for c, n in svc.METODOS]


@router.get("/fornecedores/tabela")
def tabela_de_fornecedores(
    empresa: EmpresaAtual, db: DB, procura: str = "", limite: int = 50
) -> list[dict]:
    """Os fornecedores, para o F4 da ficha do bem e das obras em curso.

    A MESMA TABELA QUE AS COMPRAS LEEM, exposta aqui com `imob.ver`. Estava
    só na Logística, e quem regista imobilizado é o contabilista, que não tem
    acesso a essa área: o campo do fornecedor ficava vazio e sem forma de o
    preencher. Só lê — quem cria fornecedores continua a precisar da sua
    própria permissão.
    """
    from src.services import terceiros as svc_terceiros

    return svc_terceiros.tabela_de_fornecedores(db, empresa.id, procura, limite)


@router.get("/ativos")
def listar_ativos(empresa: EmpresaAtual, db: DB, so_ativos: bool = False) -> list[dict]:
    q = select(Ativo).where(Ativo.empresa_id == empresa.id)
    if so_ativos:
        q = q.where(Ativo.estado == "activo")
    ativos = db.scalars(q.order_by(Ativo.codigo)).all()

    # O QUE CADA OBRA JA CUSTOU, NUMA CONSULTA SO.
    #
    # O separador dos Imobilizados em Curso corre a lista das obras e precisa,
    # em cada linha, do acumulado e de quantas despesas o formam. Ir busca-los
    # ficha a ficha eram duas consultas por linha - com trinta obras, sessenta
    # idas a base de dados para desenhar uma tabela. Aqui e uma soma agrupada.
    #
    # So para as que estao em curso: uma ficha ja fechada tem o valor no
    # `valor_aquisicao`, que e o que a transferencia la pos.
    ids_em_curso = [a.id for a in ativos if a.em_curso]
    somas: dict = {}
    if ids_em_curso:
        somas = {
            linha.ativo_id: (linha.total, linha.quantos)
            for linha in db.execute(
                select(
                    ItemImobilizado.ativo_id,
                    func.coalesce(func.sum(ItemImobilizado.valor), 0).label("total"),
                    func.count(ItemImobilizado.id).label("quantos"),
                )
                .where(ItemImobilizado.ativo_id.in_(ids_em_curso))
                .group_by(ItemImobilizado.ativo_id)
            ).all()
        }

    return [
        {"id": a.id, "codigo": a.codigo, "designacao": a.designacao,
         "conta_imob": a.conta_imob, "conta_amort_acum": a.conta_amort_acum,
         "conta_custo_amort": a.conta_custo_amort,
         "data_aquisicao": a.data_aquisicao, "valor_aquisicao": a.valor_aquisicao,
         "taxa": a.taxa, "metodo": a.metodo, "amort_acumulada": a.amort_acumulada,
         "valor_liquido": svc.valor_liquido(a),
         "amort_anual": svc.amort_anual(a), "amort_mensal": svc.amort_mensal(a),
         "percent_amortizado": svc.percent_amortizado(a),
         "fornecedor": a.fornecedor, "estado": a.estado,
         "tipo_imobilizado": a.tipo_imobilizado,
         "nao_amortizavel": a.nao_amortizavel,
         "condicoes_especiais": a.condicoes_especiais,
         "condicoes_texto": a.condicoes_texto,
         "valor_sujeito_amortizacao": a.valor_sujeito_amortizacao,
         "base_amortizavel": svc.base_amortizavel(a),
         "em_curso": a.em_curso, "fechado_em": a.fechado_em,
         "conta_destino": a.conta_destino,
         "valor_acumulado": somas.get(a.id, (0, 0))[0] if a.em_curso else None,
         "itens": somas.get(a.id, (0, 0))[1] if a.em_curso else None}
        for a in ativos
    ]


@router.post("/ativos", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_ativo(
    request: Request, dados: AtivoEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    a = Ativo(
        empresa_id=empresa.id,
        codigo=dados.codigo or svc.proximo_codigo(db, empresa.id),
        **dados.model_dump(exclude={"codigo"}),
    )
    db.add(a)
    db.flush()

    # CADA FICHA EM CURSO É UMA CONTA, criada já e não à primeira despesa.
    #
    # É o que foi pedido: `141001 Computador X`, `141002 Computador Y`. Sem
    # conta própria, todas as obras somavam no mesmo saldo da conta-mãe e, ao
    # fechar uma, era preciso adivinhar que parte lhe pertencia.
    #
    # A ficha grava-se na mesma se a conta falhar — uma conta em falta no plano
    # não pode impedir alguém de registar o bem que comprou. O aviso vai no
    # resultado, e a conta é criada quando a causa estiver resolvida.
    aviso = None
    if a.em_curso:
        try:
            svc.conta_em_curso_do_ativo(db, empresa.id, a, svc.cfg_imob(db, empresa.id))
        except ErroContabilistico as e:
            aviso = str(e)

    db.commit()
    db.refresh(a)
    return {
        "id": a.id,
        "codigo": a.codigo,
        "designacao": a.designacao,
        "conta_imob": a.conta_imob,
        "aviso": aviso,
    }


@router.patch("/ativos/{ativo_id}", dependencies=[GERIR])
def atualizar_ativo(
    request: Request, ativo_id: UUID, dados: AtivoEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    a = _ativo(db, empresa.id, ativo_id)
    for campo, valor in dados.model_dump(exclude_unset=True, exclude={"codigo"}).items():
        setattr(a, campo, valor)
    db.flush()

    # A conta também aqui: uma ficha que passe a estar em curso, ou que só
    # agora receba o tipo, precisa da sua conta tanto como uma ficha nova.
    aviso = None
    if a.em_curso and not a.conta_imob:
        try:
            svc.conta_em_curso_do_ativo(db, empresa.id, a, svc.cfg_imob(db, empresa.id))
        except ErroContabilistico as e:
            aviso = str(e)

    db.commit()
    return {"id": a.id, "codigo": a.codigo, "conta_imob": a.conta_imob, "aviso": aviso}


@router.delete("/ativos/{ativo_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[GERIR])
def remover_ativo(
    request: Request, ativo_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    db.delete(_ativo(db, empresa.id, ativo_id))
    db.commit()


# ---------------------------------------------------------------------------
# Imobilizado em curso: itens, fecho e transferência
# ---------------------------------------------------------------------------
@router.get("/ativos/{ativo_id}/itens")
def listar_itens(ativo_id: UUID, empresa: EmpresaAtual, db: DB) -> dict:
    """Os custos já somados a esta obra, e o total.

    O TOTAL VEM DAQUI e não se soma no ecrã: quem some no ecrã soma o que está
    na página, e uma obra com quarenta itens paginados mostraria um acumulado
    que não é o acumulado.
    """
    a = _ativo(db, empresa.id, ativo_id)
    itens = db.scalars(
        select(ItemImobilizado)
        .where(ItemImobilizado.ativo_id == a.id)
        .order_by(ItemImobilizado.data, ItemImobilizado.criado_em)
    ).all()
    return {
        "linhas": [
            {
                "id": i.id, "data": i.data, "descricao": i.descricao,
                "valor": i.valor, "fornecedor": i.fornecedor,
                "documento": i.documento,
            }
            for i in itens
        ],
        "total": svc.valor_acumulado(db, a),
        "em_curso": a.em_curso,
    }


@router.post(
    "/ativos/{ativo_id}/itens",
    status_code=status.HTTP_201_CREATED,
    dependencies=[GERIR],
)
def acrescentar_item(
    ativo_id: UUID, dados: ItemEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    """Soma um custo à obra.

    SÓ ENQUANTO ESTIVER EM CURSO. Depois de transferida, o activo já foi
    valorizado e já pode estar a amortizar — acrescentar-lhe um custo mudava um
    valor de aquisição sobre o qual já se calcularam amortizações.
    """
    a = _ativo(db, empresa.id, ativo_id)
    if not a.em_curso:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Esta obra já foi fechada e transferida para o património. Para "
            "corrigir o valor do activo, use a ficha do imobilizado.",
        )
    if Decimal(dados.valor) <= 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "O valor do item tem de ser maior do que zero.",
        )

    item = ItemImobilizado(
        empresa_id=empresa.id,
        ativo_id=a.id,
        data=dados.data,
        descricao=dados.descricao.strip(),
        valor=Decimal(dados.valor),
        fornecedor=(dados.fornecedor or "").strip() or None,
        documento=(dados.documento or "").strip() or None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id, "data": item.data, "descricao": item.descricao,
        "valor": item.valor, "total": svc.valor_acumulado(db, a),
    }


@router.delete(
    "/ativos/{ativo_id}/itens/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[GERIR],
)
def remover_item(
    ativo_id: UUID, item_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    a = _ativo(db, empresa.id, ativo_id)
    if not a.em_curso:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Esta obra já foi fechada. Os itens de uma obra transferida não se "
            "apagam — o valor já passou para o património.",
        )
    item = db.scalar(
        select(ItemImobilizado).where(
            ItemImobilizado.id == item_id,
            ItemImobilizado.ativo_id == a.id,
            ItemImobilizado.empresa_id == empresa.id,
        )
    )
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item não encontrado.")
    db.delete(item)
    db.commit()


@router.post("/ativos/{ativo_id}/fechar", dependencies=[GERIR])
def fechar(
    ativo_id: UUID, dados: FecharPedido, empresa: EmpresaAtual,
    quem: UtilizadorAtual, db: DB,
) -> dict:
    """Fecha a obra e transfere-a para o património.

    O lançamento nasce DIFERIDO: existe e fica visível, mas só conta no
    balancete quando a contabilidade o integrar.
    """
    a = _ativo(db, empresa.id, ativo_id)
    try:
        r = svc.fechar_e_transferir(
            db,
            empresa_id=empresa.id,
            ativo=a,
            conta_destino=dados.conta_destino,
            data=dados.data,
            exercicio_id=dados.exercicio_id,
            por=quem.nome,
        )
    except ErroContabilistico as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    db.commit()
    return r


@router.get("/mapa")
def mapa(empresa: EmpresaAtual, db: DB, so_ativos: bool = False) -> dict:
    """Mapa anual de amortizações."""
    return svc.mapa(db, empresa_id=empresa.id, so_ativos=so_ativos)


@router.get("/mapa-periodo")
def mapa_periodo(
    empresa: EmpresaAtual, db: DB, exercicio_id: UUID, mes: str,
    so_ativos: bool = False,
) -> dict:
    """Mapa do período: valor já processado, ou o valor a processar."""
    return svc.mapa_periodo(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, mes=mes,
        so_ativos=so_ativos,
    )


@router.get("/processos")
def listar_processos(
    empresa: EmpresaAtual, db: DB, exercicio_id: UUID | None = None
) -> list[dict]:
    q = select(ProcessoAmortizacao).where(ProcessoAmortizacao.empresa_id == empresa.id)
    if exercicio_id:
        q = q.where(ProcessoAmortizacao.exercicio_id == exercicio_id)
    return [
        {"id": p.id, "exercicio_id": p.exercicio_id, "mes": p.mes, "data": p.data,
         "total_amort": p.total_amort, "itens": len(p.itens or []), "por": p.por,
         "criado_em": p.criado_em}
        for p in db.scalars(q.order_by(ProcessoAmortizacao.mes)).all()
    ]


@router.post("/processos", dependencies=[GERIR])
def processar(
    request: Request,
    dados: ProcessarPedido,
    empresa: EmpresaAtual,
    user: UtilizadorAtual,
    db: DB,
) -> dict:
    """Processa a amortização do período. Recusa períodos já processados —
    reabre primeiro."""
    r = svc.processar_periodo(
        db, empresa_id=empresa.id, exercicio_id=dados.exercicio_id, mes=dados.mes,
        data=dados.data, por=user.nome,
    )
    db.commit()
    return r


@router.delete("/processos", dependencies=[GERIR])
def reabrir(
    request: Request, exercicio_id: UUID, mes: str, empresa: EmpresaAtual, db: DB
) -> dict:
    """Desfaz o processamento: repõe as acumuladas e remove os lançamentos."""
    r = svc.reabrir_periodo(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, mes=mes
    )
    db.commit()
    return {"reaberto": r}
