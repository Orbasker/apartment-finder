FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace root files
COPY package.json bun.lockb tsconfig.base.json turbo.json ./
COPY packages/queue/package.json packages/queue/
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/

# Install dependencies (all workspaces)
RUN bun install --frozen-lockfile

# Copy source
COPY packages/queue/src/ packages/queue/src/
COPY packages/shared/src/ packages/shared/src/
COPY apps/worker/src/ apps/worker/src/

WORKDIR /app/apps/worker
ENV NODE_ENV=production
CMD ["bun", "run", "src/index.ts"]
