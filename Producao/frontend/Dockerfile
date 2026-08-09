# AYContabilidade — frontend.
#
# Três fases. A última leva só a saída `standalone` do Next: o servidor e as
# dependências que ele usa mesmo, sem a pasta `node_modules` inteira. A imagem
# fica na ordem das dezenas de megabytes em vez das centenas.

# ---------------------------------------------------------------------------
FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---------------------------------------------------------------------------
FROM node:22-alpine AS construcao
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .

# Tudo o que começa por NEXT_PUBLIC_ é EMBUTIDO no JavaScript durante o build e
# fica legível no browser. Por isso entra aqui como argumento de construção e
# não como variável de ambiente do contentor — pô-la no arranque não teria
# efeito nenhum, o valor já ficou escrito nos ficheiros.
#
# É também por isto que nunca se põe um segredo num NEXT_PUBLIC_.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------------------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S aycontab && adduser -S aycontab -G aycontab

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# `standalone` traz o servidor e as dependências mínimas; `static` e `public`
# vêm à parte porque o Next não os inclui nessa pasta.
COPY --from=construcao --chown=aycontab:aycontab /app/.next/standalone ./
COPY --from=construcao --chown=aycontab:aycontab /app/.next/static ./.next/static
COPY --from=construcao --chown=aycontab:aycontab /app/public ./public

USER aycontab
EXPOSE 3000

CMD ["node", "server.js"]
