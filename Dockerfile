# --- Stage 1: Dipendenze backend (compila i moduli nativi) ---
# `better-sqlite3` è un modulo nativo: se il binario precompilato non è disponibile per
# questa piattaforma, npm ripiega sulla compilazione da sorgente e servono python3/make/g++.
# Il toolchain resta in questo stadio: al runner passano solo i `node_modules` già compilati.
FROM node:20-slim AS backend-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 2: Backend & Runtime ---
FROM node:20-slim AS runner
WORKDIR /app

# Install system fonts for SVG text rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig fonts-dejavu-core fonts-noto-core \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

# Imposta NODE_ENV a production
ENV NODE_ENV=production
# Porta di default dell'app (sovrascrivibile da PORT; deve combaciare con docker-compose.yml)
ENV PORT=7860

# Le dipendenze già compilate arrivano dallo stadio precedente
COPY --from=backend-deps /app/node_modules ./node_modules

# Copia il resto dell'applicazione backend
COPY . .

# Creazione cartella di mount per l'export statico del frontend (ticket 56).
# Il frontend non viene più incorporato nell'immagine: viene montato come volume
# in ./frontend/out da docker-compose.yml e aggiornato indipendentemente da ops/frontend-aggiorna.sh.
RUN mkdir -p frontend/out

# Rendi lo script di avvio eseguibile
RUN chmod +x start.sh

# Esponi la porta richiesta
EXPOSE 7860

# Avvia l'app (Redis è un servizio separato, v. docker-compose.yml)
CMD ["./start.sh"]
