# Build context: the repository root.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci --workspace apps/dashboard --include-workspace-root=false --no-audit --no-fund
COPY apps/api/src/contracts.ts apps/api/src/contracts.ts
COPY apps/dashboard apps/dashboard
RUN npm run build -w apps/dashboard

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/dashboard/.next/standalone ./
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
EXPOSE 3001
CMD ["node", "apps/dashboard/server.js"]
