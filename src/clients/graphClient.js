// src/clients/graphClient.js

/**
 * CLIENT DEL SERVIZIO GRAFO (Ticket 08).
 *
 * Comunica con il servizio Python via HTTP secondo il contratto deciso in
 * .scratch/confini/contratto-motore.md:
 * - GET /health     -> Recupera versioni di artefatto e ricetta (cache in RAM ~60s, E3)
 * - POST /raccomanda -> Invia semi e opzioni, riceve liste spiegate (E1, E2, E4)
 * - Degrado / E5    -> Timeout 10s, nessun salvataggio 7gg in cache su guasto
 */

const axios = require('axios');

const GRAPH_SERVICE_URL = process.env.GRAPH_SERVICE_URL || 'http://graph:7862';
const GRAPH_TIMEOUT_MS = 10000; // 10 s timeout (Contratto §6)
const HEALTH_CACHE_TTL_MS = 60000; // 60 s cache in RAM (Contratto E3)

let cachedHealth = { data: null, expiresAt: 0 };

/**
 * Restituisce le versioni in cache RAM se non scadute (o null).
 * Sincrono, utile per la derivazione della chiave di cache.
 */
function getGraphHealthVersionsCached() {
    if (cachedHealth.data && Date.now() < cachedHealth.expiresAt) {
        return cachedHealth.data;
    }
    return cachedHealth.data || null;
}

/**
 * Interroga GET /health del servizio Python o riusa la cache RAM (~60s).
 * Risponde in <1ms a caldo.
 * In caso di errore o servizio irraggiungibile, degrada a null senza lanciare eccezioni.
 */
async function getGraphHealthVersions({ baseUrl = GRAPH_SERVICE_URL, timeout = 2000 } = {}) {
    if (cachedHealth.data && Date.now() < cachedHealth.expiresAt) {
        return cachedHealth.data;
    }

    try {
        const response = await axios.get(`${baseUrl}/health`, {
            timeout,
            headers: { 'Accept': 'application/json' }
        });
        if (response.status === 200 && response.data && response.data.ok) {
            const versioni = response.data.versioni || null;
            cachedHealth = {
                data: versioni,
                expiresAt: Date.now() + HEALTH_CACHE_TTL_MS
            };
            return cachedHealth.data;
        }
    } catch (_err) {
        // Degrado silenzioso: se il servizio è temporaneamente giù,
        // restituisce l'ultimo valore valido o null.
    }

    return cachedHealth.data || null;
}

/**
 * Invia una richiesta di raccomandazione al servizio Python (POST /raccomanda).
 *
 * Payload:
 * {
 *   semi: [ { tmdbId: number, medium: "movie"|"series", tipo?: string, peso?: number, recente?: boolean } ],
 *   // `recente` (Ticket 07): il seme e' fra gli ultimi 15 visti; e' una selezione, non un peso.
 *   medium?: "movie"|"series",
 *   opzioni?: { largo, lontano, cozy, canone },
 *   cap?: number
 * }
 */
