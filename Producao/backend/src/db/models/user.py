"""Utilizadores.

Transposto de `Store.users` / `login` / `registar` do Piloto, com três desvios
justificados, todos exigidos pela passagem a produção multiempresa:

1. A palavra-passe passa a ser guardada em hash bcrypt (o Piloto guardava
   `senha` em texto simples) e exige 8 caracteres em vez de 4 — docs/SECURITY.md.
2. O utilizador pertence a uma empresa (`empresa_id`) — docs/TENANCY_AND_ACCESS.md.
3. `token_version` permite revogar sessões activas; o Piloto não tinha sessões
   revogáveis porque a "sessão" era uma chave no localStorage do próprio browser.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.constants import Perfil
from src.db.base import Base, TimestampMixin, UUIDMixin
from src.db.models.tenancy import Empresa


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    # NULL apenas para o superadmin da plataforma, que gere licenças e empresas
    # e não pertence a nenhuma delas. Todos os outros têm empresa obrigatória.
    empresa_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="CASCADE"), nullable=True, index=True
    )

    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    # Único globalmente: mantém o login inequívoco sem pedir a empresa ao
    # utilizador. Uma pessoa que trabalhe para duas empresas precisa de duas contas.
    email: Mapped[str] = mapped_column(
        String(200), nullable=False, unique=True, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(120), nullable=False)
    telefone: Mapped[str | None] = mapped_column(String(40))

    perfil: Mapped[Perfil] = mapped_column(String(20), nullable=False)

    # Piloto: uma conta registada nasce inactiva até um administrador a aprovar.
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    aprovado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aprovado_por_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    aprovado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Incrementado em mudança de palavra-passe, de perfil ou de estado: qualquer
    # token emitido com uma versão anterior deixa imediatamente de ser aceite.
    token_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    #: A palavra-passe actual foi definida por OUTRA pessoa — o administrador da
    #: empresa ou quem administra a plataforma. Enquanto for verdade, há duas
    #: pessoas com acesso a esta conta.
    #:
    #: Não tranca nada: serve para AVISAR no primeiro acesso. Forçar a mudança
    #: transformaria a recuperação de acesso num obstáculo, e quem acabou de
    #: recuperar a conta é precisamente quem menos precisa de mais um passo.
    #: Limpa-se sozinha quando a pessoa muda a palavra-passe.
    password_provisoria: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )

    # --- Segundo factor (TOTP) ---
    # O segredo vai CIFRADO (ver src/auth/totp.py). Em claro, quem leia a base
    # gera códigos válidos de qualquer conta.
    totp_segredo: Mapped[str | None] = mapped_column(Text)
    # Só fica verdadeiro depois de o utilizador CONFIRMAR um código: sem isso,
    # uma configuração começada e abandonada trancava a conta na próxima
    # entrada.
    totp_ativo: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    totp_ativado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Passo de tempo do último código aceite. Um código vale cerca de um minuto;
    # sem guardar isto, o mesmo código serve duas vezes e quem o intercepte tem
    # uma janela para o repetir.
    totp_ultimo_contador: Mapped[int | None] = mapped_column(BigInteger)
    # Códigos de recuperação por gastar, em SHA-256. De uso único.
    totp_codigos_recuperacao: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )
    # Falhas seguidas e até quando a conta está travada. Contam por CONTA e não
    # por IP: o limite por IP não protege uma conta atacada a partir de muitos.
    totp_falhas: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"), nullable=False
    )
    totp_bloqueado_ate: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    ultimo_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # NULL = sem restrição pessoal, aplica-se só a regra do perfil e a activação
    # global da empresa (comportamento `modulosPermitidos` do Piloto). Lista vazia
    # significa mesmo "nenhum módulo", que é diferente de NULL.
    modulos_permitidos: Mapped[list[str] | None] = mapped_column(JSONB)

    # Capacidades extra somadas às do perfil (permissoesExtra no Piloto),
    # ex.: ["contab.fechar"].
    permissoes_extra: Mapped[list[str]] = mapped_column(
        JSONB, default=list, nullable=False
    )

    # Permissões por módulo e acção, exigidas por docs/TENANCY_AND_ACCESS.md:
    # {"contabilidade": ["ver", "criar"], "comercial": ["ver", "exportar"]}
    # Vazio = aplica-se apenas a matriz CAPS do perfil.
    permissoes_accao: Mapped[dict[str, list[str]]] = mapped_column(
        JSONB, default=dict, nullable=False
    )

    empresa: Mapped[Empresa | None] = relationship(foreign_keys=[empresa_id])

    def __repr__(self) -> str:
        return f"<User {self.email} {self.perfil}>"
