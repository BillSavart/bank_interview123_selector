# Frontend image: build the SPA and serve it with Caddy.
# Built in CI — never on the e2-micro VM (1GB RAM would OOM on `vite build`).

FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app
RUN apk add --no-cache curl unzip
COPY package*.json ./
# Keep the image reproducible and fail immediately if package.json and the
# committed lockfile drift apart. This frontend stage never loads the API's
# better-sqlite3 binding, so lifecycle scripts are skipped to avoid compiling a
# native dependency that is built separately in Dockerfile.api.
RUN npm ci --ignore-scripts --no-audit --no-fund
# prebuild (extract:questions) needs public/*.pdf and bank123_pdftojson.json,
# so copy the full context before building.
COPY . .
RUN npm run build

FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
COPY deploy/Caddyfile.docker /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443
