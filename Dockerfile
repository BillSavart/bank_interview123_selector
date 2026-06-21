# Frontend image: build the SPA and serve it with Caddy.
# Built in CI — never on the e2-micro VM (1GB RAM would OOM on `vite build`).

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache curl unzip
COPY package*.json ./
# `npm ci` is the fast/reproducible path; fall back to `npm install` if the
# lockfile is missing Linux-only optional deps (happens when it was last
# regenerated on macOS). Self-heals so CI never breaks on that.
RUN npm ci || npm install
# prebuild (extract:questions) needs public/*.pdf and bank123_pdftojson.json,
# so copy the full context before building.
COPY . .
# Adsterra ads master switch — a public, build-time value baked into the bundle.
# "true" → load real ads; anything else → no ads. Passed via --build-arg / CI.
ARG VITE_ADS_ENABLED=""
ENV VITE_ADS_ENABLED=$VITE_ADS_ENABLED
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile.docker /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443
