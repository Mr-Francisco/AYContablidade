"""Definições de IA da plataforma, geridas pelo superadministrador.

Vivem na base e não em ficheiro nem no código: quem gere a plataforma ajusta-as
a partir da interface e a alteração vale para os pedidos seguintes, sem deploy
nenhum.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models.tenancy import ConfigPlataforma

#: Limites do tecto de tokens de resposta.
#:
#: O MÍNIMO não é decorativo. Uma resposta cortada aos 50 tokens não é uma
#: resposta barata — é uma resposta inútil que se paga na mesma e que a pessoa
#: vai repetir, gastando o dobro. Abaixo disto o limite deixa de poupar.
#:
#: O MÁXIMO existe para que o campo continue a ser um travão: sem tecto, um
#: valor enorme escrito por engano tornava a configuração num nome bonito para
#: «sem limite».
MIN_TOKENS_SAIDA = 200
MAX_TOKENS_SAIDA = 4000

#: Usado quando a linha ainda não existe — instalação anterior à migração, ou
#: base a ser criada. Nunca devolve `None`: um tecto ausente seria tratado como
#: «sem limite» pelo chamador, que é o contrário do que esta definição existe
#: para fazer.
POR_OMISSAO = 800


def obter(db: Session) -> ConfigPlataforma:
    """A linha única de configuração, criando-a se faltar."""
    cfg = db.scalar(select(ConfigPlataforma).limit(1))
    if cfg is None:
        cfg = ConfigPlataforma(max_tokens_saida=POR_OMISSAO)
        db.add(cfg)
        db.flush()
    return cfg


def max_tokens_saida(db: Session) -> int:
    """Tecto de tokens de resposta a aplicar agora.

    Lido a cada pedido de propósito, e não guardado em memória: quando o
    superadministrador o altera, a pergunta seguinte já usa o valor novo. É um
    inteiro por consulta — o custo da leitura não se compara ao da chamada à
    API que vem a seguir.
    """
    valor = db.scalar(select(ConfigPlataforma.max_tokens_saida).limit(1))
    return int(valor) if valor else POR_OMISSAO


def validar(valor: int) -> int:
    """Confina o valor aos limites. Levanta `ValueError` fora deles."""
    if not MIN_TOKENS_SAIDA <= valor <= MAX_TOKENS_SAIDA:
        raise ValueError(
            f"O limite de tokens por resposta tem de estar entre "
            f"{MIN_TOKENS_SAIDA} e {MAX_TOKENS_SAIDA}."
        )
    return valor
