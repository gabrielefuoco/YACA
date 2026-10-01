/**
 * tmdbFallback.js
 * Risolve fallback per titoli anime che non hanno un TMDB ID nei mapping ufficiali
 * (Fribb / AniBridge) tramite ricerca mirata sull'API TMDB (/3/search/tv).
 * Regole prudenti:
 * - lingua ja/zh OPPURE genere 16 (Animation)
 * - anno (date) ±1 quando presente (per serie padre: data inizio antecedente, max 4 anni)
 * - titolo normalizzato (minuscole, senza punteggiatura/diacritici, senza suffissi come "(ITA)")
 * - supporto matching serie padre per stagioni/special/sequel
 * - cache persistente in <cacheDir>/title-fallback-mappings.json
 */

const fs = require('fs');
const path = require('path');

function normalizeTitle(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s*\((ITA|SUB|DUB|AUDIO ITA|SUB ITA)\)/gi, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getParentTitles(str) {
    if (!str) return [];
    const cleaned = str.replace(/\s*\((ITA|SUB|DUB|AUDIO ITA|SUB ITA)\)/gi, '').trim();
    const parents = [];

    // 1. Rimuovi marcatori di stagione o sequel (es. '2nd Season', 'Season 2', 'Part 2', numeri romani)
    const withoutSeason = cleaned
        .replace(/\s+(2nd|3rd|4th|\d+th)\s+season.*$/i, '')
        .replace(/\s+season\s+\d+.*$/i, '')
        .replace(/\s+part\s+\d+.*$/i, '')
        .replace(/\s+cour\s+\d+.*$/i, '')
        .replace(/\s+(II|III|IV|V|VI|VII|VIII|IX|X)$/i, '')
        .trim();
    if (withoutSeason && withoutSeason !== cleaned) {
        parents.push(withoutSeason);
    }

    // Rimuovi eventuale numero finale solo se non preceduto da "no." o "#" (es. "Kaiju No. 8" preserva l'8)
    if (!/no\.\s*\d+$/i.test(cleaned) && !/#\s*\d+$/i.test(cleaned)) {
        const withoutNum = cleaned.replace(/\s+\d+$/i, '').trim();
        if (withoutNum && withoutNum !== cleaned && !parents.includes(withoutNum)) {
            parents.push(withoutNum);
        }
    }

    // 2. Rimuovi sottotitolo dopo ':' o ' - '
    if (cleaned.includes(':')) {
        const prefix = cleaned.split(':')[0].trim();
        if (prefix.length >= 4 && prefix !== cleaned && !parents.includes(prefix)) {
            parents.push(prefix);
            const prefixNoNum = prefix.replace(/\s+\d+$/i, '').trim();
            if (prefixNoNum.length >= 4 && !parents.includes(prefixNoNum)) {
                parents.push(prefixNoNum);
            }
        }
    }
    if (cleaned.includes(' - ')) {
        const prefix = cleaned.split(' - ')[0].trim();
        if (prefix.length >= 4 && prefix !== cleaned && !parents.includes(prefix)) {
            parents.push(prefix);
        }
    }

    return parents;
}

function getCandidateQueries(record) {
    const raw = [
        record.title_it,
        record.title,
        record.title_eng,
        record.slug ? record.slug.replace(/-/g, ' ') : null
    ].filter(Boolean);

    const queries = [];
    const seen = new Set();

    const add = (q) => {
        if (!q) return;
        const trimmed = q.replace(/\s*\((ITA|SUB|DUB|AUDIO ITA|SUB ITA)\)/gi, '').trim();
        if (trimmed.length >= 2 && !seen.has(trimmed.toLowerCase())) {
            seen.add(trimmed.toLowerCase());
            queries.push(trimmed);
        }
    };

    for (const r of raw) {
        add(r);
        const parents = getParentTitles(r);
        for (const p of parents) add(p);
    }

    return queries;
}

class TmdbFallbackResolver {
    constructor(options = {}) {
        this.cacheDir = options.cacheDir || path.join(__dirname, '../.cache');
        this.apiKey = options.apiKey || process.env.TMDB_API_KEY;
        this.fetchFn = options.fetch || globalThis.fetch;
        this.cachePath = path.join(this.cacheDir, 'title-fallback-mappings.json');
        this.cache = new Map();
        this.isLoaded = false;
    }

    async loadCache() {
        if (this.isLoaded) return;
        if (fs.existsSync(this.cachePath)) {
            try {
                const content = fs.readFileSync(this.cachePath, 'utf8');
                const parsed = JSON.parse(content);
                if (parsed && typeof parsed === 'object') {
                    for (const [k, v] of Object.entries(parsed)) {
                        this.cache.set(k, v);
                    }
                }
            } catch (err) {
                console.warn(`[TmdbFallback] Impossibile leggere cache fallback: ${err.message}`);
            }
        }
        this.isLoaded = true;
    }

    saveCache() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            const obj = {};
            for (const [k, v] of this.cache.entries()) {
                obj[k] = v;
            }
            fs.writeFileSync(this.cachePath, JSON.stringify(obj, null, 2), 'utf8');
        } catch (err) {
            console.warn(`[TmdbFallback] Errore salvataggio cache fallback: ${err.message}`);
        }
    }

    /**
     * Risolve un record AnimeUnity tramite ricerca TMDB
     * @param {Object} record
     * @param {string} [record.title]
     * @param {string} [record.title_eng]
     * @param {string} [record.title_it]
     * @param {string} [record.slug]
     * @param {string|number} [record.date]
     * @param {string|number} [record.anilistId]
     * @param {string|number} [record.malId]
     * @param {Object} [options]
     * @param {boolean} [options.refreshFallbacks]
     * @param {boolean} [options.dryRun]
     * @returns {Promise<{ tmdbId: string, name: string, matchedTitle: string, confidence: number }|null>}
     */
    async resolveFallback(record, options = {}) {
        const anilistKey = record.anilistId ? `anilist:${record.anilistId}` : null;
        const malKey = record.malId ? `mal:${record.malId}` : null;

        await this.loadCache();

        // 1. Controllo cache persistente (a meno che non sia forzato --refresh-fallbacks)
        if (!options.refreshFallbacks) {
            if (anilistKey && this.cache.has(anilistKey)) {
                return this.cache.get(anilistKey);
            }
            if (malKey && this.cache.has(malKey)) {
                return this.cache.get(malKey);
            }
        }

        if (!this.apiKey) {
            console.warn('[TmdbFallback] TMDB_API_KEY assente: ricerca fallback TMDB disabilitata.');
            return null;
        }

        const queries = getCandidateQueries(record);
        const recYear = record.date ? parseInt(record.date, 10) : null;

        const allRecordTitles = [
            record.title,
            record.title_eng,
            record.title_it,
            record.slug ? record.slug.replace(/-/g, ' ') : null
        ].filter(Boolean);

        const normTitles = allRecordTitles.map(normalizeTitle).filter(Boolean);
        const normParentTitles = allRecordTitles.flatMap(getParentTitles).map(normalizeTitle).filter(Boolean);

        // Cache per evitare chiamate HTTP identiche all'interno dello stesso ciclo
        const httpCache = new Map();

        for (const query of queries) {
            for (const lang of ['it-IT', 'en-US']) {
                const cacheKey = `${query}::${lang}`;
                let results = httpCache.get(cacheKey);

                if (!results) {
                    try {
                        const url = `https://api.themoviedb.org/3/search/tv?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=${lang}`;
                        const res = await this.fetchFn(url);
                        if (res.ok) {
                            const data = await res.json();
                            results = data.results || [];
                        } else {
                            results = [];
                        }
                    } catch (err) {
                        console.warn(`[TmdbFallback] Errore richiesta TMDB per "${query}" (${lang}): ${err.message}`);
                        results = [];
                    }
                    httpCache.set(cacheKey, results);
                }

                for (const cand of results) {
                    // Regola 1: Vincolo lingua o genere
                    const isAnimeLangOrGenre = (
                        cand.original_language === 'ja' ||
                        cand.original_language === 'zh' ||
                        (Array.isArray(cand.genre_ids) && cand.genre_ids.includes(16))
                    );
                    if (!isAnimeLangOrGenre) continue;

                    // Regola 2: Combaciamento titolo normalizzato
                    const candNames = [cand.name, cand.original_name]
                        .filter(Boolean)
                        .map(normalizeTitle)
                        .filter(Boolean);

                    let isDirectMatch = false;
                    let isParentMatch = false;
                    let matchedTitleStr = cand.name || cand.original_name;

                    for (const cn of candNames) {
                        if (normTitles.includes(cn)) {
                            isDirectMatch = true;
                            break;
                        }
                        if (normParentTitles.includes(cn) || normTitles.some(nt => nt.startsWith(cn + ' '))) {
                            isParentMatch = true;
                            break;
                        }
                    }

                    if (!isDirectMatch && !isParentMatch) continue;

                    // Regola 3: Vincolo anno (date) ±1 quando presente
                    const candYear = cand.first_air_date ? parseInt(cand.first_air_date.slice(0, 4), 10) : null;
                    if (recYear && candYear) {
                        if (isDirectMatch) {
                            if (Math.abs(candYear - recYear) > 1) continue;
                        } else if (isParentMatch) {
                            // Serie padre: anno inizio antecedente al sequel, max 4 anni (es. Shin Tennis 2022 -> 2026)
                            if (candYear > recYear + 1 || recYear - candYear > 4) continue;
                        }
                    }

                    // Calcolo confidenza
                    const confidence = isDirectMatch ? 1.0 : 0.85;

                    const match = {
                        tmdbId: String(cand.id),
                        name: cand.name,
                        matchedTitle: matchedTitleStr,
                        confidence
                    };

                    // Salva in cache in-memory
                    if (anilistKey) this.cache.set(anilistKey, match);
                    if (malKey) this.cache.set(malKey, match);

                    return match;
                }
            }
        }

        // Nessun match valido trovato: memorizza esito negativo in cache per evitare ripetizioni
        if (anilistKey) this.cache.set(anilistKey, null);
        if (malKey) this.cache.set(malKey, null);

        return null;
    }
}

module.exports = {
    TmdbFallbackResolver,
    normalizeTitle,
    getParentTitles,
    getCandidateQueries
};
