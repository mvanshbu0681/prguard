# One build for the repo's two services. Build context: the repository root.
#
# APP picks the image: `api` or `dashboard`. Railway builds this file for every service rooted at the
# repository root and passes the service's own name, so services named `api` and `dashboard` need no
# settings. Anything else (Docker Compose, a differently named service) sets APP.
ARG RAILWAY_SERVICE_NAME=api
ARG APP=${RAILWAY_SERVICE_NAME}

# API
FROM node:24-slim AS api-deps
WORKDIR /app
# better-sqlite3 builds from source when no prebuilt binary fits.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci --workspace apps/api --include-workspace-root=false --omit=dev --no-audit --no-fund

FROM node:24-slim AS api
WORKDIR /app
ENV NODE_ENV=production PORT=8000 DATA_DIR=/data
COPY --from=api-deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 8000
CMD ["node", "src/index.ts"]

# Dashboard
FROM node:24-slim AS dashboard-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci --workspace apps/dashboard --include-workspace-root=false --no-audit --no-fund
COPY apps/api/src/contracts.ts apps/api/src/contracts.ts
COPY apps/dashboard apps/dashboard
RUN npm run build -w apps/dashboard

FROM node:24-slim AS dashboard
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=dashboard-build /app/apps/dashboard/.next/standalone ./
COPY --from=dashboard-build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
EXPOSE 3001
CMD ["node", "apps/dashboard/server.js"]

# The image for this service
FROM ${APP}
