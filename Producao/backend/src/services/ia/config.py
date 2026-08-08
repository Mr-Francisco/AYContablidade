"""Definições de IA da plataforma, geridas pelo superadministrador.

Vivem na base e não em ficheiro nem no código: quem gere a plataforma ajusta-as
a partir da interface e a alteração vale para os pedidos seguintes, sem deploy
nenhum.
"""

from datetime import timedelta
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy import null as sa_null
from sqlalchemy.orm import Session

from src.db.base import agora
from src.db.models.ia import ConsultaIA, ModeloIA
from src.core.config import get_settings
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


# ---------------------------------------------------------------------------
# Retenção do histórico
# ---------------------------------------------------------------------------
#: Prazos até descartar o PACOTE enviado. Guardá-lo serve para auditar o que
#: saiu para a API, e essa utilidade tem vida curta — passado um mês ninguém
#: vai conferir o contexto de uma pergunta antiga. É a parte pesada: cerca de
#: 3 kB por consulta, contra escassas centenas de bytes do resto.
MIN_DIAS_PACOTE = 7
MAX_DIAS_PACOTE = 365

#: Prazos até APAGAR a consulta. O mínimo é largo de propósito: os totais de
#: consumo por empresa são somados a partir destas linhas, e apagar de mais faz
#: o consumo mentir em vez de o tornar mais barato de guardar.
MIN_DIAS_HISTORICO = 90
MAX_DIAS_HISTORICO = 3650

DIAS_PACOTE_POR_OMISSAO = 30
DIAS_HISTORICO_POR_OMISSAO = 365


def validar_retencao(dias_pacote: int, dias_historico: int) -> tuple[int, int]:
    """Confina os dois prazos e garante que fazem sentido juntos."""
    if not MIN_DIAS_PACOTE <= dias_pacote <= MAX_DIAS_PACOTE:
        raise ValueError(
            f"O prazo do pacote enviado tem de estar entre {MIN_DIAS_PACOTE} e "
            f"{MAX_DIAS_PACOTE} dias."
        )
    if not MIN_DIAS_HISTORICO <= dias_historico <= MAX_DIAS_HISTORICO:
        raise ValueError(
            f"O prazo do histórico tem de estar entre {MIN_DIAS_HISTORICO} e "
            f"{MAX_DIAS_HISTORICO} dias."
        )
    if dias_pacote > dias_historico:
        # Descartar o pacote depois de a consulta já ter sido apagada não
        # significa nada, e a configuração ficava a dizer uma coisa impossível.
        raise ValueError(
            "O prazo do pacote não pode ser maior do que o do histórico — a "
            "consulta já teria sido apagada."
        )
    return dias_pacote, dias_historico


def retencao(db: Session) -> tuple[int, int]:
    """(dias até descartar o pacote, dias até apagar a consulta)."""
    linha = db.execute(
        select(ConfigPlataforma.ia_dias_pacote, ConfigPlataforma.ia_dias_historico)
        .limit(1)
    ).first()
    if linha is None:
        return DIAS_PACOTE_POR_OMISSAO, DIAS_HISTORICO_POR_OMISSAO
    return int(linha[0]), int(linha[1])


def limpar_historico(db: Session, *, empresa_id: UUID) -> dict:
    """Aplica os dois prazos ao histórico de uma empresa.

    Corre depois de cada consulta nova, para a empresa que a fez. Não precisa
    de agendador nenhum: quem cria linhas é quem as vai limpando, e o trabalho
    é proporcional ao que essa empresa acumulou — não à tabela inteira. As duas
    consultas usam o índice `(empresa_id, criado_em)`.

    NUNCA APAGA LINHAS DO MÊS CORRENTE, seja qual for a configuração. Os totais
    de consumo do mês são somados a partir destas linhas e são eles que travam
    quem passa da quota; apagá-las faria o contador recuar e a empresa
    continuar a consumir depois de ter esgotado o plano. O mínimo de 90 dias já
    o impediria — isto é a rede por baixo dele, para o dia em que alguém baixar
    o mínimo sem reparar na consequência.
    """
    dias_pacote, dias_historico = retencao(db)
    hoje = agora()
    inicio_do_mes = hoje.replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )

    corte_apagar = min(hoje - timedelta(days=dias_historico), inicio_do_mes)
    apagadas = db.execute(
        delete(ConsultaIA).where(
            ConsultaIA.empresa_id == empresa_id,
            ConsultaIA.criado_em < corte_apagar,
        )
    ).rowcount

    # O pacote sai das que ficam. `isnot(None)` evita reescrever linhas que já
    # foram limpas numa passagem anterior.
    corte_pacote = hoje - timedelta(days=dias_pacote)
    limpas = db.execute(
        update(ConsultaIA)
        .where(
            ConsultaIA.empresa_id == empresa_id,
            ConsultaIA.criado_em < corte_pacote,
            ConsultaIA.dados_enviados.isnot(None),
        )
        # `null()` e não `None`: numa coluna JSONB, `None` grava o VALOR JSON
        # `null`, que em SQL não é NULL. A linha continuava a casar com o
        # `isnot(None)` acima e cada pergunta nova reescrevia todo o histórico
        # antigo da empresa — o contrário do que esta guarda existe para fazer.
        .values(dados_enviados=sa_null())
    ).rowcount

    return {"apagadas": apagadas or 0, "pacotes_descartados": limpas or 0}


# ---------------------------------------------------------------------------
# Modelo e interruptor
# ---------------------------------------------------------------------------
def modelos_suportados(db: Session) -> list[str]:
    """Modelos que a plataforma pode usar agora — os activos do registo.

    SÃO OS QUE TÊM PREÇO, e a regra não é arbitrária: sem preço não se estima
    o custo, sem custo estimado as quotas por empresa ficam cegas, e uma quota
    cega não trava nada. Por isso um modelo só entra aqui depois de alguém
    dizer quanto custa — é o registo que impõe as duas coisas ao mesmo tempo.

    Não é a lista da OpenAI. Essa traz quase uma centena de entradas — modelos
    antigos, de embeddings, de áudio — que esta integração não usa, e oferecê-la
    seria convidar a escolher algo que não funciona aqui.
    """
    return list(
        db.scalars(
            select(ModeloIA.modelo_id)
            .where(ModeloIA.ativo.is_(True))
            .order_by(ModeloIA.preco_saida.desc())
        )
    )


def modelo(db: Session) -> str:
    """Modelo a usar agora: o do registo marcado como padrão.

    Cai no `OPENAI_MODELO` do ambiente se não houver padrão activo — numa base
    ainda por semear, ou depois de alguém desactivar o que estava escolhido.
    Sem esta saída, o assistente ficava calado por causa de uma configuração
    incompleta, e prefere-se que responda pelo valor do ambiente.
    """
    escolhido = db.scalar(
        select(ModeloIA.modelo_id).where(
            ModeloIA.padrao.is_(True), ModeloIA.ativo.is_(True)
        )
    )
    return (escolhido or "").strip() or get_settings().OPENAI_MODELO


def validar_modelo(db: Session, nome: str) -> str:
    suportados = modelos_suportados(db)
    limpo = (nome or "").strip()
    if limpo not in suportados:
        raise ValueError(
            f"«{limpo}» não é um modelo activo no registo. Os disponíveis são: "
            f"{', '.join(suportados) or '(nenhum)'}."
        )
    return limpo


def ia_ativa(db: Session) -> bool:
    """O assistente está ligado para toda a plataforma?"""
    valor = db.scalar(select(ConfigPlataforma.ia_ativa).limit(1))
    return True if valor is None else bool(valor)
