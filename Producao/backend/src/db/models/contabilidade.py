"""Contabilidade — plano de contas, diários, documentos, lançamentos.

Transposto de `Piloto/assets/js/contabilidade.js` (framework estilo Primavera V10,
PGC de Angola). Regra 9/11: comportamento preservado, só a arquitectura muda.

Nota sobre valores monetários: tudo é `Numeric(18, 2)`, nunca vírgula flutuante.
O Piloto usava números de JS com `round2()` a cada operação; em base de dados o
tipo exacto é obrigatório — um cêntimo perdido por arredondamento desequilibra
um lançamento e o `estaEquilibrado()` passa a rejeitá-lo.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin

# Dinheiro: 18 dígitos, 2 casas. Em Kwanzas os valores são grandes (milhões
# correntes), por isso a precisão é generosa.
Money = Numeric(18, 2)


class Conta(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Conta do plano (PGC-AR Angola).

    `tipo` segue o Primavera: M = movimento (folha, recebe lançamentos),
    I = integradora (só agrega), R = raiz. A regra do Piloto é rígida: uma
    integradora NUNCA recebe lançamentos.
    """

    __tablename__ = "contas"
    __table_args__ = (
        UniqueConstraint("empresa_id", "codigo", name="conta_codigo"),
        Index("ix_contas_empresa_codigo", "empresa_id", "codigo"),
    )

    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str | None] = mapped_column(String(1))  # M | I | R
    # Natureza esperada do saldo: D = devedora, C = credora, M = mista.
    natureza: Mapped[str] = mapped_column(String(1), default="D", nullable=False)
    # Classe de IVA do plano do Primavera (ex.: "22?11"), usada no apuramento.
    classe_iva: Mapped[str | None] = mapped_column(String(20))
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # --- A ficha de conta do Piloto -----------------------------------------
    # Os campos da janela «Nova conta» de `plano-contas.html`, que a Produção
    # não guardava. São informativos ou de parametrização: nenhum entra no
    # motor de lançamentos, e por isso nenhum é obrigatório. Ficam aqui e não
    # num JSONB porque se pesquisa e se filtra por eles.

    #: Agrupamento do Primavera (ex.: "DEFA"). Não é a classe PGC — essa lê-se
    #: do primeiro dígito do código.
    classe_primavera: Mapped[str | None] = mapped_column(String(20))

    #: Conta alternativa: o par código/designação que o Piloto guarda para
    #: mapeamentos de plano. A designação é livre e não tem de existir no plano.
    conta_alt_codigo: Mapped[str | None] = mapped_column(String(20))
    conta_alt_nome: Mapped[str | None] = mapped_column(String(200))

    # Fiscalidade
    retencao: Mapped[str | None] = mapped_column(String(40))
    motivo_tributacao: Mapped[str | None] = mapped_column(String(200))

    # Integração
    trat_pendentes: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    integra_equipamentos: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    integra_ativos: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    investimento: Mapped[str | None] = mapped_column(String(40))
    custo_fixo: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), server_default=text("0"), nullable=False
    )

    # Tesouraria
    item_tesouraria: Mapped[str | None] = mapped_column(String(40))

    def __repr__(self) -> str:
        return f"<Conta {self.codigo} {self.nome!r}>"


