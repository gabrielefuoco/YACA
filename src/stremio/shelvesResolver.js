// src/stremio/shelvesResolver.js

/**
 * Risolutore degli scaffali dinamici del profilo per il manifest di Stremio (V45).
 *
 * Flusso:
 * 1. Restituisce direttamente userConfig.shelves o profile.shelves se già forniti (es. test, override).
 * 2. Verifica la cache RAM in-memory del pool (getCachedProfileShelves) per profileId o userId (gratuito).
 * 3. Se vuota, calcola gli scaffali per entrambi i media type (movie e series) via semiDi -> convertiSemiPerGrafo -> graphClient.scaffali.
 *    La chiamata è protetta da cache RAM + Redis (shelvesCache), quindi le build ripetute sono economiche.
 * 4. Fonde i risultati assegnando slot progressivi e deterministici (1..N).
 * 5. Se il grafo è offline o non ci sono semi (cold start), degrada silenziosamente restituendo [] senza mai lanciare eccezioni o 500.
 */

const {
    getCachedProfileShelves,
    setCachedProfileShelves,
    convertiSemiPerGrafo,
    modoDelPool,
    slidersDelPool
} = require('../pool');
const library = require('../library');
const { graphClient } = require('../clients');
const { shelvesCache } = require('../cache/cacheInstances');
const { buildShelfCacheKey } = require('../cache/shelfKey');
const { risolviProfiloAttivo } = require('../profile');

/**
 * Fonde due liste di scaffali (film e serie) assegnando slot progressivi e deterministici (1..N).
 */
function mergeShelves(movieList = [], seriesList = []) {
    const merged = [];
    const seen = new Set();
    let currentSlot = 1;

    for (const shelf of [...(movieList || []), ...(seriesList || [])]) {
        const cid = shelf?.catalog_id || shelf?.id;
        if (cid && !seen.has(cid)) {
            seen.add(cid);
            merged.push({
                ...shelf,
                slot: currentSlot++
            });
        }
    }
    return merged;
}

/**
 * Risolve la lista degli scaffali per il profilo attivo del userConfig.
 *
 * Invariante (Ticket V45): la cache mantiene al più una voce per (profilo, medium)
 * e il resolver restituisce sempre entrambi i media quando entrambi hanno scaffali.
 * Una cache parziale per un medium non cortocircuita mai il calcolo dell'altro.
 *
 * @param {object} params
 * @param {object} params.userConfig configurazione utente (risolta da resolveUserConfig)
 * @param {string} [params.profileId] ID facoltativo del profilo (default: risolto da risolviProfiloAttivo)
 * @returns {Promise<Array<object>>} lista di scaffali pronti per catalogDefinitionsFromShelves
 */
