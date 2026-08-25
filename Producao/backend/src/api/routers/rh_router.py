"""Recursos Humanos: pessoal, processamento, pagamentos e honorários.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select

from src.api.deps import DB, EmpresaAtual, exigir_cap, exigir_perfil
from src.api.paginacao import LIMITE_OMISSAO, pagina
from src.core.constants import Perfil
from src.core.rh import IRPS_INFO, SUBS_NAO_SUJEITOS, SUBS_SUJEITOS
from src.db.models.tenancy import Exercicio
from src.db.models.rh import (
    AlteracaoMensal,
    Colaborador,
    Honorario,
    Independente,
    MapaIrtLinha,
    PagamentoSalarial,
    ProcessamentoSalarial,
)
from src.services import rh as svc

router = APIRouter(
    prefix="/api/rh",
    tags=["recursos humanos"],
    dependencies=[Depends(exigir_cap("rh.ver"))],
)

GERIR = Depends(exigir_cap("rh.gerir"))


# ---------------------------------------------------------------------------
# Esquemas
# ---------------------------------------------------------------------------
class ColaboradorEntrada(BaseModel):
    """A ficha do Piloto, inteira — os oito separadores.

    IDENTIFICAÇÃO OBRIGATÓRIA: um trabalhador tem de ser identificável perante
    a AGT e a Segurança Social. Exige-se o NIF **ou** o número do documento —
    e um contacto, porque uma ficha sem forma de contactar a pessoa é uma ficha
    incompleta no dia em que faz falta. A validação está no `model_validator`,
    e não só no ecrã: o ecrã ajuda, mas quem garante é o servidor.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    nome: str = Field(min_length=1, max_length=200)
    numero: str | None = Field(default=None, max_length=20)

    # ---- Identificação ----
    nome_abreviado: str | None = None
    genero: str | None = None
    data_nascimento: Date | None = None
    nacionalidade: str | None = None
    naturalidade: str | None = None
    morada: str | None = None
    localidade: str | None = None
    codigo_postal: str | None = None
    pais: str | None = None
    provincia: str | None = None
    municipio: str | None = None
    comuna: str | None = None
    email: str | None = None
    telefone: str | None = None
    telemovel: str | None = None

    # ---- Documentos ----
    tipo_documento: str | None = None
    num_documento: str | None = None
    validade_documento: Date | None = None

    # ---- Dados fiscais ----
    nif: str | None = None
    num_ss: str | None = None
    estado_civil: str | None = None
    dependentes: int = 0
    regime_irt: str | None = None

    # ---- Contrato ----
    categoria: str | None = None
    tipo_contrato: str | None = None
    data_admissao: Date | None = None
    data_fim: Date | None = None

    # ---- Processamento ----
    salario_base: Decimal = Decimal("0")
    subsidios: Decimal = Decimal("0")
    subs_nao_sujeitos: Decimal = Decimal("0")
    estado: str = "activo"

    # ---- Pagamento ----
    forma_pagamento: str | None = None
    banco: str | None = None
    iban: str | None = None

    # ---- Subsídios e férias ----
    dias_ferias: int = 22
    subsidio_ferias: Decimal = Decimal("0")
    #: Em percentagem do salário base, em alternativa ao valor em kwanzas.
    #: Dado isto, o valor é calculado aqui — ver `_subsidio_de_ferias`.
    subsidio_ferias_perc: Decimal | None = Field(default=None, ge=0, le=100)
    subsidio_natal: Decimal = Decimal("0")

    # ---- Habilitações ----
    habilitacoes: str | None = None
    notas: str | None = None

    @model_validator(mode="after")
    def _subsidio_de_ferias(self):
        """Percentagem do salário base, quando é assim que se calcula.

        O valor em kwanzas continua a ser o que o processamento lê. Calcular
        aqui — e não no motor de cálculo — é o que faz esta alteração não tocar
        em nenhuma regra contabilística: para tudo o que vem a jusante, o
        subsídio continua a ser um número escrito na ficha.
        """
        if self.subsidio_ferias_perc is not None and self.subsidio_ferias_perc > 0:
            self.subsidio_ferias = (
                self.salario_base * self.subsidio_ferias_perc / 100
            ).quantize(Decimal("0.01"))
        return self

    @model_validator(mode="after")
    def _ficha_completa(self):
        """O que uma ficha tem de ter para o colaborador ser processável.

        NÃO É UMA LISTA DE PREFERÊNCIAS. Cada um destes campos é exigido por
        alguma coisa a jusante, e sem ele o que falha é o processamento ou uma
        declaração — mais tarde, e a quem não teve nada que ver com o
        preenchimento:

        - **NIF**, **nome**, **nº de Segurança Social**, **província** e
          **município**: são cinco das catorze colunas do Mapa de
          Remunerações (Modelo IRT A2.1). Sem elas o mapa sai incompleto e a
          AGT recusa o ficheiro.
        - **Salário base**: sem ele não há folha; um colaborador a zero entra
          no processamento e sai com líquido zero, sem ninguém reparar.
        - **Morada** e **localidade**: identificam o trabalhador nos mapas e
          nos recibos.

        A verificação está aqui, no servidor, e não só no ecrã: um formulário
        ajuda quem o usa, mas quem garante é quem grava.
        """
        obrigatorios = [
            ("nome", self.nome, "o nome"),
            ("nif", self.nif, "o NIF"),
            ("num_ss", self.num_ss, "o nº de Segurança Social (INSS)"),
            ("provincia", self.provincia, "a província"),
            ("municipio", self.municipio, "o município"),
            ("morada", self.morada, "a morada"),
            ("localidade", self.localidade, "a localidade"),
        ]
        em_falta = [
            rotulo for _, valor, rotulo in obrigatorios if not (valor or "").strip()
        ]
        if em_falta:
            lista = ", ".join(em_falta[:-1])
            ultimo = em_falta[-1]
            faltam = f"{lista} e {ultimo}" if lista else ultimo
            raise ValueError(
                f"Falta preencher {faltam}. São campos exigidos pelo Mapa de "
                "Remunerações e pelo processamento salarial."
            )

        if self.salario_base <= 0:
            raise ValueError(
                "O salário base tem de ser maior do que zero — sem ele o "
                "colaborador entra no processamento e sai com líquido zero."
            )

        if not (self.telefone or self.telemovel or self.email):
            raise ValueError(
                "Indique pelo menos um contacto: telefone, telemóvel ou "
                "e-mail."
            )
        return self


