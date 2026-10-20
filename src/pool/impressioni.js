// src/pool/impressioni.js

/**
 * IL RITORNO DELLE IMPRESSIONI (Ticket 14).
 *
 * `src/profile/impressions.js` scrive da sempre quali titoli sono stati serviti in pagina 1, e nessuno li
 * rileggeva: chi apre Stremio per dieci giorni vedeva gli stessi titoli in cima. Qui si legge la finestra
 * recente e si applica un **decadimento sul punteggio**, mai una cancellazione:
 *
 *     punteggio_effettivo = punteggio * 0.85 ** giorni_mostrato
 *
 * solo per i titoli mostrati in pagina 1 per almeno `GIORNI_MINIMI` giorni distinti e **mai visti**.
 * Il titolo scende, i candidati dalla posizione 21-60 salgono: una riga che si rinnova senza perdere
 * qualità. Il decadimento si applica **dopo** la cache delle righe, quindi non invalida il lavoro del
 * grafo; la lettura delle impressioni e' memoizzata 60 s (`src/profile/impressions.js`).
 */

const { leggiImpressioniRecenti } = require('../profile/impressions');
const { normalizeContentId } = require('../catalog/contentId');

/** Titoli mostrati cosi' tante volte da meritare di scendere (Ticket 14). */
const DECADIMENTO_GIORNI_MINIMI = 3;
/** Quanto pesa un giorno in piu' in home: 0.85^n (Ticket 14). */
const DECADIMENTO_FATTORE = 0.85;

/** L'id con cui il modello registra l'impressione: la STESSA normalizzazione dello scrittore. */
function tmdbDi(item) {
    return normalizeContentId(item?.tmdbId ?? item?.id);
}

/**
 * Applica il decadimento a un assegnato di cataloghi. NON muta gli input (le righe vengono dalla cache:
 * mutarle avvelenerebbe la cache) e NON toglie nessun titolo.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.profileId
 * @param {Object<string, Array<object>>} params.assigned
 * @param {Set<string>|string[]} [params.visti] i titoli che l'utente ha gia' visto (i semi del grafo)
 * @param {number} [params.giorniMinimi]
 * @param {number} [params.fattore]
 * @returns {Promise<{assigned: Object, statistiche: {titoli: number, cataloghi: number, giorniMedi: number, spostamenti: number, righeNonOrdinate: number}}>}
 */
async function applicaDecadimento({
    userId,
    profileId,
    assigned,
    visti = [],
    giorniMinimi = DECADIMENTO_GIORNI_MINIMI,
    fattore = DECADIMENTO_FATTORE,
    leggi = leggiImpressioniRecenti
} = {}) {
    const statistiche = { titoli: 0, cataloghi: 0, giorniMedi: 0, spostamenti: 0, righeNonOrdinate: 0 };
    if (!assigned || typeof assigned !== 'object' || !userId) return { assigned, statistiche };

    const cataloghi = Object.keys(assigned);
    const impressioni = await leggi({ userId, profileId, catalogIds: cataloghi, memo: true });
    if (!impressioni || impressioni.size === 0) return { assigned, statistiche };

    // `visti` arriva da un payload di cache: se e' corrotto si ignora (un tipo sbagliato non deve
    // far cadere la porta del pool, cioe' tutte le righe hero).
    const vistiArr = visti instanceof Set ? [...visti] : (Array.isArray(visti) ? visti : []);
    const vistiSet = new Set(vistiArr.map((id) => normalizeContentId(id)));
    const risultato = {};
    let sommaGiorni = 0;

    for (const catalogo of cataloghi) {
        const riga = Array.isArray(assigned[catalogo]) ? assigned[catalogo] : [];
        const giorniPerTitolo = impressioni.get(catalogo);
        if (!giorniPerTitolo || giorniPerTitolo.size === 0) {
            risultato[catalogo] = riga;
            continue;
        }

        let toccati = 0;
        const nuova = riga.map((item) => {
            const id = tmdbDi(item);
            const giorni = giorniPerTitolo.get(id) || 0;
            if (giorni < giorniMinimi || vistiSet.has(id)) return item;
            const punteggio = Number(item?.punteggio);
            if (!Number.isFinite(punteggio)) return item;
            const effettivo = punteggio * Math.pow(fattore, giorni);
            toccati += 1;
            sommaGiorni += giorni;
            return { ...item, punteggio: effettivo, punteggio_grafo: punteggio, giorni_in_home: giorni };
        });

        if (toccati > 0) {
            statistiche.titoli += toccati;
            statistiche.cataloghi += 1;
            // Si riordina SOLO se ogni titolo della riga ha un punteggio: un titolo senza punteggio non
            // e' ne' primo ne' ultimo, e trattarlo come zero lo sposterebbe senza motivo.
            const tuttiConPunteggio = nuova.every((i) => Number.isFinite(Number(i?.punteggio)));
            if (!tuttiConPunteggio) {
                statistiche.righeNonOrdinate += 1;
                risultato[catalogo] = nuova;
                continue;
            }
            const primaPosizione = new Map(nuova.map((i, idx) => [tmdbDi(i), idx]));
            // Ordine per punteggio effettivo, stabile: i pari merito restano nell'ordine del grafo.
            nuova.sort((a, b) => Number(b.punteggio) - Number(a.punteggio));
            for (let idx = 0; idx < nuova.length; idx++) {
                if (primaPosizione.get(tmdbDi(nuova[idx])) !== idx) statistiche.spostamenti += 1;
            }
        }
        risultato[catalogo] = nuova;
    }

    statistiche.giorniMedi = statistiche.titoli > 0 ? Number((sommaGiorni / statistiche.titoli).toFixed(2)) : 0;
    return { assigned: risultato, statistiche };
}

module.exports = {
    applicaDecadimento,
    DECADIMENTO_GIORNI_MINIMI,
    DECADIMENTO_FATTORE
};
