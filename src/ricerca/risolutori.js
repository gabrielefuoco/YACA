/**
 * src/ricerca/risolutori.js
 *
 * I RISOLUTORI VERI (fetta 3). Il parser (`pianificatore.js`) è puro e chiede: «questo valore,
 * che id è?». Qui si risponde, con l'indice, `people.db`, il grafo e il lessico.
 *
 *   concetto  «navi»                  → ['ship', 'sea voyage', 'cargo ship', …]   (lessico + grafo)
 *   persona   «leonardo dicaprio»     → ['6193']                                  (people.db, FTS5)
 *   titolo    «amici miei atto ii»    → [45324]                                   (FTS DuckDB)
 *   provider  «netflix»               → [8]                                       (parquet)
 *
 * Quattro regole che valgono qui:
 *   1. **niente I/O al boot**: i client si aprono alla prima domanda (l'indice delle persone pesa
 *      94 MB, la mappa dei provider si costruisce con una query da 67 ms);
 *   2. **niente eccezioni**: un indice rotto è `null`, e il parser lo trasforma in un motivo;
 *   3. **niente invenzioni**: un concetto che non esiste nel dump non diventa un filtro. Una
 *      keyword inventata non dà errore, dà una pagina vuota;
 *   4. **il grafo espande, non indovina**: l'ancora è una keyword certa (lessico o nome inglese);
 *      le sorelle del suo cluster L1 sono un'aggiunta, con un tetto (`RICERCA_ESPANSIONE_MAX`,
 *      default 4; `RICERCA_ESPANSIONE=0` spegne l'espansione).
 *
 * Il `genere` non ha un risolutore: i 19 generi sono un dizionario puro in `generi.js`, e il parser
 * lo usa da solo. Iniettare anche quello avrebbe significato due fonti di verità.
 */

const indice = () => require('../indice');

/** Le mappe keyword, chieste alla porta dell'indice al primo uso (non all'import). */
const keywordIds = () => indice().keywordIds;
const { concettiDaNome } = require('./lessico_it');
const { normalizza } = require('../infra/testo');
const { distanza } = require('../indice/people');

/** Quante keyword sorelle aggiungere all'ancora. */
const ESPANSIONE_MAX = (() => {
    if (String(process.env.RICERCA_ESPANSIONE ?? '1') === '0') return 0;
    const valore = Number(process.env.RICERCA_ESPANSIONE_MAX);
    return Number.isFinite(valore) && valore >= 0 ? valore : 4;
})();

// ============================================================================
// FUZZY: la distanza si paga solo dove serve
// ============================================================================

/** Tolleranza di un refuso: una lettera sotto le 5, due sopra. Oltre, non è lo stesso nome. */
function sogliaPer(nome) {
    return String(nome || '').length <= 4 ? 1 : 2;
}

/**
 * Il candidato più vicino a `cercato` fra `candidati`. `null` se nessuno è entro la soglia.
 * L'elenco è piccolo per costruzione (le chiavi del lessico, o i nomi con lo stesso prefisso).
 */
function migliorPerDistanza(cercato, candidati, max = sogliaPer(cercato)) {
    let migliore = null;
    let miglioreDistanza = max + 1;

    for (const candidato of candidati) {
        const d = distanza(cercato, candidato, max);
        if (d < miglioreDistanza) {
            miglioreDistanza = d;
            migliore = candidato;
            if (d === 0) break;
        }
    }
    return migliore;
}

// ============================================================================
// INDICE DEI PREFISSI DELLE KEYWORD (in RAM, pigro)
// ============================================================================

/**
 * I 38.329 nomi di keyword del dump, indicizzati per i primi 2 e 3 caratteri.
 *
 * Perché non si può scorrere la mappa a ogni query: 38k Levenshtein sono ~10-20 ms, e questa è la
 * strada del *refuso*, non quella normale. Con i prefissi i candidati scendono a qualche decina.
 * Costo: ~10 ms una volta, ~3 MB; si costruisce solo alla prima richiesta fuzzy.
 */
