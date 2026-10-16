/**
 * LA ROTTA DEL GRAFO — `POST /api/bolle`.
 *
 * Prende il profilo dalla sessione (come fa `catalog.js`), legge la sua cronologia da `WatchHistory` e
 * chiede le liste a `src/engines/bolle/raccomanda.js`. Il calcolo sta la': qui c'e' solo il collegamento
 * — autenticazione, query, risposta — che e' esattamente la parte che va scritta guardando come lo fa il
 * resto del prodotto, e non inventata.
 *
 * LA FORMA DELLA RISPOSTA e' quella che il motore restituisce e nient'altro:
 *   { ok, liste, items, versioni, esclusi }
 * `liste` sono i mondi accesi, ognuno coi suoi `items` e la sua spiegazione; due delle quattro liste
 * tornano vuote con `da_comporre: true`, perche' `uscite_nuove` ha bisogno degli anni e
 * `nicchia_di_qualita` di popolarita' e voto medio — che stanno nel catalogo del prodotto, non nel
 * grafo. Il posto e' riservato nell'ordine, cosi' chi le compone non deve anche ricordarsi dove vanno.
 *
 * COSA NON FA: non risolve i poster, non tocca TMDB, non scrive niente. E' una lettura.
 */
const express = require('express');
const router = express.Router();

const { cronologiaDi } = require('../library');
const { raccomanda } = require('../engines/bolle/raccomanda');

const COOKIE = 'yaca_session';
const STORIA_MAX = 300;      // il motore e' tarato su storie fino a ~300 voci (i file di Trakt lo erano)

/** L'utente dalla sessione, o `null`. Stesso meccanismo di `catalog.js`, senza inventarne un altro. */
function utenteDallaSessione(req) {
    const token = req.cookies && req.cookies[COOKIE];
    if (!token) return null;
    try {
        const jwt = require('jsonwebtoken');
        const { getJwtSecret } = require('./auth/index');
        const decoded = jwt.verify(token, getJwtSecret());
        return decoded && decoded.userId ? decoded.userId : null;
    } catch (e) {
        return null;                       // sessione scaduta o manomessa: si tratta come assente
    }
}

router.post('/bolle', async (req, res) => {
    try {
        const userId = utenteDallaSessione(req);
        if (!userId) return res.status(401).json({ ok: false, errore: 'sessione assente o scaduta' });

        const profileId = (req.body && req.body.profileId) || 'global';
        const quante = Math.max(1, Math.min(8, Number(req.body && req.body.quante) || 4));

        // `{owner, context}` e' la coppia con cui il resto del prodotto indicizza i profili: `context`
        // e' l'id del profilo, o 'global'. La storia piu' recente per prima: il motore pesa le
        // ri-visioni e la recenza, e una storia troncata deve perdere il vecchio, non il nuovo.
        const voci = await cronologiaDi({ userId, profileId, limit: STORIA_MAX });

        const fuori = raccomanda(voci, { quante });
        return res.json({ ok: true, ...fuori, quanti_voci: voci.length, profilo: profileId });
    } catch (err) {
        console.error('[bolle] errore:', err && err.message);
        return res.status(500).json({ ok: false, errore: 'errore interno' });
    }
});

module.exports = router;
module.exports.utenteDallaSessione = utenteDallaSessione;
