#!/usr/bin/env node
/**
 * Inserisce (o aggiorna) il token di ERDB in accounts.db.
 *
 * Da eseguire DENTRO il contenitore: `better-sqlite3` è già nell'immagine e il database
 * deve stare nel volume montato su /app/data.
 *
 *   docker compose exec erdb node /app/inserisci-token.js <token> '<config-json>'
 *
 * Esempio:
 *   docker compose exec erdb node /app/inserisci-token.js Tk-legion \
 *     '{"tmdbKey":"LA_TUA_CHIAVE","language":"it-IT"}'
 *
 * NOTE SULLA CONFIGURAZIONE (decise nella mappa poster-erdb, non rinegoziare qui):
 *   - NON mettere `streamBadgesProviderUrl`: i badge di risoluzione (4K/HDR/Dolby)
 *     costano i check sui torrent ed erano spesso falsati. Si vogliono fuori.
 *   - MDBList spento: è il provider che da solo faceva 5-25,9 s, e la sua assenza è
 *     quello che porta il giro da ~840 ore a ~2.
 *   - Un voto solo basta: IMDb (dal dataset locale, zero rete) o TMDB.
 *   - `customBadge` NON serve metterlo qui: il badge lo si passa per richiesta
 *     (`?badge=ITA`), così un poster può averlo e un altro no, e la chiave di cache
 *     della patch tiene separati i due casi. Metterlo qui lo applicherebbe a tutti.
 */

const path = require('node:path');
const Database = require('better-sqlite3');

const [token, configJson] = process.argv.slice(2);

if (!token || !configJson) {
    console.error("Uso: node inserisci-token.js <token> '<config-json>'");
    process.exit(1);
}

let config;
try {
    config = JSON.parse(configJson);
} catch (errore) {
    console.error('La configurazione non è JSON valido:', errore.message);
    process.exit(1);
}

if (config.streamBadgesProviderUrl) {
    console.error(
        'Rifiuto: `streamBadgesProviderUrl` è nella configurazione, ma la mappa ha deciso ' +
        'di non avere provider di stream (sono i check sui torrent che non vogliamo).'
    );
    process.exit(1);
}

const dbPath = process.env.ERDB_DATA_DIR
    ? path.join(process.env.ERDB_DATA_DIR, 'accounts.db')
    : '/app/data/accounts.db';

const db = new Database(dbPath);
db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
db.prepare(
    'INSERT INTO tokens (token, password_hash, config_json, created_at, updated_at) VALUES (?,?,?,?,?)'
).run(token, 'x:y', JSON.stringify(config), Date.now(), Date.now());

const mostrata = { ...config };
if (mostrata.tmdbKey) {
    mostrata.tmdbKey = `${String(mostrata.tmdbKey).slice(0, 4)}…(${String(mostrata.tmdbKey).length} caratteri)`;
}
console.log('config aggiornata per', `${token.slice(0, 14)}…`, JSON.stringify(mostrata));
db.close();
