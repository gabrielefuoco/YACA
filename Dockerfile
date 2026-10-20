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

# --- Stage 1b: Export statico del frontend (ticket 24) ---
# PRIMA il frontend era una cartella montata da fuori, aggiornata da uno script: due artefatti, due
# versioni, e la possibilità di divergere in silenzio (il 20/10/2026 i container erano aggiornati e la
# dashboard serviva il JS del giorno prima). Ora il frontend si costruisce QUI: una build sola, una
# versione sola. `output: 'export'` in `frontend/next.config.*` produce file statici, non un server.
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# La sha dell'immagine viaggia nell'export: serve a `/health` per dire QUALE frontend sta servendo.
ARG GIT_SHA=dev
RUN NEXT_TELEMETRY_DISABLED=1 npm run build     && printf '{"sha":"%s","source":"immagine","built":"%s"}
' "$GIT_SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"        > out/version.json     && test -f out/index.html

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

# L'export statico del frontend, costruito nello stadio `frontend-build` (ticket 24).
# Niente più bind mount: la cartella è nell'immagine, quindi app e frontend hanno la stessa versione.
COPY --from=frontend-build /frontend/out ./frontend/out

# Rendi lo script di avvio eseguibile
RUN chmod +x start.sh

# Esponi la porta richiesta
EXPOSE 7860

# Avvia l'app (Redis è un servizio separato, v. docker-compose.yml)
CMD ["./start.sh"]
