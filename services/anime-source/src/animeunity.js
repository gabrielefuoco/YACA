/**
 * animeunity.js
 * Adapter per la nuova API JSON di AnimeUnity (/api/home/latest-episodes, /api/archive, /api/anime/{id}/episodes).
 * Nessuna dipendenza esterna: usa fetch nativo.
 */

const fs = require('fs');
const path = require('path');
const { cleanTitle } = require('./aggregate');

const DEFAULT_BASE_URL = process.env.ANIMEUNITY_BASE_URL || 'https://animeunity.cx';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

const HOME_WINDOW_DAYS = 14;
// 5 pagine x 20 item = 100 episodi per passata completa.
const HOME_MAX_PAGES = 5;
const SEEN_AIRED_AT_FILE = 'home-observed-at.json';
const SEEN_AIRED_AT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT_DELAYS_MS = [2000, 5000];

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

function mapDefaultStatus(status) {
    if (!status || typeof status !== 'string') return null;
    const low = status.trim().toLowerCase();
    if (low === 'ongoing') return 'In Corso';
    if (low === 'completed') return 'Terminato';
    return status;
}

function normalizeArchiveRecord(record, options = {}) {
    if (!record || typeof record !== 'object') return record;
    // Record legacy gia' normalizzato (senza variants e con dub numerico)
    if (record.dub !== undefined && !Array.isArray(record.variants) && record.default_status === undefined) {
        return record;
    }

    const variants = Array.isArray(record.variants) ? record.variants : [];
    const defaultLang = options.defaultDub === 1 ? 'ita' : 'jpn';
    const preferredVariant = variants.find(v => v && v.language === defaultLang) || variants[0] || null;
    const hasIta = variants.some(v => v && v.language === 'ita');
    const hasJpn = variants.some(v => v && v.language === 'jpn');

    let dub = 0;
    if (record.dub !== undefined && record.dub !== null) {
        dub = Number(record.dub) === 1 ? 1 : 0;
    } else if (options.defaultDub !== undefined) {
        dub = Number(options.defaultDub) === 1 ? 1 : 0;
    } else if (hasIta && !hasJpn) {
        dub = 1;
    }

    const epCount = record.real_episodes_count ?? preferredVariant?.episodes_count ?? record.episodes_count ?? record.total_episodes ?? null;
    const rawStatus = record.status || preferredVariant?.status || record.default_status || null;

    return {
        ...record,
        title_eng: record.title_eng ?? record.title_ja ?? null,
        date: record.date ?? (record.year !== undefined && record.year !== null ? String(record.year) : null),
        status: mapDefaultStatus(rawStatus),
        dub,
        real_episodes_count: epCount,
        episodes_count: record.episodes_count ?? preferredVariant?.episodes_count ?? record.total_episodes ?? null
    };
}

function parseJsonPayload(input) {
    if (!input) return null;
    if (typeof input === 'object') return input;
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return null;
    }
}

function extractArrayFromPayload(parsed) {
    if (!parsed || typeof parsed !== 'object') return [];
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.data)) return parsed.data;
    if (Array.isArray(parsed.records)) return parsed.records;
    return [];
}

function extractArchiveRecords(input, options = {}) {
    const parsed = parseJsonPayload(input);
    if (parsed) {
        return extractArrayFromPayload(parsed).map(r => normalizeArchiveRecord(r, options));
    }

    if (typeof input !== 'string') return [];

    // Fallback retrocompatibile per fixture HTML storiche (records="...")
    const match = input.match(/\brecords="([^"]+)"/) || input.match(/\brecords='([^']+)'/);
    if (!match || !match[1]) return [];
    try {
        const htmlParsed = JSON.parse(decodeHtmlEntities(match[1]));
        return extractArrayFromPayload(htmlParsed).map(r => normalizeArchiveRecord(r, options));
    } catch (err) {
        console.error(`[AnimeUnity] Errore nel parsing JSON dei record archivio: ${err.message}`);
        return [];
    }
}

