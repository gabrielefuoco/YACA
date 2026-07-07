# --- Stage 1: Build Frontend ---
FROM node:20-slim AS frontend-builder
LABEL version="1.0.4"
WORKDIR /app/frontend

# Copia i file di configurazione del frontend
COPY frontend/package*.json ./
RUN npm install

# Copia il resto dell'app frontend e costruisci (static export)
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Backend & Runtime ---
FROM node:20-slim AS runner
WORKDIR /app

# Install system fonts for SVG text rendering and redis-server for cache
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig fonts-dejavu-core fonts-noto-core redis-server \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

# Imposta NODE_ENV a production
ENV NODE_ENV=production
# Hugging Face Spaces richiede la porta 7860
ENV PORT=7860

# Copia le dipendenze del backend
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia il resto dell'applicazione backend
COPY . .

# Copia il frontend buildato dalla cartella 'out' generata nel primo stage
COPY --from=frontend-builder /app/frontend/out ./frontend/out

# Rendi lo script di avvio eseguibile
RUN chmod +x start.sh

# Esponi la porta richiesta
EXPOSE 7860

# Start Redis and Node app via script
CMD ["./start.sh"]
