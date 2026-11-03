# One service: the backend serves the API and the built frontend from the same origin.
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/db ./db
COPY --from=frontend /app/frontend/dist /app/frontend/dist
USER node
CMD ["node", "src/server.ts"]
