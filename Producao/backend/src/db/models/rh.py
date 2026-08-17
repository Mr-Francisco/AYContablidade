"""Recursos Humanos — pessoal, processamento salarial e honorários.

Transposto de `Piloto/assets/js/rh.js`. Cálculo de INSS e IRT de Angola.

A tabela do IRT (Lei n.º 14/25, de 30 de Dezembro — OGE 2026, isenção até
150.000 Kz) é configuração por empresa e vive em `ConfigEmpresa.parametrizacoes`,
tal como no Piloto (`rh_cfg`), porque é editável pelo utilizador e muda com a lei.
Guardá-la em código impediria corrigir uma tabela sem novo deploy.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin

Money = Numeric(18, 2)


class Colaborador(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    __tablename__ = "colaboradores"
    __table_args__ = (
        UniqueConstraint("empresa_id", "numero", name="colaborador_numero"),
    )

    numero: Mapped[str] = mapped_column(String(20), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    categoria: Mapped[str | None] = mapped_column(String(120))

    salario_base: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    subsidios: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    subsidio_ferias: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    #: Percentagem do salário base, quando o subsídio de férias é calculado
    #: assim em vez de escrito em kwanzas. O VALOR CONTINUA A SER O QUE MANDA:
    #: guarda-se a percentagem para se saber como foi calculado e para o valor
    #: acompanhar uma mudança de salário — o processamento lê `subsidio_ferias`
    #: e não precisa de saber que isto existe.
    subsidio_ferias_perc: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    subsidio_natal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    subs_nao_sujeitos: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    data_admissao: Mapped[date | None] = mapped_column(Date)
    iban: Mapped[str | None] = mapped_column(String(60))

    # ---- Identificação ----
    # A ficha do Piloto (`pessoal.html`) tem oito separadores. Estavam aqui
    # quinze campos dos trinta, e os que faltavam não havia sequer onde os
    # guardar — quem preenchesse a morada ou o contacto perdia-os ao gravar.
    nome_abreviado: Mapped[str | None] = mapped_column(String(80))
    genero: Mapped[str | None] = mapped_column(String(20))
    data_nascimento: Mapped[date | None] = mapped_column(Date)
    nacionalidade: Mapped[str | None] = mapped_column(String(60))
    naturalidade: Mapped[str | None] = mapped_column(String(120))
    morada: Mapped[str | None] = mapped_column(String(300))
    localidade: Mapped[str | None] = mapped_column(String(120))
    codigo_postal: Mapped[str | None] = mapped_column(String(20))
    pais: Mapped[str | None] = mapped_column(String(60))
    comuna: Mapped[str | None] = mapped_column(String(80))
    email: Mapped[str | None] = mapped_column(String(200))
    telefone: Mapped[str | None] = mapped_column(String(40))
    telemovel: Mapped[str | None] = mapped_column(String(40))

    # ---- Documentos ----
    tipo_documento: Mapped[str | None] = mapped_column(String(40))
    num_documento: Mapped[str | None] = mapped_column(String(40))
    validade_documento: Mapped[date | None] = mapped_column(Date)

    # ---- Dados fiscais ----
    # Exigidos pelo Mapa de Remunerações (Modelo IRT A2.1 da AGT).
    nif: Mapped[str | None] = mapped_column(String(20))
    num_ss: Mapped[str | None] = mapped_column(String(30))
    estado_civil: Mapped[str | None] = mapped_column(String(30))
    dependentes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    regime_irt: Mapped[str | None] = mapped_column(String(80))
    provincia: Mapped[str | None] = mapped_column(String(40))
    municipio: Mapped[str | None] = mapped_column(String(80))

    # ---- Contrato ----
    tipo_contrato: Mapped[str | None] = mapped_column(String(40))
    data_fim: Mapped[date | None] = mapped_column(Date)

    # ---- Pagamento ----
    forma_pagamento: Mapped[str | None] = mapped_column(String(40))
    banco: Mapped[str | None] = mapped_column(String(120))

    # ---- Férias e habilitações ----
    dias_ferias: Mapped[int] = mapped_column(Integer, default=22, nullable=False)
    habilitacoes: Mapped[str | None] = mapped_column(String(200))
    notas: Mapped[str | None] = mapped_column(Text)

    estado: Mapped[str] = mapped_column(String(20), default="activo", nullable=False)

    def __repr__(self) -> str:
        return f"<Colaborador {self.numero} {self.nome!r}>"


class AlteracaoMensal(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Variáveis do mês: faltas, abonos e descontos extraordinários."""

    __tablename__ = "rh_alteracoes"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id", "colaborador_id", "exercicio_id", "mes",
            name="alteracao_mes", postgresql_nulls_not_distinct=True,
        ),
    )

    colaborador_id: Mapped[UUID] = mapped_column(
        ForeignKey("colaboradores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="CASCADE"), index=True
    )
    mes: Mapped[str] = mapped_column(String(2), nullable=False, index=True)

    # Dias. O desconto é salário_base / 30 × faltas (base 30 dias, como no Piloto).
    faltas: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    # [{"desc": "...", "valor": 0.00}] — lista de forma livre, como no Piloto.
    abonos: Mapped[list[dict]] = mapped_column(JSONB, default=list, nullable=False)
    descontos: Mapped[list[dict]] = mapped_column(JSONB, default=list, nullable=False)

    def __repr__(self) -> str:
        return f"<AlteracaoMensal {self.mes}>"


class ProcessamentoSalarial(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Processamento da folha de um mês, com um lançamento agregado."""

    __tablename__ = "rh_processamentos"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id", "exercicio_id", "mes", name="processamento_mes",
            postgresql_nulls_not_distinct=True,
        ),
    )

    # Desvio justificado ao Piloto: lá o mês ("03") e único em todo o histórico,
    # portanto no SEGUNDO ano de utilização Março apareceria como ja processado e
    # seria impossivel processá-lo. Não é um comportamento a preservar, é um
    # defeito latente. O período passa a ser único POR EXERCÍCIO.
    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="CASCADE"), index=True
    )
    mes: Mapped[str] = mapped_column(String(2), nullable=False)
    # {"bruto", "inss", "irt", "liquido", "inssEmpresa"}
    totais: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    lancado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lancamento_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("lancamentos.id", ondelete="SET NULL")
    )

    def __repr__(self) -> str:
        return f"<ProcessamentoSalarial {self.mes}>"


class PagamentoSalarial(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Pagamento dos líquidos de um mês a partir do banco.

    Só é permitido depois de o mês estar processado, e uma vez por mês — é a
    regra do Piloto (`pagarMes` recusa mês já pago ou por processar).
    """

    __tablename__ = "rh_pagamentos"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id", "exercicio_id", "mes", name="pagamento_mes",
            postgresql_nulls_not_distinct=True,
        ),
    )

    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="CASCADE"), index=True
    )
    mes: Mapped[str] = mapped_column(String(2), nullable=False)
    valor: Mapped[Decimal] = mapped_column(Money, nullable=False)
    conta: Mapped[str | None] = mapped_column(String(20))
    lancado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lancamento_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("lancamentos.id", ondelete="SET NULL")
    )
    numero_op: Mapped[str | None] = mapped_column(String(30))

    def __repr__(self) -> str:
        return f"<PagamentoSalarial {self.mes} {self.valor}>"


