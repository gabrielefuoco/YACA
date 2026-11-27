/**
 * src/ricerca/compilatore.js
 *
 * IL COMPILATORE DEGLI INTENTI (fetta 4): intento in, filtri dell'indice out.
 *
 * Il parser produce `{ generi, anno, concetti, persone, provider, lingua, paese, anime, simile_a,
 * testo }`; l'indice capisce `with_genres`, `with_keywords`, `with_cast`, `primary_release_date.*`,
 * `with_watch_providers`, `with_original_language`, `with_origin_country`, `isAnime`, `similar_to`,
 * `text_search`. Questo modulo è l'unico posto in cui le due lingue si incontrano: se cambia una
 * delle due, si cambia qui, e i test lo dicono.
 *
 * Tre modi, perché sono tre motori diversi:
 *   - `testo`  → la ricerca testuale (FTS Tier 1 + Tier 2 + nomi appresi);
 *   - `filtri` → una discovery su DuckDB (`getDuckDbCatalogFromFilters`);
 *   - `semi`   → i vicini di uno o più titoli (`similar_to`, cioè le `recommendations` del parquet;
 *                la diffusione sul grafo arriva con la fetta 5).
 *
 * Regole di traduzione, tutte dichiarate:
 *   - **più valori = OR** (`with_genres: '27|35'`, `with_cast: '6193|525'`,
 *     `with_keywords: '…|…'`, `with_watch_providers: '8|119'`), tranne `anno` che è un intervallo;
 *   - **nessun filtro implicito**: non aggiungiamo `vote_count ≥ N` né whitelist di lingue. Con la
 *     sintassi l'utente è esplicito, e nascondere il cinema turco non è una decisione che ci spetta
 *     (l'ordinamento predefinito è già per popolarità, che il rumore lo toglie da solo);
 *   - **un concetto senza id non diventa un filtro**: le keyword si filtrano per id numerico
 *     (`with_keywords` fa `map(Number)`), quindi un nome che il dump non conosce viene dichiarato
 *     nei `motivi`, non passato avanti come stringa.
 */

/**
 * La risoluzione nome→id delle keyword, chiesta alla **porta dell'indice** solo quando serve:
 * importarla al caricamento del modulo trascinerebbe DuckDB dentro il compilatore.
 */
function keywordIdForNamePredefinito() {
    return require('../indice').keywordIds.keywordIdForName;
}

/**
 * I filtri dell'indice a partire da un intento.
 *
 * @param {Object} intento
 * @param {Object} [opzioni]
 * @param {'movie'|'series'} [opzioni.type='movie']
 * @param {(nome: string) => string|null} [opzioni.risolviKeyword] iniettabile per i test
 * @returns {{ modo: 'testo'|'filtri'|'semi'|'nessuno', filtri: Object, semi: (number|string)[], motivi: string[] }}
 */