class AlteracaoEntrada(BaseModel):
    mes: str = Field(min_length=7, max_length=7, description="AAAA-MM")
    faltas: Decimal = Decimal("0")
    abonos: list[dict] = Field(default_factory=list)
    descontos: list[dict] = Field(default_factory=list)


class SimulacaoAlteracao(BaseModel):
    """As variáveis do mês por gravar — para ver o líquido antes de decidir."""

    colaborador_id: UUID
    faltas: Decimal = Decimal("0")
    abonos: list[dict] = Field(default_factory=list)
    descontos: list[dict] = Field(default_factory=list)


class SimulacaoSalario(BaseModel):
    """Dois números, sem ficha nenhuma — o simulador do Piloto."""

    salario_base: Decimal = Decimal("0")
    subsidios: Decimal = Decimal("0")


class ProcessarPedido(BaseModel):
    mes: str = Field(min_length=7, max_length=7)
    data: Date | None = None
    exercicio_id: UUID | None = None


class PagarPedido(BaseModel):
    mes: str = Field(min_length=7, max_length=7)
    conta: str | None = None
    data: Date | None = None
    exercicio_id: UUID | None = None


class IndependenteEntrada(BaseModel):
    nome: str = Field(min_length=1, max_length=200)
    nif: str | None = None
    atividade: str | None = None
    taxa_ret: Decimal = Decimal("6.5")
    estado: str = "activo"


class HonorarioPedido(BaseModel):
    independente_id: UUID
    valor: Decimal
    data: Date | None = None
    mes: str | None = None
    descricao: str | None = None
    ref: str | None = None
    exercicio_id: UUID | None = None


class MapaIrtEntrada(BaseModel):
    mes: str = Field(min_length=7, max_length=7)
    valores: dict[str, Decimal] = Field(default_factory=dict)
    calc_manual_excesso: bool = False
    excesso_subsidios_nao_sujeitos: Decimal = Decimal("0")
    registo_manual_ss: bool = False
    base_tributavel_ss_manual: Decimal = Decimal("0")
    nao_sujeito_ss: bool = False
    isento_irt: bool = False


