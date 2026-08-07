"""Ficha de Terceiro (cliente / fornecedor).

Transposto de `Piloto/assets/js/terceiros.js`, que define uma ficha única com
separadores (Moradas, Dados Fiscais, Bancos, Comerciais, Crédito, Contabilidade,
Observações) e é reutilizada pelos dois lados.

Desvio de estrutura, sem desvio de comportamento: o Piloto guarda clientes e
fornecedores em duas chaves separadas (`com_clientes`, `cmp_fornecedores`) mas
com campos idênticos. Aqui é uma tabela com discriminador `tipo`, mantendo a
numeração sequencial independente por tipo e o prefixo de conta próprio de cada
um (31… clientes, 32… fornecedores). Uma entidade que seja cliente e fornecedor
continua a ter dois registos, exactamente como no Piloto.
"""

from decimal import Decimal

from sqlalchemy import Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin

# Províncias de Angola (PROVINCIAS em terceiros.js).
PROVINCIAS = (
    "Bengo", "Benguela", "Bié", "Cabinda", "Cuando Cubango", "Cuanza Norte",
    "Cuanza Sul", "Cunene", "Huambo", "Huíla", "Luanda", "Lunda Norte",
    "Lunda Sul", "Malanje", "Moxico", "Namibe", "Uíge", "Zaire",
)


class Terceiro(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    __tablename__ = "terceiros"
    __table_args__ = (
        UniqueConstraint("empresa_id", "tipo", "numero", name="terceiro_numero"),
    )

    # "cliente" | "fornecedor" — determina a numeração e o prefixo de conta.
    tipo: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    numero: Mapped[str] = mapped_column(String(20), nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False, index=True)

    # ---- Moradas ----
    morada: Mapped[str | None] = mapped_column(String(300))
    morada2: Mapped[str | None] = mapped_column(String(300))
    localidade: Mapped[str | None] = mapped_column(String(120))
    codigo_postal: Mapped[str | None] = mapped_column(String(20))
    provincia: Mapped[str | None] = mapped_column(String(40))
    pais: Mapped[str] = mapped_column(String(60), default="Angola", nullable=False)
    telefone: Mapped[str | None] = mapped_column(String(40))
    telefone2: Mapped[str | None] = mapped_column(String(40))
    fax: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(200))
    web: Mapped[str | None] = mapped_column(String(200))
    # "Cliente" | "Fornecedor" | "Cliente e Fornecedor" | "Outro"
    tipo_terceiro: Mapped[str | None] = mapped_column(String(40))

    # ---- Dados fiscais ----
    nif: Mapped[str | None] = mapped_column(String(20), index=True)
    regime_iva: Mapped[str | None] = mapped_column(String(60))
    isento_iva: Mapped[bool] = mapped_column(default=False, nullable=False)
    retencao_fonte: Mapped[bool] = mapped_column(default=False, nullable=False)
    reparticao_fiscal: Mapped[str | None] = mapped_column(String(120))

    # ---- Bancos ----
    banco: Mapped[str | None] = mapped_column(String(120))
    iban: Mapped[str | None] = mapped_column(String(60))
    swift: Mapped[str | None] = mapped_column(String(20))

    # ---- Dados comerciais ----
    condicoes_pagamento: Mapped[str | None] = mapped_column(String(40))
    desconto_comercial: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0"), nullable=False
    )
    moeda: Mapped[str] = mapped_column(String(8), default="AKZ", nullable=False)
    responsavel: Mapped[str | None] = mapped_column(String(200))

    # ---- Crédito ----
    limite_credito: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), default=Decimal("0"), nullable=False
    )
    dias_credito: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="activo", nullable=False)

    # ---- Contabilidade ----
    # Subconta própria da conta corrente, criada automaticamente na 1.ª facturação
    # (contaCorrenteCliente no Piloto). Ex.: 31121001.
    conta: Mapped[str | None] = mapped_column(String(20), index=True)

    observacoes: Mapped[str | None] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<Terceiro {self.tipo} {self.numero} {self.nome!r}>"
