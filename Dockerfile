# One image runs every server process; docker-compose.prod.yml picks the command.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 NPM_CONFIG_UPDATE_NOTIFIER=false

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps/server apps/server
COPY apps/web apps/web
RUN npx prisma generate --schema apps/server/prisma/schema.prisma \
  && npm run build -w @cdt/server \
  && npm run build -w @cdt/web

FROM base AS runtime
# mysqldump for the nightly backup job in the worker.
RUN apt-get update \
  && apt-get install -y --no-install-recommends default-mysql-client \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @cdt/server && npm cache clean --force
COPY apps/server/prisma apps/server/prisma
RUN npx prisma generate --schema apps/server/prisma/schema.prisma
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/dist-seed apps/server/dist-seed
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir -p /data/uploads /data/backups && chown -R node:node /data
ENV NODE_ENV=production \
  BIND_HOST=0.0.0.0 \
  HOME=/tmp \
  UPLOAD_DIR=/data/uploads \
  BACKUP_DIR=/data/backups \
  WEB_DIST_DIR=/app/apps/web/dist
USER node
WORKDIR /app/apps/server
EXPOSE 4000 4100
CMD ["node", "dist/index.js"]