class Independente(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Trabalhador independente / prestador de serviços, sujeito a retenção
    na fonte (6,5% por omissão)."""

    __tablename__ = "rh_independentes"

    nome: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    nif: Mapped[str | None] = mapped_column(String(20))
    atividade: Mapped[str | None] = mapped_column(String(200))
    taxa_ret: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("6.5"), nullable=False
    )
    estado: Mapped[str] = mapped_column(String(20), default="activo", nullable=False)

    def __repr__(self) -> str:
        return f"<Independente {self.nome!r}>"


class Honorario(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Honorário pago a um independente, com retenção de IRT."""

    __tablename__ = "rh_honorarios"

    independente_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("rh_independentes.id", ondelete="RESTRICT"), index=True
    )
    nome: Mapped[str | None] = mapped_column(String(200))
    data: Mapped[date] = mapped_column(Date, nullable=False)
    # `mes` é o PERÍODO de dois dígitos, como nas restantes tabelas de RH — o
    # ano vem do exercício. Sem `exercicio_id` os honorários do período 08 de
    # dois anos diferentes ficavam indistinguíveis, que é precisamente o
    # problema do Piloto que esta coluna existe para resolver.
    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="SET NULL"), index=True
    )
    mes: Mapped[str | None] = mapped_column(String(2))
    descricao: Mapped[str | None] = mapped_column(Text)

    bruto: Mapped[Decimal] = mapped_column(Money, nullable=False)
    taxa: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    retencao: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    liquido: Mapped[Decimal] = mapped_column(Money, nullable=False)

    lancado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lancamento_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("lancamentos.id", ondelete="SET NULL")
    )
    numero_op: Mapped[str | None] = mapped_column(String(30))

    def __repr__(self) -> str:
        return f"<Honorario {self.nome!r} {self.bruto}>"


class MapaIrtLinha(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    """Linha do Mapa de Remunerações — Modelo IRT A2.1 (AGT).

    Colunas explícitas, e não JSON, porque são exactamente as rubricas do
    template oficial da AGT: o mapa tem de poder ser exportado tal-e-qual, e
    cada rubrica é declarada individualmente.

    A distinção entre sujeitos e não sujeitos é o que determina a matéria
    colectável: só os sujeitos entram na base do IRT.
    """

    __tablename__ = "rh_mapa_irt"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id", "colaborador_id", "exercicio_id", "mes",
            name="mapa_irt_mes", postgresql_nulls_not_distinct=True,
        ),
    )

    colaborador_id: Mapped[UUID] = mapped_column(
        ForeignKey("colaboradores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exercicio_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("exercicios.id", ondelete="CASCADE"), index=True
    )
    mes: Mapped[str] = mapped_column(String(2), nullable=False, index=True)

    # ---- Subsídios NÃO sujeitos a IRT ----
    sub_alimentacao: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    sub_transporte: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    abono_familia: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    reembolso_despesas: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    outros_nao_sujeitos: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    # ---- Subsídios sujeitos a IRT ----
    abono_falhas: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    sub_renda_casa: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    compensacao_rescisao: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    sub_ferias: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    horas_extras: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    sub_atavio: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    sub_representacao: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    premios: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    sub_natal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    outros_sujeitos: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    # ---- Excepções manuais (flags "S"/"N" no Piloto, booleanos aqui) ----
    calc_manual_excesso: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    excesso_subsidios_nao_sujeitos: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0"), nullable=False
    )
    registo_manual_ss: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    base_tributavel_ss_manual: Mapped[Decimal] = mapped_column(
        Money, default=Decimal("0"), nullable=False
    )
    nao_sujeito_ss: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    isento_irt: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<MapaIrtLinha {self.mes}>"
