"""Empresas, licenças e pedidos de licença.

Modelo novo na Produção — o Piloto é mono-empresa e não tem nada disto
(o campo `licenca` em app.js:124 nunca chegou a ser lido). Especificação:
`docs/TENANCY_AND_ACCESS.md`.
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.constants import (
    EstadoEmpresa,
    EstadoLicenca,
    RegimeIVA,
)
from src.db.base import Base, TimestampMixin, UUIDMixin


class Empresa(UUIDMixin, TimestampMixin, Base):
    """O inquilino (tenant). Corresponde ao objecto `config.empresa` do Piloto,
    que ali era único e passa aqui a ser uma linha por cliente da plataforma."""

    __tablename__ = "empresas"

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    nif: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)

    # Código curto e único da empresa («BE001»), gerado na activação a partir
    # das iniciais do nome. Entra no login como terceiro factor de
    # IDENTIFICAÇÃO — não é um segredo, e não é tratado como tal: serve para
    # saber a que empresa a conta pertence sem depender do e-mail ser único em
    # toda a plataforma, e para que conhecer só o e-mail e a palavra-passe não
    # baste para entrar.
    codigo: Mapped[str] = mapped_column(
        String(12), nullable=False, unique=True, index=True
    )

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
    """Licença de utilização, gerada pelo superadministrador da plataforma.

    Ciclo de vida: o superadmin GERA a licença com os dados da empresa a que se
    destina (NIF, nome, duração, limites). A licença nasce `pendente` e sem
    empresa — a empresa ainda não existe. Quem a recebe tem 7 dias para a
    activar; a activação cria a empresa e o seu administrador, e vincula a
    licença. Passado o prazo sem activação, expira.

    A CHAVE NÃO É GUARDADA. Guarda-se o seu SHA-256 e um prefixo visível.
    A chave em claro é mostrada uma única vez, a quem a gera.

    Porquê SHA-256 e não bcrypt, se é um segredo? Porque bcrypt gera um sal
    diferente por hash, e um valor com sal não se pode indexar: activar uma
    licença obrigaria a ler todas as linhas e a correr bcrypt em cada uma. O
    bcrypt existe para compensar a POUCA entropia das palavras-passe humanas;
    esta chave tem 60 bits vindos de um CSPRNG, contra os quais a força bruta é
    inviável mesmo com um hash rápido. É o mesmo raciocínio que se aplica a
    chaves de API — e é por isso que a comparação é feita em tempo constante.
    """

    __tablename__ = "licencas"

    # Nasce nula: a licença é criada ANTES de a empresa existir, e é a
    # activação que as liga. É esta coluna que torna a licença de uso único —
    # uma vez preenchida, não volta a poder ser activada.
    empresa_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="CASCADE"), index=True
    )

    chave_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    # Primeiros caracteres, para o superadmin identificar a licença numa lista
    # sem que a chave inteira fique gravada («SGD-A3F2…»).
    chave_prefixo: Mapped[str] = mapped_column(String(16), nullable=False)

    # Dados da empresa a que a licença se destina, indicados na geração. Ficam
    # aqui para a activação poder confirmar que quem activa é quem devia: o NIF
    # introduzido na activação tem de coincidir com este.
    nif_previsto: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    nome_previsto: Mapped[str] = mapped_column(String(200), nullable=False)

    titular: Mapped[str] = mapped_column(String(200), nullable=False)
    plano: Mapped[str] = mapped_column(String(60), nullable=False)
    # Duração do contrato. A validade só é contada a partir da ACTIVAÇÃO — uma
    # licença gerada em Janeiro e activada em Março dá o período completo.
    duracao_meses: Mapped[int | None] = mapped_column(Integer)

    # Prazo para activar. Sem activação até aqui, a licença expira e não serve.
    expira_activacao: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    activada_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Sem validade = licença perpétua. Preenchida na activação, a partir da
    # duração contratada.
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

    # Limites de consumo de IA. Nulo = sem limite. O custo é o travão que
    # interessa à plataforma; os tokens são o que se consegue medir ao certo.
    limite_tokens_mes: Mapped[int | None] = mapped_column(Integer)
    limite_custo_mes: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))

    criada_por_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    notas: Mapped[str | None] = mapped_column(Text)

    empresa: Mapped[Empresa | None] = relationship(back_populates="licencas")

    def __repr__(self) -> str:
        return f"<Licenca {self.chave_prefixo}… {self.estado}>"

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
