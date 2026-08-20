# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine

RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/admin-web/package.json apps/admin-web/
RUN npm install --workspace @sendwhats/shared --workspace @sendwhats/core --workspace @sendwhats/api --include-workspace-root

COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/api apps/api

RUN npm run build -w @sendwhats/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @sendwhats/core \
 && npx tsc -p apps/api/tsconfig.json

ENV NODE_ENV=production
EXPOSE 4000

# Migrations run at boot so a fresh `docker compose up` gives a ready database.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/index.js"]
