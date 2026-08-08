"""Perguntas e respostas sobre os dados do sistema.

Único ponto de todo o sistema que fala com uma API de IA externa. Tudo o resto
é local, por regra (`docs/AI_INTEGRATION.md`).

O que a IA recebe: um pacote de dados já filtrado pelo contexto e período,
agregado e pseudonimizado. O que a IA NÃO recebe e nunca poderá receber: acesso
à base de dados, credenciais, capacidade de executar SQL ou de alterar seja o
que for. Não há ferramentas expostas ao modelo — é uma chamada de texto para
texto.
"""

import json
import logging
import time
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.core.config import get_settings
from src.db.models.ia import ConsultaIA
from src.services.ia.contexto import construir
from src.services.ia import config as config_ia
from src.services.ia.consumo import custo_de, verificar_quota
from src.services.ia.redaccao import (
    Pseudonimizador,
    limpar_texto,
    verificar_sem_dados_pessoais,
)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODELOS_URL = "https://api.openai.com/v1/models"

log = logging.getLogger(__name__)

INSTRUCOES = """\
És um assistente de análise contabilística de um ERP angolano que segue o Plano \
Geral de Contabilidade (PGC-AR). Respondes SEMPRE em Português de Portugal.

Regras que não podes quebrar:

1. Responde EXCLUSIVAMENTE com base nos dados que te são fornecidos nesta \
mensagem. Não inventes valores, contas, datas nem entidades. Se a resposta não \
estiver nos dados, di-lo claramente e indica que dados seriam precisos.
2. Não tens acesso à base de dados nem podes executá-la. Não sugiras SQL.
3. Não alteras nada no sistema. És uma ferramenta de consulta e análise.
4. Não substituis o julgamento do contabilista. Quando apontares um problema, \
explica o raciocínio para a pessoa poder verificar.
5. As entidades aparecem com nomes genéricos («Cliente 1», «Colaborador 2»). \
Usa-os tal como estão — o sistema repõe os nomes reais antes de mostrar a \
resposta.
6. Os valores monetários vêm como texto para não perderem exactidão. Ao fazeres \
contas, mantém as duas casas decimais e indica a moeda.

Estilo: directo e conciso. Começa pela resposta, não por preâmbulos. Usa tabelas \
markdown quando comparares valores. Quando um número te parecer anómalo à luz \
das regras contabilísticas, diz porquê."""


class ErroIA(Exception):
    """Falha no módulo de IA. Mapeia para 4xx/503 na API."""


def _settings():
    return get_settings()


def ia_disponivel() -> bool:
    return bool(_settings().OPENAI_API_KEY)


def listar_modelos() -> list[str]:
    """Modelos a que a chave configurada tem acesso.

    Existe para o administrador poder escolher o mais recente sem depender de
    um nome fixo no código — a lista da OpenAI muda com frequência e um modelo
    fixo ficaria desactualizado ou inválido.
    """
    s = _settings()
    if not s.OPENAI_API_KEY:
        raise ErroIA("A chave da API da OpenAI não está configurada.")
    try:
        r = httpx.get(
            OPENAI_MODELOS_URL,
            headers={"Authorization": f"Bearer {s.OPENAI_API_KEY}"},
            timeout=20,
        )
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise ErroIA(f"Não foi possível obter a lista de modelos: {e}") from e
    dados = r.json().get("data", [])
    return sorted(m["id"] for m in dados if m.get("id", "").startswith("gpt"))


