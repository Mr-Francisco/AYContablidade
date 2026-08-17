"""Consulta de NIF — serviço da AGT (DS-120, «Consultar Dados de Contribuinte»).

Transposto de `Piloto/assets/js/nif.js`, com uma diferença de fundo: no Piloto
a chamada saía do browser, e por isso as credenciais da AGT teriam de estar no
código que o utilizador descarrega. Aqui sai do servidor. As credenciais ficam
em variáveis de ambiente e nunca chegam ao cliente.

O QUE A AGT DEVOLVE, e o que não devolve. Devolve o **nome**, o **estado do
contribuinte**, o **regime de IVA**, se é pessoa singular ou colectiva e se é
não residente. **Não devolve morada, telefone nem e-mail** — esses continuam a
ser escritos à mão. Dizer o contrário levaria alguém a esperar um formulário
inteiro preenchido e a achar que está avariado quando não está.

SEM CREDENCIAIS CONFIGURADAS o serviço não se cala: valida o formato do número,
diz de que tipo de contribuinte se trata, e diz claramente que a resposta é
local e não da AGT. É a diferença entre «não sei» e «não perguntei».
"""

from __future__ import annotations

import base64
import re
from typing import Any

import httpx

from src.core.config import get_settings

#: Estados do contribuinte (DS-120 §4.2.7).
ESTADOS = {
    "A": "Activo",
    "C": "Cessado",
    "D": "Falecido",
    "E": "Herança",
    "F": "Anulado",
    "G": "Suspenso",
}

#: Estados que implicam restrições legais — não pode emitir facturas nem operar
#: normalmente. Quem vai registar uma empresa tem de saber disto ANTES.
ESTADOS_RESTRITOS = {"C", "D", "F", "G"}

#: Regimes de IVA, como a AGT os codifica.
REGIMES = {
    "GNAD": "Regime Geral",
    "TRAG": "Regime Transitório",
    "SIMP": "Regime Simplificado",
    "NBND": "Regime de Não Sujeição",
    "EXCL": "Regime de Exclusão",
}

#: O mesmo, no vocabulário da ficha da empresa (que tem três opções e não cinco).
REGIME_NA_FICHA = {
    "GNAD": "Regime Geral",
    "TRAG": "Regime Geral",
    "SIMP": "Regime Simplificado",
    "EXCL": "Regime de Exclusão / Não Sujeição",
    "NBND": "Regime de Exclusão / Não Sujeição",
}

ROTULO_TIPO = {
    "coletivo": "Pessoa colectiva",
    "singular": "Pessoa singular",
    "outro": "Contribuinte",
    "estrangeiro": "Não residente",
    "invalido": "Inválido",
}


def limpar(numero: str) -> str:
    return re.sub(r"\s+", "", str(numero or "")).upper()


def tipo_de_nif(numero: str) -> str:
    """Que espécie de contribuinte o número representa, pela forma.

    As regras são as do Piloto: colectivos começam por 5 e têm dez dígitos;
    singulares são nove dígitos, duas letras e três dígitos.
    """
    n = limpar(numero)
    if re.fullmatch(r"5\d{9}", n):
        return "coletivo"
    if re.fullmatch(r"\d{9}[A-Z]{2}\d{3}", n):
        return "singular"
    if re.fullmatch(r"\d{8,10}", n):
        return "outro"
    if len(n) >= 6 and re.fullmatch(r"[A-Z0-9]+", n):
        return "estrangeiro"
    return "invalido"


def _resposta_local(numero: str) -> dict[str, Any]:
    t = tipo_de_nif(numero)
    if t == "invalido":
        return {
            "fonte": "formato",
            "valido": False,
            "encontrado": False,
            "nif": limpar(numero),
            "tipo": t,
            "tipo_rotulo": ROTULO_TIPO[t],
            "mensagem": "O número não tem um formato de NIF angolano válido.",
        }
    return {
        "fonte": "formato",
        "valido": True,
        "encontrado": False,
        "nif": limpar(numero),
        "tipo": t,
        "tipo_rotulo": ROTULO_TIPO[t],
        "mensagem": (
            f"NIF válido ({ROTULO_TIPO[t]}). A consulta à AGT não está "
            "configurada, por isso o nome e o regime têm de ser preenchidos à "
            "mão."
        ),
    }


def _booleano(*valores: Any) -> bool | None:
    """O primeiro valor que exista, lido como sim/não. `None` se nenhum existir.

    Distinguir «não» de «não sei» é o ponto: um campo em falta não pode
    passar por uma resposta negativa.
    """
    for v in valores:
        if v is None:
            continue
        if isinstance(v, bool):
            return v
        texto = str(v).strip().lower()
        if texto in {"true", "s", "sim", "1", "y", "yes"}:
            return True
        if texto in {"false", "n", "nao", "não", "0"}:
            return False
    return None