function compilaIntento(intento, { type = 'movie', risolviKeyword = null } = {}) {
    const risolvi = risolviKeyword || keywordIdForNamePredefinito();
    const motivi = [];
    const filtri = {};

    if (!intento || typeof intento !== 'object') {
        return { modo: 'nessuno', filtri, semi: [], motivi: ['intento_assente'] };
    }

    const isTv = type === 'series' || type === 'tv';

    if (intento.testo) filtri.text_search = String(intento.testo);

    if (Array.isArray(intento.generi) && intento.generi.length > 0) {
        // `|` = OR nell'indice. Più generi scritti dall'utente sono alternative, non una richiesta
        // di titoli che siano horror E commedia insieme (`allGenres` esiste, ma non è ciò che dice
        // la sintassi: vedi spec §1 regola 3).
        filtri.with_genres = intento.generi.map(String).join('|');
    }

    if (Array.isArray(intento.concetti) && intento.concetti.length > 0) {
        const ids = [];
        for (const nome of intento.concetti) {
            const id = risolvi(nome);
            if (id) ids.push(String(id));
            else motivi.push(`concetto_senza_id: ${nome}`);
        }
        if (ids.length > 0) filtri.with_keywords = [...new Set(ids)].join('|');
    }

    if (Array.isArray(intento.persone) && intento.persone.length > 0) {
        filtri.with_cast = intento.persone.map(String).join('|');
    }

    if (Array.isArray(intento.crew) && intento.crew.length > 0) {
        // Le serie non hanno `directors`: lì il filtro è `created_by`.
        filtri[isTv ? 'with_created_by' : 'with_crew'] = intento.crew.map(String).join('|');
    }

    if (Array.isArray(intento.voto) && intento.voto.length === 2) {
        if (intento.voto[0] !== null) filtri['vote_average.gte'] = Number(intento.voto[0]);
        if (intento.voto[1] !== null) filtri['vote_average.lte'] = Number(intento.voto[1]);
    }

    if (Array.isArray(intento.durata) && intento.durata.length === 2) {
        if (intento.durata[0] !== null) filtri['with_runtime.gte'] = Number(intento.durata[0]);
        if (intento.durata[1] !== null) filtri['with_runtime.lte'] = Number(intento.durata[1]);
    }

    if (intento.eta) filtri['certification.lte'] = String(intento.eta);

    if (Array.isArray(intento.senzaGeneri) && intento.senzaGeneri.length > 0) {
        filtri.without_genres = intento.senzaGeneri.map(String).join(',');
    }

    if (Array.isArray(intento.senzaConcetti) && intento.senzaConcetti.length > 0) {
        const ids = [];
        for (const nome of intento.senzaConcetti) {
            const id = risolvi(nome);
            if (id) ids.push(String(id));
            else motivi.push(`concetto_senza_id: ${nome}`);
        }
        if (ids.length > 0) filtri.without_keywords = [...new Set(ids)].join(',');
    }

    if (intento.ordina) {
        // `ordina data` diventa la data giusta per il tipo.
        filtri.sort_by = intento.ordina === 'primary_release_date.desc' && isTv
            ? 'first_air_date.desc'
            : String(intento.ordina);
    }

    if (Array.isArray(intento.anno) && intento.anno.length === 2) {
        const [da, a] = intento.anno.map(Number);
        if (Number.isFinite(da) && Number.isFinite(a)) {
            const prefisso = isTv ? 'first_air_date' : 'primary_release_date';
            filtri[`${prefisso}.gte`] = `${da}-01-01`;
            filtri[`${prefisso}.lte`] = `${a}-12-31`;
        }
    }

    if (Array.isArray(intento.provider) && intento.provider.length > 0) {
        // La regione è quella del catalogo (l'Italia): il parquet ha `watch_providers_it` e `_us`.
        filtri.with_watch_providers = intento.provider.map(String).join('|');
        filtri.watch_region = 'IT';
    }

    if (intento.lingua) filtri.with_original_language = String(intento.lingua);
    if (intento.paese) filtri.with_origin_country = String(intento.paese);
    if (intento.anime) filtri.isAnime = true;

    const semi = Array.isArray(intento.simile_a) ? intento.simile_a.filter(Boolean) : [];
    if (semi.length > 0) {
        // Gli altri filtri restano e si applicano *dentro* i vicini: `simili interstellar anno 2010`
        // sono i vicini di Interstellar usciti nel 2010.
        return { modo: 'semi', filtri, semi, motivi };
    }

    if (Object.keys(filtri).length === 0) {
        return { modo: 'nessuno', filtri, semi: [], motivi: [...motivi, 'nessuna_condizione'] };
    }

    // `testo` è una modalità a sé solo quando è l'unico vincolo: lì la ricerca usa anche il Tier 2
    // e i nomi appresi (i titoli della coda lunga). Con altri filtri si passa dall'indice come una
    // discovery qualsiasi, che è l'unica cosa che sa combinare testo e vincoli.
    const soloTesto = Boolean(filtri.text_search) && Object.keys(filtri).length === 1;
    return { modo: soloTesto ? 'testo' : 'filtri', filtri, semi: [], motivi };
}

/**
 * Budget della chiamata al grafo. È un servizio locale, ma la ricerca non può aspettare il
 * timeout di default (10 s): oltre questo, si torna alla colonna `recommendations`.
 * Override con `RICERCA_GRAFO_TIMEOUT_MS`.
 */
const GRAFO_TIMEOUT_MS = Math.max(500, Number(process.env.RICERCA_GRAFO_TIMEOUT_MS) || 4000);

/**
 * Quanti vicini chiedere. La matrice porta i 100 più vicini di ogni titolo: si chiedono tutti e
 * cento, così la prima pagina è piena (60) e la seconda non è vuota. Con 60 si serviva una pagina
 * sola e la successiva restava senza niente, anche se il grafo aveva altro da dire.
 */
const SEMI_CAP = 100;

