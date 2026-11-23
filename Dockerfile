FROM node:22-bookworm-slim

WORKDIR /app

# Build dependencies required if better-sqlite3 needs native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));const keep=['better-sqlite3','dotenv','express','geoip-lite','ws'];const deps=Object.fromEntries(keep.map(k=>[k,p.dependencies[k]]));fs.writeFileSync('package.json',JSON.stringify({name:p.name,type:p.type,private:true,scripts:{start:p.scripts.start},dependencies:deps},null,2));" \
  && npm install --omit=dev --no-audit --no-fund \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /root/.npm

COPY server.ts ./
COPY src/server ./src/server
COPY src/shared ./src/shared

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
