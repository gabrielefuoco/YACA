FROM node:20-slim

WORKDIR /app

# Forziamo IPv4 per DNS/fetch: sulla macchina di casa IPv6 non e' instradato
ENV NODE_OPTIONS=--dns-result-order=ipv4first
ENV NODE_ENV=production

# Installa solo le dipendenze di produzione
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia solo l'entrypoint e la cartella sorgente (escludendo test, node_modules e cache)
COPY cli.js ./
COPY src/ ./src/

CMD ["node", "cli.js"]
