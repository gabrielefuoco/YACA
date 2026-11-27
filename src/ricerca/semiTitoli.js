/**
 * src/ricerca/semiTitoli.js
 *
 * IL SEME DI `simili`: dal titolo scritto all'id, in RAM.
 *
 * Perché non la ricerca testuale dell'indice: l'FTS risponde «quali righe contengono queste parole
 * come prefissi», non «quale titolo intendeva». Misurato su 32 casi reali (vedi
 * `.scratch/ricerca-senza-llm/probe-semi.js`), il percorso FTS + regola del prefisso esatto ne
 * azzeccava 15 su 32: cadeva su ogni modo normale di scrivere un titolo — l'articolo omesso
 * («padrino»), il titolo italiano quando si scrive quello originale («dark knight»), le parole
 * attaccate («spiderman»), gli accenti («amelie»), e i nomi corti («inter» → *Inter. Due Stelle sul
 * Cuore* invece di *Interstellar*).
 *
 * Qui i titoli si caricano una volta (118k righe, ~250 ms) e restano in RAM normalizzati:
 * minuscole, senza accenti, punteggiatura ridotta a spazio. La risoluzione è una regola sola,
 * spiegabile a voce:
 *
 *   vince il titolo **più visto** fra quelli che contengono quello che hai scritto alla parola
 *   intera; se uno si chiama **esattamente** così, vince lui — a meno che sia un titolo che
 *   nessuno ha visto (meno del 5% del più visto che lo contiene).
 *
 * Così «cavaliere oscuro» trova *Il cavaliere oscuro* e non il seguito, «godfather» trova *The
 * Godfather* e non l'omonimo sconosciuto, «batman» trova *Batman* e non *Batman Begins*.
 *
 * Il refuso vero resta fuori: `batmn` non trova *Batman*. È un limite dichiarato, non una svista —
 * un seme sbagliato produce vicini sbagliati, e non si vede.
 */
const { normalizza } = require('../infra/testo');

/** Sotto i tre caratteri ogni titolo che contiene quelle lettere va bene: non è una risposta. */
const MIN_LUNGHEZZA = 3;

/** Il passaggio «titolo scritto attaccato» alloca una stringa per riga: si fa solo se serve. */
const MIN_UNITE = 6;

/**
 * Quanto deve contare un titolo esatto per vincere sul più visto che lo contiene. Sotto questa
 * quota è un titolo che nessuno ha visto (l'omonimo *Godfather* del 1997 contro *The Godfather*):
 * chi scrive una parola sola non intende quello.
 */
const QUOTA_ESATTO = 0.05;

/**
 * L'indice dei semi a partire dalle righe dell'indice: una voce per titolo, e una per il titolo
 * originale quando è diverso (`dark knight` deve trovare *Il cavaliere oscuro*).
 *
 * @param {Array<{id: number|string, titolo: string, titoloOriginale?: string, voti?: number}>} righe
 * @returns {{ ids: number[], voti: number[], norme: string[] }}
 */