def _chamar_openai(pacote: dict, pergunta: str, max_saida: int, modelo: str) -> dict:
    s = _settings()
    if not s.OPENAI_API_KEY:
        raise ErroIA(
            "A chave da API da OpenAI não está configurada. Defina OPENAI_API_KEY "
            "no ficheiro .env."
        )

    corpo = {
        "model": modelo,
        # O CORTE É AQUI, imposto pela API, e não no pedido ao modelo. Pedir
        # brevidade nas instruções ajuda a resposta a acabar bem, mas é um
        # pedido — o modelo pode não o cumprir. Isto é um limite.
        "max_tokens": max_saida,
        "messages": [
            {
                "role": "system",
                "content": (
                    f"{INSTRUCOES}\n"
                    f"12. Tens um limite de {max_saida} tokens para a resposta. "
                    "Escreve de forma a CABER nele: vai ao essencial e fecha o "
                    "raciocínio. Uma resposta cortada a meio não serve a "
                    "ninguém."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Dados do sistema (already filtered — não existem outros):\n"
                    f"```json\n{json.dumps(pacote, ensure_ascii=False, indent=1)}\n```\n\n"
                    f"Pergunta: {pergunta}"
                ),
            },
        ],
        "temperature": 0.2,
    }

    try:
        r = httpx.post(
            OPENAI_URL,
            headers={
                "Authorization": f"Bearer {s.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=corpo,
            timeout=s.OPENAI_TIMEOUT_SEGUNDOS,
        )
    except httpx.TimeoutException as e:
        raise ErroIA("A IA demorou demasiado a responder. Tente uma pergunta mais "
                     "específica ou um período mais curto.") from e
    except httpx.HTTPError as e:
        raise ErroIA(f"Falha na comunicação com a IA: {e}") from e

    if r.status_code == 401:
        raise ErroIA("A chave da API da OpenAI foi recusada. Verifique OPENAI_API_KEY.")
    if r.status_code == 429:
        raise ErroIA("Limite de utilização da OpenAI atingido. Tente daqui a pouco.")
    if r.status_code >= 400:
        detalhe = ""
        try:
            detalhe = r.json().get("error", {}).get("message", "")
        except ValueError:
            detalhe = r.text[:200]
        raise ErroIA(f"A OpenAI recusou o pedido: {detalhe}")

    dados = r.json()
    escolha = (dados.get("choices") or [{}])[0]
    uso = dados.get("usage") or {}
    # A entrada servida de cache é cobrada mais barato e vem aqui dentro. Está
    # INCLUÍDA em `prompt_tokens` — quem a somar à parte conta-a duas vezes.
    detalhe_entrada = uso.get("prompt_tokens_details") or {}
    return {
        "texto": (escolha.get("message") or {}).get("content") or "",
        "modelo": dados.get("model"),
        "tokens_entrada": uso.get("prompt_tokens"),
        "tokens_entrada_cache": detalhe_entrada.get("cached_tokens") or 0,
        "tokens_saida": uso.get("completion_tokens"),
    }


def perguntar(
    db: Session,
    *,
    empresa_id: UUID,
    user_id: UUID | None,
    pergunta: str,
    ambitos: list[str],
    exercicio_id: UUID | None = None,
    de=None,
    ate=None,
    mes: str | None = None,
    incluir_diagnostico: bool = True,
) -> dict:
    """Responde a uma pergunta sobre os dados do contexto e período indicados.

    A sequência é sempre esta e não pode ser alterada:
      consultar a base -> agregar -> pseudonimizar -> VERIFICAR -> enviar ->
      repor os nomes.

    A verificação antes do envio é deliberadamente redundante com as camadas
    anteriores. Se encontrar um identificador que escapou, o envio é abortado —
    é preferível falhar a consulta a vazar um dado pessoal.
    """
    pergunta = (pergunta or "").strip()
    if not pergunta:
        raise ErroIA("Escreva a pergunta.")
    if len(pergunta) > 2000:
        raise ErroIA("A pergunta é demasiado longa (máximo 2000 caracteres).")
    if not ambitos:
        raise ErroIA("Escolha pelo menos um âmbito de análise.")

    # Antes de construir o contexto e antes de contactar a API: uma chamada já
    # feita custa dinheiro mesmo que a resposta seja recusada.
    quota = verificar_quota(db, empresa_id=empresa_id)

    pacote, ps = construir(
        db, empresa_id=empresa_id, ambitos=ambitos, exercicio_id=exercicio_id,
        de=de, ate=ate, mes=mes, incluir_diagnostico=incluir_diagnostico,
    )

    # A própria pergunta é escrita por uma pessoa e pode conter um NIF.
    pergunta_limpa = limpar_texto(pergunta)

    fugas = verificar_sem_dados_pessoais(pacote) + verificar_sem_dados_pessoais(
        pergunta_limpa
    )
    if fugas:
        raise ErroIA(
            "Consulta bloqueada: foram detectados identificadores pessoais nos "
            f"dados a enviar ({len(fugas)} ocorrência(s)). Nada foi enviado para "
            "a IA. Comunique esta ocorrência ao administrador."
        )

    registo = ConsultaIA(
        empresa_id=empresa_id, user_id=user_id, pergunta=pergunta,
        contexto={
            "ambitos": ambitos,
            "exercicio_id": str(exercicio_id) if exercicio_id else None,
            "de": str(de) if de else None, "ate": str(ate) if ate else None,
            "mes": mes,
        },
        dados_enviados=pacote,
        entidades_pseudonimizadas=ps.total,
    )
    db.add(registo)

    # Lido agora, não em memória: se o superadministrador alterar o tecto, a
    # pergunta seguinte já usa o valor novo.
    if not config_ia.ia_ativa(db):
        raise ErroIA(
            "O assistente está desligado pela administração da plataforma. "
            "Contacte o suporte."
        )
    max_saida = config_ia.max_tokens_saida(db)
    modelo = config_ia.modelo(db)

    inicio = time.monotonic()
    try:
        r = _chamar_openai(pacote, pergunta_limpa, max_saida, modelo)
    except ErroIA as e:
        registo.erro = str(e)
        registo.duracao_ms = int((time.monotonic() - inicio) * 1000)
        db.flush()
        raise

    registo.duracao_ms = int((time.monotonic() - inicio) * 1000)
    registo.modelo = r["modelo"]
    registo.tokens_entrada = r["tokens_entrada"]
    registo.tokens_entrada_cache = r["tokens_entrada_cache"]
    registo.tokens_saida = r["tokens_saida"]
    # Grava os PREÇOS aplicados junto com o custo: sem eles, mudar a tabela
    # tornava este número impossível de reconstruir mais tarde. É por isto que
    # o superadministrador pode corrigir um preço sem reescrever o passado.
    registo.custo, preco = custo_de(
        db,
        r["modelo"],
        r["tokens_entrada"],
        r["tokens_saida"],
        r["tokens_entrada_cache"],
    )
    registo.preco_entrada = preco.entrada
    registo.preco_entrada_cache = preco.entrada_cache
    registo.preco_saida = preco.saida

    # A limpeza corre aqui, depois de a consulta nova estar gravada: quem cria
    # linhas é quem as vai limpando, sem agendador nenhum. O trabalho é
    # proporcional ao que ESTA empresa acumulou, e falhar não pode custar a
    # resposta que já foi paga.
    try:
        config_ia.limpar_historico(db, empresa_id=empresa_id)
    except Exception:  # noqa: BLE001
        log.warning("Não foi possível limpar o histórico de IA.", exc_info=True)

    # Repor os nomes reais só agora, depois de tudo estar gravado. O histórico
    # guarda a resposta como o utilizador a viu.
    resposta = ps.repor(r["texto"])
    registo.resposta = resposta
    db.flush()

    return {
        "id": registo.id,
        "resposta": resposta,
        "modelo": r["modelo"],
        "ambitos": ambitos,
        "entidades_pseudonimizadas": ps.total,
        "tokens": {
            "entrada": r["tokens_entrada"],
            "saida": r["tokens_saida"],
            # O tecto em vigor, para a interface poder explicar uma resposta
            # curta em vez de a deixar parecer um defeito.
            "max_saida": max_saida,
        },
        "custo": registo.custo,
        "duracao_ms": registo.duracao_ms,
        # O consumo ANTES desta consulta, mais o que ela gastou: é o que
        # permite avisar quem está a chegar ao limite antes de lá chegar.
        "quota": {
            "percentagem": quota["percentagem"],
            "a_avisar": quota["a_avisar"],
            "sem_limite": quota["sem_limite"],
        },
    }


def historico(
    db: Session, *, empresa_id: UUID, user_id: UUID | None = None, limite: int = 30
) -> list[dict]:
    q = select(ConsultaIA).where(ConsultaIA.empresa_id == empresa_id)
    if user_id is not None:
        q = q.where(ConsultaIA.user_id == user_id)
    return [
        {
            "id": c.id, "pergunta": c.pergunta, "resposta": c.resposta,
            "contexto": c.contexto, "modelo": c.modelo, "erro": c.erro,
            "entidades_pseudonimizadas": c.entidades_pseudonimizadas,
            "duracao_ms": c.duracao_ms, "criado_em": c.criado_em,
        }
        for c in db.scalars(q.order_by(ConsultaIA.criado_em.desc()).limit(limite)).all()
    ]


def dados_enviados(db: Session, *, empresa_id: UUID, consulta_id: UUID) -> Any:
    """Pacote exacto que saiu para a API numa consulta — para auditoria."""
    c = db.scalar(
        select(ConsultaIA).where(
            ConsultaIA.id == consulta_id, ConsultaIA.empresa_id == empresa_id
        )
    )
    if c is None:
        raise ErroIA("Consulta não encontrada.")
    return c.dados_enviados