async function raccomanda({ semi = [], medium, opzioni, sliders, slider, cap = 60 } = {}, { baseUrl = GRAPH_SERVICE_URL, timeout = GRAPH_TIMEOUT_MS } = {}) {
    const opts = opzioni || sliders || slider;
    const payload = {
        semi,
        ...(medium ? { medium } : {}),
        ...(opts && typeof opts === 'object' && Object.keys(opts).length > 0 ? { opzioni: opts } : {}),
        cap: Number(cap) || 60
    };

    const response = await axios.post(`${baseUrl}/raccomanda`, payload, {
        timeout,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (response.status === 200 && response.data) {
        if (response.data.versioni) {
            cachedHealth = {
                data: response.data.versioni,
                expiresAt: Date.now() + HEALTH_CACHE_TTL_MS
            };
        }
        return response.data;
    }

    throw new Error(`Servizio grafo ha risposto con stato ${response.status}`);
}

const ALLOWED_SCAFFALI_SEED_KEYS = new Set([
    'key', 'tmdbId', 'tmdb_id', 'medium', 'plays', 'frazione',
    'tipo', 'tipi', 'eta_giorni', 'watched', 'library_only'
]);

function sanitizeScaffaliSeed(s, idx) {
    if (!s || typeof s !== 'object') return s;
    const sanitized = {};
    for (const key of Object.keys(s)) {
        if (ALLOWED_SCAFFALI_SEED_KEYS.has(key)) {
            sanitized[key] = s[key];
        }
    }
    if (sanitized.medium === 'tv') {
        sanitized.medium = 'series';
    }
    if (sanitized.plays !== undefined) {
        const pl = Number(sanitized.plays);
        sanitized.plays = Number.isFinite(pl) && pl >= 0 ? pl : 1.0;
    } else {
        sanitized.plays = 1.0;
    }
    if (sanitized.eta_giorni !== undefined) {
        const eg = Number(sanitized.eta_giorni);
        sanitized.eta_giorni = Number.isFinite(eg) && eg >= 0 ? eg : Number(idx);
    } else {
        sanitized.eta_giorni = Number(idx);
    }
    if (sanitized.tmdbId !== undefined) {
        sanitized.tmdbId = Number(sanitized.tmdbId);
    }
    return sanitized;
}

/**
 * Invia una richiesta di generazione scaffali al servizio Python (POST /scaffali).
 *
 * Supporta sia:
 *   scaffali(semi, opts, conf)
 * che:
 *   scaffali({ semi, medium, opzioni, cap, n, esclusi, tono, complessita }, conf)
 *
 * Sanitizza ciascun seme garantendo che non contenga chiavi sconosciute (es. recente, peso),
 * e assicurando che plays, eta_giorni e medium siano passati correttamente secondo il contratto.
 */
async function scaffali(semiOrPayload = [], opts = {}, conf = {}) {
    let payload;
    let config;

    if (Array.isArray(semiOrPayload)) {
        const o = opts || {};
        const optionsMotore = o.opzioni || o.sliders || o.slider;
        payload = {
            semi: semiOrPayload.map((s, idx) => sanitizeScaffaliSeed(s, idx)),
            ...(o.medium ? { medium: o.medium === 'tv' ? 'series' : o.medium } : {}),
            ...(optionsMotore && typeof optionsMotore === 'object' && Object.keys(optionsMotore).length > 0 ? { opzioni: optionsMotore } : {}),
            ...(o.cap !== undefined ? { cap: Number(o.cap) || 60 } : {}),
            ...(o.n !== undefined ? { n: Number(o.n) || 8 } : {}),
            ...(Array.isArray(o.esclusi) ? { esclusi: o.esclusi } : {}),
            ...(o.tono !== undefined ? { tono: Number(o.tono) } : {}),
            ...(o.complessita !== undefined ? { complessita: Number(o.complessita) } : {}),
            ...(o.kids !== undefined ? { kids: Boolean(o.kids) } : (optionsMotore && optionsMotore.kids !== undefined ? { kids: Boolean(optionsMotore.kids) } : {}))
        };
        config = conf && (conf.baseUrl || conf.timeout) ? conf : (o.baseUrl || o.timeout ? o : {});
    } else {
        const p = semiOrPayload || {};
        const o = p.opzioni || p.sliders || p.slider || opts.opzioni || opts.sliders || opts.slider;
        const semiList = Array.isArray(p.semi) ? p.semi : [];
        payload = {
            semi: semiList.map((s, idx) => sanitizeScaffaliSeed(s, idx)),
            ...(p.medium ? { medium: p.medium === 'tv' ? 'series' : p.medium } : (opts.medium ? { medium: opts.medium === 'tv' ? 'series' : opts.medium } : {})),
            ...(o && typeof o === 'object' && Object.keys(o).length > 0 ? { opzioni: o } : {}),
            ...(p.cap !== undefined ? { cap: Number(p.cap) || 60 } : (opts.cap !== undefined ? { cap: Number(opts.cap) || 60 } : {})),
            ...(p.n !== undefined ? { n: Number(p.n) || 8 } : (opts.n !== undefined ? { n: Number(opts.n) || 8 } : {})),
            ...(Array.isArray(p.esclusi) ? { esclusi: p.esclusi } : (Array.isArray(opts.esclusi) ? { esclusi: opts.esclusi } : {})),
            ...(p.tono !== undefined ? { tono: Number(p.tono) } : (opts.tono !== undefined ? { tono: Number(opts.tono) } : {})),
            ...(p.complessita !== undefined ? { complessita: Number(p.complessita) } : (opts.complessita !== undefined ? { complessita: Number(opts.complessita) } : {})),
            ...(p.kids !== undefined ? { kids: Boolean(p.kids) } : (opts.kids !== undefined ? { kids: Boolean(opts.kids) } : (o && o.kids !== undefined ? { kids: Boolean(o.kids) } : {})))
        };
        config = opts && (opts.baseUrl || opts.timeout) ? opts : conf;
    }

    const baseUrl = config.baseUrl || GRAPH_SERVICE_URL;
    const timeout = config.timeout || GRAPH_TIMEOUT_MS;

    const response = await axios.post(`${baseUrl}/scaffali`, payload, {
        timeout,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (response.status === 200 && response.data) {
        if (response.data.versioni) {
            cachedHealth = {
                data: response.data.versioni,
                expiresAt: Date.now() + HEALTH_CACHE_TTL_MS
            };
        }
        return response.data;
    }

    throw new Error(`Servizio grafo ha risposto con stato ${response.status}`);
}

function resetHealthCache() {
    cachedHealth = { data: null, expiresAt: 0 };
}

module.exports = {
    getGraphHealthVersionsCached,
    getGraphHealthVersions,
    raccomanda,
    scaffali,
    resetHealthCache
};
