// src/pool/impressioni.js

/**
 * IL RITORNO DELLE IMPRESSIONI (Ticket 14) E LA TARATURA (Ticket 21).
 *
 * `src/profile/impressions.js` scrive da sempre quali titoli sono stati serviti in pagina 1, e nessuno li
 * rileggeva: chi apre Stremio per dieci giorni vedeva gli stessi titoli in cima. Qui si legge la finestra
 * recente e si applica un **decadimento sul punteggio**, mai una cancellazione:
 *
 *     punteggio_effettivo = punteggio * 0.85 ** giorni_mostrato
 *
 * solo per i titoli mostrati in pagina 1 per almeno `DECADIMENTO_GIORNI_MINIMI` giorni distinti e **mai
 * visti**. Il titolo scende, i candidati dalla posizione 21-60 salgono: una riga che si rinnova senza
 * perdere qualità. Il decadimento si applica **dopo** la cache delle righe, quindi non invalida il lavoro
 * del grafo; la lettura delle impressioni e' memoizzata 60 s (`src/profile/impressions.js`).
 *
 * TICKET 21 — due difetti misurati della formula da sola, e le due aggiunte decise il 20/10:
 *  a. **senza varietà**: la pagina 1 si rinnovava in blocco ma sempre nello stesso ordine, e nei primi due
 *     giorni non cambiava niente. Ora ogni titolo porta un **alpha del giorno** (deterministico: dipende da
 *     giorno UTC e id), che muove l'ordine di ±`DECADIMENTO_ALPHA_BANDA` e cambia a mezzanotte.
 *  b. **senza ritorno**: un titolo scivolato giu' restava giu' ~11 giorni, poi tornava di colpo. Ora il
 *     decadimento vale **solo se il titolo e' ancora in home**: se non compare in pagina 1 da
 *     `DECADIMENTO_RESET_GIORNI_FUORI` giorni, il decadimento e' **azzerato** (reset) e il titolo torna al
 *     suo punteggio, con l'alpha del giorno.
 */

const { leggiImpressioniRecenti, giornoUTC } = require('../profile/impressions');
const { normalizeContentId } = require('../catalog/contentId');

/** Titoli mostrati cosi' tante volte da meritare di scendere (Ticket 14). */
const DECADIMENTO_GIORNI_MINIMI = 3;
/** Quanto pesa un giorno in piu' in home: 0.85^n (Ticket 14). */
const DECADIMENTO_FATTORE = 0.85;
/**
 * Se il titolo non e' in home da questi giorni, il decadimento e' azzerato (Ticket 21, il reset).
 * MISURATO (sonda, 10 giornate): con 2 giorni la pagina 1 fa il pendolo (92 rientri, restano 7,6/20 da
 * ieri); con 4 si calma (53 rientri, 10,7/20 restano). Si torna in gioco, ma non si balla.
 */
const DECADIMENTO_RESET_GIORNI_FUORI = 4;
/** L'alpha del giorno muove il punteggio di ±questa banda: varieta', non boost di gusto (Ticket 21). */
const DECADIMENTO_ALPHA_BANDA = 0.05;

/** L'id con cui il modello registra l'impressione: la STESSA normalizzazione dello scrittore. */
function tmdbDi(item) {
    return normalizeContentId(item?.tmdbId ?? item?.id);
}

/**
 * Un numero in [0, 1) che dipende SOLO da (giorno, id): stesso giorno -> stesso ordine, giorno dopo ->
 * ordine diverso. FNV-1a a 32 bit, nessuno stato da salvare.
 */
