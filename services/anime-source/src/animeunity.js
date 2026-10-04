/**
 * animeunity.js
 * Adapter per AnimeUnity (archivio e info_api episodi).
 * Nessuna dipendenza esterna: usa fetch nativo e regex per il parsing.
 */

const { cleanTitle } = require('./aggregate');

const DEFAULT_BASE_URL = process.env.ANIMEUNITY_BASE_URL || 'https://www.animeunity.so';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Finestra del "chi è in simulcast": due settimane. Misurata il 04/10/2026, sei pagine
// della home coprono esattamente 14 giorni (30 item per pagina, ordine per data).
const HOME_WINDOW_DAYS = 14;
// Tetto di pagine per un giro completo: rete di sicurezza, NON una taratura. Con la
// regola "prendi pagine finché la più vecchia è dentro la finestra" il numero di pagine
// dipende solo da quanti episodi escono al giorno; il tetto serve solo a non girare
// all'infinito se il sito rispondesse sempre con pagine piene di item freschi.
const HOME_MAX_PAGES = 25;

function decodeHtmlEntities(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&#(\d+);/g, (_, code) => {
            const num = Number(code);
            return !isNaN(num) ? String.fromCharCode(num) : '';
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            const num = parseInt(hex, 16);
            return !isNaN(num) ? String.fromCharCode(num) : '';
        });
}

function extractArchiveRecords(input) {
    if (!input) return [];

    // Se è già un oggetto JS (es. risposta JSON parsata)
    if (typeof input === 'object') {
        if (Array.isArray(input)) return input;
        if (Array.isArray(input.records)) return input.records;
        if (Array.isArray(input.data)) return input.data;
        return [];
    }

    if (typeof input !== 'string') return [];

    // Se è una stringa JSON
    const trimmed = input.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && Array.isArray(parsed.records)) return parsed.records;
            if (parsed && Array.isArray(parsed.data)) return parsed.data;
        } catch {
            // Continua con il fallback di estrazione HTML
        }
    }

    // Estrazione da attributo HTML records="..."
    const match = input.match(/\brecords="([^"]+)"/) || input.match(/\brecords='([^']+)'/);
    if (!match || !match[1]) return [];

    const decoded = decodeHtmlEntities(match[1]);
    try {
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.data)) return parsed.data;
        if (parsed && Array.isArray(parsed.records)) return parsed.records;
        return [];
    } catch (err) {
        console.error(`[AnimeUnity] Errore nel parsing JSON dei record archivio: ${err.message}`);
        return [];
    }
}

function extractHomeItems(input) {
    if (!input) return [];

    // Se è già un oggetto JS (es. array o oggetto paginatore)
    if (typeof input === 'object') {
        if (Array.isArray(input)) return input;
        if (Array.isArray(input.data)) return input.data;
        if (Array.isArray(input.records)) return input.records;
        return [];
    }

    if (typeof input !== 'string') return [];

    // Se è una stringa JSON
    const trimmed = input.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && Array.isArray(parsed.data)) return parsed.data;
            if (parsed && Array.isArray(parsed.records)) return parsed.records;
        } catch {
            // Continua con estrazione HTML
        }
    }

    // Estrazione da attributo HTML items-json="..." o items-json='...'
    const match = input.match(/\bitems-json="([^"]+)"/) || input.match(/\bitems-json='([^']+)'/);
    if (!match || !match[1]) return [];

    const decoded = decodeHtmlEntities(match[1]);
    try {
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.data)) return parsed.data;
        if (parsed && Array.isArray(parsed.records)) return parsed.records;
        return [];
    } catch (err) {
        console.error(`[AnimeUnity] Errore nel parsing JSON degli item della home: ${err.message}`);
        return [];
    }
}

