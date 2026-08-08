"""Registo de modelos de IA: regras de quem pode entrar e sair da lista.

As regras estão aqui e não nas rotas porque são invariantes do sistema, não do
HTTP: tem de haver sempre um padrão utilizável, os preços têm de ser plausíveis,
e o identificador tem de ser um que a API configurada aceite.
"""

import logging
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from src.db.models.ia import ModeloIA

log = logging.getLogger(__name__)

#: Tecto por 1 000 000 de tokens. Não é um limite técnico — é um travão contra
#: o dedo escorregado. Escrever 800 onde se queria 8,00 multiplicava por cem o
#: custo estimado de toda a plataforma sem nada avisar.
PRECO_MAXIMO = Decimal("1000")


def listar(db: Session, *, so_ativos: bool = False) -> list[ModeloIA]:
    q = select(ModeloIA).order_by(ModeloIA.preco_saida.desc())
    if so_ativos:
        q = q.where(ModeloIA.ativo.is_(True))
    return list(db.scalars(q))


def _preco(valor, campo: str, *, obrigatorio: bool = True) -> Decimal | None:
    """Converte e confina um preço.

    Aceita texto de propósito: `0.1` em vírgula flutuante não é exactamente um
    décimo, e aqui multiplicam-se dinheiros por milhões de tokens.
    """
    if valor is None or valor == "":
        if obrigatorio:
            raise ValueError(f"Indique o {campo}.")
        return None
    try:
        d = Decimal(str(valor))
    except (InvalidOperation, ValueError) as e:
        raise ValueError(f"O {campo} não é um número válido.") from e
    if d < 0:
        raise ValueError(f"O {campo} não pode ser negativo.")
    if d > PRECO_MAXIMO:
        raise ValueError(
            f"O {campo} parece errado: {d} por milhão de tokens. O máximo "
            f"aceite é {PRECO_MAXIMO}."
        )
    return d


def validar_precos(entrada, cache, saida) -> tuple[Decimal, Decimal | None, Decimal]:
    e = _preco(entrada, "preço de entrada")
    c = _preco(cache, "preço da entrada em cache", obrigatorio=False)
    s = _preco(saida, "preço de saída")
    if c is not None and c > e:
        # A entrada em cache é sempre mais barata do que a normal. Se vier
        # maior, os dois campos foram trocados — e o custo passava a ser
        # calculado ao contrário sem ninguém dar por isso.
        raise ValueError(
            "O preço da entrada em cache não pode ser maior do que o da "
            "entrada normal — verifique se os campos não estão trocados."
        )
    return e, c, s


def verificar_na_api(modelo_id: str) -> str | None:
    """Confirma que a API configurada conhece este identificador.

    Devolve `None` quando está tudo bem, ou um aviso quando NÃO FOI POSSÍVEL
    verificar. Não verificar não impede de gravar: a alternativa era deixar a
    plataforma por configurar sempre que a OpenAI estivesse inacessível ou a
    chave em rotação. Um identificador errado dá erro na primeira pergunta, que
    é um problema recuperável; ficar sem poder configurar não é.

    O que NÃO faz é aceitar em silêncio um identificador que a API recusa: isso
    levanta erro, porque é uma escolha errada e sabe-se que é.
    """
    from src.services.ia.qa import ErroIA, listar_modelos

    try:
        disponiveis = listar_modelos()
    except ErroIA as e:
        log.info("Modelos de IA: não foi possível verificar «%s» (%s).", modelo_id, e)
        return (
            "Não foi possível confirmar o identificador junto da OpenAI "
            f"({e}). O modelo foi gravado — confirme que o identificador está "
            "correcto antes de o tornar padrão."
        )
    if modelo_id not in disponiveis:
        raise ValueError(
            f"A OpenAI não reconhece o modelo «{modelo_id}» com a chave "
            "configurada. Verifique o identificador técnico."
        )
    return None


