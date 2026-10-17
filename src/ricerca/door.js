/**
 * src/ricerca/door.js
 *
 * LA PORTA DEL MODULO RICERCA (Ticket 22).
 *
 * Firma unica: cerca({ q, tipo, contesto, cap })
 *
 * Principi di design:
 * 1. "Una porta sola": tipo opzionale (titolo, genere, keyword, persona).
 * 2. "Il caso normale non è mai un errore": restituisce sempre { items, motivi[] }.
 *    Mai un'eccezione o errore 4xx/5xx (regola Stremio STREMIO_INTERNALS.md:129).
 * 3. Degrado morbido: se una fonte è giù (TMDB, indice DuckDB, Tier 2, AI), le altre
 *    rispondono e motivi traccia la diagnosi.
 * 4. Fusione e ordinamento: da più fonti a un'unica lista ordinata e deduplicata.
 * 5. Riceve il contesto (contestoDi), non lo costruisce.
 */

const { findSourcesForSearch } = require('./registry');
const { mergeLocalWithTier2, fondiEOrdina } = require('./fusione');
const { richiediComprensioneAI } = require('./aiAdapter');
const { createTmdbClient } = require('../clients/tmdb');

const TIPI_TITOLO = new Set(['titolo', 'multi', 'movie', 'series', 'film', 'serie']);
const TIPI_GENERE = new Set(['genere', 'genre']);
const TIPI_KEYWORD = new Set(['keyword']);
const TIPI_PERSONA = new Set(['persona', 'person']);

