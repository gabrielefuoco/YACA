/**
 * Chiave di cache per la risposta di `POST /scaffali`.
 *
 * PERCHE' ESISTE. Calcolare gli scaffali di un profilo costa ~4 secondi sul grafo V45:
 * sedici righe da sessanta titoli, ognuna con la sua diffusione, piu' le controparti
 * dell'altro medium. Il risultato pero' dipende solo da: quali titoli hai visto (e quanto),
 * i due cursori, il cap, e la versione del grafo. Non dall'ora, non dal dispositivo,
 * non dall'ordine in cui il client manda i semi.
 *
 * Quindi la chiave e' un'impronta di QUELLE cose, e nient'altro:
 *   · i semi normalizzati e ORDINATI (due richieste con gli stessi titoli in ordine diverso
 *     devono dare la stessa chiave, altrimenti la cache non serve a niente — e' lo stesso
 *     motivo per cui `requestHash.js` ordina le chiavi);
 *   · i cursori arrotondati, perche' 0.1 e 0.10000000000000002 sono lo stesso cursore;
 *   · le versioni del grafo (artefatto + ricetta): un grafo nuovo deve invalidare tutto;
 *   · un numero di versione di questa chiave, per poter cambiare la normalizzazione senza
 *     servire per un giorno risposte costruite con la regola vecchia.
 *
 * `eta_giorni` entra nella chiave perche' cambia il ranking di freschezza: cambia una volta
 * al giorno per utente, e questo di fatto limita la validita' della cache a un giorno.
 *
 * NOTA SUL FLAG `anime`:
 * Il flag booleano `anime` emesso nella risposta di POST /scaffali NON deve entrare nella chiave
 * di cache. `anime` non è un parametro di input né varia indipendentemente dagli altri input:
 * è un dato puramente derivato dalla composizione dei membri dello scaffale e dai metadati del
 * canone (congelati nell'artefatto del grafo). Includerlo nella chiave sarebbe ridondante ed errato.
 */
const crypto = require('crypto');

const CHIAVE_VERSIONE = 1;

function normalizzaSemi(semi, mediumRichiesto) {
    return (Array.isArray(semi) ? semi : [])
        .map((s) => {
            const medium = s.medium === 'movie' || s.medium === 'series'
                ? s.medium
                : (mediumRichiesto === 'movie' ? 'movie' : 'series');
            const chiave = s.key || `${medium === 'series' ? 'tv' : 'movie'}:${s.tmdbId}`;
            return {
                k: String(chiave),
                p: Number.isFinite(Number(s.plays)) ? Number(s.plays) : 1,
                e: Math.round(Number.isFinite(Number(s.eta_giorni)) ? Number(s.eta_giorni) : 0),
                m: medium,
            };
        })
        .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
}

function normalizzaOpzioni(opzioni) {
    if (!opzioni || typeof opzioni !== 'object') return null;
    const out = {};
    for (const chiave of ['tono', 'complessita', 'canone']) {
        const v = Number(opzioni[chiave]);
        if (Number.isFinite(v) && v !== 0) out[chiave] = Math.round(v * 100) / 100;
    }
    const kids = opzioni.kids !== undefined ? Boolean(opzioni.kids) : (opzioni.filtri?.kids !== undefined ? Boolean(opzioni.filtri.kids) : undefined);
    if (kids) out.kids = true;
    return Object.keys(out).length ? out : null;
}

function buildShelfCacheKey({ semi, medium, opzioni, cap, versioni } = {}) {
    const payload = JSON.stringify({
        v: CHIAVE_VERSIONE,
        g: [versioni && versioni.artefatto, versioni && versioni.ricetta].filter(Boolean).join('|'),
        med: medium === 'movie' ? 'movie' : (medium === 'series' || medium === 'tv' ? 'series' : 'all'),
        cap: Number(cap) || 60,
        opt: normalizzaOpzioni(opzioni),
        semi: normalizzaSemi(semi, medium),
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

module.exports = { buildShelfCacheKey, CHIAVE_VERSIONE };
