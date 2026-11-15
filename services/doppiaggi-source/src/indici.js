/**
 * indici.js
 * Download e caching delle pagine d'indice de "Il Mondo dei Doppiatori" (antoniogenna.net).
 * 
 * Regole di cortesia obbligatorie:
 * - 4 zone utili: film.htm, telefilm.htm, anim.htm, soap.htm (altro.htm ESCLUSO)
 * - delay 800 ms fra le richieste di rete
 * - una sola connessione alla volta (sequenziale)
 * - User-Agent identificabile con scopo e contatto
 * - cache su disco con ripresa automatica dal punto se interrotto
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.antoniogenna.net/doppiaggio/';
const DEFAULT_UA = 'YACA-bot/0.1 (valutazione copertura doppiaggi ITA; contatto: gabriele.fuoco99@gmail.com)';
const DEFAULT_DELAY_MS = 800;
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
const ZONES = ['film', 'telefilm', 'anim', 'soap'];

// Pagine d'indice e lettera note (79 pagine totali del catalogo)
const KNOWN_PAGES = {
    film: [
        'film.htm',
        ...Array.from({ length: 24 }, (_, i) => `film-${i + 1}.htm`),
        'film-corti.htm',
        'film-mini.htm'
    ],
    telefilm: [
        'telefilm.htm',
        ...Array.from({ length: 24 }, (_, i) => `telefilm-${i + 1}.htm`)
    ],
    anim: [
        'anim.htm',
        ...Array.from({ length: 24 }, (_, i) => `anim-${i + 1}.htm`),
        'anim-film.htm'
    ],
    soap: [
        'soap.htm',
        'soap-s.htm',
        'soap-t.htm'
    ]
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ponytail: TTL unico + mtime come unico stato. Il ceiling è che una pagina può restare stantia fino a 48 h e che il refresh costa 21 richieste anche quando nulla è cambiato. Upgrade path se serve: conditional GET (If-Modified-Since) con il Last-Modified di risposta salvato in un sidecar — solo allora vale un file di metadati.
function selectPagesForRefresh(allPages, cacheDir, fallbackDirs = [], minBytes = 500, options = {}) {
    const nowMs = typeof options.now === 'number'
        ? options.now
        : (typeof options.nowFn === 'function' ? options.nowFn() : Date.now());
    const ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_TTL_MS;
    const forceRefresh = Boolean(options.forceRefresh);
    const maxRefresh = forceRefresh
        ? Infinity
        : (typeof options.maxRefreshPerRun === 'number'
            ? options.maxRefreshPerRun
            : Math.ceil(allPages.length / 4));

    const missing = new Set();
    const staleCandidates = [];

    for (const item of allPages) {
        const page = typeof item === 'string' ? item : item.page;
        const cachedPath = findCachedFile(page, cacheDir, fallbackDirs, minBytes);
        if (!cachedPath) {
            missing.add(page);
            continue;
        }

        let mtimeMs = 0;
        try {
            mtimeMs = fs.statSync(cachedPath).mtimeMs;
        } catch (_) {
            mtimeMs = 0;
        }

        if (forceRefresh || (nowMs - mtimeMs) >= ttlMs) {
            staleCandidates.push({ page, mtimeMs });
        }
    }

    staleCandidates.sort((a, b) => (a.mtimeMs - b.mtimeMs) || a.page.localeCompare(b.page));
    const selectedStale = new Set(
        staleCandidates.slice(0, Math.max(0, maxRefresh)).map((c) => c.page)
    );

    return { missing, selectedStale, totalStale: staleCandidates.length };
}

/**
 * Trova il file di cache se esiste nella directory primaria o nei fallback.
 * @param {string} pageName 
 * @param {string} cacheDir 
 * @param {string[]} [fallbackDirs=[]] 
 * @param {number} [minBytes=500] 
 * @returns {string|null}
 */
