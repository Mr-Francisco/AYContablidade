"""Serialização JSON da API.

Valores monetários viajam como STRING, não como número JSON.

Um número JSON é lido como double de 64 bits pelo JavaScript, que só garante
15–17 dígitos significativos. As nossas colunas são `Numeric(18, 2)`: um valor
grande em Kwanzas perde exactidão na viagem, e um balancete que fecha no
servidor pode chegar desequilibrado ao browser por um cêntimo — sem nada nos
registos a explicar porquê.

Enviar `"1234567890123456.78"` e converter no frontend com uma biblioteca de
precisão arbitrária é a única forma de o total no ecrã ser o mesmo que está na
base de dados.
"""

from decimal import Decimal
from typing import Any

from fastapi.responses import JSONResponse

try:  # o FastAPI traz orjson quando disponível; caso contrário, json da stdlib
    import orjson

    def _dumps(conteudo: Any) -> bytes:
        return orjson.dumps(conteudo, default=_default)

except ImportError:  # pragma: no cover
    import json

    def _dumps(conteudo: Any) -> bytes:
        return json.dumps(conteudo, default=_default, ensure_ascii=False).encode("utf-8")


def _default(o: Any) -> Any:
    if isinstance(o, Decimal):
        return str(o)
    raise TypeError(f"Tipo não serializável: {type(o).__name__}")


class RespostaJSON(JSONResponse):
    """Resposta JSON com Decimal em string."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return _dumps(content)
