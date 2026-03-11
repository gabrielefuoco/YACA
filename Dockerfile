# --- Stage 1: Build Frontend ---
FROM node:20-slim AS frontend-builder
LABEL version="2.0.0"
WORKDIR /app/frontend

# Copia i file di configurazione del frontend
COPY frontend/package*.json ./
RUN npm install

# Copia il resto dell'app frontend e costruisci (Next.js server build, non static export)
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Backend & Runtime ---
FROM node:20-slim AS runner
WORKDIR /app

# Install Redis server
RUN apt-get update && apt-get install -y --no-install-recommends redis-server redis-tools && \
    rm -rf /var/lib/apt/lists/*

# Imposta NODE_ENV a production
ENV NODE_ENV=production
# Hugging Face Spaces richiede la porta 7860
ENV PORT=7860

# Copia le dipendenze del backend
COPY package*.json ./
RUN npm install --omit=dev

# Copia il resto dell'applicazione backend
COPY . .

# Copia il frontend buildato (Next.js .next directory)
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-builder /app/frontend/package.json ./frontend/package.json

# Copy startup script and make executable
COPY scripts/start.sh /app/scripts/start.sh
RUN chmod +x /app/scripts/start.sh

# Esponi la porta richiesta
EXPOSE 7860

# Start Redis in background, then the Node app
CMD ["/app/scripts/start.sh"]