class AnimeUnityClient {
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
        this.fetchFn = options.fetch || globalThis.fetch;
        this.requestDelayMs = options.requestDelayMs !== undefined ? options.requestDelayMs : 350;
        this._lastRequestTime = 0;
        this._csrfData = null;
        this._searchCache = new Map();
    }

    async _courtesyWait() {
        if (this.requestDelayMs <= 0) return;
        const now = Date.now();
        const elapsed = now - this._lastRequestTime;
        if (elapsed < this.requestDelayMs) {
            await new Promise(r => setTimeout(r, this.requestDelayMs - elapsed));
        }
        this._lastRequestTime = Date.now();
    }

    /**
     * Cerca anime nell'archivio per titolo
     * @param {string} title Titolo da cercare
     * @returns {Promise<Array<Object>>} Lista di record trovati
     */
    async searchArchive(title) {
        if (!title || typeof title !== 'string') return [];
        await this._courtesyWait();

        const url = `${this.baseUrl}/archivio?title=${encodeURIComponent(title.trim())}`;
        try {
            const res = await this.fetchFn(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            if (!res.ok) {
                console.error(`[AnimeUnity] Richiesta archivio fallita con status ${res.status} per "${title}"`);
                return [];
            }

            const html = await res.text();
            return extractArchiveRecords(html);
        } catch (err) {
            console.error(`[AnimeUnity] Errore di rete nella ricerca archivio per "${title}": ${err.message}`);
            return [];
        }
    }

    /**
     * Recupera gli episodi di una serie tramite /info_api/{id}/{dub}
     * @param {number|string} animeId ID anime su AnimeUnity
     * @param {number|string} dub 0 per sub, 1 per doppiato
     * @param {Object} [rangeOptions]
     * @param {number} [rangeOptions.startRange=1]
     * @param {number} [rangeOptions.endRange=100]
     * @returns {Promise<{ episodes_count: number, episodes: Array<Object> }|null>}
     */
    async getEpisodes(animeId, dub = 0, rangeOptions = {}) {
        if (!animeId) return null;
        await this._courtesyWait();

        const start = rangeOptions.startRange || 1;
        const end = rangeOptions.endRange || 100;
        const url = `${this.baseUrl}/info_api/${animeId}/${dub}?start_range=${start}&end_range=${end}`;

        try {
            const res = await this.fetchFn(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) {
                console.error(`[AnimeUnity] Richiesta info_api fallita con status ${res.status} per anime ${animeId} dub ${dub}`);
                return null;
            }

            const data = await res.json();
            if (!data || typeof data !== 'object') {
                return null;
            }

            return {
                episodes_count: Number(data.episodes_count) || (Array.isArray(data.episodes) ? data.episodes.length : 0),
                current_episode: data.current_episode,
                episodes: Array.isArray(data.episodes) ? data.episodes : []
            };
        } catch (err) {
            console.error(`[AnimeUnity] Errore nel recupero episodi per anime ${animeId} dub ${dub}: ${err.message}`);
            return null;
        }
    }

    /**
     * Recupera l'elenco delle serie in corso da AnimeUnity (/archivio/get-animes con paginazione)
     * @param {Object} [options]
     * @param {number} [options.limit=300] Budget massimo di serie per giro
     * @param {string} [options.status='In corso'] Filtro di stato
     * @returns {Promise<Array<Object>>} Lista di record trovati
     */
    async _getCsrfAndCookies(forceRefresh = false) {
        if (!forceRefresh && this._csrfData) {
            return this._csrfData;
        }

        await this._courtesyWait();

        const archiveUrl = `${this.baseUrl}/archivio`;
        let csrfToken = null;
        let cookieHeader = '';

        try {
            const res = await this.fetchFn(archiveUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            if (!res.ok) {
                console.error(`[AnimeUnity] Richiesta archivio fallita con status ${res.status}`);
                return null;
            }

            const setCookies = typeof res.headers?.getSetCookie === 'function'
                ? res.headers.getSetCookie()
                : (res.headers?.get ? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []) : []);

            cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');

            const html = await res.text();
            const csrfMeta = html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
            if (csrfMeta && csrfMeta[1]) {
                csrfToken = csrfMeta[1];
            }
        } catch (err) {
            console.error(`[AnimeUnity] Errore di rete nel recupero CSRF da /archivio: ${err.message}`);
            return null;
        }

        if (!csrfToken) {
            console.error('[AnimeUnity] Impossibile trovare il token CSRF nella pagina /archivio');
            return null;
        }

        this._csrfData = { csrfToken, cookieHeader };
        return this._csrfData;
    }

    /**
     * Recupera l'elenco delle serie in corso da AnimeUnity (/archivio/get-animes con paginazione)
     * @param {Object} [options]
     * @param {number} [options.limit=300] Budget massimo di serie per giro
     * @param {string} [options.status='In corso'] Filtro di stato
     * @returns {Promise<Array<Object>>} Lista di record trovati
     */
    async getOngoingSeries(options = {}) {
        const limit = options.limit !== undefined ? Number(options.limit) : 300;
        const status = options.status || 'In corso';

        const csrfData = await this._getCsrfAndCookies();
        if (!csrfData || !csrfData.csrfToken) {
            return [];
        }

        let offset = 0;
        const allRecords = [];

        while (offset < limit) {
            await this._courtesyWait();

            const postUrl = `${this.baseUrl}/archivio/get-animes`;
            const payload = {
                title: false,
                type: false,
                year: false,
                order: false,
                status,
                genres: [],
                offset,
                dubbed: false,
                season: false
            };

            try {
                const postRes = await this.fetchFn(postUrl, {
                    method: 'POST',
                    headers: {
                        'User-Agent': this.userAgent,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, text/plain, */*',
                        'X-CSRF-TOKEN': csrfData.csrfToken,
                        ...(csrfData.cookieHeader ? { 'Cookie': csrfData.cookieHeader } : {})
                    },
                    body: JSON.stringify(payload)
                });

                if (!postRes.ok) {
                    console.error(`[AnimeUnity] Richiesta get-animes fallita con status ${postRes.status} all'offset ${offset}`);
                    break;
                }

                const data = await postRes.json();
                const records = extractArchiveRecords(data);
                if (!records || records.length === 0) {
                    break;
                }

                for (const r of records) {
                    allRecords.push(r);
                    if (allRecords.length >= limit) break;
                }

                offset += records.length;
                if (data.tot !== undefined && offset >= data.tot) {
                    break;
                }
            } catch (err) {
                console.error(`[AnimeUnity] Errore durante la paginazione get-animes all'offset ${offset}: ${err.message}`);
                break;
            }
        }

        return allRecords;
    }

    /**
     * Recupera l'elenco dei doppiati dall'archivio AnimeUnity (/archivio/get-animes con dubbed: true, status: false)
     * @param {Object} [options]
     * @param {number} [options.limit=1600] Budget massimo di serie per giro
     * @returns {Promise<Array<Object>>} Lista di record doppiati trovati
     */
    async getDubbedSeries(options = {}) {
        const limit = options.limit !== undefined ? Number(options.limit) : 1600;

        const csrfData = await this._getCsrfAndCookies();
        if (!csrfData || !csrfData.csrfToken) {
            return [];
        }

        let offset = 0;
        const allRecords = [];

        while (offset < limit) {
            await this._courtesyWait();

            const postUrl = `${this.baseUrl}/archivio/get-animes`;
            const payload = {
                title: false,
                type: false,
                year: false,
                order: false,
                status: false,
                genres: [],
                offset,
                dubbed: true,
                season: false
            };

            try {
                const postRes = await this.fetchFn(postUrl, {
                    method: 'POST',
                    headers: {
                        'User-Agent': this.userAgent,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, text/plain, */*',
                        'X-CSRF-TOKEN': csrfData.csrfToken,
                        ...(csrfData.cookieHeader ? { 'Cookie': csrfData.cookieHeader } : {})
                    },
                    body: JSON.stringify(payload)
                });

                if (!postRes.ok) {
                    console.error(`[AnimeUnity] Richiesta get-animes (doppiati) fallita con status ${postRes.status} all'offset ${offset}`);
                    break;
                }

                const data = await postRes.json();
                const records = extractArchiveRecords(data);
                if (!records || records.length === 0) {
                    break;
                }

                for (const r of records) {
                    allRecords.push(r);
                    if (allRecords.length >= limit) break;
                }

                offset += records.length;
                if (data.tot !== undefined && offset >= data.tot) {
                    break;
                }
            } catch (err) {
                console.error(`[AnimeUnity] Errore durante la paginazione get-animes (doppiati) all'offset ${offset}: ${err.message}`);
                break;
            }
        }

        return allRecords;
    }

    /**
     * UNA pagina della home (pagina 1 = la radice, pagina N = `/?page=N`).
     * È l'unico posto che conosce l'URL: il resto del modulo ragiona su "pagine".
     * @param {number} [page=1]
     * @returns {Promise<Array<Object>>} Item episodio della pagina ([] se la pagina non c'è più)
     */
    async _fetchHomePage(page = 1) {
        await this._courtesyWait();

        const url = Number(page) <= 1 ? this.baseUrl : `${this.baseUrl}/?page=${page}`;

        try {
            const res = await this.fetchFn(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            if (!res.ok) {
                console.error(`[AnimeUnity] Richiesta home pagina ${page} fallita con status ${res.status}`);
                return [];
            }

            const html = await res.text();
            return extractHomeItems(html);
        } catch (err) {
            console.error(`[AnimeUnity] Errore durante il fetch della home (pagina ${page}): ${err.message}`);
            return [];
        }
    }

    /**
     * Le ultime uscite dalla home page di AnimeUnity (componente layout-items con items-json).
     * È la PRIMA pagina: le 30 uscite più recenti (misurato il 04/10/2026: ~27 ore di uscite).
     * @returns {Promise<Array<Object>>} Lista di item episodio (ciascuno con .anime, .number, .created_at, ecc.)
     */
    async getLatestReleasesFromHome() {
        return this._fetchHomePage(1);
    }

    /**
     * Il giro completo della home, paginato: "le ultime due settimane" lette dalla fonte.
     *
     * LA REGOLA SI AUTO-CORREGGE: l'elenco è ordinato per data, quindi si scava finché
     * l'item PIÙ VECCHIO di una pagina cade fuori dalla finestra. Non c'è nessun numero
     * di pagine da tarare: oggi sono sei, domani potrebbero essere otto, e la regola
     * continua a essere giusta. Il tetto `maxPages` è solo la rete di sicurezza.
     *
     * La pagina che fa scattare la finestra viene INCLUSA: la decisione "dentro o fuori"
     * spetta a `summarizeHomeItems` (aggregate.js), che lavora item per item.
     *
     * @param {Object} [options]
     * @param {number} [options.windowDays=14] Finestra in giorni
     * @param {number} [options.now] "Adesso" in ms (test)
     * @param {number} [options.maxPages=25] Tetto di pagine (rete di sicurezza)
     * @returns {Promise<{items: Array<Object>, pages: Array<Object>, stoppedBy: string, windowStartMs: number, windowEndMs: number, windowDays: number}>}
     *   `stoppedBy`: 'window' (la pagina più vecchia è uscita), 'empty' (pagina vuota),
     *   'max_pages' (tetto), 'unreachable' (nemmeno la prima pagina ha risposto).
     */
    async getHomeReleases(options = {}) {
        const windowDays = Number.isFinite(options.windowDays) && options.windowDays > 0
            ? Number(options.windowDays)
            : HOME_WINDOW_DAYS;
        const nowMs = Number.isFinite(options.now) ? Number(options.now) : Date.now();
        const windowStartMs = nowMs - windowDays * 24 * 60 * 60 * 1000;
        const maxPages = Number.isFinite(options.maxPages) && options.maxPages > 0
            ? Math.floor(Number(options.maxPages))
            : HOME_MAX_PAGES;

        const items = [];
        const pages = [];
        let stoppedBy = 'max_pages';

        for (let page = 1; page <= maxPages; page++) {
            const pageItems = await this._fetchHomePage(page);

            if (!Array.isArray(pageItems) || pageItems.length === 0) {
                stoppedBy = page === 1 ? 'unreachable' : 'empty';
                break;
            }

            items.push(...pageItems);

            let oldestMs = null;
            let newestMs = null;
            for (const item of pageItems) {
                const at = item && item.created_at ? Date.parse(String(item.created_at).replace(' ', 'T') + 'Z') : NaN;
                if (!Number.isFinite(at)) continue;
                if (oldestMs === null || at < oldestMs) oldestMs = at;
                if (newestMs === null || at > newestMs) newestMs = at;
            }

            pages.push({
                page,
                count: pageItems.length,
                oldestAt: oldestMs === null ? null : new Date(oldestMs).toISOString(),
                newestAt: newestMs === null ? null : new Date(newestMs).toISOString()
            });

            if (oldestMs !== null && oldestMs < windowStartMs) {
                stoppedBy = 'window';
                break;
            }
        }

        return { items, pages, stoppedBy, windowStartMs, windowEndMs: nowMs, windowDays };
    }

    /**
     * Trova la controparte sub (dub: 0) di un record doppiato (dub: 1)
     * effettuando una ricerca mirata per titolo in archivio e matchando anilist_id o mal_id.
     * Ritorna null se la serie non ha controparte sub (es. esiste solo doppiata).
     * @param {Object} dubbedRecord Record doppiato da AnimeUnity
     * @returns {Promise<Object|null>} Record sub counterpart o null
     */
    async findSubCounterpart(dubbedRecord) {
        if (!dubbedRecord) return null;
        const rawTitle = dubbedRecord.title || dubbedRecord.title_eng || dubbedRecord.title_it || dubbedRecord.slug;
        if (!rawTitle) return null;

        const cleaned = cleanTitle(rawTitle);
        const searchKey = cleaned || rawTitle;

        let records = null;
        if (this._searchCache && this._searchCache.has(searchKey)) {
            records = this._searchCache.get(searchKey);
        } else {
            records = await this.searchArchive(searchKey);
            if (this._searchCache) {
                this._searchCache.set(searchKey, records);
            }
        }

        if (!Array.isArray(records) || records.length === 0) {
            return null;
        }

        const match = records.find(r =>
            Number(r.dub) === 0 &&
            Number(r.id) !== Number(dubbedRecord.id) &&
            ((r.anilist_id && dubbedRecord.anilist_id && Number(r.anilist_id) === Number(dubbedRecord.anilist_id)) ||
             (r.mal_id && dubbedRecord.mal_id && Number(r.mal_id) === Number(dubbedRecord.mal_id)))
        );

        return match || null;
    }
}

module.exports = {
    AnimeUnityClient,
    decodeHtmlEntities,
    extractArchiveRecords,
    extractHomeItems,
    HOME_WINDOW_DAYS,
    HOME_MAX_PAGES
};
