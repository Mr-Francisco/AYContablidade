# AYContabilidade — backend.
#
# Duas fases: a primeira instala as dependências, a segunda só copia o que ficou
# instalado. O compilador e os cabeçalhos de C ficam para trás — não servem para
# correr a aplicação e a imagem final não tem de os carregar.

# ---------------------------------------------------------------------------
FROM python:3.12-slim AS dependencias

# `psycopg` compila contra a libpq. Aqui pode; na imagem final não é preciso.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/instalado -r requirements.txt

# ---------------------------------------------------------------------------
FROM python:3.12-slim

# Só a biblioteca de execução, não os cabeçalhos de desenvolvimento.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

# A aplicação não corre como root. Se algum dia for comprometida, o que o
# atacante consegue fazer no contentor fica limitado ao que este utilizador
# pode — e este não pode escrever no código nem instalar nada.
RUN useradd --create-home --shell /bin/bash aycontab

COPY --from=dependencias /instalado /usr/local

WORKDIR /app
COPY --chown=aycontab:aycontab . .

USER aycontab

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8001

# `--no-proxy-headers` NÃO É OPCIONAL — ver o cabeçalho de `main.py`. Sem ele o
# uvicorn reescreve a origem do pedido a partir do `X-Forwarded-For`, que
# qualquer cliente forja, e a decisão sobre proxies de confiança em
# `core/rede.py` deixa de ter efeito.
#
# `--workers 2`: dois processos para um pedido lento não bloquear os outros.
# Subir conforme os núcleos da máquina.
CMD ["python", "-m", "uvicorn", "main:app", \
     "--host", "0.0.0.0", "--port", "8001", \
     "--no-proxy-headers", "--workers", "2"]