function findCachedFile(pageName, cacheDir, fallbackDirs = [], minBytes = 500) {
    const candidates = [
        path.join(cacheDir, pageName),
        path.join(cacheDir, pageName.replace(/\//g, '__')),
        ...fallbackDirs.flatMap((dir) => [
            path.join(dir, pageName),
            path.join(dir, pageName.replace(/\//g, '__'))
        ])
    ];

    for (const cand of candidates) {
        if (fs.existsSync(cand)) {
            try {
                const stat = fs.statSync(cand);
                if (stat.size >= minBytes) {
                    return cand;
                }
            } catch (_) {
                // ignora e prova successivo
            }
        }
    }
    return null;
}

/**
 * Decodifica una pagina HTML.
 * ponytail: il sito è passato a UTF-8 (header `charset=UTF-8`) mentre le pagine ancora in cache
 * sono windows-1252. Si prova UTF-8 e si ripiega solo se compaiono caratteri di sostituzione.
 * Ceiling: un file cp1252 valido anche come UTF-8 è solo-ASCII e decodifica uguale (caso innocuo).
 * @param {Buffer} buf
 * @returns {string}
 */
function decodeHtml(buf) {
    const utf8 = new TextDecoder('utf-8').decode(buf);
    if (!utf8.includes('\uFFFD')) return utf8;
    return new TextDecoder('windows-1252').decode(buf);
}

/**
 * Legge e decodifica una pagina HTML dalla cache.
 * @param {string} filePath 
 * @returns {string}
 */
function readHtmlFile(filePath) {
    return decodeHtml(fs.readFileSync(filePath));
}

/**
 * Estrae i link alle pagine-lettera dall'HTML di una pagina di zona.
 * @param {string} html 
 * @param {string} zone 
 * @returns {string[]}
 */
function extractLetterPages(html, zone) {
    const re = /href\s*=\s*["']?([^"'\s>]+)["']?/gi;
    const found = new Set();
    let m;
    while ((m = re.exec(html))) {
        const link = m[1].trim();
        // Esclude telefilmnews e file css o estranei
        if (new RegExp(`^${zone}-(?!news)[\\w.-]*\\.htm$`, 'i').test(link) && !/\.css$/i.test(link)) {
            found.add(link);
        }
    }
    return Array.from(found);
}

/**
 * Scarica o legge dalla cache tutte le pagine d'indice delle 4 zone.
 * @param {object} [options]
 * @param {string} [options.cacheDir] Cartella di destinazione per la cache
 * @param {string[]} [options.fallbackDirs] Cartelle aggiuntive di cache in lettura
 * @param {number} [options.delayMs=800] Ritardo tra richieste di rete
 * @param {string} [options.userAgent] User-Agent
 * @param {boolean} [options.forceRefresh=false] Ignora la cache e riscarica
 * @param {number} [options.minBytes=500] Dimensione minima per considerare valida una pagina
 * @param {function} [options.onProgress] Callback per progresso (page, index, total, fromCache)
 * @returns {Promise<Array<{ page: string, zone: string, html: string, filePath: string, fromCache: boolean }>>}
 */
async function fetchAllIndices(options = {}) {
    const cacheDir = options.cacheDir || path.resolve(__dirname, '..', '.cache', 'indici');
    const fallbackDirs = options.fallbackDirs || [
        path.resolve(__dirname, '..', '..', '..', '.scratch', 'doppiaggio-ita', 'tmp')
    ];
    const delayMs = typeof options.delayMs === 'number' ? options.delayMs : DEFAULT_DELAY_MS;
    const userAgent = options.userAgent || DEFAULT_UA;
    const forceRefresh = Boolean(options.forceRefresh);
    const minBytes = typeof options.minBytes === 'number' ? options.minBytes : 500;
    const fetchImpl = options.fetch || globalThis.fetch;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    fs.mkdirSync(cacheDir, { recursive: true });

    let netRequests = 0;

    const allPagesToFetch = [];
    if (Array.isArray(options.pages)) {
        for (const item of options.pages) {
            allPagesToFetch.push(typeof item === 'string' ? { page: item, zone: 'film' } : item);
        }
    } else {
        for (const zone of ZONES) {
            const knownList = KNOWN_PAGES[zone] || [`${zone}.htm`];
            for (const p of knownList) {
                if (!allPagesToFetch.some((item) => item.page === p)) {
                    allPagesToFetch.push({ page: p, zone });
                }
            }
        }
    }

    const plan = selectPagesForRefresh(allPagesToFetch, cacheDir, fallbackDirs, minBytes, options);

    async function fetchPage(pageName) {
        const cachedPath = findCachedFile(pageName, cacheDir, fallbackDirs, minBytes);
        const shouldRefresh = plan.missing.has(pageName) || plan.selectedStale.has(pageName);

        if (cachedPath && !shouldRefresh) {
            return {
                html: readHtmlFile(cachedPath),
                filePath: cachedPath,
                fromCache: true
            };
        }

        netRequests++;
        const targetPath = path.join(cacheDir, pageName.replace(/\//g, '__'));
        const url = BASE_URL + pageName;

        try {
            const res = await fetchImpl(url, {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml'
                }
            });

            if (!res.ok) {
                throw new Error(`Richiesta fallita per ${url}: HTTP ${res.status} ${res.statusText}`);
            }

            const arrayBuf = await res.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            if (buf.length < minBytes) {
                throw new Error(`Risposta troppo breve per ${url} (${buf.length} bytes < ${minBytes})`);
            }

            const tmpPath = `${targetPath}.tmp.${process.pid}`;
            fs.writeFileSync(tmpPath, buf);
            fs.renameSync(tmpPath, targetPath);
            const html = decodeHtml(buf);

            if (delayMs > 0) {
                await sleep(delayMs);
            }

            return {
                html,
                filePath: targetPath,
                fromCache: false
            };
        } catch (err) {
            if (cachedPath) {
                console.warn(`[Indici] Avviso: Impossibile aggiornare ${pageName} (${err.message}), riuso copia in cache`);
                return {
                    html: readHtmlFile(cachedPath),
                    filePath: cachedPath,
                    fromCache: true
                };
            }
            throw err;
        }
    }

    const results = [];
    for (let i = 0; i < allPagesToFetch.length; i++) {
        const item = allPagesToFetch[i];
        try {
            const pageData = await fetchPage(item.page);
            results.push({
                page: item.page,
                zone: item.zone,
                html: pageData.html,
                filePath: pageData.filePath,
                fromCache: pageData.fromCache
            });
            onProgress({
                page: item.page,
                index: i + 1,
                total: allPagesToFetch.length,
                fromCache: pageData.fromCache,
                netRequests
            });
        } catch (err) {
            console.warn(`[Indici] Avviso: Impossibile scaricare ${item.page}: ${err.message}`);
        }
    }

    return results;
}

module.exports = {
    BASE_URL,
    DEFAULT_UA,
    DEFAULT_DELAY_MS,
    DEFAULT_TTL_MS,
    ZONES,
    KNOWN_PAGES,
    findCachedFile,
    readHtmlFile,
    decodeHtml,
    extractLetterPages,
    selectPagesForRefresh,
    fetchAllIndices
};
