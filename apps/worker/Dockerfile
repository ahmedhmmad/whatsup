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
RUN npm install --workspace @sendwhats/shared --workspace @sendwhats/core --workspace @sendwhats/worker --include-workspace-root

COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/api/prisma apps/api/prisma
COPY apps/worker apps/worker

RUN npm run build -w @sendwhats/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @sendwhats/core \
 && npx tsc -p apps/worker/tsconfig.json

ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/index.js"]
