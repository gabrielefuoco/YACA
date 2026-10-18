const crypto = require('crypto');
const CacheManager = require('./CacheManager');
const cacheInstances = require('./cacheInstances');
const redisClient = require('./redisClient');
const { generateRequestHash } = require('./requestHash');

const finalMetaCache = new CacheManager('final_meta_cache', { ramMax: 300, ramTtlMs: 3600000, swrMs: 600000 });
const defaultCache = new CacheManager('default_cache', { ramMax: 100, ramTtlMs: 300000 });

function hashObject(obj) {
    const keys = Object.keys(obj).sort();
    const sorted = {};
    for (const k of keys) {
        if (obj[k] !== undefined) sorted[k] = obj[k];
    }
    return crypto.createHash('md5').update(JSON.stringify(sorted)).digest('hex').slice(0, 12);
}

function getCacheInstanceForNome(nome) {
    switch (nome) {
        case 'heroes':
        case 'hero':
        case 'recommendations':
        case 'recommendation':
            return cacheInstances.hybridRecommendationsCache;
        case 'catalog_page':
        case 'catalog':
        case 'tmdb_catalog':
            return cacheInstances.catalogRequestCache;
        case 'meta':
        case 'final_meta':
            return finalMetaCache;
        case 'ai_prompt':
            return cacheInstances.aiPromptCache;
        case 'ai_discovery':
            return cacheInstances.aiDiscoveryCache;
        case 'dna_names':
            return cacheInstances.dnaNamesCache;
        default:
            return defaultCache;
    }
}

/**
 * Deriva la chiave di cache e il TTL a partire dalla descrizione di una risorsa.
 * 
 * La descrizione ha la forma:
 * {
 *   nome: string,             // es. 'heroes', 'recommendations', 'catalog_page', 'meta'
 *   versione?: number|string, // es. 14, 24 - campo di invalidazione strutturale
 *   dipendenze: {
 *     varia?: object,         // ciò che varia: crea chiavi DIVERSE (profilo, kids, media, selettori...)
 *     invalida?: object       // ciò che invalida: rende VECCHIA la voce (versione, artefatto, ricetta...)
 *   },
 *   ttl?: number              // TTL esplicito della voce in millisecondi
 * }
 *
 * @param {object} descrizione
 * @returns {{ chiave: string, ttl: number, instance: CacheManager }}
 */
