"""Empresas, licenças e pedidos de licença.

Modelo novo na Produção — o Piloto é mono-empresa e não tem nada disto
(o campo `licenca` em app.js:124 nunca chegou a ser lido). Especificação:
`docs/TENANCY_AND_ACCESS.md`.
"""

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.constants import (
    EstadoEmpresa,
    EstadoLicenca,
    EstadoPedidoLicenca,
    RegimeIVA,
)
from src.db.base import Base, TimestampMixin, UUIDMixin


class Empresa(UUIDMixin, TimestampMixin, Base):
    """O inquilino (tenant). Corresponde ao objecto `config.empresa` do Piloto,
    que ali era único e passa aqui a ser uma linha por cliente da plataforma."""

    __tablename__ = "empresas"

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    nif: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)

    morada: Mapped[str | None] = mapped_column(String(300))
    localizacao: Mapped[str | None] = mapped_column(String(200))
    telefone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(200))
    logo: Mapped[str | None] = mapped_column(Text)

    moeda: Mapped[str] = mapped_column(String(8), default="Kz", nullable=False)
    regime: Mapped[RegimeIVA] = mapped_column(
        String(20), default=RegimeIVA.GERAL, nullable=False
    )
    # Histórico de mudanças de regime (regimeHistorico no Piloto): o regime de IVA
    # muda ao longo do tempo e o apuramento de períodos passados tem de usar o
    # regime que estava em vigor nessa altura.
    regime_historico: Mapped[list[dict]] = mapped_column(
        JSONB, default=list, nullable=False
    )

    # Forma jurídica (FORMAS em fiscalidade.js) — determina as obrigações fiscais.
    forma_juridica: Mapped[str | None] = mapped_column(String(20))

    estado: Mapped[EstadoEmpresa] = mapped_column(
        String(20), default=EstadoEmpresa.ACTIVA, nullable=False, index=True
    )

    licencas: Mapped[list["Licenca"]] = relationship(
        back_populates="empresa", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Empresa {self.nif} {self.nome!r}>"


class Licenca(UUIDMixin, TimestampMixin, Base):
    """Licença de utilização de uma empresa.

    O estado da licença é validado em cada operação (`docs/TENANCY_AND_ACCESS.md`),
    por isso não basta guardar a validade — é preciso saber se está activa agora.
    """

    __tablename__ = "licencas"

    empresa_id: Mapped[UUID] = mapped_column(
        ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True
    )

    chave: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    titular: Mapped[str] = mapped_column(String(200), nullable=False)
    plano: Mapped[str] = mapped_column(String(60), nullable=False)

    # Sem validade = licença perpétua.
    validade: Mapped[date | None] = mapped_column(Date)
    estado: Mapped[EstadoLicenca] = mapped_column(
        String(20), default=EstadoLicenca.PENDENTE, nullable=False, index=True
    )

    # Módulos incluídos no plano. Vazio = todos. Combina-se com os módulos
    # activados na empresa e com os módulos permitidos ao utilizador — a
    # intersecção é o que fica visível, tal como a regra `moduloAtivo` do Piloto.
    modulos_incluidos: Mapped[list[str]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    limite_utilizadores: Mapped[int | None] = mapped_column(Integer)

    aprovada_por_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    aprovada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notas: Mapped[str | None] = mapped_column(Text)

    empresa: Mapped[Empresa] = relationship(back_populates="licencas")

    def __repr__(self) -> str:
        return f"<Licenca {self.chave} {self.estado}>"


class PedidoLicenca(UUIDMixin, TimestampMixin, Base):
    """Pedido de licença submetido a partir da página inicial, antes de existir
    empresa ou utilizador (passos 1-3 de `docs/TENANCY_AND_ACCESS.md`).

    Vive fora do isolamento multiempresa por definição: quem submete ainda não
    pertence a nenhuma empresa. Só o superadmin da plataforma lê esta tabela.
    """

    __tablename__ = "pedidos_licenca"
    __table_args__ = (
        # Impede pedidos pendentes duplicados para o mesmo NIF sem bloquear um
        # pedido novo depois de um anterior ter sido decidido.
        UniqueConstraint("nif", "estado", name="pedido_nif_estado"),
    )

    nome_empresa: Mapped[str] = mapped_column(String(200), nullable=False)
    nif: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    email_contacto: Mapped[str] = mapped_column(String(200), nullable=False)
    telefone: Mapped[str | None] = mapped_column(String(40))
    responsavel: Mapped[str] = mapped_column(String(200), nullable=False)
    plano_pretendido: Mapped[str | None] = mapped_column(String(60))
    mensagem: Mapped[str | None] = mapped_column(Text)

    estado: Mapped[EstadoPedidoLicenca] = mapped_column(
        String(20), default=EstadoPedidoLicenca.PENDENTE, nullable=False, index=True
    )
    decidido_por_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    decidido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    motivo_recusa: Mapped[str | None] = mapped_column(Text)

    # Preenchido quando o pedido é aprovado e a empresa é criada.
    empresa_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL")
    )

    def __repr__(self) -> str:
        return f"<PedidoLicenca {self.nif} {self.estado}>"


class ConfigEmpresa(UUIDMixin, TimestampMixin, Base):
    """Parametrizações por empresa: o resto do objecto `config` do Piloto
    (módulos activos, contas por omissão de cada módulo, séries de documentos,
    integração AGT). Guardado como JSONB para acompanhar o Piloto, onde cada
    módulo tem o seu próprio bloco de configuração com forma livre.

    Os segredos da AGT NÃO ficam aqui — vão para variáveis de ambiente (Regra 6).
    """

    __tablename__ = "config_empresa"

    empresa_id: Mapped[UUID] = mapped_column(
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # {"contabilidade": true, "rh": false, ...} — MODULOS em app.js
    modulos: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # Configuração por módulo: {"com": {...}, "log": {...}, "rh": {...}, "imob": {...}}
    parametrizacoes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # Integração AGT sem credenciais: {"ativo": bool, "ambiente": "homologacao"}
    agt: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    def __repr__(self) -> str:
        return f"<ConfigEmpresa empresa={self.empresa_id}>"


class Exercicio(UUIDMixin, TimestampMixin, Base):
    """Exercício económico, por empresa (exercicios em app.js).

    Vários podem estar activos em simultâneo (transição de ano) — `ativo` é um
    interruptor independente, não uma escolha exclusiva, tal como no Piloto.
    """

    __tablename__ = "exercicios"
    __table_args__ = (UniqueConstraint("empresa_id", "nome", name="exercicio_nome"),)

    empresa_id: Mapped[UUID] = mapped_column(
        ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True
    )

    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fim: Mapped[date] = mapped_column(Date, nullable=False)
    # "aberto" | "fechado" — um exercício fechado recusa lançamentos.
    estado: Mapped[str] = mapped_column(String(20), default="aberto", nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Resultado do último Apuramento de Resultados deste exercício:
    # {em, ate, resultado, lancamento_ids, detalhe}. NULL = por apurar.
    # Guardado aqui, como no Piloto (`ex.apuramento`), porque é o que permite
    # reabrir o apuramento e remover exactamente os lançamentos que ele gerou.
    apuramento: Mapped[dict | None] = mapped_column(JSONB)

    def __repr__(self) -> str:
        return f"<Exercicio {self.nome} {self.estado}>"
