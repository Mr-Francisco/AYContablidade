"""Assistente inteligente: perguntas e respostas, e diagnóstico de erros.

Nota: NÃO usar `from __future__ import annotations` — slowapi (docs/LESSONS.md).
"""

from datetime import date as Date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from src.api.deps import DB, EmpresaAtual, UtilizadorAtual, exigir_cap
from src.services.ia import contexto as ctx
from src.services.ia import diagnostico as diag
from src.services.ia import consumo as cons
from src.services.ia import qa
from src.services.ia.consumo import QuotaExcedida
from src.services.ia.qa import ErroIA

router = APIRouter(
    prefix="/api/ia",
    tags=["inteligência artificial"],
    # Ver os dados do sistema é o mínimo para poder perguntar sobre eles.
    dependencies=[Depends(exigir_cap("contab.ver"))],
)


class ContextoPedido(BaseModel):
    """O que define o pacote: âmbitos e período. A pergunta NÃO entra aqui.

    A pré-visualização usa este esquema e não o de `PerguntaPedido`: a página
    promete que se pode confirmar o que sai antes de perguntar, e exigir a
    pergunta para isso contrariava a própria garantia. O pacote é exactamente o
    mesmo — a pergunta viaja à parte, no pedido ao modelo.
    """

    ambitos: list[str] = Field(min_length=1)
    exercicio_id: UUID | None = None
    de: Date | None = None
    ate: Date | None = None
    mes: str | None = Field(default=None, max_length=2)
    incluir_diagnostico: bool = True


class PerguntaPedido(ContextoPedido):
    pergunta: str = Field(min_length=1, max_length=2000)


# ---------------------------------------------------------------------------
# Contextos disponíveis
# ---------------------------------------------------------------------------
@router.get("/ambitos")
def ambitos(empresa: EmpresaAtual, user: UtilizadorAtual, db: DB) -> list[dict]:
    """Âmbitos que este utilizador pode consultar.

    Filtrados pelas mesmas regras de acesso do resto do sistema: quem não vê o
    módulo de RH também não pode fazer perguntas sobre salários.
    """
    from src.api.deps import licenca_da_empresa
    from src.auth.permissions import modulo_ativo
    from src.db.models.tenancy import ConfigEmpresa
    from sqlalchemy import select

    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa.id))
    lic = licenca_da_empresa(db, empresa.id)
    return [
        a for a in ctx.AMBITOS
        if modulo_ativo(a["modulo"], user, config=cfg, licenca=lic)
    ]


def _validar_ambitos(
    pedidos: list[str], empresa, user, db
) -> list[str]:
    """Rejeita âmbitos inexistentes ou a que o utilizador não tem acesso."""
    from src.api.deps import licenca_da_empresa
    from src.auth.permissions import modulo_ativo
    from src.db.models.tenancy import ConfigEmpresa
    from sqlalchemy import select

    cfg = db.scalar(select(ConfigEmpresa).where(ConfigEmpresa.empresa_id == empresa.id))
    lic = licenca_da_empresa(db, empresa.id)

    validos = []
    for a in pedidos:
        defn = ctx.ambito_valido(a)
        if defn is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"Âmbito desconhecido: {a}."
            )
        if not modulo_ativo(defn["modulo"], user, config=cfg, licenca=lic):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Sem acesso ao módulo {defn['nome']}.",
            )
        validos.append(a)
    return validos


# ---------------------------------------------------------------------------
# Diagnóstico — local, sem IA
# ---------------------------------------------------------------------------
@router.get("/diagnostico")
def diagnostico(
    empresa: EmpresaAtual,
    user: UtilizadorAtual,
    db: DB,
    exercicio_id: UUID | None = None,
    ambitos: str | None = None,
) -> dict:
    """Detecção de erros e incoerências por regras.

    Corre inteiramente no servidor, sem contactar nenhuma API externa. Funciona
    mesmo sem chave da OpenAI configurada.
    """
    modulos = None
    if ambitos:
        pedidos = [a.strip() for a in ambitos.split(",") if a.strip()]
        modulos = set(_validar_ambitos(pedidos, empresa, user, db))
    return diag.diagnosticar(
        db, empresa_id=empresa.id, exercicio_id=exercicio_id, modulos=modulos
    )