function deriva(descrizione) {
    if (typeof descrizione === 'string') {
        throw new TypeError('Il modulo cache accetta solo una descrizione { nome, ... }, mai una chiave stringa');
    }
    if (!descrizione || typeof descrizione !== 'object') {
        throw new TypeError('La descrizione della cache deve essere un oggetto { nome, versione, dipendenze, ttl }');
    }
    if (!descrizione.nome || typeof descrizione.nome !== 'string') {
        throw new Error('La descrizione della cache deve includere il campo "nome"');
    }

    const { nome, versione, ttl } = descrizione;

    // Separa dipendenze che variano e che invalidano
    const dip = descrizione.dipendenze || {};
    const varia = dip.varia !== undefined ? (dip.varia || {}) : dip;
    const invalida = {
        ...(dip.invalida || {}),
        ...(versione !== undefined ? { versione } : {})
    };

    let chiave;
    let defaultTtl;

    switch (nome) {
        case 'heroes':
        case 'hero': {
            defaultTtl = 7 * 24 * 60 * 60 * 1000; // 7 giorni
            const utente = varia.utente ?? varia.userId ?? '';
            const profilo = varia.profilo ?? varia.context ?? 'global';
            const media = varia.media ?? varia.mediaType ?? 'movie';
            const kids = Boolean(varia.kids ?? varia.kidsMode);
            const selettori = varia.selettori ?? varia.typeSelectors ?? null;

            // Invalidazione: versione strutturale + artefatto e ricetta del motore
            const vRaw = invalida.versione ?? versione ?? 14;
            const vNorm = String(vRaw).startsWith('v') ? String(vRaw) : `v${vRaw}`;
            const artefatto = invalida.artefatto ?? varia.artefatto ?? varia.graphVersions?.artefatto;
            const ricetta = invalida.ricetta ?? varia.ricetta ?? varia.graphVersions?.ricetta;
            const gSuffix = artefatto
                ? `_art_${artefatto}${ricetta ? `_ric_${ricetta}` : ''}`
                : '';

            // Variazione: kids, anime e slider
            const kidsSuffix = kids ? '_kids' : '';
            const animeSuffix = selettori?.anime ? `_a_${selettori.anime}` : '';
            const sl = varia.slider ?? varia.sliders;
            let sliderSuffix = '';
            if (sl && typeof sl === 'object') {
                const largo = sl.largo !== undefined ? Number(sl.largo) : 4;
                const lontano = sl.lontano !== undefined ? Number(sl.lontano) : 0;
                const cozy = sl.cozy !== undefined ? Number(sl.cozy) : 0;
                const canone = sl.canone !== undefined ? Number(sl.canone) : 0;
                if (largo !== 4 || lontano !== 0 || cozy !== 0 || canone !== 0) {
                    sliderSuffix = `_sl_${largo}_${lontano}_${cozy}_${canone}`;
                }
            }

            chiave = `${utente}_${profilo}_heroes_${vNorm}${gSuffix}_${media}${kidsSuffix}${animeSuffix}${sliderSuffix}`;
            break;
        }

        case 'recommendations':
        case 'recommendation': {
            defaultTtl = 7 * 24 * 60 * 60 * 1000; // 7 giorni
            const utente = varia.utente ?? varia.userId ?? '';
            const profilo = varia.profilo ?? varia.context ?? 'global';
            const catalogo = varia.catalogo ?? varia.catalogId ?? '';
            const kids = Boolean(varia.kids ?? varia.kidsMode);
            const selettori = varia.selettori ?? varia.typeSelectors ?? null;

            // LA VERSIONE E IL MEDIA ENTRANO NELLA CHIAVE. La revisione del 17/10/2026 ha trovato che
            // qui mancavano: senza, alzare la versione NON invalidava niente e i film si
            // sovrapponevano alle serie per lo stesso catalogo — una collisione silenziosa, che e'
            // esattamente la trappola che questo modulo esiste per rendere impossibile.
            const vRaw = invalida.versione ?? versione ?? 14;
            const vNorm = String(vRaw).startsWith('v') ? String(vRaw) : `v${vRaw}`;
            const artefatto = invalida.artefatto ?? varia.artefatto ?? varia.graphVersions?.artefatto;
            const ricetta = invalida.ricetta ?? varia.ricetta ?? varia.graphVersions?.ricetta;
            const gSuffix = artefatto
                ? `_art_${artefatto}${ricetta ? `_ric_${ricetta}` : ''}`
                : '';
            const media = varia.media ?? varia.mediaType ?? '';

            const kidsSuffix = kids ? '_kids' : '';
            const animeSuffix = selettori?.anime ? `_a_${selettori.anime}` : '';
            const slRec = varia.slider ?? varia.sliders;
            let sliderSuffixRec = '';
            if (slRec && typeof slRec === 'object') {
                const largo = slRec.largo !== undefined ? Number(slRec.largo) : 4;
                const lontano = slRec.lontano !== undefined ? Number(slRec.lontano) : 0;
                const cozy = slRec.cozy !== undefined ? Number(slRec.cozy) : 0;
                const canone = slRec.canone !== undefined ? Number(slRec.canone) : 0;
                if (largo !== 4 || lontano !== 0 || cozy !== 0 || canone !== 0) {
                    sliderSuffixRec = `_sl_${largo}_${lontano}_${cozy}_${canone}`;
                }
            }

            chiave = `${utente}_${profilo}_${catalogo}_${vNorm}${gSuffix}_${media}${kidsSuffix}${animeSuffix}${sliderSuffixRec}`;
            break;
        }

        case 'catalog_page':
        case 'catalog':
        case 'tmdb_catalog': {
            defaultTtl = 14 * 24 * 60 * 60 * 1000; // 14 giorni
            const id = varia.id;
            const skip = varia.skip || 0;
            const type = varia.type || 'movie';

            const condiviso = Boolean(varia.condiviso);
            const user = condiviso ? undefined : (varia.utente ?? varia.userId);
            const profile = condiviso ? undefined : (varia.profilo ?? varia.activeProfileId);

            const badgeV = invalida.badgeVersion ?? invalida.versione ?? versione ?? 24;
            const catalogDef = invalida.catalogDef;
            const slCat = varia.slider ?? varia.sliders;

            const params = {
                type,
                extra: varia.extra,
                directFilters: varia.directFilters,
                kidsMode: varia.kids ?? varia.kidsMode,
                typeSelectors: varia.selettori ?? varia.typeSelectors,
                catalogDef,
                ...(condiviso ? {} : { user, profile }),
                landscape: Boolean(varia.landscape),
                ...(slCat ? { slider: slCat } : {}),
                badgeV
            };

            chiave = generateRequestHash(id, params, skip, type);
            break;
        }

        case 'meta':
        case 'final_meta': {
            const mediaType = varia.type || 'movie';
            defaultTtl = mediaType === 'movie'
                ? 14 * 24 * 60 * 60 * 1000  // 14 giorni per i film
                : 6 * 60 * 60 * 1000;       // 6 ore per le serie
            const id = varia.id ?? varia.tmdbId ?? '';
            chiave = `meta_${id}_${mediaType}`;
            break;
        }

        default: {
            defaultTtl = 24 * 60 * 60 * 1000;
            const vRaw = invalida.versione ?? versione;
            const vPart = vRaw !== undefined ? `:v${vRaw}` : '';
            const invPart = Object.keys(invalida).length > 0 ? `:${hashObject(invalida)}` : '';
            const varPart = Object.keys(varia).length > 0 ? `:${hashObject(varia)}` : '';
            chiave = `${nome}${vPart}${invPart}${varPart}`;
            break;
        }
    }

    const effectiveTtl = typeof ttl === 'number' ? ttl : defaultTtl;
    const instance = getCacheInstanceForNome(nome);

    return {
        chiave,
        ttl: effectiveTtl,
        instance
    };
}