let _prefissi = null;

function indicePrefissi() {
    if (_prefissi !== null) return _prefissi;
    const { nameToId } = keywordIds().getKeywordNameMaps();
    if (!nameToId || nameToId.size === 0) {
        _prefissi = false;
        return _prefissi;
    }
    const mappa = new Map();
    for (const nome of nameToId.keys()) {
        for (const lunghezza of [2, 3]) {
            if (nome.length < lunghezza) continue;
            const chiave = `${lunghezza}:${nome.slice(0, lunghezza)}`;
            const elenco = mappa.get(chiave);
            if (elenco) elenco.push(nome);
            else mappa.set(chiave, [nome]);
        }
    }
    _prefissi = mappa;
    return _prefissi;
}

/** Il nome di keyword più vicino a un refuso, o `null`. */
function keywordPerRefuso(cercato) {
    const indice = indicePrefissi();
    if (!indice) return null;

    const max = sogliaPer(cercato);
    for (const lunghezza of [3, 2]) {
        if (cercato.length < lunghezza) continue;
        const candidati = indice.get(`${lunghezza}:${cercato.slice(0, lunghezza)}`);
        if (candidati && candidati.length > 0) {
            const migliore = migliorPerDistanza(cercato, candidati, max);
            if (migliore) return migliore;
        }
    }
    return null;
}

// ============================================================================
// ESPANSIONE DAL GRAFO GERARCHICO
// ============================================================================

let _grafo = null;
function grafo() {
    if (_grafo) return _grafo;
    try {
        _grafo = indice().grafoGerarchico;
    } catch (_err) {
        _grafo = false;
    }
    return _grafo;
}

/**
 * L'ancora più le keyword sorelle del suo micro-cluster L1.
 *
 * Il grafo è indicizzato per **nome** di keyword (`kw_to_L1`), quindi l'ancora deve essere un nome
 * canonico: le si passa quello che torna da `keywordNameForId`, non quello che ha scritto l'utente.
 */
function espandiConcetto(ancora) {
    const nome = String(ancora || '').trim();
    if (!nome) return [];
    if (ESPANSIONE_MAX === 0) return [nome];

    const g = grafo();
    const dati = g && g.data;
    if (!dati || !dati.kw_to_L1) return [nome];

    const l1 = dati.kw_to_L1[nome] || dati.kw_to_L1[normalizza(nome)] || null;
    if (!l1) return [nome];

    const sorelle = (dati.L1 && dati.L1[l1] && dati.L1[l1].keywords) || [];
    const expansion = [nome];
    for (const sorella of sorelle) {
        if (expansion.length >= ESPANSIONE_MAX + 1) break;
        if (normalizza(sorella) === normalizza(nome)) continue;
        if (!expansion.includes(sorella)) expansion.push(sorella);
    }
    return expansion;
}

// ============================================================================
// CONCETTO
// ============================================================================

/**
 * Da un valore di `tema` alle keyword (nomi canonici) da filtrare.
 *
 * Quattro passi, dal più certo al più tollerante:
 *   1. è già un nome di keyword (`zombie`, `time travel`)? → quella;
 *   2. è una voce del lessico italiano (`navi`)? → la sua ancora;
 *   3. è un refuso di una voce del lessico (`navvi`)? → la più vicina (180 chiavi, gratis);
 *   4. è un refuso di un nome inglese (`zombi`)? → il più vicino fra i candidati col suo prefisso.
 * Poi l'ancora si espande col grafo. Se nessun passo trova niente: `null`, e il parser lo dichiara.
 *
 * @param {string} valore
 * @returns {string[]|null} nomi di keyword (il primo è l'ancora)
 */
