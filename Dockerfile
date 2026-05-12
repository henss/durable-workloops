FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/server/package.json packages/server/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build:all

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV AWL_HOST=0.0.0.0
ENV AWL_PORT=3210
ENV AWL_WEB_DIST_DIR=/app/apps/web/dist

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json packages/api/package.json
COPY packages/server/package.json packages/server/package.json

RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3210

CMD ["node", "packages/server/dist/index.js"]
