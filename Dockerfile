# DailyFlash as one Railway service: the Express API also serves the built dashboard.
# Build context is the repo root (Railway service Root Directory = /).

# --- Stage 1: build the dashboard ---------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# No VITE_API_BASE: the dashboard calls the API on its own origin. VITE_AUTH_URL turns
# on central sign-on — Railway passes a service variable of that name in as this ARG.
ARG VITE_AUTH_URL=""
ENV VITE_AUTH_URL=$VITE_AUTH_URL
RUN npm run build

# --- Stage 2: API + dashboard ---------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production
# The backend reads data/ relative to its working directory, as it did on Railway before.
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
EXPOSE 4000
CMD ["node", "src/index.js"]