function risolviConcetto(valore) {
    const cercato = normalizza(valore);
    if (!cercato) return null;

    // Il lessico italiano PRIMA del nome di keyword esatto. Non è un dettaglio: TMDB ha keyword
    // anche in italiano, e «natale» è una di quelle (id 327871, usata su pochi titoli). Col nome
    // esatto per primo, «tema natale» filtrava quella keyword invece di `christmas` e restituiva
    // zero risultati — mentre il lessico, curato, sa che natale = christmas.
    const voce = concettiDaNome(cercato);
    if (voce) return espandiConcetto(voce[0]);

    const idEsatto = keywordIds().keywordIdForName(cercato);
    if (idEsatto) return espandiConcetto(keywordIds().keywordNameForId(idEsatto) || cercato);

    const chiavi = require('./lessico_it').chiaviLessico();
    const chiaveVicina = migliorPerDistanza(cercato, chiavi);
    if (chiaveVicina) {
        const voci = concettiDaNome(chiaveVicina);
        if (voci) return espandiConcetto(voci[0]);
    }

    const nomeInglese = keywordPerRefuso(cercato);
    if (nomeInglese) {
        const id = keywordIds().keywordIdForName(nomeInglese);
        return espandiConcetto(id ? (keywordIds().keywordNameForId(id) || nomeInglese) : nomeInglese);
    }

    return null;
}

// ============================================================================
// PERSONA
// ============================================================================

let _clientPersone = null;
function clientPersone() {
    if (_clientPersone) return _clientPersone;
    const { PeopleSearchClient } = indice().people;
    _clientPersone = new PeopleSearchClient();
    return _clientPersone;
}

/** Chiude l'handle di `people.db` (test, reload dell'indice). */
function chiudiPersone() {
    if (_clientPersone) {
        try { _clientPersone.close(); } catch (_err) { /* niente */ }
        _clientPersone = null;
    }
}

/**
 * Da un nome scritto a mano all'id TMDB della persona: **una sola**, la migliore.
 *
 * Restituirne due per un cognome solo era una scelta di ripiego e si è rivelata peggiore del
 * vuoto: `cast nolan, villeneuve` metteva in OR Christopher Nolan e *Nolan North* (doppiatore), e
 * la pagina si riempiva di SpongeBob e Scooby-Doo. L'ordinamento per popolarità sceglie bene; per
 * l'omonimo l'utente scrive il nome per esteso.
 */
function risolviPersona(valore, { ruolo = null } = {}) {
    if (normalizza(valore).split(' ').filter(Boolean).length === 0) return null;
    // `minTitoli: 2` scarta gli omonimi con un solo titolo (spec §3.2): un nome che appare una
    // volta sola è più probabilmente rumore del dump che la persona che l'utente sta cercando.
    const risultati = clientPersone().search(valore, { limit: 1, ruolo, minTitoli: 2 });
    if (!Array.isArray(risultati) || risultati.length === 0) return null;
    return [risultati[0].tmdbId];
}

/**
 * `regista X`: il ruolo giusto per il tipo. Per le serie TMDB non ha i registi — ha i creatori
 * (`created_by`), e `people.db` li tiene sotto `creator`.
 */
function risolviCrew(valore, { type = 'movie' } = {}) {
    return risolviPersona(valore, { ruolo: type === 'series' ? 'creator' : 'director' });
}

// ============================================================================
// TITOLO
// ============================================================================