class Diario(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Diário contabilístico. `categoria` filtra os selectores por módulo
    (compras, vendas, caixa_bancos, imobilizado, rh, outros)."""

    __tablename__ = "diarios"
    __table_args__ = (UniqueConstraint("empresa_id", "codigo", name="diario_codigo"),)

    codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    categoria: Mapped[str] = mapped_column(String(20), default="outros", nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Diario {self.codigo} {self.nome!r}>"


class DocumentoContabilistico(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Documento afecto a um diário, com as contas de débito/crédito por omissão."""

    __tablename__ = "documentos_contabilisticos"
    __table_args__ = (UniqueConstraint("empresa_id", "codigo", name="documento_codigo"),)

    codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False)
    diario_codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    conta_debito: Mapped[str | None] = mapped_column(String(20))
    conta_credito: Mapped[str | None] = mapped_column(String(20))
    retencao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    #: SUBCLASSE DE OUTRO DOCUMENTO. O `211` e a classe; o `211.1` e uma
    #: subclasse dela, e guarda aqui o `211`.
    #:
    #: Serve para organizar: uma empresa com quinze variantes de compra tem
    #: quinze documentos soltos numa lista, e nao ha por onde ver que sao
    #: todos da mesma familia. Uma subclasse pede o mesmo que uma classe e
    #: pode fixar a sua propria conta de debito — e e essa que manda quando se
    #: lanca com ela.
    #:
    #: UM SO NIVEL: uma subclasse nao tem subclasses. Foi o que foi pedido, e
    #: e o que mantem a lista legivel.
    pai_codigo: Mapped[str | None] = mapped_column(String(10))

    #: SISTEMA DE INVENTARIACAO: `permanente`, `periodico`, ou vazio.
    #:
    #: No PERMANENTE o custo reconhece-se no momento em que ocorre: a compra
    #: entra na conta de compras e, no mesmo lancamento, reflecte-se para a
    #: conta de existencias. No PERIODICO nao ha reflexao — o custo so se apura
    #: no fim do periodo, pelo inventario.
    #:
    #: Vazio e o comportamento de sempre, e e onde ficam todos os documentos
    #: que ja existem: nenhum lancamento ja feito muda por causa disto.
    sistema_inventario: Mapped[str | None] = mapped_column(String(20))

    #: A CONTA PARA ONDE A COMPRA SE REFLECTE — a de destino, tipicamente uma
    #: 26 ou uma 22, conforme o inventario que a empresa usa.
    #:
    #: So tem efeito com o sistema permanente. O outro lado da reflexao nao se
    #: guarda porque nao e uma escolha: e a propria `conta_debito` deste
    #: documento, creditada. Guardar as duas deixava-as divergir.
    conta_reflexao: Mapped[str | None] = mapped_column(String(20))

    def __repr__(self) -> str:
        return f"<Documento {self.codigo} {self.descricao!r}>"


class Fluxo(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Rubrica da Demonstração de Fluxos de Caixa.
    `tipo`: R = actividade (raiz), I = intermédio, M = movimento (imputável)."""

    __tablename__ = "fluxos"
    __table_args__ = (UniqueConstraint("empresa_id", "codigo", name="fluxo_codigo"),)

    codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    descricao: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(String(1), nullable=False)

    def __repr__(self) -> str:
        return f"<Fluxo {self.codigo} {self.descricao!r}>"


class CentroCusto(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Centro de custo da contabilidade analítica."""

    __tablename__ = "centros_custo"
    __table_args__ = (UniqueConstraint("empresa_id", "codigo", name="centro_codigo"),)

    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="custo", nullable=False)
    responsavel: Mapped[str | None] = mapped_column(String(200))
    estado: Mapped[str] = mapped_column(String(20), default="activo", nullable=False)

    def __repr__(self) -> str:
        return f"<CentroCusto {self.codigo}>"


