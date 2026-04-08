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
COPY --chown=root:root packages/shared/package.json ./packages/shared/

# Install dependencies (this layer will be cached unless package.json files change)
RUN bun ci

# Copy the rest of the project
COPY --chown=root:root . .

# Build the project
RUN bun run build

FROM base AS chimp
WORKDIR /app

RUN apt update && apt install -y git

# Copy the workspace dependencies and chimp source
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/packages ./packages
COPY --from=build /usr/src/app/package.json ./

RUN useradd -ms /bin/bash agent
USER agent

WORKDIR /home/agent/

ENTRYPOINT [ "bun", "run", "/app/packages/chimp/index.ts" ]

FROM base AS ringmaster
WORKDIR /app

COPY --from=build /usr/src/app/packages/ringmaster/index.js ./index.js

ENTRYPOINT [ "node", "index.js" ]

FROM base AS usher
WORKDIR /app

# Copy the workspace dependencies and usher source
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/packages ./packages
COPY --from=build /usr/src/app/package.json ./

ENTRYPOINT [ "bun", "run", "/app/packages/usher/index.ts" ]

FROM base AS bullhorn
WORKDIR /app

# Copy the workspace dependencies and bullhorn source
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/packages ./packages
COPY --from=build /usr/src/app/package.json ./

ENTRYPOINT [ "bun", "run", "/app/packages/bullhorn/index.ts" ]
