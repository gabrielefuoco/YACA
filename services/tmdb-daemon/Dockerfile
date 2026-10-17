# Dockerfile per il servizio standalone tmdb-daemon
# Riutilizza l'immagine applicativa yaca:latest che contiene già tutte le dipendenze
# native (duckdb, better-sqlite3) e gli script di conversione.
FROM ghcr.io/gabrielefuoco/yaca:latest

WORKDIR /app

ENV NODE_ENV=production

CMD ["node", "services/tmdb-daemon/cli.js"]