def _colab(db: DB, empresa_id: UUID, colaborador_id: UUID) -> Colaborador:
    c = db.scalar(
        select(Colaborador).where(
            Colaborador.id == colaborador_id, Colaborador.empresa_id == empresa_id
        )
    )
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Colaborador não encontrado.")
    return c


def _proximo_numero(db: DB, empresa_id: UUID) -> str:
    numeros = db.scalars(
        select(Colaborador.numero).where(Colaborador.empresa_id == empresa_id)
    ).all()
    maximo = max((int(n) for n in numeros if n and n.isdigit()), default=0)
    return f"{maximo + 1:03d}"


def _numero_livre(
    db: DB, empresa_id: UUID, numero: str, excepto: UUID | None = None
) -> None:
    """O número é único por empresa. Chocar dava um 500 sem explicação."""
    q = select(Colaborador.id).where(
        Colaborador.empresa_id == empresa_id, Colaborador.numero == numero
    )
    if excepto is not None:
        q = q.where(Colaborador.id != excepto)
    if db.scalar(q) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Já existe um colaborador com o número {numero}.",
        )


# ---------------------------------------------------------------------------
# Colaboradores
# ---------------------------------------------------------------------------
def _colaborador_publico(c: Colaborador) -> dict:
    """A ficha toda.

    Devolvia-se metade dos campos, e abrir um colaborador para alterar trazia o
    formulário com o resto em branco — gravar por cima apagava-o. Devolver tudo
    o que se pode gravar é a única forma de a ficha ser reversível.
    """
    return {
        "id": c.id, "numero": c.numero, "nome": c.nome, "estado": c.estado,
        "nome_abreviado": c.nome_abreviado, "genero": c.genero,
        "data_nascimento": c.data_nascimento, "nacionalidade": c.nacionalidade,
        "naturalidade": c.naturalidade, "morada": c.morada,
        "localidade": c.localidade, "codigo_postal": c.codigo_postal,
        "pais": c.pais, "provincia": c.provincia, "municipio": c.municipio,
        "comuna": c.comuna, "email": c.email, "telefone": c.telefone,
        "telemovel": c.telemovel,
        "tipo_documento": c.tipo_documento, "num_documento": c.num_documento,
        "validade_documento": c.validade_documento,
        "nif": c.nif, "num_ss": c.num_ss, "estado_civil": c.estado_civil,
        "dependentes": c.dependentes, "regime_irt": c.regime_irt,
        "categoria": c.categoria, "tipo_contrato": c.tipo_contrato,
        "data_admissao": c.data_admissao, "data_fim": c.data_fim,
        "salario_base": c.salario_base, "subsidios": c.subsidios,
        "subs_nao_sujeitos": c.subs_nao_sujeitos,
        "forma_pagamento": c.forma_pagamento, "banco": c.banco, "iban": c.iban,
        "dias_ferias": c.dias_ferias, "subsidio_ferias": c.subsidio_ferias,
        "subsidio_ferias_perc": c.subsidio_ferias_perc,
        "subsidio_natal": c.subsidio_natal,
        "habilitacoes": c.habilitacoes, "notas": c.notas,
    }


@router.get("/colaboradores/tabela")
def tabela_de_colaboradores(
    empresa: EmpresaAtual, db: DB, procura: str = "", limite: int = 50
) -> list[dict]:
    """A tabela de colaboradores, para o F4 do RH e do mapa de remunerações.

    Só os ACTIVOS por omissão: quem processa salários deste mês não quer ver
    quem saiu no ano passado a meio da lista.
    """
    from sqlalchemy import or_ as _ou

    from src.db.models.rh import Colaborador

    q = select(Colaborador).where(
        Colaborador.empresa_id == empresa.id, Colaborador.estado == "activo"
    )
    if procura.strip():
        termo = f"%{procura.strip()}%"
        q = q.where(_ou(Colaborador.nome.ilike(termo), Colaborador.numero.ilike(termo)))
    return [
        {
            "id": str(c.id),
            "codigo": c.numero,
            "nome": c.nome,
            "detalhe": str(c.salario_base or ""),
        }
        for c in db.scalars(q.order_by(Colaborador.numero).limit(limite)).all()
    ]