function casualeDelGiorno(giorno, id) {
    const testo = `${giorno}|${id}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < testo.length; i += 1) {
        hash ^= testo.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash / 0x100000000;
}

/** Il fattore del giorno per un titolo: `1 ± banda`. */
function alphaDelGiorno(id, giorno = giornoUTC(), banda = DECADIMENTO_ALPHA_BANDA) {
    return 1 + banda * (2 * casualeDelGiorno(giorno, id) - 1);
}

/** Giorni interi fra due date `YYYY-MM-DD` (positivo se `dopo` viene dopo `prima`). */
function giorniFra(prima, dopo) {
    if (!prima || !dopo) return null;
    const a = Date.parse(`${prima}T00:00:00.000Z`);
    const b = Date.parse(`${dopo}T00:00:00.000Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * Rilegge le impressioni e riordina le righe: decadimento (mai cancellazione) + alpha del giorno.
 * NON muta gli input (le righe vengono dalla cache: mutarle avvelenerebbe la cache) e NON toglie nessun
 * titolo. Si riordina solo una riga in cui OGNI titolo ha un punteggio.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.profileId
 * @param {Object<string, Array<object>>} params.assigned
 * @param {Set<string>|string[]} [params.visti] i titoli che l'utente ha gia' visto (i semi del grafo)
 * @param {string} [params.oggi] giorno UTC (per i test); default: oggi
 * @param {number} [params.giorniMinimi]
 * @param {number} [params.fattore]
 * @param {number} [params.resetGiorniFuori]
 * @param {number} [params.alphaBanda]
 * @returns {Promise<{assigned: Object, statistiche: {titoli: number, cataloghi: number, giorniMedi: number, spostamenti: number, righeNonOrdinate: number, riposati: number}}>}
 */
async function applicaDecadimento({
    userId,
    profileId,
    assigned,
    visti = [],
    oggi = giornoUTC(),
    giorniMinimi = DECADIMENTO_GIORNI_MINIMI,
    fattore = DECADIMENTO_FATTORE,
    resetGiorniFuori = DECADIMENTO_RESET_GIORNI_FUORI,
    alphaBanda = DECADIMENTO_ALPHA_BANDA,
    leggi = leggiImpressioniRecenti
} = {}) {
    const statistiche = { titoli: 0, cataloghi: 0, giorniMedi: 0, spostamenti: 0, righeNonOrdinate: 0, riposati: 0 };
    if (!assigned || typeof assigned !== 'object' || !userId) return { assigned, statistiche };

    const cataloghi = Object.keys(assigned);
    const impressioni = await leggi({ userId, profileId, catalogIds: cataloghi, memo: true });
    // Attenzione: si prosegue ANCHE senza impressioni, perche' l'alpha del giorno vale per tutti.

    // `visti` arriva da un payload di cache: se e' corrotto si ignora (un tipo sbagliato non deve
    // far cadere la porta del pool, cioe' tutte le righe hero).
    const vistiArr = visti instanceof Set ? [...visti] : (Array.isArray(visti) ? visti : []);
    const vistiSet = new Set(vistiArr.map((id) => normalizeContentId(id)));
    const risultato = {};
    let sommaGiorni = 0;

    for (const catalogo of cataloghi) {
        const riga = Array.isArray(assigned[catalogo]) ? assigned[catalogo] : [];
        const perTitolo = (impressioni && impressioni.get(catalogo)) || null;

        let toccati = 0;
        const nuova = riga.map((item) => {
            const id = tmdbDi(item);
            const punteggio = Number(item?.punteggio);
            if (!Number.isFinite(punteggio)) return item;

            const voce = perTitolo ? perTitolo.get(id) : null;
            const giorni = Number(voce?.giorni) || 0;
            const giorniFuori = giorniFra(voce?.ultimo, oggi);
            // Il decadimento vale solo se il titolo E' ANCORA in home (Ticket 21, il reset).
            const ancoraInHome = giorniFuori !== null && giorniFuori < resetGiorniFuori;
            const decade = giorni >= giorniMinimi && !vistiSet.has(id) && ancoraInHome;

            if (giorni >= giorniMinimi && !vistiSet.has(id) && !ancoraInHome) statistiche.riposati += 1;

            const dopoDecadimento = decade ? punteggio * Math.pow(fattore, giorni) : punteggio;
            const alpha = alphaDelGiorno(id, oggi, alphaBanda);
            const effettivo = dopoDecadimento * alpha;

            if (!decade && Math.abs(alpha - 1) < 1e-12) return item;

            if (decade) {
                toccati += 1;
                sommaGiorni += giorni;
            }
            return {
                ...item,
                punteggio: effettivo,
                punteggio_grafo: punteggio,
                ...(decade ? { giorni_in_home: giorni } : {}),
                alpha_giorno: alpha
            };
        });

        if (toccati > 0) {
            statistiche.titoli += toccati;
            statistiche.cataloghi += 1;
        }

        // Si riordina SOLO se ogni titolo della riga ha un punteggio: un titolo senza punteggio non e'
        // ne' primo ne' ultimo, e trattarlo come zero lo sposterebbe senza motivo.
        const tuttiConPunteggio = nuova.every((i) => Number.isFinite(Number(i?.punteggio)));
        if (!tuttiConPunteggio) {
            if (toccati > 0) statistiche.righeNonOrdinate += 1;
            risultato[catalogo] = nuova;
            continue;
        }
        const primaPosizione = new Map(nuova.map((i, idx) => [tmdbDi(i), idx]));
        // Ordine per punteggio effettivo, stabile: i pari merito restano nell'ordine del grafo.
        nuova.sort((a, b) => Number(b.punteggio) - Number(a.punteggio));
        for (let idx = 0; idx < nuova.length; idx++) {
            if (primaPosizione.get(tmdbDi(nuova[idx])) !== idx) statistiche.spostamenti += 1;
        }
        risultato[catalogo] = nuova;
    }

    statistiche.giorniMedi = statistiche.titoli > 0 ? Number((sommaGiorni / statistiche.titoli).toFixed(2)) : 0;
    return { assigned: risultato, statistiche };
}

module.exports = {
    applicaDecadimento,
    alphaDelGiorno,
    casualeDelGiorno,
    giorniFra,
    DECADIMENTO_GIORNI_MINIMI,
    DECADIMENTO_FATTORE,
    DECADIMENTO_RESET_GIORNI_FUORI,
    DECADIMENTO_ALPHA_BANDA
};
