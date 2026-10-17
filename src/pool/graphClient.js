// src/pool/graphClient.js

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
 *   semi: [ { tmdbId: number, medium: "movie"|"series", tipo?: string, peso?: number } ],
 *   medium?: "movie"|"series",
 *   opzioni?: { largo, lontano, cozy, canone },
 *   cap?: number
 * }
 */
async function raccomanda({ semi = [], medium, opzioni, cap = 60 } = {}, { baseUrl = GRAPH_SERVICE_URL, timeout = GRAPH_TIMEOUT_MS } = {}) {
    const payload = {
        semi,
        ...(medium ? { medium } : {}),
        ...(opzioni ? { opzioni } : {}),
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

function resetHealthCache() {
    cachedHealth = { data: null, expiresAt: 0 };
}

function setCachedHealthForTest(versioni, ttlMs = HEALTH_CACHE_TTL_MS) {
    cachedHealth = {
        data: versioni,
        expiresAt: Date.now() + ttlMs
    };
}

module.exports = {
    GRAPH_SERVICE_URL,
    GRAPH_TIMEOUT_MS,
    HEALTH_CACHE_TTL_MS,
    getGraphHealthVersionsCached,
    getGraphHealthVersions,
    raccomanda,
    resetHealthCache,
    setCachedHealthForTest
};