@router.get("/independentes/tabela")
def tabela_de_independentes(
    empresa: EmpresaAtual, db: DB, procura: str = "", limite: int = 50
) -> list[dict]:
    """Os trabalhadores independentes, para o F4 do processamento de honorarios.

    So os ACTIVOS: quem processa um honorario deste mes nao quer escolher entre
    prestadores que ja nao trabalham com a empresa.
    """
    from sqlalchemy import or_ as _ou

    from src.db.models.rh import Independente

    q = select(Independente).where(
        Independente.empresa_id == empresa.id, Independente.estado == "activo"
    )
    if procura.strip():
        termo = f"%{procura.strip()}%"
        q = q.where(_ou(Independente.nome.ilike(termo), Independente.nif.ilike(termo)))
    return [
        {
            "id": str(i.id),
            "codigo": i.nif or "",
            "nome": i.nome,
            # A taxa de retencao e o que distingue um prestador de outro na
            # hora de escolher: e ela que decide o liquido a pagar.
            "detalhe": f"{i.taxa_ret} %" + (f" · {i.atividade}" if i.atividade else ""),
        }
        for i in db.scalars(q.order_by(Independente.nome).limit(limite)).all()
    ]


@router.get("/colaboradores")
def listar_colaboradores(
    empresa: EmpresaAtual, db: DB, so_ativos: bool = False
) -> list[dict]:
    q = select(Colaborador).where(Colaborador.empresa_id == empresa.id)
    if so_ativos:
        q = q.where(Colaborador.estado == "activo")
    return [
        _colaborador_publico(c)
        for c in db.scalars(q.order_by(Colaborador.numero)).all()
    ]


