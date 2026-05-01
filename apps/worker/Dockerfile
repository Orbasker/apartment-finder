FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace root files. Every workspace package.json declared in the
# root package.json's "workspaces" array MUST be present here, even if its
# source isn't copied — bun --frozen-lockfile reconciles the lockfile against
# the full workspace graph and otherwise fails with "lockfile had changes".
COPY package.json bun.lock tsconfig.base.json turbo.json ./
COPY packages/queue/package.json packages/queue/
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/

# Install dependencies (all workspaces)
RUN bun install --frozen-lockfile

# Copy source
COPY packages/queue/src/ packages/queue/src/
COPY packages/shared/src/ packages/shared/src/
COPY apps/worker/src/ apps/worker/src/

WORKDIR /app/apps/worker
ENV NODE_ENV=production
CMD ["bun", "run", "src/index.ts"]