# ---------------------------------------------------------------------------
# Pré-visualização do que sai
# ---------------------------------------------------------------------------
@router.post("/contexto")
def previsualizar_contexto(
    request: Request,
    dados: ContextoPedido,
    empresa: EmpresaAtual,
    user: UtilizadorAtual,
    db: DB,
) -> dict:
    """Mostra EXACTAMENTE o pacote que seria enviado à IA, sem o enviar.

    Existe para o utilizador poder confirmar por si próprio que nenhum dado
    pessoal sai do sistema, antes de fazer a pergunta.
    """
    validos = _validar_ambitos(dados.ambitos, empresa, user, db)
    pacote, ps = ctx.construir(
        db, empresa_id=empresa.id, ambitos=validos, exercicio_id=dados.exercicio_id,
        de=dados.de, ate=dados.ate, mes=dados.mes,
        incluir_diagnostico=dados.incluir_diagnostico,
    )
    from src.services.ia.redaccao import verificar_sem_dados_pessoais

    return {
        "pacote": pacote,
        "entidades_pseudonimizadas": ps.total,
        "identificadores_detectados": verificar_sem_dados_pessoais(pacote),
    }


# ---------------------------------------------------------------------------
# Perguntas e respostas
# ---------------------------------------------------------------------------
@router.get("/estado")
def estado(db: DB) -> dict:
    """Se o módulo de perguntas está operacional, e com que modelo.

    O modelo vem da configuração da plataforma e não do ambiente: é o
    superadministrador que o escolhe, e a interface tem de mostrar o que está
    mesmo a ser usado.
    """
    from src.services.ia import config as cfg_ia

    ligada = cfg_ia.ia_ativa(db)
    return {
        "disponivel": qa.ia_disponivel() and ligada,
        "modelo": cfg_ia.modelo(db),
        "diagnostico_local": True,
        # Distingue «falta a chave» de «foi desligado» — são coisas diferentes
        # e a mensagem a mostrar também é.
        "desligada_pela_plataforma": not ligada,
    }


@router.get("/modelos")
def modelos() -> list[str]:
    """Modelos a que a chave configurada tem acesso, para escolher o mais
    recente sem depender de um nome fixo no código."""
    try:
        return qa.listar_modelos()
    except ErroIA as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e


@router.post("/perguntar")
def perguntar(
    request: Request,
    dados: PerguntaPedido,
    empresa: EmpresaAtual,
    user: UtilizadorAtual,
    db: DB,
) -> dict:
    """Responde a uma pergunta sobre os dados do contexto e período escolhidos."""
    validos = _validar_ambitos(dados.ambitos, empresa, user, db)
    try:
        r = qa.perguntar(
            db, empresa_id=empresa.id, user_id=user.id, pergunta=dados.pergunta,
            ambitos=validos, exercicio_id=dados.exercicio_id, de=dados.de,
            ate=dados.ate, mes=dados.mes,
            incluir_diagnostico=dados.incluir_diagnostico,
        )
    except QuotaExcedida as e:
        # 402 e não 503: o serviço está bem, o que acabou foi o plano. É o
        # mesmo código que a licença inactiva usa, e a interface já o sabe
        # distinguir de uma falha.
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, str(e)) from e
    except ErroIA as e:
        # A tentativa falhada fica gravada no histórico — por isso commit.
        db.commit()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    db.commit()
    return r



@router.get("/consumo")
def consumo(empresa: EmpresaAtual, db: DB) -> dict:
    """Consumo de IA da empresa no mês e como se compara com o limite.

    Os tokens são medidos ao certo; o custo é uma ESTIMATIVA a partir de uma
    tabela de preços que tem de ser confirmada contra a facturação real.
    """
    return cons.estado_quota(db, empresa_id=empresa.id)


@router.get("/historico")
def historico(
    empresa: EmpresaAtual, user: UtilizadorAtual, db: DB,
    so_minhas: bool = True, limite: int = 30,
) -> list[dict]:
    return qa.historico(
        db, empresa_id=empresa.id,
        user_id=user.id if so_minhas else None, limite=limite,
    )


@router.get("/historico/{consulta_id}/dados-enviados")
def dados_enviados(consulta_id: UUID, empresa: EmpresaAtual, db: DB) -> dict:
    """Pacote exacto que saiu para a API nesta consulta — auditoria."""
    try:
        return {"dados": qa.dados_enviados(db, empresa_id=empresa.id,
                                           consulta_id=consulta_id)}
    except ErroIA as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