@router.post("/colaboradores", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_colaborador(
    request: Request, dados: ColaboradorEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    if dados.numero:
        _numero_livre(db, empresa.id, dados.numero)
    c = Colaborador(
        empresa_id=empresa.id,
        numero=dados.numero or _proximo_numero(db, empresa.id),
        **dados.model_dump(exclude={"numero"}),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "numero": c.numero, "nome": c.nome}


@router.patch("/colaboradores/{colaborador_id}", dependencies=[GERIR])
def atualizar_colaborador(
    request: Request,
    colaborador_id: UUID,
    dados: ColaboradorEntrada,
    empresa: EmpresaAtual,
    db: DB,
) -> dict:
    c = _colab(db, empresa.id, colaborador_id)
    # O número também se altera. Vinha excluído, e quem o corrigisse na ficha
    # via-o voltar ao antigo sem aviso — o mesmo silêncio que já custou caro
    # nos campos dos clientes. Em branco mantém-se o que já lá está.
    if dados.numero and dados.numero != c.numero:
        _numero_livre(db, empresa.id, dados.numero, excepto=c.id)
        c.numero = dados.numero
    for campo, valor in dados.model_dump(exclude_unset=True, exclude={"numero"}).items():
        setattr(c, campo, valor)
    db.commit()
    return {"id": c.id, "nome": c.nome}


@router.delete(
    "/colaboradores/{colaborador_id}", status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[GERIR],
)
def remover_colaborador(
    request: Request, colaborador_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    db.delete(_colab(db, empresa.id, colaborador_id))
    db.commit()


# ---------------------------------------------------------------------------
# Alterações mensais
# ---------------------------------------------------------------------------
@router.get("/alteracoes")
def listar_alteracoes(empresa: EmpresaAtual, db: DB, mes: str) -> list[dict]:
    alts = svc.listar_alteracoes(db, empresa_id=empresa.id, mes=mes)
    return [
        {"id": a.id, "colaborador_id": a.colaborador_id, "mes": a.mes,
         "faltas": a.faltas, "abonos": a.abonos, "descontos": a.descontos}
        for a in alts
    ]


@router.put("/alteracoes/{colaborador_id}", dependencies=[GERIR])
def gravar_alteracao(
    request: Request,
    colaborador_id: UUID,
    dados: AlteracaoEntrada,
    empresa: EmpresaAtual,
    db: DB,
) -> dict:
    _colab(db, empresa.id, colaborador_id)
    # Mês pago é mês fechado. O Piloto só desactivava o botão; o ecrã não é
    # sítio para guardar uma regra destas — alterar as variáveis depois de o
    # dinheiro sair deixava os recibos emitidos a dizer uma coisa e a ficha
    # outra, e ninguém dava por isso.
    if svc.mes_pago(db, empresa.id, dados.mes):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"A folha de {dados.mes} já foi paga. As variáveis desse mês não "
            "podem ser alteradas — corrige-se no mês seguinte.",
        )
    a = svc.guardar_alteracao(
        db, empresa_id=empresa.id, colaborador_id=colaborador_id, mes=dados.mes,
        faltas=dados.faltas, abonos=dados.abonos, descontos=dados.descontos,
    )
    db.commit()
    return {"colaborador_id": colaborador_id, "mes": a.mes, "faltas": a.faltas}


@router.post("/alteracoes/simular")
def simular_alteracao(dados: SimulacaoAlteracao, empresa: EmpresaAtual, db: DB) -> dict:
    """O recibo como ficaria com estas alterações. NÃO grava nada.

    Existe para a janela das alterações poder mostrar o líquido enquanto se
    escreve, sem repetir a fórmula do lado do cliente — a conta do IRT tem
    escalões e parcela fixa, e uma segunda cópia acabaria por divergir.
    """
    c = _colab(db, empresa.id, dados.colaborador_id)
    return svc.recibo_com(
        c,
        cfg=svc.cfg_rh(db, empresa.id),
        faltas=dados.faltas,
        abonos=dados.abonos,
        descontos=dados.descontos,
    )


# ---------------------------------------------------------------------------
# Folha, processamento e pagamento
# ---------------------------------------------------------------------------
@router.get("/folha")
def obter_folha(
    empresa: EmpresaAtual, db: DB, mes: str | None = None, so_ativos: bool = True
) -> dict:
    """Simulação da folha do mês — não grava nem lança nada."""
    return svc.folha(db, empresa_id=empresa.id, mes=mes, so_ativos=so_ativos)


@router.post("/simular-salario")
def simular_salario(
    dados: SimulacaoSalario, empresa: EmpresaAtual, db: DB
) -> dict:
    """«Quanto sobra de um bruto destes?» — o simulador do Piloto.

    Não toca em ficha nenhuma e não grava. A conta é a mesma que processa a
    folha: um simulador que responda outra coisa não serve para simular.
    """
    return svc.recibo_valores(
        salario_base=dados.salario_base,
        subsidios=dados.subsidios,
        cfg=svc.cfg_rh(db, empresa.id),
    )


@router.get("/estado")
def estado_mes(empresa: EmpresaAtual, db: DB, mes: str) -> dict:
    return {"mes": mes, "estado": svc.estado_mes(db, empresa.id, mes)}


@router.get("/processamentos")
def listar_processamentos(
    empresa: EmpresaAtual, db: DB, offset: int = 0, limite: int = LIMITE_OMISSAO
) -> dict:
    """Processamentos, uma página de cada vez.

    Doze por ano parece pouco — mas uma empresa com dez anos de histórico tem
    cento e vinte, e a lista nunca deixa de crescer. A regra não abre excepção
    para listas que crescem devagar; abre para as que não crescem.
    """
    return pagina(
        db,
        select(ProcessamentoSalarial)
        .where(ProcessamentoSalarial.empresa_id == empresa.id)
        .order_by(ProcessamentoSalarial.mes.desc()),
        offset=offset,
        limite=limite,
        formatar=lambda p: {
            "id": p.id, "mes": p.mes, "totais": p.totais, "lancado": p.lancado,
            "lancamento_id": p.lancamento_id, "criado_em": p.criado_em,
        },
    )


@router.post("/processamentos", dependencies=[GERIR])
def processar(
    request: Request, dados: ProcessarPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    r = svc.processar_mes(
        db, empresa_id=empresa.id, mes=dados.mes, data=dados.data,
        exercicio_id=dados.exercicio_id,
    )
    db.commit()
    return r


@router.get("/meses-a-pagar")
def meses_a_pagar(
    empresa: EmpresaAtual, db: DB, offset: int = 0, limite: int = LIMITE_OMISSAO
) -> dict:
    """Os meses processados e o que falta pagar em cada um — a lista do Piloto.

    O ecrã de pagamentos mostrava só os pagamentos JÁ FEITOS. Quem lá entra
    quer o contrário: saber o que está processado e ainda por pagar. Sem isso,
    a única forma de descobrir era experimentar mês a mês no selector.

    Um mês por linha, com o líquido processado, o estado e o lançamento — e o
    valor efectivamente pago quando já houve pagamento (pode diferir do
    processado se a folha foi corrigida entretanto).
    """
    consulta = (
        select(ProcessamentoSalarial)
        .where(ProcessamentoSalarial.empresa_id == empresa.id)
        .order_by(ProcessamentoSalarial.mes.desc())
    )
    # A chave é (exercício, mês) e não só o mês: o período é de dois dígitos,
    # e Agosto de 2026 e de 2027 são o mesmo "08". Foi por isso que o modelo
    # guarda o exercício.
    pagos = {
        (p.exercicio_id, p.mes): p
        for p in db.scalars(
            select(PagamentoSalarial).where(
                PagamentoSalarial.empresa_id == empresa.id
            )
        ).all()
    }
    exercicios = {
        e.id: e.nome
        for e in db.scalars(
            select(Exercicio).where(Exercicio.empresa_id == empresa.id)
        ).all()
    }

    def linha(p: ProcessamentoSalarial) -> dict:
        pago = pagos.get((p.exercicio_id, p.mes))
        return {
            "mes": p.mes,
            "exercicio": exercicios.get(p.exercicio_id),
            "liquido": (p.totais or {}).get("liquido", "0"),
            "estado": "pago" if pago else "processado",
            "valor_pago": pago.valor if pago else None,
            "conta": pago.conta if pago else None,
            "numero_op": pago.numero_op if pago else None,
            "lancamento_id": (pago.lancamento_id if pago else p.lancamento_id),
        }

    return pagina(db, consulta, offset=offset, limite=limite, formatar=linha)


@router.get("/pagamentos")
def listar_pagamentos(
    empresa: EmpresaAtual, db: DB, offset: int = 0, limite: int = LIMITE_OMISSAO
) -> dict:
    return pagina(
        db,
        select(PagamentoSalarial)
        .where(PagamentoSalarial.empresa_id == empresa.id)
        .order_by(PagamentoSalarial.mes.desc()),
        offset=offset,
        limite=limite,
        formatar=lambda p: {
            "id": p.id, "mes": p.mes, "valor": p.valor, "conta": p.conta,
            "lancado": p.lancado, "numero_op": p.numero_op,
        },
    )


@router.get("/resumo-pagamentos")
def resumo_pagamentos(empresa: EmpresaAtual, db: DB) -> dict:
    """Os quatro números do topo do ecrã de pagamentos.

    Vêm do servidor porque a lista passou a ser paginada: somados no cliente,
    o «total pago» passaria a ser o total da PÁGINA — e um total de salários
    que muda quando se carrega em «seguinte» não é um total, é um acidente.

    «Por pagar» é o que foi processado e ainda não tem pagamento: cruza os dois
    conjuntos pelo mês, que é a chave por que a folha se organiza.
    """
    pagos = select(PagamentoSalarial.mes).where(
        PagamentoSalarial.empresa_id == empresa.id
    )
    total_pago, n_pagamentos = db.execute(
        select(
            func.coalesce(func.sum(PagamentoSalarial.valor), 0), func.count()
        ).where(PagamentoSalarial.empresa_id == empresa.id)
    ).one()

    processados = db.scalars(
        select(ProcessamentoSalarial).where(
            ProcessamentoSalarial.empresa_id == empresa.id
        )
    ).all()
    meses_pagos = set(db.scalars(pagos).all())
    por_pagar = sum(
        (
            Decimal(str((p.totais or {}).get("liquido") or 0))
            for p in processados
            if p.mes not in meses_pagos
        ),
        Decimal("0"),
    )

    return {
        "total_pago": total_pago,
        "n_pagamentos": n_pagamentos,
        "meses_processados": len(processados),
        "por_pagar": por_pagar,
    }


@router.post("/pagamentos", dependencies=[GERIR])
def pagar(request: Request, dados: PagarPedido, empresa: EmpresaAtual, db: DB) -> dict:
    r = svc.pagar_mes(
        db, empresa_id=empresa.id, mes=dados.mes, conta=dados.conta,
        data=dados.data, exercicio_id=dados.exercicio_id,
    )
    db.commit()
    return r


# ---------------------------------------------------------------------------
# Independentes e honorários
# ---------------------------------------------------------------------------
@router.get("/independentes")
def listar_independentes(empresa: EmpresaAtual, db: DB) -> list[dict]:
    return [
        {"id": i.id, "nome": i.nome, "nif": i.nif, "atividade": i.atividade,
         "taxa_ret": i.taxa_ret, "estado": i.estado}
        for i in db.scalars(
            select(Independente)
            .where(Independente.empresa_id == empresa.id)
            .order_by(Independente.nome)
        ).all()
    ]


@router.post("/independentes", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_independente(
    request: Request, dados: IndependenteEntrada, empresa: EmpresaAtual, db: DB
) -> dict:
    i = Independente(empresa_id=empresa.id, **dados.model_dump())
    db.add(i)
    db.commit()
    db.refresh(i)
    return {"id": i.id, "nome": i.nome, "taxa_ret": i.taxa_ret}


def _independente(db: DB, empresa_id: UUID, ident: UUID) -> Independente:
    i = db.scalar(
        select(Independente).where(
            Independente.id == ident, Independente.empresa_id == empresa_id
        )
    )
    if i is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Independente não encontrado.")
    return i


@router.patch("/independentes/{independente_id}", dependencies=[GERIR])
def actualizar_independente(
    request: Request,
    independente_id: UUID,
    dados: IndependenteEntrada,
    empresa: EmpresaAtual,
    db: DB,
) -> dict:
    """Alterar a ficha — o Piloto tem «Editar» e a Produção só sabia criar."""
    i = _independente(db, empresa.id, independente_id)
    for campo, valor in dados.model_dump().items():
        setattr(i, campo, valor)
    db.commit()
    return {"id": i.id, "nome": i.nome, "taxa_ret": i.taxa_ret}


@router.delete(
    "/independentes/{independente_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[GERIR],
)
def remover_independente(
    request: Request, independente_id: UUID, empresa: EmpresaAtual, db: DB
) -> None:
    """Eliminar — mas não quem já tem honorários pagos.

    O Piloto apagava sempre, e os honorários ficavam sem titular: o IRT retido
    tinha sido entregue ao Estado em nome de alguém que já não existia na
    aplicação. É a mesma regra dos outros mestres — o que já foi usado
    desactiva-se, não se apaga.
    """
    i = _independente(db, empresa.id, independente_id)
    tem = db.scalar(
        select(func.count())
        .select_from(Honorario)
        .where(Honorario.independente_id == i.id)
    )
    if tem:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{i.nome} tem {tem} honorário(s) processado(s) e não pode ser "
            "eliminado — passe o estado a inactivo.",
        )
    db.delete(i)
    db.commit()


@router.get("/honorarios")
def listar_honorarios(
    empresa: EmpresaAtual,
    db: DB,
    mes: str | None = None,
    offset: int = 0,
    limite: int = LIMITE_OMISSAO,
) -> dict:
    """Honorários processados, uma página de cada vez, com os totais.

    Os totais são do CONJUNTO FILTRADO e não da página — a linha «TOTAIS» do
    Piloto tem de continuar a somar tudo o que o filtro apanha, senão muda ao
    carregar em «seguinte».
    """
    linhas = svc.listar_honorarios(db, empresa_id=empresa.id, mes=mes)
    total = len(linhas)
    limite = max(1, min(limite, 200))
    offset = max(0, offset)

    def formatar(h) -> dict:
        return {
            "id": h.id, "nome": h.nome, "data": h.data, "mes": h.mes,
            "descricao": h.descricao, "bruto": h.bruto, "taxa": h.taxa,
            "retencao": h.retencao, "liquido": h.liquido,
            "numero_op": h.numero_op, "lancamento_id": h.lancamento_id,
        }

    return {
        "linhas": [formatar(h) for h in linhas[offset : offset + limite]],
        "total": total,
        "offset": offset,
        "limite": limite,
        "totais": {
            "bruto": sum((h.bruto for h in linhas), Decimal("0")),
            "retencao": sum((h.retencao for h in linhas), Decimal("0")),
            "liquido": sum((h.liquido for h in linhas), Decimal("0")),
        },
    }


@router.post("/honorarios", status_code=status.HTTP_201_CREATED, dependencies=[GERIR])
def criar_honorario(
    request: Request, dados: HonorarioPedido, empresa: EmpresaAtual, db: DB
) -> dict:
    r = svc.processar_honorario(
        db, empresa_id=empresa.id, independente_id=dados.independente_id,
        valor=dados.valor, data=dados.data, mes=dados.mes,
        descricao=dados.descricao, ref=dados.ref, exercicio_id=dados.exercicio_id,
    )
    db.commit()
    return r


# ---------------------------------------------------------------------------
# Mapa de Remunerações IRT A2.1
# ---------------------------------------------------------------------------
@router.get("/mapa-irt")
def obter_mapa_irt(
    empresa: EmpresaAtual, db: DB, mes: str, so_ativos: bool = True
) -> dict:
    """Mapa de Remunerações — Modelo IRT A2.1 (AGT), pronto a exportar."""
    linhas = svc.mapa_irt(db, empresa_id=empresa.id, mes=mes, so_ativos=so_ativos)
    return {
        "mes": mes,
        "rubricas_nao_sujeitas": list(SUBS_NAO_SUJEITOS),
        "rubricas_sujeitas": list(SUBS_SUJEITOS),
        "linhas": linhas,
        "totais": {
            k: sum((l[k] for l in linhas), Decimal("0"))
            for k in ("salario_base", "sub_nao_suj", "sub_suj", "salario_iliquido",
                      "base_ss", "contrib_ss", "base_irt", "irt")
        },
    }


@router.put("/mapa-irt/{colaborador_id}", dependencies=[GERIR])
def gravar_mapa_irt(
    request: Request,
    colaborador_id: UUID,
    dados: MapaIrtEntrada,
    empresa: EmpresaAtual,
    db: DB,
) -> dict:
    _colab(db, empresa.id, colaborador_id)
    linha = svc.linha_mapa_irt_para_gravar(
        db, empresa_id=empresa.id, colaborador_id=colaborador_id, mes=dados.mes
    )

    permitidas = set(SUBS_NAO_SUJEITOS) | set(SUBS_SUJEITOS)
    desconhecidas = set(dados.valores) - permitidas
    if desconhecidas:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Rubricas desconhecidas: {', '.join(sorted(desconhecidas))}.",
        )
    for k, v in dados.valores.items():
        setattr(linha, k, v)
    for flag in ("calc_manual_excesso", "registo_manual_ss", "nao_sujeito_ss",
                 "isento_irt"):
        setattr(linha, flag, getattr(dados, flag))
    linha.excesso_subsidios_nao_sujeitos = dados.excesso_subsidios_nao_sujeitos
    linha.base_tributavel_ss_manual = dados.base_tributavel_ss_manual

    db.commit()
    return {"colaborador_id": colaborador_id, "mes": dados.mes}


# ---------------------------------------------------------------------------
# Configuração e tabelas fiscais
# ---------------------------------------------------------------------------
@router.get("/config")
def obter_config(empresa: EmpresaAtual, db: DB) -> dict:
    """Configuração de RH: taxas de INSS, tabela do IRT e contas."""
    return svc.cfg_rh(db, empresa.id)


@router.put(
    "/config",
    dependencies=[GERIR, Depends(exigir_perfil(Perfil.ADMIN))],
)
def gravar_config(
    request: Request, dados: dict, empresa: EmpresaAtual, db: DB
) -> dict:
    """As taxas e as contas de RH — só o administrador.

    Mudar a taxa do INSS muda o que se retém a toda a gente, todos os meses,
    e mudar as contas muda onde a folha cai na contabilidade. Não é trabalho
    de quem processa a folha; é de quem responde pela parametrização da
    empresa. O ecrã já o dizia — faltava o servidor exigi-lo.
    """
    r = svc.guardar_cfg_rh(db, empresa.id, dados)
    db.commit()
    return r


@router.get("/irps")
def irps() -> dict:
    """IRPS — informativo. Entra em vigor a 01-01-2027 e substitui o IRT."""
    return IRPS_INFO