const FALLBACK_GENRES = [
    { id: 28, name: 'Azione' },
    { id: 12, name: 'Avventura' },
    { id: 16, name: 'Animazione' },
    { id: 35, name: 'Commedia' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentario' },
    { id: 18, name: 'Dramma' },
    { id: 10751, name: 'Famiglia' },
    { id: 14, name: 'Fantasy' },
    { id: 36, name: 'Storia' },
    { id: 27, name: 'Horror' },
    { id: 10402, name: 'Musica' },
    { id: 9648, name: 'Mistero' },
    { id: 10749, name: 'Romance' },
    { id: 878, name: 'Fantascienza' },
    { id: 10770, name: 'Film TV' },
    { id: 53, name: 'Thriller' },
    { id: 10752, name: 'Guerra' },
    { id: 37, name: 'Western' }
];

/**
 * Ottiene o crea il client TMDB in sicurezza.
 */
function getSafeTmdbClient(client, apiKey) {
    if (client) return client;
    const { chiaveEffettiva } = require('../configurazione');
    const key = chiaveEffettiva({ richiesta: apiKey, servizio: 'tmdb' });
    if (!key) return null;
    try {
        return createTmdbClient(key);
    } catch (_) {
        return null;
    }
}

/**
 * La porta del modulo ricerca.
 *
 * @param {Object} params
 * @param {string} params.q - Testo della query cercata
 * @param {string} [params.tipo] - 'titolo' | 'genere' | 'keyword' | 'persona' (default: 'titolo')
 * @param {Object} [params.contesto] - Contesto profilo ({ userId, kidsMode, selettoriEffettivi, slider })
 * @param {number} [params.cap=20] - Limite massimo di risultati
 * @param {string} [params.tmdbApiKey] - Chiave TMDB opzionale
 * @param {Object} [params.client] - Client TMDB opzionale
 * @param {string} [params.mistralKey] - Chiave Mistral opzionale per comprensione semantica
 * @returns {Promise<{ items: Array<Object>, motivi: Array<string> }>}
 */
async function cerca({
    q = '',
    tipo = 'titolo',
    contesto = {},
    cap = 20,
    tmdbApiKey = null,
    client = null,
    mistralKey = null
} = {}) {
    const motivi = [];

    try {
        const query = String(q === null || q === undefined ? '' : q).trim();
        if (!query) {
            return { items: [], motivi: ['query_vuota'] };
        }

        const normTipo = String(tipo || 'titolo').trim().toLowerCase();
        const limit = Math.max(1, Math.min(Number(cap) || 20, 100));
        const tmdbClient = getSafeTmdbClient(client, tmdbApiKey);

        // ============================================
        // 1. TIPO: GENERE
        // ============================================
        if (TIPI_GENERE.has(normTipo)) {
            if (tmdbClient) {
                try {
                    const [movieRes, tvRes] = await Promise.all([
                        tmdbClient.get('/genre/movie/list', { params: { language: 'it-IT' } }),
                        tmdbClient.get('/genre/tv/list', { params: { language: 'it-IT' } })
                    ]);
                    const merged = [...(movieRes.data?.genres || []), ...(tvRes.data?.genres || [])];
                    const dedup = Array.from(new Map(merged.map(g => [String(g.id), g])).values());
                    const filtered = dedup.filter(g => String(g.name || '').toLowerCase().includes(query.toLowerCase()));
                    if (filtered.length === 0) motivi.push('nessun_risultato');
                    return { items: filtered.slice(0, limit), motivi };
                } catch (err) {
                    motivi.push(`fonte_tmdb_degradata: ${err.message}`);
                }
            }

            // Fallback locale generi
            const filtered = FALLBACK_GENRES.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));
            if (filtered.length === 0) motivi.push('nessun_risultato');
            return { items: filtered.slice(0, limit), motivi };
        }

        // ============================================
        // 2. TIPO: KEYWORD
        // ============================================
        if (TIPI_KEYWORD.has(normTipo)) {
            if (!tmdbClient) {
                return { items: [], motivi: ['servizio_ricerca_non_disponibile'] };
            }
            try {
                const response = await tmdbClient.get('/search/keyword', { params: { query, page: 1 } });
                const results = response.data?.results || [];
                if (results.length === 0) motivi.push('nessun_risultato');
                return { items: results.slice(0, limit), motivi };
            } catch (err) {
                return { items: [], motivi: [`fonte_tmdb_degradata: ${err.message}`] };
            }
        }

        // ============================================
        // 3. TIPO: PERSONA
        // ============================================
        if (TIPI_PERSONA.has(normTipo)) {
            if (!tmdbClient) {
                return { items: [], motivi: ['servizio_ricerca_non_disponibile'] };
            }
            try {
                const response = await tmdbClient.get('/search/person', {
                    params: { query, language: 'it-IT', page: 1, include_adult: false }
                });
                const results = response.data?.results || [];
                if (results.length === 0) motivi.push('nessun_risultato');
                return { items: results.slice(0, limit), motivi };
            } catch (err) {
                return { items: [], motivi: [`fonte_tmdb_degradata: ${err.message}`] };
            }
        }

        // ============================================
        // 4. TIPO NON SUPPORTATO
        // ============================================
        if (!TIPI_TITOLO.has(normTipo)) {
            return { items: [], motivi: [`tipo_non_supportato: ${normTipo}`] };
        }

        // ============================================
        // 5. TIPO: TITOLO / MULTI (Fusione multi-fonte)
        // ============================================

        // A. Comprensione AI opzionale se la query sembra naturale o complessa
        const isNaturalQuery = query.split(/\s+/).length > 3;
        if (isNaturalQuery) {
            const aiResult = await richiediComprensioneAI({
                query,
                mistralKey,
                context: contesto
            });
            if (aiResult.degraded) {
                motivi.push(aiResult.reason || 'ai_degradata');
            }
        }

        // B. Raccolta candidati dalle fonti abilitate nel registro
        const searchCtx = {
            q: query,
            tipo: normTipo,
            contesto,
            cap: limit,
            userConfig: contesto
        };
        const sources = findSourcesForSearch(searchCtx);

        let localCandidates = [];
        for (const src of sources) {
            try {
                const items = await src.search(searchCtx);
                if (Array.isArray(items) && items.length > 0) {
                    localCandidates = mergeLocalWithTier2(localCandidates, items);
                }
            } catch (err) {
                motivi.push(`fonte_${src.id}_degradata: ${err.message}`);
            }
        }

        // C. Raccolta candidati da TMDB (se configurato)
        let tmdbCandidates = [];
        if (tmdbClient) {
            try {
                const response = await tmdbClient.get('/search/multi', {
                    params: {
                        query,
                        language: 'it-IT',
                        page: 1,
                        include_adult: Boolean(contesto.kidsMode ? false : undefined)
                    }
                });
                tmdbCandidates = response.data?.results || [];
            } catch (err) {
                motivi.push(`fonte_tmdb_degradata: ${err.message}`);
            }
        }

        // D. Fusione e ordinamento (la ricerca possiede l'ordine dei candidati)
        // Se TMDB ha risposto (es. nel panel creator o multi search), uniamo i risultati
        // mantenendo priorità e deduplicando per ID TMDB.
        // Il cap NON si applica qui: prima si filtra per contesto, poi si tronca (ticket 27).
        // Troncare prima del filtro restituisce MENO risultati del richiesto: con 40 candidati
        // di cui 20 non-adulti, il taglio a 20 scarta parte dei non-adulti e il filtro Kids Mode
        // ne lascia 5 invece di 20. `fondiEOrdina` tronca solo se riceve un limite: ometterlo
        // significa "nessun cap", e il taglio finale resta quello di sotto.
        let finalItems = fondiEOrdina({
            locali: localCandidates.length > 0 ? localCandidates : tmdbCandidates,
            tier2: [],
            learned: [],
            altri: localCandidates.length > 0 ? tmdbCandidates : []
        });

        // E. Rispetto del contesto (es. Kids Mode)
        if (contesto.kidsMode) {
            finalItems = finalItems.filter(item => {
                if (item.adult) return false;
                if (item.rawTMDB && item.rawTMDB.adult) return false;
                return true;
            });
        }

        if (finalItems.length === 0) {
            motivi.push('nessun_risultato');
        }

        return {
            items: finalItems.slice(0, limit),
            motivi
        };
    } catch (unhandledErr) {
        // La porta non solleva MAI eccezioni
        return {
            items: [],
            motivi: [`errore_imprevisto: ${unhandledErr.message || 'sconosciuto'}`]
        };
    }
}

module.exports = {
    cerca,
    TIPI_TITOLO,
    TIPI_GENERE,
    TIPI_KEYWORD,
    TIPI_PERSONA
};
