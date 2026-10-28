FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY packages/core ./packages/core
COPY apps/web ./apps/web
RUN pnpm install --filter @guidepatch/web... --ignore-scripts
RUN pnpm --filter @guidepatch/web build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/server ./apps/server
ENV GUIDEPATCH_HOST=0.0.0.0 GUIDEPATCH_PORT=4318 GUIDEPATCH_DB_PATH=/data/usage.sqlite
VOLUME ["/data"]
EXPOSE 4318
CMD ["node", "apps/server/src/server.mjs"]