/** L'id numerico di un meta (`tmdb:123` o `123`). */
function idNumerico(item) {
    const raw = item && item._tmdbId !== undefined && item._tmdbId !== null ? item._tmdbId : item && item.id;
    const id = Number(String(raw === null || raw === undefined ? '' : raw).replace(/^tmdb:/i, ''));
    return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * I vicini dei semi, chiesti al grafo con **tutti i semi insieme** (`POST /vicini`).
 *
 * Il contratto del servizio è `{ vicini: [ { tmdbId, medium, punteggio } ] }`, letto dalla matrice
 * `vicini-top100.npz` già costruita offline: la richiesta è una **lettura di riga** (0,8 ms con tre
 * semi, contro 32 ms di PageRank). I titoli arrivano per id e per punteggio, quindi si idratano dal
 * nostro indice **conservando l'ordine del grafo**: rimetterli nell'ordine della query sarebbe come
 * non averli ordinati.
 *
 * @returns {Promise<{items: Array, motivi: string[]}|null>} `null` quando il grafo non può
 *   rispondere (servizio giù, semi fuori canone, lista vuota): chi chiama ripiega sulla colonna.
 */
async function semiDaGrafo(piano, { type, skip, cap, contesto, cerca, vicini }) {
    const medium = type === 'series' ? 'series' : 'movie';
    const semi = (piano.semi || []).slice(0, 5).map(seme => ({ tmdbId: Number(seme), medium }));
    if (semi.length === 0 || semi.some(seme => !Number.isFinite(seme.tmdbId))) return null;

    let risposta;
    try {
        const chiedi = vicini || require('../clients/graphClient').vicini;
        // Si chiedono i vicini che la matrice ha (100), non la pagina: la pagina può essere più
        // grande per le richieste generiche, ma il grafo non ha altro da dare.
        risposta = await chiedi(
            { semi, medium, cap: SEMI_CAP },
            { timeout: GRAFO_TIMEOUT_MS }
        );
    } catch (_err) {
        return null;
    }

    const elenco = Array.isArray(risposta && risposta.vicini) ? risposta.vicini : [];
    const ids = [...new Set(elenco.map(vicino => Number(vicino && vicino.tmdbId)).filter(id => Number.isFinite(id) && id > 0))];
    if (ids.length === 0) return null;

    const metas = await cerca({ ...piano.filtri, tmdbIds: ids, uniqueById: true }, type, 0, ids.length, contesto);
    const perId = new Map();
    for (const meta of Array.isArray(metas) ? metas : []) {
        const id = idNumerico(meta);
        if (id && !perId.has(id)) perId.set(id, meta);
    }

    const ordinati = ids.map(id => perId.get(id)).filter(Boolean);
    if (ordinati.length === 0) return null;

    return { items: ordinati.slice(skip, skip + cap), motivi: ['simile:grafo'] };
}

/**
 * Esegue il piano sull'indice. Un solo posto conosce la differenza fra i tre modi, così
 * `cercaUnificata` non deve sapere né cosa sia una FTS né cosa sia un seme.
 *
 * @param {Object} piano risultato di `compilaIntento`
 * @param {Object} opzioni
 * @param {'movie'|'series'} opzioni.type
 * @param {number} opzioni.skip
 * @param {number} opzioni.cap
 * @param {Object} [opzioni.contesto]
 * @param {Function} [opzioni.cerca] iniettabile per i test: (filtri, type, skip, limit, contesto) => items
 * @param {Function} [opzioni.vicini] iniettabile per i test: (payload, opts) => risposta del grafo
 * @returns {Promise<{items: Array<Object>, motivi: string[]}>}
 */
async function eseguiPiano(piano, {
    type = 'movie',
    skip = 0,
    cap = 20,
    contesto = {},
    cerca = null,
    vicini = null
} = {}) {
    const cercaLocale = cerca || ((filtri, tipo, salto, limite, ctx) => {
        const { getDuckDbCatalogFromFilters } = require('../indice');
        return getDuckDbCatalogFromFilters(filtri, tipo, salto, limite, ctx);
    });

    if (!piano || piano.modo === 'nessuno') return { items: [], motivi: [] };

    try {
        if (piano.modo === 'semi') {
            return await eseguiSemi(piano, { type, skip, cap, contesto, cerca: cercaLocale, vicini });
        }

        const items = await cercaLocale(piano.filtri, type, skip, cap, contesto) || [];
        if (items.length > 0 || skip > 0 || !piano.filtri || !piano.filtri.text_search) {
            return { items, motivi: [] };
        }

        // La ricerca testuale è severa: cerca le parole **come sono scritte**. Ma un titolo lo si
        // scrive in mille modi — senza accenti («la citta incantata»), attaccato («spiderman»),
        // senza articolo («cavaliere oscuro»), con un refuso («batmn») — e il testo non trova
        // niente. L'indice dei semi sa risolverli (è lo stesso che risolve `simili`): qui si usa
        // solo per riparare un vuoto, quindi quando la ricerca normale trova non cambia nulla.
        // Misurato su 181 richieste: 11 pagine vuote su 12 erano esattamente questo.
        const { risolviSemeDettagliato } = require('./semiTitoli');
        const riparato = await risolviSemeDettagliato(piano.filtri.text_search, { type });
        if (!riparato) return { items: [], motivi: [] };

        const ripescati = await cercaLocale({ ids: [riparato.id] }, type, 0, cap, contesto) || [];
        if (ripescati.length === 0) return { items: [], motivi: [] };

        return {
            items: ripescati,
            motivi: [`testo_riparato: ${piano.filtri.text_search} → ${riparato.titolo}`]
        };
    } catch (_err) {
        return { items: [], motivi: ['errore_indice'] };
    }
}

/**
 * I vicini di uno o più titoli.
 *
 * Prima il **grafo** — è il suo mestiere, e con più semi fa una diffusione sola invece di fondere
 * due liste. Se il grafo non risponde (servizio giù, semi fuori canone, nessun titolo noto al
 * nostro indice), si ripiega sulla colonna `recommendations` del parquet: una query per seme, poi
 * il consensus già in uso nel resto del motore. Il motivo dice quale delle due ha risposto.
 */
async function eseguiSemi(piano, { type, skip, cap, contesto, cerca, vicini }) {
    const viaGrafo = await semiDaGrafo(piano, { type, skip, cap, contesto, cerca, vicini });
    if (viaGrafo) return viaGrafo;

    const semi = (piano.semi || []).slice(0, 5);
    if (semi.length === 0) return { items: [], motivi: ['simile:nessun_seme'] };

    const liste = await Promise.all(semi.map(seme =>
        cerca({ ...piano.filtri, similar_to: seme }, type, skip, cap, contesto).catch(() => [])
    ));

    if (semi.length === 1) return { items: liste[0] || [], motivi: ['simile:colonna'] };

    const { applyConsensusScoring } = require('../infra');
    const fusi = applyConsensusScoring(liste);
    fusi.sort((a, b) => {
        const bonus = (b.consensusBonus || 0) - (a.consensusBonus || 0);
        if (bonus !== 0) return bonus;
        return (b.popularity || 0) - (a.popularity || 0);
    });
    return { items: fusi.slice(0, cap), motivi: ['simile:colonna'] };
}

/**
 * Compila **N intenti** (una riga ciascuno). Gli intenti senza condizioni si scartano e dichiarano.
 *
 * @param {Object[]} intenti
 * @param {Object} [opzioni]
 * @returns {{ piani: Object[], motivi: string[] }}
 */
function compilaIntenti(intenti, opzioni = {}) {
    const piani = [];
    const motivi = [];
    const elenco = Array.isArray(intenti) ? intenti : [];

    elenco.forEach((intento, indice) => {
        const piano = compilaIntento(intento, opzioni);
        if (piano.modo === 'nessuno') {
            for (const motivo of piano.motivi) motivi.push(elenco.length > 1 ? `riga ${indice + 1}: ${motivo}` : motivo);
            return;
        }
        piani.push(piano);
    });

    return { piani, motivi };
}

/**
 * Esegue N piani: uno solo è una lettura, più d'uno è un consensus (lo stesso che il motore usa per
 * i cataloghi multi-blocco).
 */
async function eseguiPiani(piani, opzioni = {}) {
    const elenco = Array.isArray(piani) ? piani : [];
    if (elenco.length === 0) return { items: [], motivi: [] };
    if (elenco.length === 1) return await eseguiPiano(elenco[0], opzioni);

    const cap = Number(opzioni.cap) || 20;
    const skip = Number(opzioni.skip) || 0;

    // PERCHÉ SI PARTE SEMPRE DA ZERO, CON UNA FINESTRA PIÙ LARGA. Il consensus dipende da quali
    // titoli cadono nella finestra di ogni query: se pagina 2 chiedesse `skip..skip+cap` a ogni
    // riga, i bonus cambierebbero e i titoli di pagina 1 tornerebbero in pagina 2 — è esattamente
    // il difetto H5 del vecchio percorso multi-query. Quindi finestra identica per ogni pagina,
    // poi il taglio.
    const finestra = skip + cap;
    const esiti = await Promise.all(elenco.map(piano => eseguiPiano(piano, { ...opzioni, skip: 0, cap: finestra })));
    const motivi = [...new Set(esiti.flatMap(esito => esito.motivi || []))];
    const { applyConsensusScoring } = require('../infra');
    const fusi = applyConsensusScoring(esiti.map(esito => esito.items || []));
    fusi.sort((a, b) => {
        const bonus = (b.consensusBonus || 0) - (a.consensusBonus || 0);
        if (bonus !== 0) return bonus;
        return (b.popularity || 0) - (a.popularity || 0);
    });
    return { items: fusi.slice(skip, skip + cap), motivi };
}

module.exports = {
    GRAFO_TIMEOUT_MS,
    compilaIntento,
    compilaIntenti,
    eseguiPiano,
    eseguiPiani
};