function resolveEpisodeNumber(ep) {
    if (!ep || typeof ep !== 'object') return '';
    const raw = ep.number !== undefined && ep.number !== null ? String(ep.number).trim() : '';
    const num = Number(raw);
    if (raw !== '' && Number.isFinite(num) && num > 0) return raw;
    const seqEnd = Number(ep.seq_number_end);
    if (Number.isFinite(seqEnd) && seqEnd > 0) return String(seqEnd);
    return raw;
}

function normalizeHomeItem(raw, options = {}) {
    if (!raw || typeof raw !== 'object') return null;
    // Item gia' normalizzato (fixture legacy con raw.anime diretto e senza raw.episode)
    if (!raw.episode) return raw;

    const ep = raw.episode;
    const anime = ep && ep.anime && typeof ep.anime === 'object' ? ep.anime : null;
    const language = raw.language === 'ita' ? 'ita' : 'jpn';
    const dub = language === 'ita' ? 1 : 0;
    const number = resolveEpisodeNumber(ep);

    let createdAt = raw.created_at || ep.created_at || null;
    if (!createdAt) {
        if (typeof options.observeAiredAt === 'function') {
            createdAt = options.observeAiredAt(anime ? anime.id : null, number, language, options.now);
        } else {
            const nowMs = Number.isFinite(options.now) ? Number(options.now) : Date.now();
            createdAt = new Date(nowMs).toISOString();
        }
    }

    return {
        id: raw.id,
        anime_id: anime ? anime.id : null,
        episode_id: ep ? ep.id : null,
        language,
        number,
        seq_number_end: ep ? ep.seq_number_end : null,
        created_at: createdAt,
        anime: anime ? {
            id: anime.id,
            slug: anime.slug ?? null,
            title: anime.title ?? null,
            title_ja: anime.title_ja ?? null,
            title_eng: anime.title_eng ?? anime.title_ja ?? null,
            title_it: anime.title_it ?? null,
            type: anime.type ?? null,
            year: anime.year ?? null,
            date: anime.date ?? (anime.year !== undefined && anime.year !== null ? String(anime.year) : null),
            total_episodes: anime.total_episodes ?? null,
            default_status: anime.default_status ?? null,
            status: anime.status || mapDefaultStatus(anime.default_status),
            dub,
            anilist_id: anime.anilist_id ?? null,
            mal_id: anime.mal_id ?? null
        } : null
    };
}

function extractHomeItems(input, options = {}) {
    const parsed = parseJsonPayload(input);
    if (!parsed) return [];
    return extractArrayFromPayload(parsed)
        .map(item => normalizeHomeItem(item, options))
        .filter(Boolean);
}

