# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS build
COPY . .
RUN bun ci

FROM base AS chimp
WORKDIR /app

RUN <<EOF
apt update
apt install -y git
EOF

# Copy the workspace dependencies and chimp source
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/packages ./packages
COPY --from=build /usr/src/app/package.json ./

RUN useradd -ms /bin/bash agent
USER agent

WORKDIR /home/agent/

# Run the TypeScript source directly (no build needed)
ENTRYPOINT [ "bun", "run", "/app/packages/chimp/index.ts" ]
