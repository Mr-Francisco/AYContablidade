"""Registo das consultas ao módulo de IA.

Existe por duas razões, e a segunda é a mais importante:

1. Histórico para o utilizador reencontrar respostas.
2. PROVA. `dados_enviados` guarda exactamente o pacote que saiu para a API
   externa — já pseudonimizado e sem identificadores. Sem este registo não há
   forma de demonstrar, mais tarde, que nenhum dado pessoal foi enviado.
"""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base, EmpresaScopedMixin, TimestampMixin, UUIDMixin


class ModeloIA(UUIDMixin, TimestampMixin, Base):
    """Modelos que a plataforma pode usar, e quanto custam.

    Vive na base e não no código porque os preços da OpenAI mudam sem aviso e
    porque a escolha do modelo é uma decisão de custo — toma-se a olhar para a
    factura, não num deploy. O superadministrador acrescenta, altera preços,
    desactiva e escolhe o padrão a partir da interface.

    NÃO É UM SEGREDO: os preços são públicos e o `modelo_id` também. A chave da
    API continua a viver só no ambiente e nunca passa por aqui.

    O que aqui se guarda são os preços EM VIGOR. Os preços APLICADOS a cada
    consulta ficam copiados na própria consulta (`ia_consultas`), para que
    mexer nesta tabela nunca reescreva o custo do que já aconteceu.
    """

    __tablename__ = "ia_modelos"

    #: Nome para quem lê o painel: «Equilibrado», «Análises complexas».
    nome: Mapped[str] = mapped_column(String(80), nullable=False)

    #: O identificador técnico que vai no corpo do pedido à API. É por este que
    #: se casa o preço com o modelo que respondeu, por isso é único.
    modelo_id: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

    #: Dólares por 1 000 000 de tokens. Seis casas porque há modelos abaixo de
    #: um cêntimo por milhão, e arredondar antes de multiplicar propaga o erro.
    preco_entrada: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    #: Entrada repetida que a API cobra mais barato. Nulo quando o modelo não
    #: distingue — e aí a entrada em cache paga o preço de entrada normal.
    preco_entrada_cache: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    preco_saida: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)

    #: Para que serve, em duas palavras. Ajuda a escolher sem ir ler a
    #: documentação da OpenAI.
    nota: Mapped[str | None] = mapped_column(String(160))

    #: Desactivado deixa de poder ser escolhido, mas continua a explicar o
    #: histórico: as consultas antigas guardam o nome do modelo que as atendeu.
    ativo: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )

    #: O que a plataforma usa. Só um pode estar marcado — garantido por um
    #: índice único parcial, e não apenas pelo código que o escreve.
    padrao: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )

    def __repr__(self) -> str:
        return f"<ModeloIA {self.modelo_id}{' (padrão)' if self.padrao else ''}>"


class ConsultaIA(UUIDMixin, EmpresaScopedMixin, TimestampMixin, Base):
    __tablename__ = "ia_consultas"

    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    pergunta: Mapped[str] = mapped_column(Text, nullable=False)
    # {"ambitos": [...], "exercicio_id": ..., "de": ..., "ate": ..., "mes": ...}
    contexto: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # O pacote exacto que foi enviado para a API externa.
    dados_enviados: Mapped[dict | None] = mapped_column(JSONB)
    # Quantas entidades foram pseudonimizadas neste pedido.
    entidades_pseudonimizadas: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    resposta: Mapped[str | None] = mapped_column(Text)
    modelo: Mapped[str | None] = mapped_column(String(80))
    tokens_entrada: Mapped[int | None] = mapped_column(Integer)
    #: Parte da entrada que a API serviu de cache e cobrou mais barato. Vem em
    #: `usage.prompt_tokens_details.cached_tokens` e está INCLUÍDA em
    #: `tokens_entrada` — somar os dois contava a mesma coisa duas vezes.
    tokens_entrada_cache: Mapped[int | None] = mapped_column(Integer)
    tokens_saida: Mapped[int | None] = mapped_column(Integer)
    # Custo ESTIMADO em dólares, calculado dos tokens pela tabela de preços de
    # `services/ia/precos.py`. Fica gravado no momento da consulta, e não
    # recalculado depois: se a tabela de preços mudar, o histórico tem de
    # continuar a dizer o que a consulta custou na altura.
    custo: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    # OS PREÇOS APLICADOS, em dólares por milhão de tokens. Sem isto, o custo
    # gravado era um número sem forma de o reconstruir: quando a OpenAI mudasse
    # os preços deixava de haver maneira de explicar como se chegou aos valores
    # antigos, e a facturação histórica ficava inauditável.
    #
    # Seis casas decimais porque há modelos abaixo de um cêntimo por milhão de
    # tokens, e arredondar o preço antes de multiplicar propaga o erro.
    preco_entrada: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    preco_entrada_cache: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    preco_saida: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    duracao_ms: Mapped[int | None] = mapped_column(Integer)
    erro: Mapped[str | None] = mapped_column(Text)

    def __repr__(self) -> str:
        return f"<ConsultaIA {self.criado_em} {self.pergunta[:40]!r}>"
