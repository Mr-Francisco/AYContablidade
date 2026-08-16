"""Consulta de NIF — o serviço da AGT, à distância de um botão.

Nota: NÃO usar `from __future__ import annotations` — slowapi.

**Autenticada, e não pública.** A chamada gasta as credenciais da AGT desta
instalação, e uma rota aberta seria emprestá-las a quem passasse: com pedidos
suficientes, alguém enumerava o registo de contribuintes à nossa custa. Todos
os sítios que precisam disto — clientes, fornecedores, colaboradores,
independentes, licenças, a ficha da empresa — são posteriores à entrada.

O ecrã de activação de licença **não precisa**: o NIF e o nome já vêm gravados
na licença, confirmados na activação. Foi o que evitou ter de abrir isto ao
mundo.

Sem `rh.gerir` ou `comercial.gerir` — não devolve dados da empresa, devolve o
que a AGT diz sobre um contribuinte. Exigir uma capacidade de gestão impediria
um contabilista de confirmar um NIF antes de lançar uma factura.
"""

from fastapi import APIRouter, Query, Request

from src.api.deps import UtilizadorAtual
from src.api.limites import limiter
from src.services import nif as svc

router = APIRouter(prefix="/api/nif", tags=["nif"])


@router.get("")
@limiter.limit("30/minute")
async def consultar(
    request: Request,
    quem: UtilizadorAtual,
    numero: str = Query(min_length=1, max_length=30),
    tipo_documento: str = Query(default="NIF", max_length=20),
) -> dict:
    """O que a AGT sabe sobre este contribuinte.

    Devolve sempre uma resposta, mesmo com a AGT desligada ou em baixo: nesse
    caso valida o formato e diz que a resposta é local. `fonte` distingue as
    duas coisas — `agt` ou `formato` — para o ecrã não apresentar como
    confirmado o que não foi.

    Trinta por minuto: quem preenche uma ficha consulta um NIF, não trezentos.
    """
    return await svc.consultar(numero, tipo_documento)
