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
    // AVALANCHE FINALE (review standards): senza, id vicini (603/604, 701/702) producevano alpha quasi
    // uguali — la correlazione misurata era 0,95 — e l'alpha diventava uno spostamento a blocchi invece
    // di un rimescolamento per titolo.
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b) >>> 0;
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
    hash ^= hash >>> 16;
    return (hash >>> 0) / 0x100000000;
}

// L'alpha e' costante per tutta la giornata UTC: si ricorda per (giorno, id) e si butta al cambio giorno.
let memoAlphaGiorno = null;
const memoAlpha = new Map();

/** Il fattore del giorno per un titolo: `1 ± banda`. */
function alphaDelGiorno(id, giorno = giornoUTC(), banda = DECADIMENTO_ALPHA_BANDA) {
    if (memoAlphaGiorno !== giorno) {
        memoAlpha.clear();
        memoAlphaGiorno = giorno;
    }
    const chiave = `${banda}|${id}`;
    const ricordato = memoAlpha.get(chiave);
    if (ricordato !== undefined) return ricordato;
    const alpha = 1 + banda * (2 * casualeDelGiorno(giorno, id) - 1);
    memoAlpha.set(chiave, alpha);
    return alpha;
}

/**
 * La «serie in corso»: quanti giorni consecutivi (con buchi piu' corti della soglia di reset) portano
 * all'ultima volta in home. E' il numero che il decadimento usa come esponente: dopo un'assenza lunga la
 * serie riparte da 1, quindi il titolo non torna a decadere con l'esponente vecchio (Ticket 21).
 */
function serieInCorso(date, resetGiorniFuori = DECADIMENTO_RESET_GIORNI_FUORI, oggi = giornoUTC()) {
    if (!Array.isArray(date) || date.length === 0) return 0;
    const ultimo = date[date.length - 1];
    // La serie deve ARRIVARE A OGGI: se il titolo non e' in home da `resetGiorniFuori` giorni, la serie
    // e' interrotta (0). E' il cuore del reset: quando torna, riparte da 1 e non dall'esponente vecchio.
    const bucoOggi = giorniFra(ultimo, oggi);
    if (bucoOggi === null || bucoOggi >= resetGiorniFuori) return 0;
    let n = 1;
    for (let i = date.length - 1; i > 0; i -= 1) {
        const buco = giorniFra(date[i - 1], date[i]);
        if (buco === null || buco >= resetGiorniFuori) break;
        n += 1;
    }
    return n;
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
    // Una banda fuori da [0, 1) produrrebbe punteggi negativi o NaN: si ricade sul default dichiarato.
    const banda = Number(alphaBanda);
    const bandaSicura = Number.isFinite(banda) && banda >= 0 && banda < 1 ? banda : DECADIMENTO_ALPHA_BANDA;
    // `oggi` deve essere un giorno `YYYY-MM-DD`: un ISO completo renderebbe NaN ogni confronto e il
    // decadimento si spegnerebbe in silenzio per tutta la richiesta.
    const oggiSicuro = /^\d{4}-\d{2}-\d{2}$/.test(String(oggi)) ? oggi : giornoUTC();

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

        // Se anche un solo titolo non ha un punteggio, la riga non si tocca: applicare l'alpha solo ad
        // alcuni lascerebbe i punteggi in disaccordo con l'ordine servito.
        const rigaOrdinabile = riga.every((i) => Number.isFinite(Number(i?.punteggio)));

        let toccati = 0;
        const nuova = rigaOrdinabile ? riga.map((item) => {
            const id = tmdbDi(item);
            const punteggio = Number(item?.punteggio);
            if (!Number.isFinite(punteggio)) return item;

            const voce = perTitolo ? perTitolo.get(id) : null;
            // L'esponente e' la SERIE IN CORSO, non il totale nella finestra: dopo un'assenza lunga la
            // serie riparte, altrimenti il «reset» durerebbe un giorno e il titolo tornerebbe a decadere
            // con l'esponente di prima (difetti trovati dalle due review).
            const giorni = serieInCorso(voce?.date, resetGiorniFuori, oggiSicuro);
            const totaleGiorni = Number(voce?.giorni) || 0;
            const giorniFuori = giorniFra(voce?.ultimo, oggiSicuro);
            // Il decadimento vale solo se il titolo E' ANCORA in home (Ticket 21, il reset).
            // Un `ultimo` nel futuro (orologio storto) non vale come «in home».
            const ancoraInHome = giorniFuori !== null && giorniFuori >= 0 && giorniFuori < resetGiorniFuori;
            const decade = giorni >= giorniMinimi && !vistiSet.has(id) && ancoraInHome;

            // «Riposati» = il decadimento e' stato ANNULLATO dal reset: il titolo aveva accumulato giorni
            // ma non e' piu' in home. Si conta sul totale storico, non sulla serie (che ora e' 0).
            if (totaleGiorni >= giorniMinimi && !vistiSet.has(id) && giorniFuori !== null
                && (giorniFuori < 0 || giorniFuori >= resetGiorniFuori)) {
                statistiche.riposati += 1;
            }

            const dopoDecadimento = decade ? punteggio * Math.pow(fattore, giorni) : punteggio;
            const alpha = alphaDelGiorno(id, oggiSicuro, bandaSicura);
            const effettivo = dopoDecadimento * alpha;

            if (!decade && Math.abs(alpha - 1) < 1e-12) return item;

            if (decade) {
                toccati += 1;
                sommaGiorni += giorni;
            }
            return {
                ...item,
                punteggio: effettivo,
                // Se l'item porta gia' il punteggio del grafo, si conserva quello: due passate non devono
                // squadrare il decadimento ne' spacciare il punteggio decadiuto per quello del grafo.
                punteggio_grafo: Number.isFinite(Number(item?.punteggio_grafo)) ? Number(item.punteggio_grafo) : punteggio,
                ...(decade ? { giorni_in_home: giorni } : {}),
                alpha_giorno: alpha
            };
        }) : riga;

        if (toccati > 0) {
            statistiche.titoli += toccati;
            statistiche.cataloghi += 1;
        }

        if (!rigaOrdinabile) {
            // Un titolo senza punteggio non e' ne' primo ne' ultimo, e trattarlo come zero lo sposterebbe
            // senza motivo: la riga resta com'e' e lo si dichiara.
            statistiche.righeNonOrdinate += 1;
            risultato[catalogo] = riga;
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
    serieInCorso,
    DECADIMENTO_GIORNI_MINIMI,
    DECADIMENTO_FATTORE,
    DECADIMENTO_RESET_GIORNI_FUORI,
    DECADIMENTO_ALPHA_BANDA
};