function numeroId(item) {
    const raw = item && item._tmdbId !== undefined && item._tmdbId !== null ? item._tmdbId : item && item.id;
    const id = Number(String(raw === null || raw === undefined ? '' : raw).replace(/^tmdb:/i, ''));
    return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Il titolo cercato nel nostro indice. Il tipo è quello della richiesta (film o serie): un seme
 * serie dentro la ricerca film non serve a niente.
 *
 * La scelta del titolo vive in `semiTitoli.js`: qui passa solo la forma che il parser si aspetta
 * (`[id]` o `null`). Era una regola sui primi dodici risultati della ricerca testuale, e sbagliava
 * metà dei titoli scritti come li scrivono le persone (articolo omesso, parole attaccate, accenti).
 */
async function risolviTitolo(valore, { type = 'movie' } = {}) {
    const cercato = String(valore || '').trim();
    if (!cercato) return null;
    const { risolviSeme } = require('./semiTitoli');
    return risolviSeme(cercato, { type });
}

// ============================================================================
// PROVIDER
// ============================================================================

let _provider = null;

/**
 * I 79 provider presenti nel dump (in abbonamento, `flatrate`), una volta sola.
 * Misurato: 67 ms la query; dopo è una lista in RAM.
 */
async function mappaProvider() {
    if (_provider !== null) return _provider;
    const indice = require('../indice');
    const righe = await indice.queryRaw(`
        SELECT DISTINCT p->>'provider_id' AS id, p->>'provider_name' AS nome
        FROM (
            SELECT unnest(from_json(json_extract(watch_providers_it, '$.flatrate'), '["JSON"]')) AS p FROM movies WHERE watch_providers_it IS NOT NULL
            UNION ALL
            SELECT unnest(from_json(json_extract(watch_providers_it, '$.flatrate'), '["JSON"]')) AS p FROM tv WHERE watch_providers_it IS NOT NULL
        )
        WHERE p->>'provider_name' IS NOT NULL
    `);

    const mappa = [];
    for (const riga of Array.isArray(righe) ? righe : []) {
        const id = Number(riga.id);
        const nome = String(riga.nome || '').trim();
        if (!Number.isFinite(id) || id <= 0 || !nome) continue;
        mappa.push({ id, nome, normalizzato: normalizza(nome) });
    }
    _provider = mappa;
    return _provider;
}

/** Azzera la mappa dei provider (test, reload). */
function azzeraProvider() {
    _provider = null;
}

/**
 * Da un nome scritto a mano agli id dei provider. Tre livelli, e vince il migliore:
 * nome identico (0), nome che inizia col testo (1), nome che lo contiene (2).
 *
 * `prime` deve trovare anche «Amazon Prime Video» (che non inizia con «prime»), ed è il motivo
 * per cui esiste il terzo livello. Il tetto di 3 evita che «max» tiri dentro mezza piattaforma.
 */
function scegliProvider(cercato, elenco) {
    const atteso = normalizza(cercato);
    if (!atteso) return null;

    const livelli = [[], [], []];
    for (const voce of elenco) {
        if (voce.normalizzato === atteso) livelli[0].push(voce);
        else if (voce.normalizzato.startsWith(atteso)) livelli[1].push(voce);
        else if (voce.normalizzato.includes(atteso)) livelli[2].push(voce);
    }
    for (const livello of livelli) {
        if (livello.length === 0) continue;
        return [...new Set(livello.map(voce => voce.id))].slice(0, 3);
    }
    return null;
}

async function risolviProvider(valore) {
    const cercato = String(valore || '').trim();
    if (!cercato) return null;
    try {
        return scegliProvider(cercato, await mappaProvider());
    } catch (_err) {
        return null;
    }
}

// ============================================================================
// IL KIT PER UNA RICHIESTA
// ============================================================================

/**
 * I risolutori legati a una richiesta. Il `type` serve ai titoli (un seme serie non ha senso in
 * una ricerca film); il `contesto` è quello del profilo, che il filtro dei titoli riceve.
 *
 * @param {{ type?: 'movie'|'series', contesto?: Object }} [opzioni]
 * @returns {{ concetto: Function, persona: Function, titolo: Function, provider: Function }}
 */
function creaRisolutori({ type = 'movie', contesto = {} } = {}) {
    return {
        concetto: (valore) => risolviConcetto(valore),
        persona: (valore) => risolviPersona(valore),
        crew: (valore) => risolviCrew(valore, { type }),
        titolo: (valore) => risolviTitolo(valore, { type, contesto }),
        provider: (valore) => risolviProvider(valore)
    };
}

module.exports = {
    ESPANSIONE_MAX,
    sogliaPer,
    migliorPerDistanza,
    indicePrefissi,
    keywordPerRefuso,
    espandiConcetto,
    risolviConcetto,
    risolviPersona,
    risolviCrew,
    chiudiPersone,
    numeroId,
    risolviTitolo,
    mappaProvider,
    azzeraProvider,
    scegliProvider,
    risolviProvider,
    creaRisolutori
};