class AnimeUnityClient {
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
        this.fetchFn = options.fetch || globalThis.fetch;
        this.requestDelayMs = options.requestDelayMs !== undefined ? options.requestDelayMs : 350;
        this.rateLimitDelaysMs = Array.isArray(options.rateLimitDelaysMs) && options.rateLimitDelaysMs.length > 0
            ? options.rateLimitDelaysMs
            : DEFAULT_RATE_LIMIT_DELAYS_MS;
        this.cacheDir = options.cacheDir || null;
        this._lastRequestTime = 0;
        this._cooldownUntil = 0;
        this._rateLimitStreak = 0;
        this._searchCache = new Map();
        this._warnedRedirectHosts = new Set();
        this._seenAiredAt = new Map();
        this._loadSeenAiredAt();
    }

    _seenAiredAtPath() {
        return this.cacheDir ? path.join(this.cacheDir, SEEN_AIRED_AT_FILE) : null;
    }

    _loadSeenAiredAt() {
        const file = this._seenAiredAtPath();
        if (!file || !fs.existsSync(file)) return;
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (raw && typeof raw === 'object') {
                const cutoff = Date.now() - SEEN_AIRED_AT_TTL_MS;
                for (const [k, v] of Object.entries(raw)) {
                    const ms = Date.parse(v);
                    if (Number.isFinite(ms) && ms >= cutoff) {
                        this._seenAiredAt.set(k, v);
                    }
                }
            }
        } catch {
            // Cache osservazioni corrotta o illeggibile: riparte pulita
        }
    }

    _saveSeenAiredAt() {
        const file = this._seenAiredAtPath();
        if (!file) return;
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            const cutoff = Date.now() - SEEN_AIRED_AT_TTL_MS;
            const out = {};
            for (const [k, v] of this._seenAiredAt.entries()) {
                const ms = Date.parse(v);
                if (Number.isFinite(ms) && ms >= cutoff) out[k] = v;
            }
            fs.writeFileSync(file, JSON.stringify(out), 'utf8');
        } catch {
            // Non bloccante
        }
    }

    // ponytail: /api/home/latest-episodes omits release dates; observation time gives 1-poll-cycle (15m) accuracy. Upgrade: read a real date if the API ever exposes one.
    _observeAiredAt(animeId, episodeNumber, language, nowMs) {
        const ts = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
        if (!animeId || !episodeNumber) {
            return new Date(ts).toISOString();
        }
        const key = `${animeId}:${episodeNumber}:${language || 'jpn'}`;
        if (this._seenAiredAt.has(key)) {
            return this._seenAiredAt.get(key);
        }
        const iso = new Date(ts).toISOString();
        this._seenAiredAt.set(key, iso);
        this._saveSeenAiredAt();
        return iso;
    }

    /**
     * Esegue fetch seguendo esplicitamente i redirect (301/302/303/307/308) fino a MAX_REDIRECTS hop,
     * mantenendo gli stessi header/UA e avvisando una sola volta se l'host cambia.
     */
    async _fetch(url, options = {}) {
        const baseHost = new URL(this.baseUrl).host;
        let currentUrl = url;

        for (let hops = 0; ; hops++) {
            const res = await this.fetchFn(currentUrl, { ...options, redirect: 'manual' });
            if (!REDIRECT_STATUSES.has(res.status)) return res;

            const location = typeof res.headers?.get === 'function'
                ? res.headers.get('location')
                : (res.headers?.location || res.headers?.Location);
            if (!location) return res;

            if (res.body && typeof res.body.cancel === 'function') {
                res.body.cancel().catch(() => {});
            }

            if (hops >= MAX_REDIRECTS) {
                throw new Error(`Troppi redirect (> ${MAX_REDIRECTS}) da ${url}`);
            }

            const nextUrl = new URL(location, currentUrl).toString();
            const nextHost = new URL(nextUrl).host;
            if (nextHost !== baseHost && !this._warnedRedirectHosts.has(nextHost)) {
                this._warnedRedirectHosts.add(nextHost);
                console.warn(`[AnimeUnity] redirect: ${baseHost} → ${nextHost} (aggiorna ANIMEUNITY_BASE_URL)`);
            }
            currentUrl = nextUrl;
        }
    }

    async _courtesyWait() {
        const now = Date.now();
        const delayTarget = this.requestDelayMs > 0 ? this._lastRequestTime + this.requestDelayMs : 0;
        const waitUntil = Math.max(delayTarget, this._cooldownUntil);
        if (waitUntil > now) {
            await new Promise(r => setTimeout(r, waitUntil - now));
        }
        this._lastRequestTime = Date.now();
    }

    /**
     * Esegue la richiesta rispettando il courtesy delay e riprova UNA sola volta su 429
     * con pausa crescente, contando l'attesa nel pacing del ciclo.
     */
    async _request(url, options = {}, context = '') {
        await this._courtesyWait();
        let res = await this._fetch(url, options);

        if (res.status === 429) {
            if (res.body && typeof res.body.cancel === 'function') {
                res.body.cancel().catch(() => {});
            }
            const idx = Math.min(this._rateLimitStreak, this.rateLimitDelaysMs.length - 1);
            const pauseMs = Math.max(0, Number(this.rateLimitDelaysMs[idx]) || 0);
            this._rateLimitStreak++;
            console.warn(`[AnimeUnity] 429 rate limit${context ? ` per ${context}` : ''}: attendo ${pauseMs}ms e riprovo una volta`);
            if (pauseMs > 0) {
                await new Promise(r => setTimeout(r, pauseMs));
            }
            this._lastRequestTime = Date.now();
            res = await this._fetch(url, options);
            this._lastRequestTime = Date.now();
            if (res.status === 429 && pauseMs > 0) {
                this._cooldownUntil = Math.max(this._cooldownUntil, this._lastRequestTime + pauseMs);
            }
            return res;
        }

        if (res.ok) {
            this._rateLimitStreak = 0;
        }
        return res;
    }

    /**
     * Cerca anime nell'archivio per titolo tramite GET /api/search?q=...
     * @param {string} title Titolo da cercare
     * @returns {Promise<Array<Object>>} Lista di record trovati
     */
    async searchArchive(title) {
        if (!title || typeof title !== 'string') return [];

        const url = `${this.baseUrl}/api/search?q=${encodeURIComponent(title.trim())}`;
        try {
            const res = await this._request(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                }
            }, `ricerca "${title}"`);

            if (!res.ok) {
                console.error(`[AnimeUnity] Richiesta ricerca fallita con status ${res.status} per "${title}"`);
                return [];
            }

            const data = await res.json();
            return extractArchiveRecords(data);
        } catch (err) {
            console.error(`[AnimeUnity] Errore di rete nella ricerca archivio per "${title}": ${err.message}`);
            return [];
        }
    }

    /**
     * Recupera gli episodi di una serie tramite GET /api/anime/{id}/episodes
     * filtrando per lingua ('jpn' per sub/dub=0, 'ita' per dub=1) e paginando via start.
     * @param {number|string} animeId ID anime su AnimeUnity
     * @param {number|string} [dub=0] 0 per sub ('jpn'), 1 per doppiato ('ita')
     * @param {Object} [rangeOptions]
     * @param {number} [rangeOptions.startRange]
     * @param {number} [rangeOptions.endRange]
     * @returns {Promise<{ episodes_count: number, current_episode: *, episodes: Array<Object> }|null>}
     */
    async getEpisodes(animeId, dub = 0, rangeOptions = {}) {
        if (!animeId) return null;

        const targetLanguage = (Number(dub) === 1 || dub === 'ita') ? 'ita' : 'jpn';
        const hasEndRange = rangeOptions.endRange !== undefined && Number.isFinite(Number(rangeOptions.endRange));
        const endRange = hasEndRange ? Number(rangeOptions.endRange) : null;
        let currentStart = Math.max(1, Number(rangeOptions.startRange) || 1);

        const rawEpisodes = [];
        let apiTotal = null;
        let lastCurrentEpisode = null;

        while (true) {
            const url = currentStart > 1
                ? `${this.baseUrl}/api/anime/${animeId}/episodes?start=${currentStart}`
                : `${this.baseUrl}/api/anime/${animeId}/episodes`;

            try {
                const res = await this._request(url, {
                    headers: {
                        'User-Agent': this.userAgent,
                        'Accept': 'application/json'
                    }
                }, `anime ${animeId} (${targetLanguage})`);

                if (!res.ok) {
                    console.error(`[AnimeUnity] Richiesta episodes fallita con status ${res.status} per anime ${animeId} (${targetLanguage})`);
                    if (rawEpisodes.length === 0) {
                        return null;
                    }
                    break;
                }

                const data = await res.json();
                if (!data || typeof data !== 'object') {
                    return rawEpisodes.length === 0 ? null : { episodes_count: rawEpisodes.length, current_episode: lastCurrentEpisode, episodes: rawEpisodes };
                }

                if (data.current_episode !== undefined) {
                    lastCurrentEpisode = data.current_episode;
                }
                if (Number.isFinite(Number(data.total))) {
                    apiTotal = Number(data.total);
                }

                const pageEpisodes = Array.isArray(data.episodes) ? data.episodes : [];
                rawEpisodes.push(...pageEpisodes);

                if (pageEpisodes.length === 0) break;
                if (apiTotal === null || rawEpisodes.length >= apiTotal) break;

                const pageStart = Number.isFinite(Number(data.start)) ? Number(data.start) : currentStart;
                const nextStart = pageStart + pageEpisodes.length;
                if (hasEndRange && nextStart - 1 >= endRange) break;
                if (nextStart <= currentStart) break;
                currentStart = nextStart;
            } catch (err) {
                console.error(`[AnimeUnity] Errore nel recupero episodi per anime ${animeId} (${targetLanguage}): ${err.message}`);
                return rawEpisodes.length === 0 ? null : { episodes_count: rawEpisodes.length, current_episode: lastCurrentEpisode, episodes: rawEpisodes };
            }
        }

        const filteredEpisodes = rawEpisodes.filter((ep) => {
            if (!ep || typeof ep !== 'object') return false;
            if (!Array.isArray(ep.videos)) return true;
            return ep.videos.some(v => v && v.language === targetLanguage);
        });

        const episodesCount = (hasEndRange && filteredEpisodes.length === 0 && apiTotal !== null)
            ? apiTotal
            : filteredEpisodes.length;

        return {
            episodes_count: episodesCount,
            current_episode: lastCurrentEpisode,
            episodes: filteredEpisodes
        };
    }

    async _fetchArchivePages({ query, limit, defaultDub, label }) {
        const allRecords = [];
        for (let page = 1; allRecords.length < limit; page++) {
            const url = page === 1
                ? `${this.baseUrl}/api/archive?${query}`
                : `${this.baseUrl}/api/archive?${query}&page=${page}`;

            try {
                const res = await this._request(url, {
                    headers: {
                        'User-Agent': this.userAgent,
                        'Accept': 'application/json'
                    }
                }, `archive (${label}) pagina ${page}`);

                if (!res.ok) {
                    console.error(`[AnimeUnity] Richiesta archive (${label}) fallita con status ${res.status} alla pagina ${page}`);
                    break;
                }

                const data = await res.json();
                const records = extractArchiveRecords(data, { defaultDub });
                if (!records || records.length === 0) break;

                for (const r of records) {
                    allRecords.push(r);
                    if (allRecords.length >= limit) break;
                }

                if (data.last_page !== undefined && page >= Number(data.last_page)) break;
                if (data.total !== undefined && allRecords.length >= Number(data.total)) break;
            } catch (err) {
                console.error(`[AnimeUnity] Errore durante la paginazione archive (${label}) alla pagina ${page}: ${err.message}`);
                break;
            }
        }
        return allRecords;
    }

    /**
     * Recupera l'elenco delle serie in corso da AnimeUnity (GET /api/archive?status=ongoing)
     * @param {Object} [options]
     * @param {number} [options.limit=300] Budget massimo di serie per giro
     * @param {string} [options.status='ongoing'] Filtro di stato (solo 'ongoing' e' valido sulla nuova API)
     * @returns {Promise<Array<Object>>} Lista di record trovati
     */
    async getOngoingSeries(options = {}) {
        const limit = options.limit !== undefined ? Number(options.limit) : 300;
        const rawStatus = options.status ? String(options.status).trim().toLowerCase() : 'ongoing';
        const status = (rawStatus === 'in corso' || rawStatus === 'in_corso') ? 'ongoing' : rawStatus;

        return this._fetchArchivePages({
            query: `status=${encodeURIComponent(status)}`,
            limit,
            label: `status=${status}`
        });
    }

    /**
     * Recupera l'elenco dei doppiati dall'archivio AnimeUnity (GET /api/archive?language=ita)
     * @param {Object} [options]
     * @param {number} [options.limit=1600] Budget massimo di serie per giro
     * @returns {Promise<Array<Object>>} Lista di record doppiati trovati
     */
    async getDubbedSeries(options = {}) {
        const limit = options.limit !== undefined ? Number(options.limit) : 1600;
        return this._fetchArchivePages({
            query: 'language=ita',
            limit,
            defaultDub: 1,
            label: 'language=ita'
        });
    }

    /**
     * UNA pagina della home (GET /api/home/latest-episodes?page=N).
     * @param {number} [page=1]
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>} Item episodio normalizzati ([] se la pagina non c'è più)
     */
    async _fetchHomePage(page = 1, options = {}) {
        const url = Number(page) <= 1
            ? `${this.baseUrl}/api/home/latest-episodes`
            : `${this.baseUrl}/api/home/latest-episodes?page=${page}`;

        try {
            const res = await this._request(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                }
            }, `home pagina ${page}`);

            if (!res.ok) {
                console.error(`[AnimeUnity] Richiesta home pagina ${page} fallita con status ${res.status}`);
                return [];
            }

            const text = await res.text();
            const items = extractHomeItems(text, {
                observeAiredAt: (animeId, number, language, nowMs) => this._observeAiredAt(animeId, number, language, nowMs),
                now: options.now
            });

            if (items.length === 0 && text && text.length > 0) {
                console.error(`[AnimeUnity] Home pagina ${page}: 0 item estratti (status=${res.status}, bytes=${text.length})`);
            }
            return items;
        } catch (err) {
            console.error(`[AnimeUnity] Errore durante il fetch della home (pagina ${page}): ${err.message}`);
            return [];
        }
    }

    /**
     * Le ultime uscite dalla home page di AnimeUnity (GET /api/home/latest-episodes pagina 1).
     * @param {Object} [options]
     * @returns {Promise<Array<Object>>} Lista di item episodio normalizzati
     */
    async getLatestReleasesFromHome(options = {}) {
        return this._fetchHomePage(1, options);
    }

    /**
     * Giro completo della home, paginato (fino a HOME_MAX_PAGES = 5 pagine = 100 episodi per giro).
     *
     * @param {Object} [options]
     * @param {number} [options.windowDays=14] Finestra in giorni
     * @param {number} [options.now] "Adesso" in ms (test)
     * @param {number} [options.maxPages=5] Tetto di pagine
     * @returns {Promise<{items: Array<Object>, pages: Array<Object>, stoppedBy: string, windowStartMs: number, windowEndMs: number, windowDays: number}>}
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
            const pageItems = await this._fetchHomePage(page, { now: nowMs });

            if (!Array.isArray(pageItems) || pageItems.length === 0) {
                stoppedBy = page === 1 ? 'unreachable' : 'empty';
                break;
            }

            items.push(...pageItems);

            let oldestMs = null;
            let newestMs = null;
            for (const item of pageItems) {
                const raw = item && item.created_at ? String(item.created_at) : '';
                const at = raw
                    ? Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
                    : NaN;
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
     * Trova la controparte sub (jpn / dub: 0) di un record doppiato (dub: 1).
     * Nella nuova API la stessa serie condivide spesso lo stesso id con variants['jpn'].
     * @param {Object} dubbedRecord Record doppiato da AnimeUnity
     * @returns {Promise<Object|null>} Record sub counterpart o null
     */
    async findSubCounterpart(dubbedRecord) {
        if (!dubbedRecord) return null;

        if (Array.isArray(dubbedRecord.variants)) {
            const jpnVariant = dubbedRecord.variants.find(v => v && v.language === 'jpn');
            if (jpnVariant) {
                return {
                    ...dubbedRecord,
                    dub: 0,
                    status: mapDefaultStatus(jpnVariant.status || dubbedRecord.default_status) || dubbedRecord.status,
                    real_episodes_count: jpnVariant.episodes_count ?? dubbedRecord.real_episodes_count,
                    episodes_count: jpnVariant.episodes_count ?? dubbedRecord.episodes_count
                };
            }
        }

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
        if (match) return match;

        const sameOrSlug = records.find(r =>
            Array.isArray(r.variants) &&
            r.variants.some(v => v && v.language === 'jpn') &&
            (Number(r.id) === Number(dubbedRecord.id) || (r.slug && dubbedRecord.slug && r.slug === dubbedRecord.slug))
        );
        if (!sameOrSlug) return null;

        const jpnVariant = sameOrSlug.variants.find(v => v && v.language === 'jpn');
        return {
            ...sameOrSlug,
            dub: 0,
            status: mapDefaultStatus(jpnVariant.status || sameOrSlug.default_status) || sameOrSlug.status,
            real_episodes_count: jpnVariant.episodes_count ?? sameOrSlug.real_episodes_count,
            episodes_count: jpnVariant.episodes_count ?? sameOrSlug.episodes_count
        };
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