function creaIndiceSemi(righe) {
    const ids = [];
    const voti = [];
    const norme = [];
    // Il titolo con uno spazio davanti: la ricerca del confine di parola e' un `indexOf` su questa
    // stringa, senza allocare niente per riga a ogni query (erano 200k stringhe per ricerca).
    const cercabili = [];

    for (const riga of Array.isArray(righe) ? righe : []) {
        const id = Number(riga && riga.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const votiTitolo = Number(riga.voti) || 0;
        const nomi = new Set([normalizza(riga.titolo), normalizza(riga.titoloOriginale)]);
        nomi.delete('');
        for (const norm of nomi) {
            ids.push(id);
            voti.push(votiTitolo);
            norme.push(norm);
            cercabili.push(` ${norm}`);
        }
    }

    return { ids, voti, norme, cercabili };
}

/**
 * Il titolo che l'utente intendeva, o `null`.
 *
 * Il match è a **confine di parola** (` padrino` dentro ` il padrino`), quindi un prefisso funziona
 * e `man` non pesca `batman`. Il titolo scritto attaccato (`spiderman`) si prova in un secondo
 * passaggio, solo quando il primo non ha trovato niente.
 *
 * @param {{ids: number[], voti: number[], norme: string[]}} indice
 * @param {string} scritto
 * @returns {{id: number, titolo: string, voti: number}|null}
 */
function cercaSeme(indice, scritto) {
    if (!indice || !Array.isArray(indice.norme) || indice.norme.length === 0) return null;

    const query = normalizza(scritto);
    if (query.length < MIN_LUNGHEZZA) return null;

    const ancorata = ` ${query}`;
    const candidati = [];
    const raccogli = (i) => candidati.push({ i, esatto: indice.norme[i] === query });

    const cercabili = indice.cercabili || indice.norme.map(norm => ` ${norm}`);
    for (let i = 0; i < indice.norme.length; i++) {
        if (cercabili[i].indexOf(ancorata) !== -1) raccogli(i);
    }

    if (candidati.length === 0 && query.length >= MIN_UNITE) {
        const unite = query.replace(/ /g, '');
        for (let i = 0; i < indice.norme.length; i++) {
            const unito = indice.norme[i].replace(/ /g, '');
            // «Attaccato uguale» è esatto: `spiderman` è *Spider-Man*, non *Spider-Man: No Way Home*.
            if (unito.includes(unite)) candidati.push({ i, esatto: unito === unite });
        }
    }

    if (candidati.length === 0) return null;

    // Il più visto, poi il titolo esatto se non è trascurabile.
    let migliore = candidati[0];
    for (const candidato of candidati) {
        if (indice.voti[candidato.i] > indice.voti[migliore.i]) migliore = candidato;
    }
    const esatto = candidati.find(c => c.esatto);
    if (esatto && indice.voti[esatto.i] >= indice.voti[migliore.i] * QUOTA_ESATTO) migliore = esatto;

    const i = migliore.i;
    return { id: indice.ids[i], titolo: indice.norme[i], voti: indice.voti[i] };
}

// ============================================================================
// L'indice dei titoli vivo, caricato una volta per medium
// ============================================================================

let cache = { chiave: null, movie: null, series: null };

/**
 * Identità del database: quando il daemon scambia il file, la copia in RAM è vecchia e si ricarica.
 * Se la porta non la espone, si carica una volta e basta.
 */
function chiaveDatabase(indice) {
    try {
        const identita = typeof indice.identita === 'function' ? indice.identita() : null;
        return identita ? `${identita.mtimeMs}:${identita.size}` : 'statico';
    } catch (_err) {
        return 'statico';
    }
}

async function indiceDelMedium(medium) {
    const indice = require('../indice');
    const chiave = chiaveDatabase(indice);
    if (cache.chiave !== chiave) cache = { chiave, movie: null, series: null };
    if (cache[medium]) return cache[medium];

    const serie = medium === 'series';
    const tabella = serie ? 'tv' : 'movies';
    const righe = await indice.queryRaw(`
        SELECT id,
               ${serie ? 'name' : 'title'} AS titolo,
               ${serie ? 'original_name' : 'original_title'} AS titoloOriginale,
               COALESCE(vote_count, 0) AS voti
        FROM ${tabella}
    `);

    cache[medium] = creaIndiceSemi(righe);
    return cache[medium];
}

/**
 * Il seme per `simili`, nella forma che il parser si aspetta (`[id]`), o `null`.
 *
 * Non solleva: senza indice la ricerca continua senza seme, e il motivo lo dichiara.
 */
async function risolviSeme(scritto, { type = 'movie' } = {}) {
    const medium = type === 'series' ? 'series' : 'movie';
    try {
        const indice = await indiceDelMedium(medium);
        const scelto = cercaSeme(indice, scritto);
        return scelto ? [scelto.id] : null;
    } catch (err) {
        console.error('[SemiTitoli] indice dei semi non disponibile:', err.message);
        return null;
    }
}

/** Solo per i test: riparte dall'indice vuoto. */
function svuotaCache() {
    cache = { chiave: null, movie: null, series: null };
}

module.exports = {
    creaIndiceSemi,
    cercaSeme,
    risolviSeme,
    svuotaCache
};
