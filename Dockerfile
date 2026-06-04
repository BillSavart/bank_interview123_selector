# Frontend image: build the SPA, serve it (and reverse-proxy /api) with Caddy.
# Built in CI — never on the e2-micro VM (1GB RAM would OOM on `vite build`).

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# `npm ci` is the fast/reproducible path; fall back to `npm install` if the
# lockfile is missing Linux-only optional deps (happens when it was last
# regenerated on macOS). Self-heals so CI never breaks on that.
RUN npm ci || npm install
# prebuild (extract:questions) needs public/*.pdf and bank123_pdftojson.json,
# so copy the full context before building.
COPY . .
# AdSense publisher id is a public, build-time value (baked into the JS bundle).
# Leave empty → ads render a placeholder. Pass via --build-arg / CI to enable.
ARG VITE_ADSENSE_CLIENT=""
ENV VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile.docker /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443
