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

# Install system fonts for SVG text rendering (sharp/librsvg needs fontconfig)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig fonts-dejavu-core fonts-noto-core \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

# Imposta NODE_ENV a production
ENV NODE_ENV=production
# Hugging Face Spaces richiede la porta 7860
ENV PORT=7860

# Copia le dipendenze del backend (include lockfile for deterministic installs)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia il resto dell'applicazione backend
COPY . .

# Copia il frontend buildato dalla cartella 'out' generata nel primo stage
# L'index.js serve questi file da /frontend/out
COPY --from=frontend-builder /app/frontend/out ./frontend/out

# Esponi la porta richiesta
EXPOSE 7860

# Start the Node app directly
CMD ["node", "--expose-gc", "index.js"]
