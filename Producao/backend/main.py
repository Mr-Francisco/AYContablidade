"""Ponto de entrada do backend.

Arrancar em desenvolvimento:
    cd Producao/backend
    .venv/Scripts/uvicorn main:app --reload --port 8001 --no-proxy-headers

O `--no-proxy-headers` NÃO É OPCIONAL, e não é detalhe. Por omissão o uvicorn
corre com `proxy_headers=True` e `forwarded_allow_ips="127.0.0.1"`: reescreve
`scope["client"]` a partir do `X-Forwarded-For` ANTES de a aplicação o ver.
Quem se ligar de 127.0.0.1 passa a escolher o IP que fica na auditoria, e apaga
o rasto da origem das suas próprias acções.

Quem decide de onde veio um pedido é `src/core/rede.py`, com a definição
`PROXIES_CONFIAVEIS` — e só decide mesmo se o uvicorn não tiver decidido
primeiro. Atrás de um proxy real, declara-se lá o endereço dele.
"""

from src.api.main import app

__all__ = ["app"]
