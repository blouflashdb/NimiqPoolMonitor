# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
RUN npm ci -w @nimiq-pool-monitor/web --ignore-scripts

FROM deps AS build
COPY packages/db packages/db
COPY apps/web apps/web
RUN npm run postinstall -w @nimiq-pool-monitor/web && npm run build -w @nimiq-pool-monitor/web

# ---- web dashboard (Nuxt/Nitro, reads the SQLite database) ----
FROM node:24-slim AS web
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=build /app/apps/web/.output ./.output
ENV NODE_ENV=production DATA_DIR=/data HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]

# ---- worker (Nimiq web-client node, wallets, payout monitoring; owns the database and its migrations) ----
FROM node:24-slim AS worker
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY package.json package-lock.json ./
# npm ci checks the lockfile against every workspace manifest, but installs only the worker's dependencies
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
RUN npm ci -w @nimiq-pool-monitor/worker --omit=dev --ignore-scripts
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations
COPY apps/worker/src apps/worker/src
ENV NODE_ENV=production DATA_DIR=/data
USER node
VOLUME /data
CMD ["node", "apps/worker/src/index.ts"]
