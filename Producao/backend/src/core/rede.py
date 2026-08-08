"""De onde veio o pedido, sem deixar quem o faz escolher a resposta.

O `X-Forwarded-For` é um cabeçalho — qualquer cliente o envia com o valor que
quiser. Aceitá-lo sem mais dava a quem atacasse o poder de escolher que IP fica
na auditoria: bastava mandar `X-Forwarded-For: 8.8.8.8` para apagar o rasto da
origem de todas as suas acções.

Por isso só é aceite quando o pedido chega de um proxy conhecido, declarado em
`PROXIES_CONFIAVEIS`. Sem essa configuração — que é o caso quando não há proxy
nenhum à frente — usa-se sempre o endereço da ligação, que não se falsifica.

Este módulo é a ÚNICA fonte de verdade para o assunto. A auditoria e o limite
de pedidos usavam critérios diferentes: a auditoria confiava no cabeçalho e o
limitador não. Concordarem importa — se o limitador contar por um IP e a
auditoria gravar outro, não há forma de ligar um bloqueio ao seu autor.
"""

import ipaddress
import logging

from fastapi import Request

from src.core.config import get_settings

log = logging.getLogger(__name__)


def _redes_confiaveis() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    """Lê `PROXIES_CONFIAVEIS`. Aceita endereços soltos e blocos CIDR.

    Uma entrada inválida é ignorada com aviso, e não derruba a aplicação: um
    erro de configuração aqui degrada para o comportamento seguro — não
    confiar no cabeçalho — em vez de deixar o servidor sem arrancar.
    """
    redes = []
    for bruto in get_settings().PROXIES_CONFIAVEIS:
        texto = str(bruto).strip()
        if not texto:
            continue
        try:
            redes.append(ipaddress.ip_network(texto, strict=False))
        except ValueError:
            log.warning(
                "PROXIES_CONFIAVEIS: %r não é um endereço nem um bloco CIDR "
                "válido; ignorado. O X-Forwarded-For não será aceite dessa "
                "origem.",
                texto,
            )
    return redes


def _de_confianca(host: str | None) -> bool:
    if not host:
        return False
    redes = _redes_confiaveis()
    if not redes:
        return False
    try:
        endereco = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(endereco in rede for rede in redes)


def ip_do_pedido(request: Request | None) -> str | None:
    """O IP a registar e a contar.

    Só lê o `X-Forwarded-For` quando a ligação vem de um proxy declarado. O
    último valor da cadeia é o que esse proxy observou — os anteriores foram
    escritos por quem está mais à frente e podem ter sido inventados pelo
    cliente.
    """
    if request is None or request.client is None:
        return None

    ligacao = request.client.host
    if not _de_confianca(ligacao):
        return ligacao[:64]

    encaminhado = request.headers.get("x-forwarded-for")
    if not encaminhado:
        return ligacao[:64]

    partes = [p.strip() for p in encaminhado.split(",") if p.strip()]
    return (partes[-1] if partes else ligacao)[:64]


def chave_de_limite(request: Request) -> str:
    """Chave do limitador de pedidos. Mesma origem que a auditoria."""
    return ip_do_pedido(request) or "desconhecido"
