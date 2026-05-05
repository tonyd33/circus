# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS build

COPY --chown=root:root package.json bun.lock ./
COPY --chown=root:root packages/usher/package.json ./packages/usher/
COPY --chown=root:root packages/ringmaster/package.json ./packages/ringmaster/
COPY --chown=root:root packages/chimp/package.json ./packages/chimp/
COPY --chown=root:root packages/bullhorn/package.json ./packages/bullhorn/
COPY --chown=root:root packages/dashboard/package.json ./packages/dashboard/
COPY --chown=root:root packages/api/package.json ./packages/api/
COPY --chown=root:root packages/shared/package.json ./packages/shared/

RUN bun ci

COPY --chown=root:root packages ./packages

RUN bun run build

FROM nixos/nix:latest AS nix-env
WORKDIR /build
RUN echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "filter-syscalls = false" >> /etc/nix/nix.conf
COPY flake.nix flake.lock ./
RUN nix build .#chimp-env && \
    mkdir -p /nix-closure/nix/store && \
    nix-store -qR result | xargs -I{} cp -a {} /nix-closure/nix/store/ && \
    readlink -f result > /nix-closure/env-path

FROM base AS chimp
COPY --from=nix-env /nix-closure/nix/store /nix/store
COPY --from=nix-env /nix-closure/env-path /tmp/env-path
RUN ln -s "$(cat /tmp/env-path)" /nix-env && rm /tmp/env-path
ENV PATH="/nix-env/bin:${PATH}"
ENV SSL_CERT_FILE="/nix-env/etc/ssl/certs/ca-bundle.crt"
ENV NIX_SSL_CERT_FILE="/nix-env/etc/ssl/certs/ca-bundle.crt"
ENV GIT_SSL_CAINFO="/nix-env/etc/ssl/certs/ca-bundle.crt"
ENV CURL_CA_BUNDLE="/nix-env/etc/ssl/certs/ca-bundle.crt"
ADD --unpack https://github.com/anomalyco/opencode/releases/download/v1.14.25/opencode-linux-x64.tar.gz /usr/local/bin/
RUN bunx npm install -g @anthropic-ai/claude-code

RUN useradd -ms /bin/bash agent
USER agent
WORKDIR /home/agent/

COPY --from=build --chown=root:root /usr/src/app/packages/chimp/dist/index.js /app/index.js

ENTRYPOINT ["bun", "run", "/app/index.js"]

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

FROM base AS api
WORKDIR /app

COPY --from=build /usr/src/app/packages/api/dist/index.js ./index.js
ENTRYPOINT ["bun", "run", "index.js"]

FROM base AS dashboard
WORKDIR /app

COPY --from=build /usr/src/app/packages/dashboard/dist ./dist
COPY --from=build /usr/src/app/packages/dashboard/dist-server/index.js ./server.js

ENV DIST_DIR=/app/dist
ENTRYPOINT ["bun", "run", "server.js"]