class Lancamento(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Cabeçalho de um lançamento em partidas dobradas.

    Regras do Piloto que a camada de serviço tem de continuar a garantir:
      - pelo menos duas linhas, e soma de débitos == soma de créditos > 0;
      - nenhuma linha numa conta integradora;
      - exercício fechado ou diário/período fechado recusam o lançamento.

    `diferido` = pendente de integração: não entra em balancete, razão, extracto,
    fluxos, apuramentos nem contas correntes até ser integrado.
    """

    __tablename__ = "lancamentos"
    __table_args__ = (
        Index("ix_lancamentos_empresa_data", "empresa_id", "data"),
        Index("ix_lancamentos_empresa_exercicio", "empresa_id", "exercicio_id"),
    )

    # Sequência global por empresa (nextNum no Piloto).
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    # Nº da operação PP/DOC.NNN (período / documento / sequência no exercício).
    numero_op: Mapped[str | None] = mapped_column(String(30))
    doc_num: Mapped[int | None] = mapped_column(Integer)

    data: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # Período contabilístico 00-15: 00 abertura, 01-12 meses, 13 regularizações,
    # 14/15 apuramentos. NÃO é derivável da data — 13/14/15 não são meses.
    mes: Mapped[str] = mapped_column(String(2), default="00", nullable=False)

    diario_codigo: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    documento_codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    documento_ref: Mapped[str | None] = mapped_column(String(60))
    # Que módulo gerou o lançamento: comercial, logistica, rh, imobilizado,
    # apuramento, demo, manual.
    origem: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)

    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="RESTRICT"), index=True
    )

    diferido: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    integrado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    integrado_por: Mapped[str | None] = mapped_column(String(200))
    criado_por: Mapped[str | None] = mapped_column(String(200))

    linhas: Mapped[list["LancamentoLinha"]] = relationship(
        back_populates="lancamento",
        cascade="all, delete-orphan",
        order_by="LancamentoLinha.ordem",
    )

    def __repr__(self) -> str:
        return f"<Lancamento {self.numero_op or self.numero} {self.data}>"


class LancamentoLinha(UUIDMixin, Base):
    """Linha de um lançamento.

    Guarda `conta_codigo` e `conta_nome` além da chave estrangeira: é o que o
    Piloto faz, e é o que permite que o razão e os extractos mostrem a conta tal
    como estava à data, mesmo depois de o plano ser reestruturado.
    """

    __tablename__ = "lancamento_linhas"
    __table_args__ = (Index("ix_linhas_conta", "conta_codigo"),)

    lancamento_id: Mapped[UUID] = mapped_column(
        ForeignKey("lancamentos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    conta_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("contas.id", ondelete="RESTRICT")
    )
    conta_codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    conta_nome: Mapped[str | None] = mapped_column(String(200))

    descricao: Mapped[str | None] = mapped_column(Text)
    debito: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    credito: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    # Nome da entidade (cliente, fornecedor, colaborador) associada à linha.
    entidade: Mapped[str | None] = mapped_column(String(200))
    tipo_entidade: Mapped[str | None] = mapped_column(String(20))

    iva_perc: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    perc_nao_ded: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    iva_autoliq: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0"), nullable=False
    )

    moeda: Mapped[str] = mapped_column(String(8), default="AKZ", nullable=False)
    cambio: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("1"), nullable=False
    )

    # Códigos, não chaves estrangeiras: acompanham o Piloto, onde a imputação é
    # opcional e o centro/fluxo podem não existir na tabela.
    centro_codigo: Mapped[str | None] = mapped_column(String(20), index=True)
    fluxo_codigo: Mapped[str | None] = mapped_column(String(10), index=True)

    lancamento: Mapped[Lancamento] = relationship(back_populates="linhas")

    def __repr__(self) -> str:
        return f"<Linha {self.conta_codigo} D{self.debito} C{self.credito}>"


class DiarioFecho(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Fecho mensal de um diário: bloqueia lançamentos num diário × exercício ×
    período. O utilizador fecha e reabre à vontade, diário a diário."""

    __tablename__ = "diario_fechos"
    __table_args__ = (
        # nulls_not_distinct: `exercicio_id` pode ser NULL e, por omissão, o
        # Postgres trata NULLs como distintos — o mesmo diário/período seria
        # fechável várias vezes sem a restrição se opor.
        UniqueConstraint(
            "empresa_id",
            "diario_codigo",
            "exercicio_id",
            "mes",
            name="diario_fecho",
            postgresql_nulls_not_distinct=True,
        ),
    )

    diario_codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="CASCADE")
    )
    mes: Mapped[str] = mapped_column(String(2), nullable=False)
    por: Mapped[str | None] = mapped_column(String(200))

    def __repr__(self) -> str:
        return f"<DiarioFecho {self.diario_codigo} {self.mes}>"


class NotaTexto(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Texto manual de uma nota às demonstrações financeiras, que sobrepõe o
    texto gerado automaticamente (notasTxt no Piloto)."""

    __tablename__ = "notas_texto"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "numero",
            "exercicio_id",
            name="nota_texto",
            postgresql_nulls_not_distinct=True,
        ),
    )

    numero: Mapped[str] = mapped_column(String(10), nullable=False)
    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="CASCADE")
    )
    texto: Mapped[str] = mapped_column(Text, default="", nullable=False)

    def __repr__(self) -> str:
        return f"<NotaTexto {self.numero}>"


class SequenciaDocumento(UUIDMixin, EmpresaScopedMixin, Base):
    """Contador do nº de operação, por documento e exercício (docSeq no Piloto).

    Tabela em vez de contador em memória: com vários utilizadores em simultâneo,
    dois lançamentos do mesmo documento no mesmo exercício receberiam o mesmo
    número. A atribuição tem de ser feita com `SELECT ... FOR UPDATE`.
    """

    __tablename__ = "sequencias_documento"
    __table_args__ = (
        # nulls_not_distinct é ESSENCIAL aqui: `exercicio_id` pode ser NULL e,
        # com a semântica normal do Postgres, o ON CONFLICT do incremento nunca
        # encontraria a linha existente — inseria uma nova a cada chamada e o
        # contador devolvia sempre 1, gerando nºs de operação duplicados.
        UniqueConstraint(
            "empresa_id",
            "documento_codigo",
            "exercicio_id",
            name="sequencia_documento",
            postgresql_nulls_not_distinct=True,
        ),
    )

    documento_codigo: Mapped[str] = mapped_column(String(10), nullable=False)
    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="CASCADE")
    )
    valor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<Sequencia {self.documento_codigo}={self.valor}>"