async function resolveProfileShelves({ userConfig = {}, profileId = null } = {}) {
    // 1. Override esplicito se già presente nella configurazione
    if (Array.isArray(userConfig?.shelves) && userConfig.shelves.length > 0) {
        return userConfig.shelves;
    }
    if (Array.isArray(userConfig?.scaffali) && userConfig.scaffali.length > 0) {
        return userConfig.scaffali;
    }

    const activeProfileId = profileId || risolviProfiloAttivo(userConfig);
    const profile = Array.isArray(userConfig?.profiles)
        ? (userConfig.profiles.find(p => p.id === activeProfileId) || userConfig.profiles[0])
        : null;

    if (Array.isArray(profile?.shelves) && profile.shelves.length > 0) {
        return profile.shelves;
    }
    if (Array.isArray(profile?.scaffali) && profile.scaffali.length > 0) {
        return profile.scaffali;
    }

    const idProfilo = profile?.id || activeProfileId || 'global';
    const userId = userConfig?.userId || userConfig?.owner;

    // 2. Controllo cache RAM in-memory del pool per medium
    const cachedMovie = (idProfilo ? getCachedProfileShelves(idProfilo, 'movie') : null)
        || (userId ? getCachedProfileShelves(userId, 'movie') : null);
    const cachedSeries = (idProfilo ? getCachedProfileShelves(idProfilo, 'series') : null)
        || (userId ? getCachedProfileShelves(userId, 'series') : null);

    const hasCachedMovie = Array.isArray(cachedMovie) && cachedMovie.length > 0;
    const hasCachedSeries = Array.isArray(cachedSeries) && cachedSeries.length > 0;

    // Se entrambi i media sono già in cache, restituisce subito la fusione completa (0 chiamate esterne)
    if (hasCachedMovie && hasCachedSeries) {
        return mergeShelves(cachedMovie, cachedSeries);
    }

    // 3. Risoluzione parametri motore e anime policy dalla modalità attiva (derivaLeve) o fallback legacy
    const modoPool = modoDelPool(userConfig);

    const animePolicy = modoPool
        ? (modoPool.selettori?.anime || 'neutral')
        : (profile?.settings?.typeSelectors?.anime
            || userConfig?.activeProfileSettings?.typeSelectors?.anime
            || userConfig?.typeSelectors?.anime
            || 'neutral');

    const opzioni = modoPool
        ? slidersDelPool({ userConfig })
        : (profile?.settings?.sliders
            || profile?.settings?.slider
            || profile?.sliders
            || userConfig?.activeProfileSettings?.sliders
            || userConfig?.activeProfileSettings?.slider
            || userConfig?.context?.sliders
            || userConfig?.context?.slider
            || userConfig?.activeProfileSettings?.graphOptions
            || userConfig?.graphOptions
            || undefined);

    const isKids = modoPool
        ? Boolean(modoPool.kids)
        : Boolean(profile?.settings?.kidsMode ?? userConfig?.activeProfileSettings?.kidsMode ?? userConfig?.kidsMode);

    const filtri = {
        anime: (animePolicy === 'only' || animePolicy === 'exclude') ? animePolicy : null,
        kids: isKids
    };
    const opzioniScaffali = {
        ...(opzioni || {}),
        ...(filtri.anime || filtri.kids ? { filtri } : {}),
        ...(filtri.kids ? { kids: true } : {})
    };

    const cap = 60;

    async function fetchShelvesForMedia(med) {
        try {
            const { seeds, tipi, ultimaVisione, plays } = await library.semiDi({
                userId,
                context: idProfilo,
                mediaType: med,
                user: userConfig
            });

            const semi = convertiSemiPerGrafo(seeds, {
                medium: med,
                animePolicy,
                ultimaVisione,
                tipi,
                plays
            });

            if (!semi || semi.length === 0) {
                return [];
            }

            const semiPerScaffali = semi.map(({ recente, ...rest }) => rest);
            if (typeof graphClient.scaffali !== 'function') {
                return [];
            }

            const chiaveScaffali = buildShelfCacheKey({
                semi: semiPerScaffali,
                medium: med,
                opzioni: opzioniScaffali,
                cap,
                versioni: typeof graphClient.getGraphHealthVersionsCached === 'function'
                    ? graphClient.getGraphHealthVersionsCached()
                    : undefined
            });

            const resScaffali = await shelvesCache.getOrFetch(chiaveScaffali, () => graphClient.scaffali(semiPerScaffali, {
                medium: med,
                opzioni: opzioniScaffali,
                cap
            }));

            if (resScaffali && Array.isArray(resScaffali.scaffali)) {
                return resScaffali.scaffali.map(s => ({
                    catalog_id: s.catalog_id,
                    nome: s.nome_display || s.nome || 'Scaffale',
                    nome_display: s.nome_display || s.nome || 'Scaffale',
                    nome_fonte: s.nome_fonte,
                    confidenza: s.confidenza,
                    medium: s.medium || med,
                    slot: s.slot,
                    anime: Boolean(s.anime),
                    semi_rappresentativi: s.semi_rappresentativi,
                    semi_membri: s.semi_membri
                }));
            }
            return [];
        } catch (err) {
            console.warn(`[resolveProfileShelves] Errore calcolo scaffali ${med} per profilo ${idProfilo} (${userId}): ${err.message}`);
            return [];
        }
    }

    try {
        const moviePromise = hasCachedMovie
            ? Promise.resolve(cachedMovie)
            : fetchShelvesForMedia('movie');

        const seriesPromise = hasCachedSeries
            ? Promise.resolve(cachedSeries)
            : fetchShelvesForMedia('series');

        const [movieShelves, seriesShelves] = await Promise.all([
            moviePromise,
            seriesPromise
        ]);

        const merged = mergeShelves(movieShelves, seriesShelves);

        // Invariante: aggiorna la cache per medium solo per i risultati calcolati ex-novo
        if (!hasCachedMovie && movieShelves.length > 0) {
            if (idProfilo) setCachedProfileShelves(idProfilo, movieShelves, 'movie');
            if (userId) setCachedProfileShelves(userId, movieShelves, 'movie');
        }
        if (!hasCachedSeries && seriesShelves.length > 0) {
            if (idProfilo) setCachedProfileShelves(idProfilo, seriesShelves, 'series');
            if (userId) setCachedProfileShelves(userId, seriesShelves, 'series');
        }

        if (merged.length > 0) {
            console.log(`[resolveProfileShelves] Profilo ${idProfilo} (${userId}): ${merged.length} scaffali dinamici risolti (${movieShelves.length} film, ${seriesShelves.length} serie)`);
        } else {
            console.warn(`[resolveProfileShelves] Profilo ${idProfilo} (${userId}): nessun scaffale disponibile (cold start o grafo non raggiungibile)`);
        }

        return merged;
    } catch (globalErr) {
        console.warn(`[resolveProfileShelves] Eccezione imprevista durante risoluzione scaffali per ${idProfilo} (${userId}): ${globalErr.message}`);
        return [];
    }
}

module.exports = {
    resolveProfileShelves
};
