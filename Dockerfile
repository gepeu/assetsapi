# One image, four commands: the API (default), update-universe, update-data and migrate.
# Built from the repository root, so the API can serve the frontend at /ui.
# The base image is pinned by digest so a rebuild can't pick up a different Node silently.
FROM node:22-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --ignore-scripts
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src ./src
RUN npm run build

FROM node:22-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
ENV NODE_ENV=production
# The same layout as the repository, so the API finds the frontend at its default path.
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json backend/.npmrc ./
RUN npm ci --omit=dev --ignore-scripts
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/db ./db
COPY --from=frontend /app/frontend/dist /app/frontend/dist
USER node
CMD ["node", "src/api/server.ts"]
