/**
 * LA SESSIONE, IN UN POSTO SOLO.
 *
 * **Perché esiste (17/10/2026).** Le undici rotte di `src/api/profiles.js` prendevano l'utente da
 * `req.query.userId` / `req.body.userId` **senza verificare niente**: chiunque poteva leggere e scrivere
 * la libreria di chiunque altro passando un altro id — e l'id di un utente sta nell'URL del manifest che si
 * condivide con Stremio (`/:userHandle/manifest.json`, vedi `src/api/stremio.js`). Un IDOR, non un'ombra.
 *
 * Nello stesso giro è emerso il rovescio: `src/api/bolle.js` leggeva `req.cookies`, ma nessuno montava un
 * parser dei cookie su quel percorso (`cookieParser` c'era solo sulle rotte di auth e su `/api/configure`)
 * — quindi `req.cookies` era `undefined` e `POST /api/bolle` rispondeva **401 sempre**.
 *
 * Qui c'è il meccanismo una volta: il cookie `yaca_session` è un JWT firmato con `getJwtSecret`
 * (`src/api/auth/index.js`), e l'utente è il `userId` dentro il token. Chi monta un router che vuole un
 * utente mette `richiedeSessione` e legge `req.utenteId`: **il chiamante non ha più voce in capitolo su
 * *chi* sta chiedendo**. E chi quel cookie lo deve solo leggere mette `cookieParser()` prima (altrimenti
 * `req.cookies` è `undefined` e la sessione sembra assente).
 *
 * La forma dell'errore resta quella che il client già conosce (`error` stringa) più un `code` per il
 * vocabolario nuovo: il ticket 10 della mappa `confini` unificherà tutti gli errori di dominio in
 * `{ error: { code, message } }`.
 */
const COOKIE = 'yaca_session';

/** L'utente dalla sessione, o `null`. Non solleva mai: una sessione manomessa è una sessione assente. */
function utenteDallaSessione(req) {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) return null;
    try {
        const jwt = require('jsonwebtoken');
        const { getJwtSecret } = require('../auth/index');
        const decoded = jwt.verify(token, getJwtSecret());
        return decoded && decoded.userId ? decoded.userId : null;
    } catch (e) {
        return null;
    }
}

/** Middleware: pretende la sessione e mette l'utente in `req.utenteId`. */
function richiedeSessione(req, res, next) {
    const userId = utenteDallaSessione(req);
    if (!userId) {
        return res.status(401).json({
            error: {
                code: 'non_autenticato',
                message: 'Sessione assente o scaduta.'
            }
        });
    }
    req.utenteId = userId;
    next();
}

/** Risponde con il contratto di errore unico di dominio: `{ error: { code, message } }`. */
function erroreDominio(res, status, code, message) {
    return res.status(status).json({
        error: {
            code,
            message
        }
    });
}

module.exports = { COOKIE, utenteDallaSessione, richiedeSessione, erroreDominio };

