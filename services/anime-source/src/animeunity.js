/**
 * animeunity.js
 * Adapter per AnimeUnity (archivio e info_api episodi).
 * Nessuna dipendenza esterna: usa fetch nativo e regex per il parsing.
 */

const DEFAULT_BASE_URL = process.env.ANIMEUNITY_BASE_URL || 'https://www.animeunity.so';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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

class AnimeUnityClient {
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
        this.fetchFn = options.fetch || globalThis.fetch;
        this.requestDelayMs = options.requestDelayMs !== undefined ? options.requestDelayMs : 350;
        this._lastRequestTime = 0;
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
    async getOngoingSeries(options = {}) {
        const limit = options.limit !== undefined ? Number(options.limit) : 300;
        const status = options.status || 'In corso';

        await this._courtesyWait();

        // 1. Fetch iniziale di /archivio per estrarre cookie e token CSRF
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
                return [];
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
            return [];
        }

        if (!csrfToken) {
            console.error('[AnimeUnity] Impossibile trovare il token CSRF nella pagina /archivio');
            return [];
        }

        // 2. Paginazione su POST /archivio/get-animes
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
                        'X-CSRF-TOKEN': csrfToken,
                        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
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
}

module.exports = {
    AnimeUnityClient,
    decodeHtmlEntities,
    extractArchiveRecords
};
