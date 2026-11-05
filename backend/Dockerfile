# One image, four commands: the API (default), update-universe, update-data and migrate.
# The base image is pinned by digest so a rebuild can't pick up a different Node silently.
FROM node:22-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY scripts ./scripts
COPY db ./db
USER node
CMD ["node", "src/api/server.ts"]
