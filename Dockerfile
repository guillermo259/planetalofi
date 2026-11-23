# Base fijada por digest (etiqueta 22-bookworm-slim, 2026-11-11) para builds reproducibles.
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

WORKDIR /app

# Build dependencies required if better-sqlite3 needs native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# Installs exactly the versions pinned in package-lock.json (runtime only).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /root/.npm

COPY server.ts ./
COPY src/server ./src/server
COPY src/shared ./src/shared

# Only the data directory needs to be writable by the runtime user.
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production
ENV PORT=3090
ENV DATA_DIR=/app/data
# 1 proxy de confianza (Dokploy/Traefik); usar 0 si el contenedor se expone directo.
ENV TRUST_PROXY_HOPS=1

USER node

EXPOSE 3090

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3090) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
