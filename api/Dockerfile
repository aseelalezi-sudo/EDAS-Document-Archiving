FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS deps
WORKDIR /app
# Prisma needs OpenSSL to detect the query-engine target on Debian.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Context is the repo root so the local @edas/shared package is available.
COPY packages/shared/package.json packages/shared/
COPY api/package*.json api/
COPY api/prisma api/prisma
RUN cd api && npm ci
RUN cd api && npx prisma generate

FROM deps AS build
COPY packages/shared packages/shared
COPY api api
RUN api/node_modules/.bin/tsc -p packages/shared/tsconfig.json
RUN cd api && npm run build
RUN cd api && npm prune --omit=dev

FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS runtime
# LibreOffice converts Office documents to PDF for previews; the fonts cover
# Arabic (Noto) and Latin (Liberation/DejaVu) so documents render faithfully.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      fonts-liberation fonts-dejavu-core fonts-noto-core \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/api/node_modules ./api/node_modules
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/assets ./api/assets
COPY --from=build /app/api/prisma ./api/prisma
COPY --from=build /app/api/package*.json ./api/
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
# Run as the unprivileged `node` user that the official image already provides.
USER node
EXPOSE 4000
CMD ["node", "api/dist/main.js"]