def criar(
    db: Session,
    *,
    nome: str,
    modelo_id: str,
    preco_entrada,
    preco_saida,
    preco_entrada_cache=None,
    nota: str | None = None,
    verificar: bool = True,
) -> tuple[ModeloIA, str | None]:
    nome = (nome or "").strip()
    modelo_id = (modelo_id or "").strip()
    if not nome:
        raise ValueError("Dê um nome ao modelo.")
    if not modelo_id:
        raise ValueError("Indique o identificador técnico do modelo.")

    existe = db.scalar(select(ModeloIA).where(ModeloIA.modelo_id == modelo_id))
    if existe is not None:
        raise ValueError(f"O modelo «{modelo_id}» já está no registo.")

    e, c, s = validar_precos(preco_entrada, preco_entrada_cache, preco_saida)
    aviso = verificar_na_api(modelo_id) if verificar else None

    m = ModeloIA(
        nome=nome,
        modelo_id=modelo_id,
        preco_entrada=e,
        preco_entrada_cache=c,
        preco_saida=s,
        nota=(nota or "").strip() or None,
        ativo=True,
        padrao=False,
    )
    db.add(m)
    db.flush()
    return m, aviso


def obter(db: Session, modelo_uuid: UUID) -> ModeloIA:
    m = db.get(ModeloIA, modelo_uuid)
    if m is None:
        raise ValueError("Modelo não encontrado.")
    return m


def actualizar(db: Session, modelo_uuid: UUID, dados: dict) -> ModeloIA:
    m = obter(db, modelo_uuid)

    if "nome" in dados:
        nome = (dados["nome"] or "").strip()
        if not nome:
            raise ValueError("Dê um nome ao modelo.")
        m.nome = nome
    if "nota" in dados:
        m.nota = (dados["nota"] or "").strip() or None

    if {"preco_entrada", "preco_entrada_cache", "preco_saida"} & dados.keys():
        # Validam-se em conjunto: um preço de cache sozinho pode ser válido e
        # mesmo assim ficar acima da entrada que já lá estava.
        m.preco_entrada, m.preco_entrada_cache, m.preco_saida = validar_precos(
            dados.get("preco_entrada", m.preco_entrada),
            dados.get("preco_entrada_cache", m.preco_entrada_cache),
            dados.get("preco_saida", m.preco_saida),
        )

    if "ativo" in dados:
        ativo = bool(dados["ativo"])
        if not ativo and m.padrao:
            # Desactivar o padrão deixava a plataforma sem modelo escolhido e a
            # cair no valor do ambiente sem ninguém pedir. Escolhe-se outro
            # primeiro.
            raise ValueError(
                "Este é o modelo padrão. Escolha outro como padrão antes de o "
                "desactivar."
            )
        m.ativo = ativo

    db.flush()
    return m


def definir_padrao(db: Session, modelo_uuid: UUID) -> ModeloIA:
    """Passa a usar este modelo em todas as gerações, para todas as empresas."""
    m = obter(db, modelo_uuid)
    if not m.ativo:
        raise ValueError("Só um modelo activo pode ser o padrão.")

    # Limpar antes de marcar: o índice único parcial recusaria dois padrões ao
    # mesmo tempo, e é ele — não este código — que garante a regra.
    db.execute(update(ModeloIA).where(ModeloIA.padrao.is_(True)).values(padrao=False))
    m.padrao = True
    db.flush()
    return m


def eliminar(db: Session, modelo_uuid: UUID) -> str:
    """Remove um modelo do registo.

    Apagar não toca no histórico: cada consulta guardou o nome do modelo e os
    preços que lhe foram aplicados, por isso os custos antigos continuam
    explicáveis mesmo depois de o modelo desaparecer daqui.
    """
    m = obter(db, modelo_uuid)
    if m.padrao:
        raise ValueError(
            "Não se apaga o modelo padrão. Escolha outro como padrão primeiro."
        )
    nome = m.modelo_id
    db.delete(m)
    db.flush()
    return nome
