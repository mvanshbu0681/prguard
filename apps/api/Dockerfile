# Build context: the repository root.
FROM node:24-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci --workspace apps/api --include-workspace-root=false --omit=dev --no-audit --no-fund

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8000 DATA_DIR=/data
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 8000
CMD ["node", "src/index.ts"]
