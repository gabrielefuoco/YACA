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

# Imposta NODE_ENV a production
ENV NODE_ENV=production
# Hugging Face Spaces richiede la porta 7860
ENV PORT=7860

# Copia le dipendenze del backend
COPY package*.json ./
RUN npm install --omit=dev

# Copia il resto dell'applicazione backend
COPY . .

# Copia il frontend buildato dalla cartella 'out' generata nel primo stage
# L'index.js serve questi file da /frontend/out
COPY --from=frontend-builder /app/frontend/out ./frontend/out

# Esponi la porta richiesta
EXPOSE 7860

# Comando di avvio (senza --expose-gc se non strettamente necessario, ma lo manteniamo come in package.json)
CMD ["node", "--expose-gc", "index.js"]
