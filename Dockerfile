# One image, four commands: the API (default), update-universe, update-data and migrate.
# The base image is pinned by digest so a rebuild can't pick up a different Node silently.
FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json backend/.npmrc ./
RUN npm ci --omit=dev --ignore-scripts
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/db ./db
USER node
CMD ["node", "src/api/server.ts"]
