# LLM proxy image. No dependencies → tiny and fast.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY index.mjs ./
ENV PORT=3001
# bind on all interfaces inside the container so the web container can reach it
ENV HOST=0.0.0.0
# cap V8 heap — this app needs almost nothing; keeps RAM bounded on e2-micro
ENV NODE_OPTIONS=--max-old-space-size=128
EXPOSE 3001
USER node
CMD ["node", "index.mjs"]