def _do_contribuinte(dados: dict[str, Any], numero: str) -> dict[str, Any]:
    """Traduz a resposta da AGT para o vocabulário da aplicação."""
    envelope = dados.get("ObterContribuinte") or {}
    c = envelope.get("contribuinte") or dados.get("contribuinte") or {}

    if not c.get("numeroNIF") and not c.get("nome"):
        mensagem = envelope.get("mensagem") or "Contribuinte não encontrado."
        resposta = _resposta_local(numero)
        resposta["mensagem"] = f"A AGT respondeu: {mensagem}"
        resposta["fonte"] = "agt"
        return resposta

    estado = c.get("estadoContribuinte") or "A"
    regime = c.get("regimeIva") or ""
    tipo_agt = c.get("tipoContribuinte")
    tipo = (
        "coletivo"
        if tipo_agt == "COLLECTIVE"
        else "singular"
        if tipo_agt == "SINGULAR"
        else tipo_de_nif(numero)
    )

    return {
        "fonte": "agt",
        "valido": True,
        "encontrado": True,
        "nif": c.get("numeroNIF") or limpar(numero),
        "nome": c.get("nome") or "",
        "tipo": tipo,
        "tipo_rotulo": ROTULO_TIPO.get(tipo, tipo),
        "estado": estado,
        "estado_rotulo": ESTADOS.get(estado, estado),
        # Não é um detalhe: um contribuinte cessado ou suspenso não pode
        # emitir facturas, e quem está a registar a empresa tem de o saber
        # antes de a registar, não depois.
        "restrito": estado in ESTADOS_RESTRITOS,
        "regime_iva": regime,
        "regime_rotulo": REGIMES.get(regime, regime),
        "regime_na_ficha": REGIME_NA_FICHA.get(regime, ""),
        "nao_residente": str(c.get("indicadorNaoResidente")).lower() == "true",
        # INADIMPLENTE — «tem obrigações fiscais por cumprir».
        #
        # A consulta pública da AGT mostra este campo e nós não o trazíamos.
        # Não é um pormenor: verificado a 17 de Agosto de 2026 contra empresas
        # reais, a ETU ENERGIAS BLOCO 17/06 (SU), SA (5417010944) aparece como
        # inadimplente e a A CASA DOS PERFUMES, LDA (5402132186) não. Quem vai
        # abrir crédito a um cliente quer saber isto ANTES.
        #
        # A chave exacta no JSON da AGT não está documentada publicamente — o
        # portal de documentação só cobre a Facturação Electrónica. Tentam-se
        # as três formas prováveis e, na dúvida, fica `None`: dizer «não é
        # inadimplente» sem saber seria pior do que não dizer nada.
        "inadimplente": _booleano(
            c.get("indicadorInadimplente"),
            c.get("inadimplente"),
            c.get("indicadorIncumprimento"),
        ),
        "mensagem": (
            f"Contribuinte {ESTADOS.get(estado, estado).lower()} — com "
            "restrições legais."
            if estado in ESTADOS_RESTRITOS
            else c.get("nome") or ""
        ),
    }


async def consultar(numero: str, tipo_documento: str = "NIF") -> dict[str, Any]:
    """Consulta o NIF na AGT, com a validação de formato como rede de segurança.

    Nunca levanta excepção por causa da AGT: se o serviço estiver desligado,
    sem credenciais, em baixo ou lento, devolve a resposta local com o aviso do
    que aconteceu. Um serviço externo em baixo não pode impedir alguém de
    registar uma empresa — impediria o negócio por causa de uma dependência que
    não controlamos.
    """
    if tipo_de_nif(numero) == "invalido":
        return _resposta_local(numero)

    s = get_settings()
    if not (s.AGT_ATIVO and s.AGT_USERNAME and s.AGT_PASSWORD):
        return _resposta_local(numero)

    # AUTENTICAÇÃO: os dois formatos, e não um.
    #
    # O Piloto enviava as credenciais em cabeçalhos próprios `Username` e
    # `Password`. Contra o serviço real — testado a 17 de Agosto de 2026, nos
    # dois ambientes — a resposta é:
    #
    #     HTTP/1.1 401 Unauthorized
    #     Www-authenticate: Basic realm=owsm
    #
    # É um Oracle Web Services Manager à frente, e o que ele pede é **Basic**
    # normal. Manda-se o Basic e mantêm-se os cabeçalhos do Piloto: se o
    # serviço aceitar qualquer um dos dois, funciona; e se um dia trocarem a
    # cancela, não é preciso descobrir isto outra vez.
    basica = base64.b64encode(
        f"{s.AGT_USERNAME}:{s.AGT_PASSWORD}".encode()
    ).decode()
    cabecalhos = {
        "Accept": "application/json",
        "Authorization": f"Basic {basica}",
        "Username": s.AGT_USERNAME,
        "Password": s.AGT_PASSWORD,
    }
    parametros = {
        "tipoDocumento": tipo_documento,
        "numeroDocumento": limpar(numero),
    }

    try:
        async with httpx.AsyncClient(timeout=12) as cliente:
            r = await cliente.get(
                s.AGT_ENDPOINT.split("?")[0],
                params=parametros,
                headers=cabecalhos,
            )
            r.raise_for_status()
            return _do_contribuinte(r.json(), numero)
    except Exception as e:  # noqa: BLE001 — qualquer falha externa cai aqui de propósito
        resposta = _resposta_local(numero)
        resposta["aviso_agt"] = (
            f"O serviço da AGT não respondeu ({type(e).__name__}). O número foi "
            "validado pelo formato; os restantes dados têm de ser confirmados "
            "à mão."
        )
        return resposta
