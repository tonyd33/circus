# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS build

# Copy package manifests first for better layer caching
COPY --chown=root:root package.json bun.lock ./
COPY --chown=root:root packages/usher/package.json ./packages/usher/
COPY --chown=root:root packages/ringmaster/package.json ./packages/ringmaster/
COPY --chown=root:root packages/chimp/package.json ./packages/chimp/
COPY --chown=root:root packages/bullhorn/package.json ./packages/bullhorn/
COPY --chown=root:root packages/dashboard/package.json ./packages/dashboard/
COPY --chown=root:root packages/shared/package.json ./packages/shared/

# Install dependencies (this layer will be cached unless package.json files change)
RUN bun ci

# Copy the rest of the project
COPY --chown=root:root packages ./packages

# Build the project
RUN bun run build

FROM base AS chimp
RUN apt update && \
    apt install -y git curl gpg && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list && \
    apt install -y gh && \
    rm -rf /var/lib/apt/lists/*
ADD --unpack https://github.com/anomalyco/opencode/releases/download/v1.4.3/opencode-linux-x64.tar.gz /usr/local/bin/
RUN bunx npm install -g @anthropic-ai/claude-code

RUN useradd -ms /bin/bash agent
USER agent
WORKDIR /home/agent/

COPY --from=build --chown=root:root /usr/src/app/node_modules /app/node_modules
COPY --from=build --chown=root:root /usr/src/app/packages /app/packages
COPY --from=build --chown=root:root /usr/src/app/package.json /app/

ENTRYPOINT ["bun", "run", "/app/packages/chimp/src/index.ts"]

FROM base AS ringmaster
WORKDIR /app

COPY --from=build /usr/src/app/packages/ringmaster/dist/index.js ./index.js

ENTRYPOINT ["node", "index.js"]

FROM base AS usher
WORKDIR /app

COPY --from=build /usr/src/app/packages/usher/dist/index.js ./index.js
ENTRYPOINT ["bun", "run", "index.js"]

FROM base AS bullhorn
WORKDIR /app

COPY --from=build /usr/src/app/packages/bullhorn/dist/index.js ./index.js
ENTRYPOINT ["bun", "run", "index.js"]

FROM base AS dashboard
WORKDIR /app

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/packages ./packages
COPY --from=build /usr/src/app/package.json ./

WORKDIR /app/packages/dashboard/
ENTRYPOINT ["bun", "start"]