/**
 * Legge una risorsa dalla cache a partire dalla sua descrizione.
 * 
 * Se viene fornito `costruttore`, in caso di miss o stale lo esegue per calcolare
 * il valore fresco e memorizzarlo (con gestione SWR in background).
 * Se `costruttore` non è una funzione, restituisce l'oggetto { value, status, chiave, ttl }.
 *
 * @param {object} descrizione
 * @param {Function} [costruttore]
 * @param {object} [options]
 */
async function leggi(descrizione, costruttore, options = {}) {
    const derived = deriva(descrizione);
    const instance = options.instance || derived.instance;
    const chiave = derived.chiave;
    const ttl = options.ttl !== undefined ? options.ttl : derived.ttl;

    // Se non è fornito un costruttore, restituisce lo stato della cache { value, status }
    if (typeof costruttore !== 'function') {
        const { value, status } = await instance.getWithStatus(chiave);
        return { value, status, chiave, ttl };
    }

    // Se è fornito un costruttore, delega a getOrFetch dell'istanza
    return instance.getOrFetch(chiave, costruttore, ttl, options);
}

/**
 * Scrive un valore in cache a partire dalla descrizione della risorsa.
 *
 * @param {object} descrizione
 * @param {*} valore
 * @param {object} [options]
 * @returns {Promise<{ chiave: string, ttl: number }>}
 */
async function scrivi(descrizione, valore, options = {}) {
    const derived = deriva(descrizione);
    const instance = options.instance || derived.instance;
    const chiave = derived.chiave;
    const ttl = options.ttl !== undefined ? options.ttl : derived.ttl;

    await instance.set(chiave, valore, ttl, options);
    return { chiave, ttl };
}

/**
 * Rimuove una voce di cache corrispondente alla descrizione.
 *
 * @param {object} descrizione
 * @param {object} [options]
 * @returns {Promise<{ chiave: string }>}
 */
async function cancella(descrizione, options = {}) {
    const derived = deriva(descrizione);
    const instance = options.instance || derived.instance;
    await instance.delete(derived.chiave);
    return { chiave: derived.chiave };
}

function buildRecommendationCacheKey({ userId, context, catalogId, kidsMode, typeSelectors }) {
    const { chiave } = deriva({
        nome: 'recommendations',
        dipendenze: {
            varia: {
                utente: userId,
                profilo: context,
                catalogo: catalogId,
                kids: kidsMode,
                selettori: typeSelectors
            }
        }
    });
    return chiave;
}

module.exports = {
    leggi,
    scrivi,
    cancella,
    invalida: cancella,
    deriva,
    derivaChiave: deriva,
    buildRecommendationCacheKey,
    finalMetaCache,
    CacheManager,
    cacheInstances,
    redisClient
};
