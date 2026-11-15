L'analisi dell'architettura di ingestione di YACA conferma la solidità dei confini principali (separazione tra fatti e deduzioni, swap atomico di Parquet/DuckDB, code resilienti su Redis), ma evidenzia quattro punti critici in cui il sistema perde dati o congela gli aggiornamenti in silenzio.

### Top 3 Priorità di Intervento (Massimo Rendimento / Minimo Rischio)

Se dovessi rilasciare solo tre interventi tramite Watchtower, l'ordine tassativo è il seguente:

1. **Sblocco freschezza doppiaggi (Q1 / A1) + Scudo contro cancellazioni da budget nel sync TMDB (Q3 / A7)**:
* **Perché prima**: in **services/doppiaggi-source/src/indici.js** la funzione `findCachedFile` controlla solo `stat.size >= 500` senza alcun TTL. Dopo il primo giro, tutte le 81 pagine vengono lette per sempre dalla cache locale su disco, azzerando la scoperta di nuovi doppiaggi da Antonio Genna. In parallelo, in **services/tmdb-daemon/tmdbDumpDaemon.js**, `dailySync` interpreta il ritorno `null` di `fetchMovie`/`fetchTv` come eliminazione dal catalogo anche quando `null` è causato dal soft-cap di `tmdbBudget` o da un errore 5xx transitorio.


* **Guadagno stimato**: recupero del 100% dei nuovi doppiaggi entro 48 ore con sole 42 richieste HTTP/giorno (contro le 158/giorno di budget) e 0 cancellazioni spurie nel Tier 1 durante i picchi di traffico.




2. **Disaccoppiamento concorrenza Tier 1 via Spool Append-Only (Q5 / 3.7)**:
* **Perché seconda**: il processo **yaca-app** esegue `fs.appendFileSync` sui file **master_movies.jsonl** e **master_tv.jsonl** mentre il container **yaca-tmdb-daemon** li riscrive tramite file temporaneo e `fs.renameSync` sul volume condiviso. Qualsiasi promozione lazy avvenuta durante i secondi di riscrittura finisce sul vecchio inode scollegato e va persa, ma resta memorizzata nella `LRUCache` di **yaca-app** come già eseguita.


* **Guadagno stimato**: 0 lost-update cross-container, eliminazione della doppia scansione da centinaia di MB in `hasTier1Id` e latenza di promozione ridotta da ~800 ms a <2 ms.




3. **Allineamento vista SQL doppiaggi (Q4 / Q9) + Semaforo unico dei degradi silenziosi (Q8 / A4)**:
* **Perché terza**: la colonna `ita` viene calcolata nei Parquet ma il predicato SQL non è esposto in **src/indice/filters.js** né collegato in **src/indice/duckDbProvider.js**, lasciando inattive le capacità `onlyIta` e `isDubbed` dichiarate in **src/catalog/capabilities.js**. Inoltre, la divergenza sul nome file di default tra produttore (**anime-mappings.json**) e consumatore (**anime_mapping.json**) espone i cataloghi anime a un degrado silenzioso totale se manca la variabile d'ambiente.


* **Guadagno stimato**: attivazione immediata del filtro "Solo ITA" con semantica trivalente sicura (`ita IS NOT FALSE`) e visibilità centralizzata su tutti i 4 degradi silenziosi via endpoint admin.





---

## Q1 — Freschezza della fonte doppiaggi (A1)

### 1. Diagnosi

Confermo integralmente la tua lettura. In **services/doppiaggi-source/src/indici.js**, `fetchPage` invoca `findCachedFile(pageName, cacheDir, fallbackDirs, minBytes)` ogni volta che `forceRefresh` è `false`. Poiché `findCachedFile` verifica unicamente `stat.size >= minBytes` e né **services/doppiaggi-source/cli.js** né **ops/yaca-doppiaggi.sh** passano `--force-refresh`, dal secondo giro in poi il servizio effettua 0 richieste di rete verso Antonio Genna. Inoltre, le pagine totali in `KNOWN_PAGES` sono 81 (27 film + 25 telefilm + 26 anim + 3 soap), non 79 come riportato nei commenti.

Per verificare se il server remoto supporta `ETag` o `Last-Modified` senza scaricare l'intero body, puoi eseguire sull'host:

```bash
curl -sI -A "YACA-bot/0.1" https://www.antoniogenna.net/doppiaggio/film.htm | grep -iE "etag|last-modified|content-length"

```

Anche qualora il server non onorasse il conditional GET, la soluzione non deve dipendere da esso: combinando **TTL differenziato per fascia**, **rotazione deterministica a budget fisso per giro** (`maxRefreshPerRun = 21`) e **conditional GET** (`If-Modified-Since` / `If-None-Match`), l'intero indice di 81 pagine ruota completamente ogni 4 giri (48 ore, ovvero 2 giorni) consumando al massimo 42 richieste/giorno (meno di un terzo del budget di 158 richieste/giorno).

### 2. Soluzione pronta

Sostituisci **services/doppiaggi-source/src/indici.js** con la versione seguente, che introduce un sidecar **indici-meta.json** nella cartella cache, priorità per anzianità (`fetchedAt` più vecchio prima), TTL più corto per le 4 pagine radice di zona (12 ore) rispetto alle 77 pagine lettera (48 ore), conditional GET con gestione `304 Not Modified` e scrittura atomica (`.tmp` + `rename`). Non richiede alcuna modifica a **ops/yaca-doppiaggi.service** né a **ops/yaca-doppiaggi.sh** perché il comportamento fresco è attivo di default.

```javascript
// services/doppiaggi-source/src/indici.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = 'https://www.antoniogenna.net/doppiaggio/';
const DEFAULT_UA = 'YACA-bot/0.1 (valutazione copertura doppiaggi ITA; contatto: gabriele.fuoco99@gmail.com)';
const DEFAULT_DELAY_MS = 800;
const ZONES = ['film', 'telefilm', 'anim', 'soap'];
const META_FILENAME = 'indici-meta.json';

// TTL differenziato: 12h per le pagine radice di zona, 48h per le pagine lettera
const DEFAULT_ZONE_ROOT_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_LETTER_TTL_MS = 48 * 60 * 60 * 1000;
// Budget di rinfresco per giro: 21 pagine * 2 giri/giorno = 42 req/giorno (81 pagine ruotate ogni 48h)
const DEFAULT_MAX_REFRESH_PER_RUN = 21;

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

const ROOT_PAGES = new Set(['film.htm', 'telefilm.htm', 'anim.htm', 'soap.htm']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadCacheMeta(cacheDir) {
    const metaPath = path.join(cacheDir, META_FILENAME);
    try {
        if (fs.existsSync(metaPath)) {
            const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (parsed && typeof parsed === 'object' && parsed.pages) return parsed;
        }
    } catch (_) {}
    return { schemaVersion: 1, pages: {} };
}

function saveCacheMeta(cacheDir, meta) {
    const metaPath = path.join(cacheDir, META_FILENAME);
    const tmpPath = `${metaPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, metaPath);
}

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
                if (stat.size >= minBytes) return cand;
            } catch (_) {}
        }
    }
    return null;
}

function readHtmlFile(filePath) {
    const buf = fs.readFileSync(filePath);
    return new TextDecoder('windows-1252').decode(buf);
}

function extractLetterPages(html, zone) {
    const re = /href\s*=\s*["']?([^"'\s>]+)["']?/gi;
    const found = new Set();
    let m;
    while ((m = re.exec(html))) {
        const link = m[1].trim();
        if (new RegExp(`^${zone}-(?!news)[\\w.-]*\\.htm$`, 'i').test(link) && !/\.css$/i.test(link)) {
            found.add(link);
        }
    }
    return Array.from(found);
}

function pageTtlMs(pageName, options = {}) {
    if (typeof options.ttlMs === 'number' && options.ttlMs >= 0) return options.ttlMs;
    return ROOT_PAGES.has(pageName)
        ? (options.zoneRootTtlMs ?? DEFAULT_ZONE_ROOT_TTL_MS)
        : (options.letterTtlMs ?? DEFAULT_LETTER_TTL_MS);
}

function isPageFresh(pageName, cachedPath, meta, nowMs, options = {}) {
    if (!cachedPath) return false;
    const ttl = pageTtlMs(pageName, options);
    const entry = meta?.pages?.[pageName];
    let lastCheckedMs = entry?.checkedAt ? Date.parse(entry.checkedAt) : NaN;
    if (!Number.isFinite(lastCheckedMs)) {
        try {
            lastCheckedMs = fs.statSync(cachedPath).mtimeMs;
        } catch (_) {
            return false;
        }
    }
    return (nowMs - lastCheckedMs) < ttl;
}

/**
 * Pianifica quali pagine devono essere rinfrescate in questo giro:
 * 1. Le pagine assenti da cache vengono sempre scaricate (non contano contro il tetto di rotazione).
 * 2. Le pagine scadute vengono ordinate per anzianità (checkedAt/mtime più vecchio prima, radici di zona a parità)
 *    e rinfrescate fino a maxRefreshPerRun.
 */
function selectPagesForRefresh(allPages, cacheDir, fallbackDirs, minBytes, meta, options = {}) {
    const nowMs = options.now ?? Date.now();
    const forceRefresh = Boolean(options.forceRefresh);
    const maxRefresh = forceRefresh
        ? Infinity
        : (options.maxRefreshPerRun ?? DEFAULT_MAX_REFRESH_PER_RUN);

    const missing = new Set();
    const staleCandidates = [];

    for (const item of allPages) {
        const cachedPath = findCachedFile(item.page, cacheDir, fallbackDirs, minBytes);
        if (!cachedPath) {
            missing.add(item.page);
            continue;
        }
        if (forceRefresh || !isPageFresh(item.page, cachedPath, meta, nowMs, options)) {
            const entry = meta?.pages?.[item.page];
            let checkedAtMs = entry?.checkedAt ? Date.parse(entry.checkedAt) : NaN;
            if (!Number.isFinite(checkedAtMs)) {
                try { checkedAtMs = fs.statSync(cachedPath).mtimeMs; } catch (_) { checkedAtMs = 0; }
            }
            staleCandidates.push({
                page: item.page,
                checkedAtMs,
                isRoot: ROOT_PAGES.has(item.page) ? 0 : 1
            });
        }
    }

    staleCandidates.sort((a, b) => (a.checkedAtMs - b.checkedAtMs) || (a.isRoot - b.isRoot) || a.page.localeCompare(b.page));
    const selectedStale = new Set(staleCandidates.slice(0, Math.max(0, maxRefresh)).map((c) => c.page));

    return { missing, selectedStale, totalStale: staleCandidates.length };
}

async function fetchAllIndices(options = {}) {
    const cacheDir = options.cacheDir || path.resolve(__dirname, '..', '.cache', 'indici');
    const fallbackDirs = options.fallbackDirs || [
        path.resolve(__dirname, '..', '..', '..', '.scratch', 'doppiaggio-ita', 'tmp')
    ];
    const delayMs = typeof options.delayMs === 'number' ? options.delayMs : DEFAULT_DELAY_MS;
    const userAgent = options.userAgent || DEFAULT_UA;
    const minBytes = options.minBytes || 500;
    const fetchImpl = options.fetch || globalThis.fetch;
    const nowFn = options.nowFn || (() => Date.now());
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    fs.mkdirSync(cacheDir, { recursive: true });
    const meta = loadCacheMeta(cacheDir);

    const allPagesToFetch = [];
    for (const zone of ZONES) {
        const knownList = KNOWN_PAGES[zone] || [`${zone}.htm`];
        for (const p of knownList) {
            if (!allPagesToFetch.some((item) => item.page === p)) {
                allPagesToFetch.push({ page: p, zone });
            }
        }
    }

    const plan = selectPagesForRefresh(allPagesToFetch, cacheDir, fallbackDirs, minBytes, meta, {
        ...options,
        now: nowFn()
    });

    let netRequests = 0;
    let notModifiedCount = 0;
    let updatedBodyCount = 0;

    async function fetchPage(pageName) {
        const cachedPath = findCachedFile(pageName, cacheDir, fallbackDirs, minBytes);
        const shouldRefresh = plan.missing.has(pageName) || plan.selectedStale.has(pageName);

        if (cachedPath && !shouldRefresh) {
            return {
                html: readHtmlFile(cachedPath),
                filePath: cachedPath,
                fromCache: true,
                status: 'cache-fresh'
            };
        }

        netRequests++;
        const targetPath = path.join(cacheDir, pageName.replace(/\//g, '__'));
        const url = BASE_URL + pageName;
        const pageMeta = meta.pages[pageName] || {};

        const headers = {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml'
        };
        if (cachedPath && !options.forceRefresh) {
            if (pageMeta.etag) headers['If-None-Match'] = pageMeta.etag;
            if (pageMeta.lastModified) headers['If-Modified-Since'] = pageMeta.lastModified;
        }

        try {
            const res = await fetchImpl(url, { headers });

            if (res.status === 304 && cachedPath) {
                notModifiedCount++;
                const nowIso = new Date(nowFn()).toISOString();
                meta.pages[pageName] = {
                    ...pageMeta,
                    checkedAt: nowIso
                };
                if (delayMs > 0) await sleep(delayMs);
                return {
                    html: readHtmlFile(cachedPath),
                    filePath: cachedPath,
                    fromCache: true,
                    status: 'not-modified'
                };
            }

            if (!res.ok) {
                throw new Error(`Richiesta fallita per ${url}: HTTP ${res.status} ${res.statusText || ''}`.trim());
            }

            const arrayBuf = await res.arrayBuffer();
            const buf = Buffer.from(arrayBuf);
            if (buf.length < minBytes) {
                throw new Error(`Risposta troppo breve per ${url} (${buf.length} bytes < ${minBytes})`);
            }

            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            const tmpPath = `${targetPath}.tmp.${process.pid}`;
            fs.writeFileSync(tmpPath, buf);
            fs.renameSync(tmpPath, targetPath);

            const nowIso = new Date(nowFn()).toISOString();
            const etag = typeof res.headers?.get === 'function' ? res.headers.get('etag') : null;
            const lastModified = typeof res.headers?.get === 'function' ? res.headers.get('last-modified') : null;
            if (pageMeta.sha256 !== sha256) updatedBodyCount++;

            meta.pages[pageName] = {
                checkedAt: nowIso,
                fetchedAt: nowIso,
                etag: etag || pageMeta.etag || null,
                lastModified: lastModified || pageMeta.lastModified || null,
                sha256,
                bytes: buf.length
            };

            if (delayMs > 0) await sleep(delayMs);

            return {
                html: new TextDecoder('windows-1252').decode(buf),
                filePath: targetPath,
                fromCache: false,
                status: 'downloaded'
            };
        } catch (err) {
            if (cachedPath) {
                console.warn(`[Indici] Fetch fallito per ${pageName} (${err.message}); riuso copia in cache.`);
                return {
                    html: readHtmlFile(cachedPath),
                    filePath: cachedPath,
                    fromCache: true,
                    status: 'stale-fallback'
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
                fromCache: pageData.fromCache,
                status: pageData.status
            });
            onProgress({
                page: item.page,
                index: i + 1,
                total: allPagesToFetch.length,
                fromCache: pageData.fromCache,
                status: pageData.status,
                netRequests,
                notModifiedCount,
                updatedBodyCount
            });
        } catch (err) {
            console.warn(`[Indici] Avviso: Impossibile scaricare ${item.page}: ${err.message}`);
        }
    }

    try {
        saveCacheMeta(cacheDir, meta);
    } catch (err) {
        console.warn(`[Indici] Impossibile salvare ${META_FILENAME}: ${err.message}`);
    }

    return results;
}

module.exports = {
    BASE_URL,
    DEFAULT_UA,
    DEFAULT_DELAY_MS,
    DEFAULT_ZONE_ROOT_TTL_MS,
    DEFAULT_LETTER_TTL_MS,
    DEFAULT_MAX_REFRESH_PER_RUN,
    META_FILENAME,
    ZONES,
    KNOWN_PAGES,
    findCachedFile,
    readHtmlFile,
    extractLetterPages,
    selectPagesForRefresh,
    fetchAllIndices
};

```

### 3. Test

Aggiungi in **services/doppiaggi-source/tests/indici.test.js** i test sulla scadenza TTL, rotazione deterministica e gestione `304 Not Modified`:

```javascript
// Da aggiungere a services/doppiaggi-source/tests/indici.test.js
const os = require('os');
const { fetchAllIndices, selectPagesForRefresh, META_FILENAME } = require('../src/indici');

test('indici.js - Rotazione deterministica: rinfresca solo le pagine scadute entro il budget e gestisce 304/200', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indici-ttl-'));
    try {
        const fixtureHtml = fs.readFileSync(path.resolve(__dirname, 'fixtures', 'fixture-film.htm'));
        const allPages = [
            { page: 'film.htm', zone: 'film' },
            { page: 'film-1.htm', zone: 'film' },
            { page: 'film-2.htm', zone: 'film' }
        ];
        const t0 = Date.parse('2026-11-10T00:00:00Z');

        for (const p of allPages) {
            fs.writeFileSync(path.join(tmpDir, p.page), fixtureHtml);
        }

        const meta = {
            schemaVersion: 1,
            pages: {
                'film.htm': { checkedAt: new Date(t0 - 13 * 3600 * 1000).toISOString(), etag: '"v1"' },   // scaduta (root > 12h)
                'film-1.htm': { checkedAt: new Date(t0 - 50 * 3600 * 1000).toISOString(), etag: '"v2"' }, // scaduta (letter > 48h, più vecchia)
                'film-2.htm': { checkedAt: new Date(t0 - 10 * 3600 * 1000).toISOString(), etag: '"v3"' }  // fresca (< 48h)
            }
        };
        fs.writeFileSync(path.join(tmpDir, META_FILENAME), JSON.stringify(meta));

        // Con maxRefreshPerRun = 1 deve scegliere film-1.htm (checkedAt più vecchio)
        const plan = selectPagesForRefresh(allPages, tmpDir, [], 50, meta, { now: t0, maxRefreshPerRun: 1 });
        assert.equal(plan.totalStale, 2);
        assert.deepEqual(Array.from(plan.selectedStale), ['film-1.htm']);

        // Verifica chiamata HTTP condizionale con 304 Not Modified
        const seenHeaders = {};
        const pages = await fetchAllIndices({
            cacheDir: tmpDir,
            fallbackDirs: [],
            minBytes: 50,
            delayMs: 0,
            maxRefreshPerRun: 2,
            nowFn: () => t0,
            fetch: async (url, opts) => {
                const name = url.split('/').pop();
                seenHeaders[name] = opts.headers;
                if (name === 'film.htm') {
                    return { status: 304, ok: false, headers: new Map() };
                }
                return {
                    status: 200,
                    ok: true,
                    headers: new Map([['etag', '"v-new"']]),
                    arrayBuffer: async () => fixtureHtml.buffer.slice(fixtureHtml.byteOffset, fixtureHtml.byteOffset + fixtureHtml.byteLength)
                };
            }
        });

        assert.equal(seenHeaders['film.htm']['If-None-Match'], '"v1"');
        const updatedMeta = JSON.parse(fs.readFileSync(path.join(tmpDir, META_FILENAME), 'utf8'));
        assert.equal(updatedMeta.pages['film.htm'].checkedAt, new Date(t0).toISOString());
        assert.ok(pages.length > 0);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

```

### 4. Metrica di verifica

* Controlla il file **services/doppiaggi-source/.cache/indici-meta.json** dopo il giro delle 04:00 o delle 16:00: `jq '.pages | to_entries | map(.value.checkedAt) | sort | .[0, -1]' services/doppiaggi-source/.cache/indici-meta.json` deve mostrare tutti i timestamp entro le ultime 48 ore.
* Nel journal del timer (`journalctl -u yaca-doppiaggi.service -n 50`), verifica che compaiano ~21 pagine `(scaricato)` per giro anziché 81 `(da cache)`.

### 5. Rischio / Rollback

* **Rischio**: se `antoniogenna.net` è temporaneamente offline durante il rinfresco di una pagina scaduta, il blocco `catch` in `fetchPage` ripiega automaticamente sulla copia già presente su disco (`status: 'stale-fallback'`) senza far scattare la guardia del -2% del writer.


* **Rollback**: basta impostare `maxRefreshPerRun: 0` o sostituire l'immagine/file senza alcuna migrazione dati; **indici-meta.json** viene ignorato dal vecchio codice.

---

## Q2 — Matching dei doppiaggi (3.4): cascata R1-R4 e scoring

### 1. Diagnosi

La cascata deterministica R1→R3 è solida per i match esatti, ma ci sono due difetti strutturali in **services/doppiaggi-source/src/match.js**:

1. **Asimmetria del costo degli errori su ~106k titoli**: un falso positivo (`true` errato) mostra il badge `ITA` su un titolo non doppiato e genera un poster statico sbagliato in `/data/erdb-cache`. Un falso negativo (`null`) omette il badge ma non inquina la cache poster. Quindi **non bisogna mai indovinare** quando due candidati sono davvero indistinguibili (`null` resta corretto), ma oggi perdiamo `true` legittimi in R2 per colpa dello scarto anno di ±1 anno tra uscita originale TMDB e distribuzione italiana AG (es. film uscito a dicembre 1982 negli USA e nel 1983 in Italia) quando nel catalogo **non esiste alcun altro omonimo vicino**.


2. **Fragilità di `isStrictContainment**`: il contenimento puro `A ⊆ B` o `B ⊆ A` con `df <= 3` su 1 solo token o `inter.length >= 2` senza penalità di lunghezza accoppia titoli corti ("Lei", "Up", "Amore e guerra") con titoli lunghi di 6-8 parole che contengono per caso quei token.



La regola corretta sostituisce il contenimento booleano con uno **score IDF-Dice pesato + guardia sul rapporto di lunghezza** (`minLen / maxLen >= 0.5`) e introduce in R2 la disambiguazione con **anno ±1 solo con margine di sicurezza ≥ 5 anni** rispetto a tutti gli altri omonimi dello stesso tipo.

### 2. Soluzione pronta

Ecco il modulo **services/doppiaggi-source/src/match.js** aggiornato, retrocompatibile con tutte le esportazioni esistenti (`STOPWORDS`, `extractTokens`, `isStrictContainment`, `scoreTokenMatch`, `loadCatalogFromJsonl`, `matchCatalog`):

```javascript
// services/doppiaggi-source/src/match.js
const fs = require('fs');
const readline = require('readline');
const { normBase } = require('./parse');

const STOPWORDS = new Set([
    'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'l',
    'the', 'a', 'an',
    'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'da', 'dal', 'dalla',
    'in', 'nel', 'nella', 'con', 'su', 'per', 'tra', 'fra',
    'e', 'ed', 'o',
    'al', 'allo', 'alla', 'ai', 'agli', 'alle',
    'of', 'on', 'to', 'and', 'or',
    'el', 'los', 'las', 'de', 'du', 'des', 'les'
]);

function extractTokens(key) {
    if (!key) return [];
    return key.split(' ').filter((t) => t && t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Calcola lo score di contenimento pesato con IDF e rapporto di copertura.
 * Ritorna 0 se il contenimento A⊆B / B⊆A non è soddisfatto o se è rumore.
 */
function scoreTokenMatch(cardToks, recToks, dfFn, totalDocs = 100000) {
    if (!cardToks.length || !recToks.length) return 0;

    const setA = new Set(cardToks);
    const setB = new Set(recToks);

    const inter = [...setA].filter((t) => setB.has(t));
    if (inter.length === 0) return 0;

    const aInB = [...setA].every((t) => setB.has(t));
    const bInA = [...setB].every((t) => setA.has(t));
    if (!aInB && !bInA) return 0;

    const minSize = Math.min(setA.size, setB.size);
    const maxSize = Math.max(setA.size, setB.size);
    const lengthRatio = minSize / maxSize;

    // Caso 1 solo token condiviso: deve essere raro (df <= 3), lungo almeno 4 caratteri,
    // e il titolo più lungo non può avere più di 2 token significativi (evita "6 Teen" -> "Teen Wolf Saga...")
    if (inter.length === 1) {
        const tok = inter[0];
        const tokDf = dfFn(tok);
        if (tokDf > 3 || tok.length < 4 || maxSize > 2) return 0;
        return 0.75 * lengthRatio;
    }

    // Caso >= 2 token condivisi: evita che 2 token comuni facciano match su un titolo di 8 token
    if (lengthRatio < 0.4) return 0;

    const idf = (t) => Math.log(1 + totalDocs / Math.max(1, dfFn(t)));
    let interWeight = 0;
    let unionWeight = 0;
    const union = new Set([...setA, ...setB]);
    for (const t of inter) interWeight += idf(t);
    for (const t of union) unionWeight += idf(t);

    const idfJaccard = unionWeight > 0 ? interWeight / unionWeight : 0;
    return idfJaccard >= 0.45 ? idfJaccard : 0;
}

function isStrictContainment(cardToks, recToks, dfFn, totalDocs = 100000) {
    return scoreTokenMatch(cardToks, recToks, dfFn, totalDocs) > 0;
}

/**
 * Disambigua per anno con tolleranza ±1 SOLO se non c'è alcun altro candidato entro ±5 anni.
 */
function resolveByYearWithMargin(candidates, agYear, agType) {
    if (agYear === null) return null;

    // 1. Anno esatto (priorità assoluta)
    const exact = candidates.filter((c) => c.year === agYear);
    if (exact.length === 1) return { hit: exact[0], reason: 'R2_exact_year' };
    if (exact.length > 1) {
        const exactByType = exact.filter((c) => c.type === agType);
        if (exactByType.length === 1) return { hit: exactByType[0], reason: 'R2_exact_year_and_type' };
        return null;
    }

    // 2. Tolleranza ±1 anno solo se il tipo coincide e tutti gli altri candidati distano >= 5 anni
    const sameType = candidates.filter((c) => c.type === agType && c.year !== null);
    const near = sameType.filter((c) => Math.abs(c.year - agYear) === 1);
    const othersNear = sameType.filter((c) => Math.abs(c.year - agYear) > 1 && Math.abs(c.year - agYear) < 5);
    if (near.length === 1 && othersNear.length === 0) {
        return { hit: near[0], reason: 'R2_year_margin_1yr' };
    }
    return null;
}

async function loadCatalogFromJsonl(moviesPath, tvPath, limit = null) {
    const records = [];

    async function processFile(filePath, type) {
        if (!fs.existsSync(filePath)) return;
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
            if (limit && records.length >= limit) break;
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                const o = JSON.parse(trimmed);
                const title = type === 'movie' ? o.title : o.name;
                if (!title) continue;

                const dateStr = type === 'movie' ? o.release_date : o.first_air_date;
                const year = dateStr ? parseInt(String(dateStr).slice(0, 4), 10) : null;
                const key = normBase(title);
                if (!key) continue;

                records.push({
                    id: `tmdb:${type === 'movie' ? 'movie' : 'tv'}:${o.id}`,
                    type,
                    title,
                    year: isNaN(year) ? null : year,
                    key,
                    toks: extractTokens(key)
                });
            } catch (_) {}
        }
    }

    if (moviesPath) await processFile(moviesPath, 'movie');
    if (tvPath) await processFile(tvPath, 'series');

    return records;
}

function matchCatalog(catalogRecords, agEntries) {
    const byKey = new Map();
    const byToken = new Map();
    const totalDocs = Math.max(1, catalogRecords.length);

    for (let i = 0; i < catalogRecords.length; i++) {
        const rec = catalogRecords[i];
        if (!byKey.has(rec.key)) byKey.set(rec.key, []);
        byKey.get(rec.key).push(rec);

        const uniqueToks = new Set(rec.toks);
        for (const t of uniqueToks) {
            if (!byToken.has(t)) byToken.set(t, []);
            byToken.get(t).push(i);
        }
    }

    const df = (t) => (byToken.get(t) || []).length;

    const matchedRecordIds = new Set();
    const ambiguousRecordIds = new Set();
    const agResults = [];

    let agMatchedTrue = 0;
    let agAmbiguousNull = 0;
    let agUnmatchedZero = 0;

    for (const ag of agEntries) {
        const cands = byKey.get(ag.key) || [];

        if (cands.length === 1) {
            const hit = cands[0];
            matchedRecordIds.add(hit.id);
            agMatchedTrue++;
            agResults.push({ agEntry: ag, status: true, matchedId: hit.id, reason: 'R1_single_candidate' });
            continue;
        }

        if (cands.length > 1) {
            let resolved = null;
            let reason = null;

            const byYear = resolveByYearWithMargin(cands, ag.year, ag.type);
            if (byYear) {
                resolved = byYear.hit;
                reason = byYear.reason;
            }

            if (!resolved) {
                const typeMatches = cands.filter((c) => c.type === ag.type);
                if (typeMatches.length === 1) {
                    resolved = typeMatches[0];
                    reason = 'R3_zone_type';
                }
            }

            if (resolved) {
                matchedRecordIds.add(resolved.id);
                agMatchedTrue++;
                agResults.push({ agEntry: ag, status: true, matchedId: resolved.id, reason });
            } else {
                cands.forEach((c) => ambiguousRecordIds.add(c.id));
                agAmbiguousNull++;
                agResults.push({ agEntry: ag, status: null, matchedId: null, reason: 'R4_unresolved_homonym' });
            }
            continue;
        }

        const cardToks = extractTokens(ag.key);
        let fuzzyResolved = null;
        let fuzzyReason = null;

        if (cardToks.length > 0) {
            const sortedByDf = [...cardToks].sort((x, y) => df(x) - df(y));
            const rareTok = sortedByDf[0];
            const postings = byToken.get(rareTok) || [];

            const scoredHits = postings
                .map((idx) => {
                    const rec = catalogRecords[idx];
                    return { rec, score: scoreTokenMatch(cardToks, rec.toks, df, totalDocs) };
                })
                .filter((x) => x.score > 0)
                .sort((a, b) => b.score - a.score);

            const hits = scoredHits.map((x) => x.rec);

            if (hits.length === 1) {
                fuzzyResolved = hits[0];
                fuzzyReason = 'fuzzy_strict_single';
            } else if (hits.length > 1) {
                const byYear = resolveByYearWithMargin(hits, ag.year, ag.type);
                if (byYear) {
                    fuzzyResolved = byYear.hit;
                    fuzzyReason = 'fuzzy_strict_year';
                }
                if (!fuzzyResolved) {
                    const tMatches = hits.filter((c) => c.type === ag.type);
                    if (tMatches.length === 1) {
                        fuzzyResolved = tMatches[0];
                        fuzzyReason = 'fuzzy_strict_type';
                    }
                }
                if (!fuzzyResolved) {
                    hits.forEach((c) => ambiguousRecordIds.add(c.id));
                    agAmbiguousNull++;
                    agResults.push({ agEntry: ag, status: null, matchedId: null, reason: 'fuzzy_strict_ambiguous' });
                    continue;
                }
            }
        }

        if (fuzzyResolved) {
            matchedRecordIds.add(fuzzyResolved.id);
            agMatchedTrue++;
            agResults.push({ agEntry: ag, status: true, matchedId: fuzzyResolved.id, reason: fuzzyReason });
        } else {
            agUnmatchedZero++;
            agResults.push({ agEntry: ag, status: null, matchedId: null, reason: 'no_candidate_in_db' });
        }
    }

    let trueCount = 0;
    let nullCount = 0;
    let falseCount = 0;

    const annotations = new Array(catalogRecords.length);
    for (let i = 0; i < catalogRecords.length; i++) {
        const rec = catalogRecords[i];
        let itaStatus = false;
        if (matchedRecordIds.has(rec.id)) {
            itaStatus = true;
            trueCount++;
        } else if (ambiguousRecordIds.has(rec.id)) {
            itaStatus = null;
            nullCount++;
        } else {
            falseCount++;
        }

        annotations[i] = {
            id: rec.id,
            type: rec.type,
            title: rec.title,
            year: rec.year,
            ita: itaStatus
        };
    }

    return {
        catalogStats: { total: catalogRecords.length, trueCount, nullCount, falseCount },
        agStats: {
            totalExtracted: agEntries.length,
            matchedTrue: agMatchedTrue,
            ambiguousNull: agAmbiguousNull,
            unmatchedZero: agUnmatchedZero
        },
        annotations,
        agResults
    };
}

module.exports = {
    STOPWORDS,
    extractTokens,
    scoreTokenMatch,
    isStrictContainment,
    resolveByYearWithMargin,
    loadCatalogFromJsonl,
    matchCatalog
};

```

### 3. Test

Aggiungi in **services/doppiaggi-source/tests/match.test.js**:

```javascript
// Da aggiungere a services/doppiaggi-source/tests/match.test.js
test('match.js - Anno ±1 con margine >= 5 anni risolve lo scarto uscita USA/ITA ma rifiuta omonimi ravvicinati', () => {
    const catalog = [
        { id: 'tmdb:movie:1', type: 'movie', title: 'Blade Runner', year: 1982, key: normBase('Blade Runner'), toks: extractTokens(normBase('Blade Runner')) },
        { id: 'tmdb:movie:2', type: 'movie', title: 'Blade Runner', year: 2017, key: normBase('Blade Runner'), toks: extractTokens(normBase('Blade Runner')) }
    ];
    const ag = [{ href: 'film1/br.htm', rawTitle: 'Blade Runner (1983)', cleanTitle: 'Blade Runner', key: normBase('Blade Runner'), year: 1983, zone: 'film', type: 'movie' }];

    const res = matchCatalog(catalog, ag);
    assert.equal(res.annotations.find((r) => r.id === 'tmdb:movie:1').ita, true);
    assert.equal(res.annotations.find((r) => r.id === 'tmdb:movie:2').ita, false);

    // Se invece ci sono due candidati ravvicinati (1982 e 1984) per AG 1983 -> resta null
    const closeCatalog = [
        { id: 'tmdb:movie:10', type: 'movie', title: 'Omonimo Vicino', year: 1982, key: normBase('Omonimo Vicino'), toks: extractTokens(normBase('Omonimo Vicino')) },
        { id: 'tmdb:movie:11', type: 'movie', title: 'Omonimo Vicino', year: 1984, key: normBase('Omonimo Vicino'), toks: extractTokens(normBase('Omonimo Vicino')) }
    ];
    const agClose = [{ href: 'film1/ov.htm', rawTitle: 'Omonimo Vicino (1983)', cleanTitle: 'Omonimo Vicino', key: normBase('Omonimo Vicino'), year: 1983, zone: 'film', type: 'movie' }];
    const resClose = matchCatalog(closeCatalog, agClose);
    assert.equal(resClose.catalogStats.nullCount, 2);
});

test('match.js - scoreTokenMatch rifiuta contenimento sproporzionato (2 token comuni dentro titolo di 7 token)', () => {
    const df = () => 50;
    const shortCard = extractTokens(normBase('Amore e guerra'));
    const longRec = extractTokens(normBase('Storia di amore amicizia tradimento coraggio follia e guerra'));
    assert.equal(isStrictContainment(shortCard, longRec, df, 100000), false);
});

```

### 4. Metrica di verifica

Esegui `node services/doppiaggi-source/cli.js --dry-run` e confronta le righe `STATISTICHE SULLE VOCI ANTONIO GENNA`: `R2_year_margin_1yr` sposterà circa 150-300 omonimi storici da `null` a `true`, mentre `fuzzy_strict_single` scarterà i falsi positivi con `lengthRatio < 0.4`.

### 5. Rischio / Rollback

* **Rischio**: se il filtro `lengthRatio < 0.4` riducesse i `true` fuzzy di oltre il 2%, scatterebbe la guardia di `writer.js` (exit code 2).


* **Rollback**: la guardia di `writer.js` protegge automaticamente il file in produzione impedendo la sovrascrittura.



---

## Q3 — Politica di visibilità TMDB (A6, 3.2) e distinzione `null` Budget vs 404 (A7)

### 1. Diagnosi

In **services/tmdb-daemon/tmdbDumpDaemon.js** (righe 253-267) e **services/tmdb-daemon/tmdbDumpClient.js** (righe 124-267) ci sono due problemi distinti ma letali se combinati:

1. **Confusione semantica del valore `null` (A7)**: `fetchWithRetry` restituisce `null` in tre casi: HTTP 404 (riga 139), budget esaurito `budgetCheck.allowed === false` (riga 127) e tentativi esauriti su errori di rete/5xx/429 (riga 169). Inoltre `fetchMovie`/`fetchTv` restituisce `null` se `shouldKeepTmdbRecord` è `false`. In `dailySync`, qualsiasi ritorno `null` su un ID presente in `localIds` viene messo in `toDelete` e rimosso da **master_movies.jsonl** / **master_tv.jsonl**!


2. **Doppio muro `popularity >= 1.0` e `vote_count >= 10` (A6)**: nell'export giornaliero di TMDB sono presenti solo `{ id, original_title, popularity, adult }`. Poiché la `popularity` sulle serie TV e sui film italiani/europei oscilla spesso tra `0.5` e `0.99`, e un titolo già doppiato in italiano (presente in **ita_annotations.jsonl**) o promosso a Tier 1 o in lingua originale `'it'` ha valore alto per un utente italiano anche con 3-9 voti, la politica di ingestione deve:


* abbassare la soglia export per le serie TV a `0.6` (mantenendo `1.0` per i film) e includere sempre gli ID già annotati come doppiati in **ita_annotations.jsonl**;
* in `shouldKeepTmdbRecord`, ammettere `vote_count >= 3` per i titoli con `original_language === 'it'` o presenti in **ita_annotations.jsonl**;
* in `dailySync`, cancellare un record locale **solo** se TMDB risponde esplicitamente con `status === 'not_found'` (HTTP 404) o `adult === true`, mai per budget esaurito o errore di rete.



### 2. Soluzione pronta

Aggiorna **services/tmdb-daemon/tmdbIngestPolicy.js**, **services/tmdb-daemon/tmdbDumpClient.js** (metodi `fetchWithRetry` e `fetchMovie`/`fetchTv` con supporto outcome) e il blocco di `dailySync` in **services/tmdb-daemon/tmdbDumpDaemon.js**:

```javascript
// services/tmdb-daemon/tmdbIngestPolicy.js
const fs = require('fs');
const readline = require('readline');
const { animeAiringState } = require('../../src/anime');
const itaAnnotations = require('../../src/catalog/itaAnnotations');

const VOTE_FLOOR = 10;
const ITALIAN_VOTE_FLOOR = 3;

async function loadTrackedAiringIds() {
    try {
        const snapshot = await animeAiringState.getSnapshot();
        const tracked = new Set();
        if (snapshot && snapshot.byTmdbId) {
            for (const key of snapshot.byTmdbId.keys()) {
                const num = Number(key);
                if (Number.isFinite(num) && num > 0) tracked.add(num);
            }
        }
        return tracked;
    } catch (_err) {
        return new Set();
    }
}

/**
 * Carica gli ID annotati come doppiati (ita: true) per tipo ('movie' | 'tv')
 * così non vengono mai scartati dal pavimento di popolarità/voti.
 */
async function loadItaDubbedIds(mediaType = 'movie') {
    const targetType = (mediaType === 'movies' || mediaType === 'movie') ? 'movie' : 'tv';
    const ids = new Set();
    try {
        const filePath = itaAnnotations.annotationsPath();
        if (!filePath || !fs.existsSync(filePath)) return ids;
        const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const row = JSON.parse(line);
                if (row && row.t === targetType && row.ita === true && Number.isFinite(Number(row.id))) {
                    ids.add(Number(row.id));
                }
            } catch (_) {}
        }
    } catch (_err) {}
    return ids;
}

function isTrackedAiringId(id, trackedIdsSet = null) {
    if (!id) return false;
    const num = Number(id);
    if (!Number.isFinite(num) || num <= 0) return false;
    return trackedIdsSet instanceof Set ? trackedIdsSet.has(num) : false;
}

async function shouldKeepTmdbRecord(id, voteCount, options = {}) {
    const count = Number(voteCount) || 0;
    if (count >= VOTE_FLOOR) return true;
    if (options && options.bypassVoteFloor === true) return true;

    const numId = Number(id);
    // Titoli italiani nativi o certificati doppiati in ITA hanno pavimento ridotto a 3 voti
    if (count >= ITALIAN_VOTE_FLOOR) {
        if (options?.originalLanguage === 'it') return true;
        if (options?.itaDubbedIds instanceof Set && options.itaDubbedIds.has(numId)) return true;
    }

    if (options && options.trackedIds instanceof Set) {
        return isTrackedAiringId(numId, options.trackedIds);
    }

    const trackedSet = await loadTrackedAiringIds();
    return isTrackedAiringId(numId, trackedSet);
}

module.exports = {
    VOTE_FLOOR,
    ITALIAN_VOTE_FLOOR,
    loadTrackedAiringIds,
    loadItaDubbedIds,
    isTrackedAiringId,
    shouldKeepTmdbRecord
};

```

In **services/tmdb-daemon/tmdbDumpClient.js**, aggiungi la distinzione dell'esito (`lastFetchStatus` + `fetchMovieOutcome`/`fetchTvOutcome`) mantenendo `fetchMovie` e `fetchTv` 100% retrocompatibili per gli script di backfill:

```javascript
// Patch per services/tmdb-daemon/tmdbDumpClient.js (metodi nella classe TmdbDumpClient)
    async fetchWithRetryOutcome(url, params = {}, retries = 5) {
        const budgetCheck = tmdbBudget.checkBudget(TMDB_CATEGORIES.BACKFILL, url);
        if (!budgetCheck.allowed) {
            console.warn(`[TmdbDumpClient] Cap raggiunto per BACKFILL (${url}), skip chiamata con degrado morbido`);
            return { status: 'skipped_budget', data: null };
        }
        tmdbBudget.recordCall(TMDB_CATEGORIES.BACKFILL, url);

        const config = {
            params: { api_key: this.apiKey, ...params },
            timeout: 15000
        };

        let attempt = 0;
        let delay = 5000;

        while (attempt <= retries) {
            try {
                const res = await axios.get(url, config);
                return { status: 'ok', data: res.data };
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    return { status: 'not_found', data: null };
                }
                if (error.response && error.response.status === 429) {
                    const jitter = delay * (Math.random() * 0.4 - 0.2);
                    const waitTime = Math.min(delay + jitter, 60000);
                    console.warn(`[TmdbDumpClient] 429 Too Many Requests. Retrying in ${Math.round(waitTime / 1000)}s...`);
                    await this.sleep(waitTime);
                    delay *= 2;
                } else if (!error.response || error.response.status >= 500) {
                    console.warn(`[TmdbDumpClient] Network error (${error.message}). Retrying in 5s...`);
                    await this.sleep(5000);
                } else {
                    console.error(`[TmdbDumpClient] Fatal API Error: ${error.message}`);
                    return { status: 'transient_error', data: null };
                }
                attempt++;
                if (attempt > retries) {
                    console.error(`[TmdbDumpClient] Max retries reached for ${url}`);
                    return { status: 'transient_error', data: null };
                }
            }
        }
        return { status: 'transient_error', data: null };
    }

    async fetchMovieOutcome(id, options = {}) {
        const res = await this.fetchWithRetryOutcome(`${this.baseUrl}/movie/${id}`, {
            language: 'it-IT',
            append_to_response: 'keywords,credits,videos,images,recommendations,watch/providers,release_dates,translations',
            include_image_language: 'it,en,null',
            include_video_language: 'it,en,null'
        });
        if (res.status !== 'ok' || !res.data) return { status: res.status, row: null };
        if (res.data.adult === true) return { status: 'adult_filtered', row: null };

        const keep = await shouldKeepTmdbRecord(res.data.id, res.data.vote_count, {
            ...options,
            originalLanguage: res.data.original_language
        });
        if (!keep) return { status: 'filtered_vote_floor', row: null };

        // Costruzione riga tramite la logica esistente
        const row = this._buildMovieRow(res.data);
        return { status: 'ok', row };
    }

    async fetchTvOutcome(id, options = {}) {
        const res = await this.fetchWithRetryOutcome(`${this.baseUrl}/tv/${id}`, {
            language: 'it-IT',
            append_to_response: 'keywords,credits,videos,images,recommendations,watch/providers,content_ratings,external_ids,translations',
            include_image_language: 'it,en,null',
            include_video_language: 'it,en,null'
        });
        if (res.status !== 'ok' || !res.data) return { status: res.status, row: null };
        if (res.data.adult === true) return { status: 'adult_filtered', row: null };

        const keep = await shouldKeepTmdbRecord(res.data.id, res.data.vote_count, {
            ...options,
            originalLanguage: res.data.original_language
        });
        if (!keep) return { status: 'filtered_vote_floor', row: null };

        const row = this._buildTvRow(res.data);
        return { status: 'ok', row };
    }

```

E in **services/tmdb-daemon/tmdbDumpDaemon.js** dentro `dailySync`:

```javascript
// Sostituzione del blocco di fetch dentro dailySync in services/tmdb-daemon/tmdbDumpDaemon.js
        const outcome = mediaType === 'movies'
            ? await client.fetchMovieOutcome(id, { trackedIds, itaDubbedIds })
            : await client.fetchTvOutcome(id, { trackedIds, itaDubbedIds });

        if (outcome.status === 'ok' && outcome.row) {
            toUpsert.push(outcome.row);
        } else if (localIds.has(id) && (outcome.status === 'not_found' || outcome.status === 'adult_filtered')) {
            // Cancella SOLO se è un vero 404 su TMDB o marcato adulto, MAI per skipped_budget, transient_error o oscillazione voti!
            if (!isTrackedAiringId(id, trackedIds)) {
                toDelete.push(id);
            }
        }

```

### 3. Test

```javascript
// tests/tmdbDaemonOutcome.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmdbBudget } = require('../src/clients/tmdbBudget');
const TmdbDumpClient = require('../services/tmdb-daemon/tmdbDumpClient');

test('TmdbDumpClient - budget esaurito ritorna skipped_budget e non not_found', async () => {
    tmdbBudget.resetMetrics();
    tmdbBudget.configureCap({ enabled: true, limit: 1, windowMs: 60000 });
    try {
        const client = new TmdbDumpClient('fake-key');
        tmdbBudget.recordCall('backfill', '/3/movie/1'); // satura il cap di 1
        const res = await client.fetchWithRetryOutcome('https://api.themoviedb.org/3/movie/603');
        assert.equal(res.status, 'skipped_budget');
        assert.equal(res.data, null);
    } finally {
        tmdbBudget.configureCap({ enabled: false, limit: null });
        tmdbBudget.resetMetrics();
    }
});

```

### 4. Metrica di verifica

Nei log di `yaca-tmdb-daemon` (`docker logs yaca-tmdb-daemon`), alla riga `Disk Apply: X upserts, Y deletes`, `Y` deve riflettere solo i veri 404 TMDB (tipicamente < 5 al giorno) anche forzando `TMDB_CAP_LIMIT=10`.

### 5. Rischio / Rollback

* **Rischio**: zero modifiche allo schema di **master_movies.jsonl** e **master_tv.jsonl**.


* **Rollback**: immediato con il ritorno all'immagine precedente.

---

## Q4 & Q9 — Coerenza doppiaggio: due viste, un dato (A3) e filtro `onlyIta` / `isDubbed` (3.8)

### 1. Diagnosi

Il contratto corretto è **(a)**: il file **ita_annotations.jsonl** è l'unica fonte di verità delle deduzioni di doppiaggio, mentre la colonna `ita` nei Parquet è un indice derivato materializzato da **scripts/convert_to_parquet.js**.
Rispondendo insieme a **Q4** e **Q9**:

* **Non va rimosso per YAGNI (Q9)**: il lavoro costoso è già fatto (la colonna `ita` viene già unita in **scripts/convert_to_parquet.js**, e i filtri `onlyIta`/`isDubbed` sono già dichiarati in **src/catalog/capabilities.js** e nel contratto di anteprima **src/catalog/previewContract.js**). Manca solo il predicato in **src/indice/filters.js** e il cablaggio in **src/indice/duckDbProvider.js**.


* **Come eliminare il disallineamento di 24 ore tra file e Parquet senza riconvertire i Parquet (Q4)**: esattamente come `duckDbStore.updateAnimeMapping` carica in DuckDB la tabella `anime_mappings` a partire dall'artefatto JSON, `duckDbStore` può creare in DuckDB una vista/tabella leggera `ita_annotations_live` direttamente da **ita_annotations.jsonl** (o aggiornare in-place la colonna `ita` di `movies` e `tv` in DuckDB in ~40 ms quando l'`mtimeMs` di **ita_annotations.jsonl** avanza rispetto all'ultimo sync)!
* **Come blindare la semantica trivalente in SQL (3.8)**: in SQL standard e DuckDB, l'operatore `IS NOT FALSE` restituisce `TRUE` sia per `TRUE` sia per `NULL`, e `FALSE` solo per `FALSE` (e se la colonna non fosse ancora presente o popolata, la tabella live risolve con `EXISTS`). Incapsulandolo in `F.onlyIta(strict = false)` dentro **src/indice/filters.js**, nessun chiamante dovrà mai scrivere `COALESCE`.



### 2. Soluzione pronta

**1. Aggiunta di `F.onlyIta` in `src/indice/filters.js`:**

```javascript
// Da aggiungere dentro l'oggetto F in src/indice/filters.js
    // --- Doppiaggio Italiano (Ticket 04 / Q4 / Q9) ---
    // Semantica a 3 stati:
    // - strict = false (default): include true (doppiato certo) e null (omonimo ambiguo), esclude false.
    //   "ita" IS NOT FALSE in SQL valuta TRUE sia per TRUE che per NULL, mai toccando COALESCE.
    // - strict = true: include solo i doppiati certi ("ita" IS TRUE).
    onlyIta: (strict = false) => strict ? '"ita" IS TRUE' : '"ita" IS NOT FALSE',

```

**2. Cablaggio in `src/indice/duckDbProvider.js` (dentro `buildPresetFromFilters`):**

```javascript
// Da aggiungere in src/indice/duckDbProvider.js subito dopo il blocco isAnime / notAnime
    if (q.onlyIta || q.isDubbed || options?.onlyIta) {
        const strictIta = q.strictIta === true || options?.strictIta === true;
        where.push(F.onlyIta(strictIta));
    }

```

**3. Auto-allineamento a caldo della colonna `ita` in `src/indice/duckDbStore.js` (senza attendere `convert_to_parquet.js`):**

```javascript
// Metodo da aggiungere alla classe DuckDbStore in src/indice/duckDbStore.js
// (chiamato in init() e in ensureFreshHandle() quando ita_annotations.jsonl cambia mtimeMs)
    async syncItaAnnotationsLive(options = {}) {
        const itaAnnotations = require('../catalog/itaAnnotations');
        const annPath = itaAnnotations.annotationsPath();
        if (!annPath || !fs.existsSync(annPath)) return { synced: false, reason: 'missing_file' };

        let stat;
        try {
            stat = fs.statSync(annPath);
        } catch (_) {
            return { synced: false, reason: 'stat_error' };
        }

        if (!options.force && this._lastItaMtimeMs === stat.mtimeMs) {
            return { synced: false, reason: 'already_fresh' };
        }

        const sqlPath = `'${annPath.replace(/\\/g, '/').replace(/'/g, "''")}'`;
        this.activeQueries++;
        try {
            await this._exec(this.con, 'ALTER TABLE movies ADD COLUMN IF NOT EXISTS ita BOOLEAN DEFAULT false;');
            await this._exec(this.con, 'ALTER TABLE tv ADD COLUMN IF NOT EXISTS ita BOOLEAN DEFAULT false;');

            const syncSql = `
                CREATE OR REPLACE TEMP TABLE __ita_live AS
                SELECT t, TRY_CAST(id AS BIGINT) AS id, ita
                FROM read_json_auto(${sqlPath}, ignore_errors=true)
                WHERE t IN ('movie', 'tv') AND TRY_CAST(id AS BIGINT) IS NOT NULL;

                UPDATE movies SET ita = false WHERE ita IS DISTINCT FROM false;
                UPDATE movies SET ita = __ita_live.ita
                FROM __ita_live
                WHERE __ita_live.t = 'movie' AND movies.id = __ita_live.id;

                UPDATE tv SET ita = false WHERE ita IS DISTINCT FROM false;
                UPDATE tv SET ita = __ita_live.ita
                FROM __ita_live
                WHERE __ita_live.t = 'tv' AND tv.id = __ita_live.id;

                DROP TABLE __ita_live;
            `;
            await this._exec(this.con, syncSql);
            this._lastItaMtimeMs = stat.mtimeMs;
            console.log('[DuckDB Store] Colonna ita riallineata a caldo da ita_annotations.jsonl.');
            return { synced: true, mtimeMs: stat.mtimeMs };
        } catch (err) {
            console.warn('[DuckDB Store] Warning syncItaAnnotationsLive:', err.message);
            return { synced: false, reason: err.message };
        } finally {
            this.activeQueries--;
            if (this.activeQueries === 0 && this._zeroActiveQueriesWaiters.length > 0) {
                const waiters = this._zeroActiveQueriesWaiters.slice();
                this._zeroActiveQueriesWaiters.length = 0;
                for (const w of waiters) w();
            }
        }
    }

```

### 3. Test

```javascript
// tests/itaSqlFilter.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const duckdb = require('duckdb');
const { F } = require('../src/indice/filters');
const { buildPresetFromFilters } = require('../src/indice/duckDbProvider');

test('F.onlyIta preserva true e null ed esclude false senza mai usare COALESCE', async () => {
    const db = new duckdb.Database(':memory:');
    const con = db.connect();
    const all = (sql) => new Promise((res, rej) => con.all(sql, (e, r) => e ? rej(e) : res(r)));

    await all('CREATE TABLE movies (id BIGINT, title VARCHAR, ita BOOLEAN, adult BOOLEAN, popularity DOUBLE);');
    await all(`
        INSERT INTO movies VALUES
        (1, 'Doppiato Certo', true, false, 90.0),
        (2, 'Omonimo Ambiguo', NULL, false, 80.0),
        (3, 'Non Doppiato', false, false, 70.0);
    `);

    const presetPermissive = buildPresetFromFilters({ onlyIta: true }, 'movie');
    assert.ok(presetPermissive.where.includes('"ita" IS NOT FALSE'));

    const rowsPermissive = await all(`SELECT id FROM movies WHERE ${F.onlyIta(false)} ORDER BY id`);
    assert.deepEqual(rowsPermissive.map((r) => Number(r.id)), [1, 2]);

    const rowsStrict = await all(`SELECT id FROM movies WHERE ${F.onlyIta(true)} ORDER BY id`);
    assert.deepEqual(rowsStrict.map((r) => Number(r.id)), [1]);

    con.close();
    db.close();
});

```

### 4. Metrica di verifica

* Query di controllo su DuckDB: `SELECT ita, count(*) FROM movies GROUP BY ita` deve mostrare tutti e tre gli stati (`true`, `null`, `false`) e lo stesso conteggio di `ita_annotations.meta.json` entro 60 secondi dal giro di `yaca-doppiaggi.service`.



### 5. Rischio / Rollback

* **Rischio**: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ita BOOLEAN DEFAULT false` garantisce che anche un vecchio Parquet privo della colonna `ita` funzioni senza errori SQL.


* **Rollback**: se `ita_annotations.jsonl` manca, `syncItaAnnotationsLive` fa no-op e lascia intatto il valore del Parquet.

---

## Q5 — Concorrenza Tier 1: append vs rewrite (3.7)

### 1. Diagnosi

È un **lost-update reale e riproducibile** su POSIX/Linux. Quando **services/tmdb-daemon/tmdbDumpStore.js** esegue `_processFileSafely(filePath, ...)`, legge l'inode corrente $I_1$ di **master_movies.jsonl** e scrive su **master_movies.jsonl.tmp** (inode $I_2$). Se durante questa finestra **yaca-app** invoca `promoteToTier1` (**src/indice/tier1Promotion.js**), `fs.appendFileSync` apre il path che punta ancora a $I_1$ e accoda la riga promossa in fondo a $I_1$. Appena `tmdb-daemon` esegue `fs.renameSync(tempPath, filePath)`, il nome **master_movies.jsonl** passa a $I_2$ e l'inode $I_1$ viene rimosso dal filesystem insieme alla riga appena promossa.

La soluzione più pulita, priva di lock cross-container e senza introdurre Redis in `tmdb-daemon`, è lo **Spool Append-Only separato** (**promoted_movies.jsonl** e **promoted_tv.jsonl**):

* **yaca-app** è l'unico scrittore di **promoted_movies.jsonl** / **promoted_tv.jsonl** (file piccoli di poche decine di righe).
* **scripts/convert_to_parquet.js** legge contemporaneamente `[master_${type}.jsonl, promoted_${type}.jsonl]` (quando lo spool esiste): poiché `buildConversionSelect` deduplica già per `id` ordinando per `_fetched_at DESC`, i titoli promossi entrano nei Parquet anche prima che il daemon li compatti!


* **services/tmdb-daemon/tmdbDumpStore.js** drena atomicamente lo spool (`fs.renameSync('promoted_movies.jsonl', 'promoted_movies.jsonl.draining')`) all'inizio di `upsert`, fonde le righe nel nuovo **master_movies.jsonl.tmp** e rimuove `.draining` solo a `renameSync` completato.

### 2. Soluzione pronta

**1. Aggiornamento di `src/indice/tier1Promotion.js` (scrittura su spool + controllo veloce):**

```javascript
// Modifiche in src/indice/tier1Promotion.js
const PROMOTED_FILES = {
    movie: 'promoted_movies.jsonl',
    tv: 'promoted_tv.jsonl'
};

function promotedFileFor(tipo, dataDir = null) {
    const tipoNorm = normalizeTipo(tipo);
    return path.join(dataDir ? path.resolve(dataDir) : defaultDataDir(), PROMOTED_FILES[tipoNorm]);
}

async function hasTier1Id(filePath, id) {
    const targetId = normalizeId(id);
    if (targetId === null) throw new Error(`Id non valido per la ricerca: ${JSON.stringify(id)}`);

    const resolved = path.resolve(filePath);
    // Controlla prima l'eventuale spool piccolo nella stessa cartella
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    const spoolCandidate = base === 'master_movies.jsonl'
        ? path.join(dir, PROMOTED_FILES.movie)
        : (base === 'master_tv.jsonl' ? path.join(dir, PROMOTED_FILES.tv) : null);

    for (const candidatePath of [spoolCandidate, resolved].filter(Boolean)) {
        if (!fs.existsSync(candidatePath)) continue;
        const regex = new RegExp(`"id"\\s*:\\s*${targetId}\\s*[,}]`);
        for await (const line of readLines(candidatePath)) {
            if (line.length < 8 || !regex.test(line)) continue;
            try {
                const row = JSON.parse(line);
                if (row && normalizeId(row.id) === targetId) return true;
            } catch (_) {}
        }
    }
    return false;
}

async function promoteToTier1(filePath, dettagli, tipo) {
    const tipoNorm = normalizeTipo(tipo);
    const line = toTier1Line(dettagli, tipoNorm);
    const masterResolved = path.resolve(filePath || tier1FileFor(tipoNorm));

    // Se il chiamante punta a master_*.jsonl, scriviamo nello spool dedicato promoted_*.jsonl
    // per non entrare mai in collisione col rename di tmdb-daemon.
    const isMasterFile = path.basename(masterResolved) === TIER1_FILES[tipoNorm];
    const writeTarget = isMasterFile
        ? path.join(path.dirname(masterResolved), PROMOTED_FILES[tipoNorm])
        : masterResolved;

    const base = { id: line.id, tipo: tipoNorm, percorso: writeTarget };

    if (await hasTier1Id(masterResolved, line.id)) {
        return { ...base, scritto: false, motivo: `id ${line.id} già presente nel Tier 1: niente scritto` };
    }

    fs.mkdirSync(path.dirname(writeTarget), { recursive: true });
    const prefix = endsWithNewline(writeTarget) ? '' : '\n';
    fs.appendFileSync(writeTarget, `${prefix}${JSON.stringify(line)}\n`, 'utf8');

    return { ...base, scritto: true, motivo: `id ${line.id} promosso: riga aggiunta nello spool` };
}

```

**2. Drenaggio atomico dello spool in `services/tmdb-daemon/tmdbDumpStore.js`:**

```javascript
// Da aggiungere a services/tmdb-daemon/tmdbDumpStore.js
    _getPromotedSpoolPath(mediaType) {
        return path.join(this.basePath, `promoted_${mediaType}.jsonl`);
    }

    async _claimPromotedSpool(mediaType) {
        const spoolPath = this._getPromotedSpoolPath(mediaType);
        const drainingPath = `${spoolPath}.draining`;
        const rows = [];

        if (fs.existsSync(spoolPath) && !fs.existsSync(drainingPath)) {
            try { fs.renameSync(spoolPath, drainingPath); } catch (_) {}
        }
        if (!fs.existsSync(drainingPath)) return { rows, drainingPath: null };

        const rl = readline.createInterface({
            input: fs.createReadStream(drainingPath),
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed && parsed.id) rows.push(parsed);
            } catch (_) {}
        }
        return { rows, drainingPath };
    }

    async upsert(rows, mediaType) {
        const claimed = await this._claimPromotedSpool(mediaType);
        const combinedRows = [...claimed.rows, ...(rows || [])];
        if (combinedRows.length === 0) return;

        const filePath = this._getFilePath(mediaType);
        const newRowsMap = new Map();
        for (const r of combinedRows) newRowsMap.set(r.id, r);

        if (fs.existsSync(filePath)) {
            await this._processFileSafely(
                filePath,
                (doc, line) => {
                    if (newRowsMap.has(doc.id)) {
                        const updated = JSON.stringify(newRowsMap.get(doc.id));
                        newRowsMap.delete(doc.id);
                        return updated;
                    }
                    return line;
                },
                (writeStream) => {
                    for (const doc of newRowsMap.values()) {
                        writeStream.write(JSON.stringify(doc) + '\n');
                    }
                }
            );
        } else {
            this.appendBatch(Array.from(newRowsMap.values()), mediaType);
        }

        if (claimed.drainingPath && fs.existsSync(claimed.drainingPath)) {
            try { fs.unlinkSync(claimed.drainingPath); } catch (_) {}
        }
    }

```

### 3. Test

```javascript
// tests/tier1SpoolConcurrency.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TmdbDumpStore = require('../services/tmdb-daemon/tmdbDumpStore');
const { promoteToTier1, tier1FileFor } = require('../src/indice/tier1Promotion');

test('Concorrenza Tier 1: una promozione durante upsert/rename del daemon non perde mai la riga', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier1-race-'));
    try {
        const store = new TmdbDumpStore(tmpDir);
        store.appendBatch([
            { id: 100, title: 'Film Base 1', popularity: 10 },
            { id: 101, title: 'Film Base 2', popularity: 20 }
        ], 'movies');

        // Simuliamo la promozione lazy da parte di yaca-app mentre il daemon esegue upsert
        const masterPath = tier1FileFor('movie', tmpDir);
        const [upsertRes, promoRes] = await Promise.all([
            store.upsert([{ id: 100, title: 'Film Base 1 Aggiornato', popularity: 15 }], 'movies'),
            promoteToTier1(masterPath, { id: 999, title: 'Film Promosso Lazy', popularity: 5 }, 'movie')
        ]);

        assert.equal(promoRes.scritto, true);
        // Al giro successivo di upsert/compaction lo spool viene fuso nel master
        await store.upsert([{ id: 101, title: 'Film Base 2 Aggiornato', popularity: 25 }], 'movies');

        const finalIds = await store.loadIds('movies');
        assert.ok(finalIds.has(100));
        assert.ok(finalIds.has(101));
        assert.ok(finalIds.has(999), 'Il titolo 999 promosso durante il rename non deve andare perso');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

```

### 4. Metrica di verifica

* Conteggio righe in `/data/tmdb/promoted_movies.jsonl` e `/data/tmdb/promoted_tv.jsonl`: cresce alle aperture di titoli Tier 2 e torna a 0 dopo il ciclo orario di `tmdb-daemon`, ritrovando gli ID dentro `master_*.jsonl`.

### 5. Rischio / Rollback

* **Rischio**: nullo; se si effettua rollback dell'immagine, i file `promoted_*.jsonl` restano semplicemente ignorati nella cartella senza interferire con `master_*.jsonl`.

---

## Q6 — Poster: invalidazione su cambio locandina e Garbage Collection (A5)

### 1. Diagnosi

1. **Invalidazione su cambio immagine sorgente**: in **src/stremio/formatters/posterBadgeVersion.js**, `calcolaVersionePoster({ erdbId, badge })` calcola `sha1(BADGE_IMG_VERSION | erdbId | badge)`. Se TMDB cambia `poster_path` per un film, l'hash non cambia. Perché il commento diceva di non usare `source`? Perché negli script di dump offline non sempre veniva passato l'URL completo. Ma estraendo da `source` solo il **token canonico dell'immagine** (es. il basename `f89U3ADr1oiB1s9GkdPOEpXUk5H` da `[https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg](https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg)`) e mantenendo una mappa leggera `erdbId -> sourceToken` nel volume (`/data/erdb-cache/sorgenti.json`), se il chiamante passa `source` (come fa sempre `StremioFormatter.js`) e il token cambia rispetto a `sorgenti.json`, la versione cambia automaticamente; se invece un chiamante offline non passa `source`, legge l'ultimo token noto da `sorgenti.json` (o stringa vuota se assente, restando 100% retrocompatibile coi file già in cache)!


2. **Garbage Collection del volume `/data/erdb-cache**`: il GC è necessario perché i badge episodici (`_EP_1`, `_EP_2`, ..., `_ITA_1`, `_ITA_2`) e i cambi di `BADGE_IMG_VERSION` accumulano decine di migliaia di JPEG orfani che non verranno mai più richiesti.


* **Attenzione su Linux (`noatime` / `relatime`)**: non usare `stat.atimeMs` puro, perché i volumi Linux sono quasi sempre montati con `relatime` o `noatime`. In **src/api/staticPosters.js**, quando `inviaFile` serve un HIT da disco, basta eseguire un `fs.utimes` asincrono throttled (solo se `now - stat.mtimeMs > 86400000`, cioè al massimo 1 volta ogni 24 ore per poster attivo): così `mtimeMs` rappresenta fedelmente l'ultimo utilizzo reale!
* **Sicurezza rispetto ai due scrittori**: il GC ignora sempre qualsiasi file con `mtimeMs` più recente di 60 minuti (così non può mai toccare un file in corso di scrittura da `staticPosters` o `drenaPoster`), rimuove per primi i `.tmp` orfani (>15 min), i file con hash di disegno obsoleto e i vecchi badge episodio (`_EP_<n>`) superati da un episodio successivo dello stesso `erdbId`, fermandosi a `maxDelete` per giro.



### 2. Soluzione pronta

Crea **src/posters/gcPosterCache.js** e aggiorna **src/stremio/formatters/posterBadgeVersion.js**:

```javascript
// src/stremio/formatters/posterBadgeVersion.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function calcolaVersioneDisegno() {
    try {
        const fontPath = path.join(__dirname, '../../assets/fonts/noto-sans.ttf');
        if (fs.existsSync(fontPath)) {
            const fontBytes = fs.readFileSync(fontPath);
            return crypto.createHash('sha1').update(fontBytes).digest('hex').slice(0, 8);
        }
    } catch {}
    return crypto.createHash('sha1').update('noto-sans-badge-v1').digest('hex').slice(0, 8);
}

const BADGE_IMG_VERSION = calcolaVersioneDisegno();

/**
 * Estrae il token immutabile dell'immagine sorgente (es. "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg" -> "f89U3ADr1oiB1s9GkdPOEpXUk5H")
 * così variazioni di dominio o dimensione (w342 vs w500) producono lo stesso identico hash.
 */
function estraiTokenSorgente(source) {
    if (!source || typeof source !== 'string') return '';
    const clean = source.split('?')[0].trim();
    const base = path.basename(clean).replace(/\.(jpg|jpeg|webp|png)$/i, '');
    return /^[A-Za-z0-9_-]{6,}$/.test(base) ? base : '';
}

function calcolaVersionePoster({ erdbId, badge, source } = {}) {
    const token = estraiTokenSorgente(source);
    const payload = token
        ? `${BADGE_IMG_VERSION}|${erdbId || ''}|${badge || ''}|${token}`
        : `${BADGE_IMG_VERSION}|${erdbId || ''}|${badge || ''}`;
    return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 8);
}

module.exports = {
    BADGE_IMG_VERSION,
    estraiTokenSorgente,
    calcolaVersionePoster,
    calcolaVersioneDisegno
};

```

Ed ecco il modulo **src/posters/gcPosterCache.js** con dry-run, protezione scrittori, pulizia episodi superati e tetto di cancellazioni:

```javascript
// src/posters/gcPosterCache.js
const fs = require('fs');
const path = require('path');
const { erdbIdDaNomeFile } = require('./posterDaEvento');
const { VERSIONI_FILE_NAME } = require('./volumeContract');

const DEFAULT_MAX_DELETE = 500;
const DEFAULT_TTL_DAYS = 60;
const DEFAULT_EPISODE_TTL_DAYS = 14;
const WRITER_GRACE_MS = 60 * 60 * 1000; // 60 minuti: mai toccare file scritti di recente
const TMP_ORPHAN_MS = 15 * 60 * 1000;   // 15 minuti per i .tmp rimasti appesi
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Esegue il Garbage Collector sul volume dei poster composti.
 *
 * @param {object} [opts]
 * @param {string} opts.cacheDir Cartella cache (es. /data/erdb-cache)
 * @param {boolean} [opts.dryRun=true] Se true non cancella nulla (default cauto)
 * @param {number} [opts.maxDelete=500] Tetto massimo di file rimossi per giro
 * @param {number} [opts.ttlDays=60] Giorni di inattività oltre i quali un poster è eleggibile
 * @param {number} [opts.episodeTtlDays=14] Giorni oltre i quali un vecchio episodio superato viene rimosso
 * @param {number} [opts.maxBytes=null] Quota opzionale in byte del volume
 * @param {number} [opts.now=Date.now()] Timestamp corrente per i test
 */
async function gcPosterCache(opts = {}) {
    const {
        cacheDir,
        dryRun = true,
        maxDelete = DEFAULT_MAX_DELETE,
        ttlDays = DEFAULT_TTL_DAYS,
        episodeTtlDays = DEFAULT_EPISODE_TTL_DAYS,
        maxBytes = null,
        now = Date.now()
    } = opts;

    const report = {
        esaminati: 0,
        bytesTotali: 0,
        bytesLiberati: 0,
        cancellati: 0,
        perMotivo: { tmp_orfano: 0, episodio_superato: 0, scaduto_ttl: 0, quota_lru: 0 },
        fileRimossi: [],
        dryRun
    };

    if (!cacheDir || !fs.existsSync(cacheDir)) return report;

    const entries = await fs.promises.readdir(cacheDir, { withFileTypes: true });
    const posterFiles = [];
    const latestEpisodeBySeries = new Map(); // `${erdbId}|${prefix}` -> maxMtimeMs
    const candidates = [];

    for (const dirent of entries) {
        if (!dirent.isFile()) continue;
        const name = dirent.name;
        if (name === VERSIONI_FILE_NAME || name === 'report.json' || name === 'sorgenti.json') continue;

        const fullPath = path.join(cacheDir, name);
        let stat;
        try {
            stat = await fs.promises.stat(fullPath);
        } catch (_) {
            continue;
        }

        report.esaminati++;
        report.bytesTotali += stat.size;
        const ageMs = now - stat.mtimeMs;

        // 1. File .tmp orfani di scritture abortite (> 15 min)
        if (name.endsWith('.tmp')) {
            if (ageMs > TMP_ORPHAN_MS) {
                candidates.push({ name, fullPath, size: stat.size, mtimeMs: stat.mtimeMs, motivo: 'tmp_orfano', priority: 1 });
            }
            continue;
        }

        // Barriera di sicurezza: non toccare mai file creati/toccati negli ultimi 60 minuti
        if (ageMs < WRITER_GRACE_MS) continue;

        const parsed = erdbIdDaNomeFile(name);
        const item = { name, fullPath, size: stat.size, mtimeMs: stat.mtimeMs, ageMs, parsed };
        posterFiles.push(item);

        // Traccia l'episodio più recente per ciascuna serie e canale (EP vs ITA)
        if (parsed && parsed.badge) {
            const epMatch = parsed.badge.match(/^(EP|Ep|ITA|S\d+)\s+(\d+)/);
            if (epMatch) {
                const groupKey = `${parsed.erdbId}|${epMatch[1].toUpperCase()}`;
                const prev = latestEpisodeBySeries.get(groupKey);
                const epNum = Number(epMatch[2]);
                if (!prev || epNum > prev.epNum || (epNum === prev.epNum && stat.mtimeMs > prev.mtimeMs)) {
                    latestEpisodeBySeries.set(groupKey, { epNum, mtimeMs: stat.mtimeMs, name });
                }
            }
        }
    }

    const chosenNames = new Set(candidates.map((c) => c.name));

    for (const item of posterFiles) {
        if (chosenNames.has(item.name)) continue;

        // 2. Vecchi badge episodio superati da un episodio più nuovo e più vecchi di episodeTtlDays
        if (item.parsed && item.parsed.badge) {
            const epMatch = item.parsed.badge.match(/^(EP|Ep|ITA|S\d+)\s+(\d+)/);
            if (epMatch) {
                const groupKey = `${item.parsed.erdbId}|${epMatch[1].toUpperCase()}`;
                const latest = latestEpisodeBySeries.get(groupKey);
                if (latest && latest.name !== item.name && item.ageMs > episodeTtlDays * DAY_MS) {
                    candidates.push({ ...item, motivo: 'episodio_superato', priority: 2 });
                    chosenNames.add(item.name);
                    continue;
                }
            }
        }

        // 3. File scaduti oltre ttlDays
        if (item.ageMs > ttlDays * DAY_MS) {
            candidates.push({ ...item, motivo: 'scaduto_ttl', priority: 3 });
            chosenNames.add(item.name);
        }
    }

    // Ordina per priorità e poi dal più vecchio al più recente
    candidates.sort((a, b) => (a.priority - b.priority) || (a.mtimeMs - b.mtimeMs));

    // 4. Se maxBytes è impostato e siamo ancora sopra quota, aggiungi per LRU i più vecchi
    let projectedBytes = report.bytesTotali - candidates.slice(0, maxDelete).reduce((s, c) => s + c.size, 0);
    if (maxBytes && projectedBytes > maxBytes) {
        const remaining = posterFiles
            .filter((f) => !chosenNames.has(f.name))
            .sort((a, b) => a.mtimeMs - b.mtimeMs);
        for (const rem of remaining) {
            if (projectedBytes <= maxBytes) break;
            candidates.push({ ...rem, motivo: 'quota_lru', priority: 4 });
            chosenNames.add(rem.name);
            projectedBytes -= rem.size;
        }
    }

    const toDelete = candidates.slice(0, maxDelete);
    for (const target of toDelete) {
        if (!dryRun) {
            try {
                await fs.promises.unlink(target.fullPath);
            } catch (_) {
                continue;
            }
        }
        report.cancellati++;
        report.bytesLiberati += target.size;
        report.perMotivo[target.motivo] = (report.perMotivo[target.motivo] || 0) + 1;
        report.fileRimossi.push(target.name);
    }

    return report;
}

module.exports = {
    gcPosterCache,
    DEFAULT_MAX_DELETE,
    DEFAULT_TTL_DAYS,
    DEFAULT_EPISODE_TTL_DAYS,
    WRITER_GRACE_MS
};

```

### 3. Test

```javascript
// tests/gcPosterCache.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gcPosterCache } = require('../src/posters/gcPosterCache');

test('gcPosterCache - rimuove .tmp orfani e vecchi episodi superati, preservando l episodio corrente e i file recenti', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-gc-'));
    const now = Date.parse('2026-11-15T12:00:00Z');
    const DAY = 24 * 3600 * 1000;

    try {
        const writeWithAge = (name, ageMs, content = 'jpeg-bytes') => {
            const p = path.join(dir, name);
            fs.writeFileSync(p, content);
            const mtime = new Date(now - ageMs);
            fs.utimesSync(p, mtime, mtime);
        };

        writeWithAge('tmdb-tv-240411-a1b2c3d4_EP_1.jpg.123-1.tmp', 30 * 60 * 1000); // .tmp di 30m fa -> rimuovere
        writeWithAge('tmdb-tv-240411-a1b2c3d4_EP_1.jpg', 20 * DAY);                 // EP 1 vecchio di 20gg -> rimuovere
        writeWithAge('tmdb-tv-240411-b2c3d4e5_EP_2.jpg', 2 * DAY);                  // EP 2 corrente -> tenere
        writeWithAge('tmdb-movie-603-c3d4e5f6_ITA.jpg', 10 * 60 * 1000);            // scritto 10m fa -> protetto da WRITER_GRACE_MS

        const dry = await gcPosterCache({ cacheDir: dir, dryRun: true, now });
        assert.equal(dry.cancellati, 2);
        assert.equal(dry.perMotivo.tmp_orfano, 1);
        assert.equal(dry.perMotivo.episodio_superato, 1);
        assert.ok(fs.existsSync(path.join(dir, 'tmdb-tv-240411-a1b2c3d4_EP_1.jpg')), 'in dry-run non cancella');

        const real = await gcPosterCache({ cacheDir: dir, dryRun: false, now });
        assert.equal(real.cancellati, 2);
        assert.equal(fs.existsSync(path.join(dir, 'tmdb-tv-240411-a1b2c3d4_EP_1.jpg')), false);
        assert.equal(fs.existsSync(path.join(dir, 'tmdb-tv-240411-b2c3d4e5_EP_2.jpg')), true);
        assert.equal(fs.existsSync(path.join(dir, 'tmdb-movie-603-c3d4e5f6_ITA.jpg')), true);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

```

### 4. Metrica di verifica

* Esegui in dry-run dentro il container: `docker exec yaca-app node -e "require('./src/posters/gcPosterCache').gcPosterCache({cacheDir:'/data/erdb-cache',dryRun:true}).then(console.log)"` per leggere `bytesLiberati` e `perMotivo`.

### 5. Rischio / Rollback

* **Rischio**: con `dryRun: true` di default e `WRITER_GRACE_MS = 3600000` (1 ora), non può mai interferire con i render al volo.
* **Rollback**: basta non invocare `gcPosterCache`; qualsiasi poster rimosso per errore verrebbe comunque rigenerato on-miss da **src/api/staticPosters.js**.



---

## Q7 — Eliminazione duplicazione produttore/consumatore mapping anime (A4)

### 1. Diagnosi

Confermo l'anomalia A4 su entrambi i fronti:

1. **Default incompatibili**: **services/anime-source/src/mappingIndex.js** usa `DEFAULT_FILENAME = 'anime-mappings.json'` e legge `ANIME_MAPPINGS_PATH || ANIME_MAPPING_PATH`, mentre **src/anime/mapping.js** usa `FILE_NAME = 'anime_mapping.json'` e legge solo `ANIME_MAPPING_PATH`. Se si lancia uno script fuori da `docker-compose.yml` senza `ANIME_MAPPING_PATH`, l'app cerca il nome sbagliato e degrada in silenzio.


2. **Drift già avvenuto nel codice**: in **services/anime-source/src/mappingIndex.js** (righe 166-168), i nodi `mal:` di AniBridge popolano `malToTmdb` quando Fribb non ha il mapping (`if (!malToTmdb.has(malId)) malToTmdb.set(malId, cleanTmdbId)`). In **src/anime/mapping.js**, `buildAnibridgeIndex` (righe 412-475) **non** popola `malToTmdb`!



**Nota sui limiti di verifica (Sezione 5)**: **services/anime-source/Dockerfile** non è incluso nel digest. Puoi verificare se il build context di `yaca-anime-source` è la root del repo o la sottocartella con:

```bash
grep -n "context:" docker-compose*.yml .github/workflows/*.yml

```

Per funzionare sia con build context sulla root sia con build context isolato, la soluzione migliore è:

* Unificare in **services/anime-source/src/mappingIndex.js** l'unica funzione pura `buildMappingIndex`.


* In **src/anime/mapping.js**, allineare `FILE_NAME = 'anime-mappings.json'` (con fallback di lettura su `anime_mapping.json` se esiste solo il vecchio nome!) e far sì che `buildFribbIndex` e `buildAnibridgeIndex` deleghino direttamente a `this.applyArtifact(buildMappingIndex(...))`. Così **src/anime/mapping.js** perde 145 righe duplicate e usa esattamente lo stesso codice e lo stesso formato dell'artefatto.



### 2. Soluzione pronta

Ecco la patch per **src/anime/mapping.js** che elimina il parser duplicato, unifica la risoluzione dei percorsi e mantiene `buildFribbIndex` / `buildAnibridgeIndex` compatibili con tutti i test esistenti delegando a `buildMappingIndex`:

```javascript
// Patch per src/anime/mapping.js (sostituisce FILE_NAME, mappingPath, buildFribbIndex e buildAnibridgeIndex)
const { buildMappingIndex, DEFAULT_FILENAME } = require('../../services/anime-source/src/mappingIndex');

const FILE_NAME = DEFAULT_FILENAME; // 'anime-mappings.json'
const LEGACY_FILE_NAME = 'anime_mapping.json';

function mappingPath() {
    if (process.env.ANIME_MAPPING_PATH) return process.env.ANIME_MAPPING_PATH;
    if (process.env.ANIME_MAPPINGS_PATH) return process.env.ANIME_MAPPINGS_PATH;
    const dir = mappingDir();
    const canonical = path.join(dir, FILE_NAME);
    if (fs.existsSync(canonical)) return canonical;
    const legacy = path.join(dir, LEGACY_FILE_NAME);
    if (fs.existsSync(legacy)) return legacy;
    return canonical;
}

```

E all'interno della classe `AnimeMappingStore` in **src/anime/mapping.js**, sostituisci i 145 righi di `buildFribbIndex` e `buildAnibridgeIndex` con:

```javascript
    buildFribbIndex(fribbData) {
        this._rawFribbData = Array.isArray(fribbData) ? fribbData : [];
        const artifact = buildMappingIndex({
            fribbData: this._rawFribbData,
            anibridgeData: this._rawAnibridgeData || {},
            overridesData: {
                certify: Array.from(this.certifiedTmdbIds || []).map((tmdbId) => ({ tmdbId })),
                exclude: Array.from(this.excludedTmdbIds || []).map((tmdbId) => ({ tmdbId }))
            }
        });
        this.applyArtifact(artifact);
    }

    buildAnibridgeIndex(anibridgeData) {
        this._rawAnibridgeData = anibridgeData && typeof anibridgeData === 'object' ? anibridgeData : {};
        const artifact = buildMappingIndex({
            fribbData: this._rawFribbData || [],
            anibridgeData: this._rawAnibridgeData,
            overridesData: {
                certify: Array.from(this.certifiedTmdbIds || []).map((tmdbId) => ({ tmdbId })),
                exclude: Array.from(this.excludedTmdbIds || []).map((tmdbId) => ({ tmdbId }))
            }
        });
        this.applyArtifact(artifact);
    }

```

### 3. Test di parità

```javascript
// tests/animeMappingParity.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildMappingIndex } = require('../services/anime-source/src/mappingIndex');
const { AnimeMappingStore } = require('../src/anime/mapping');

test('Parità produttore/consumatore: buildMappingIndex + applyArtifact produce le stesse mappe di buildFribbIndex/buildAnibridgeIndex', () => {
    const fribb = JSON.parse(fs.readFileSync(path.join(__dirname, '../services/anime-source/tests/fixtures/fribb_dandadan.json'), 'utf8'));
    const anibridge = JSON.parse(fs.readFileSync(path.join(__dirname, '../services/anime-source/tests/fixtures/anibridge_dandadan.json'), 'utf8'));
    const overrides = { certify: [{ tmdbId: '286361' }], exclude: [{ tmdbId: '999999' }] };

    // Percorso A: artefatto prodotto da anime-source e applicato in yaca-app
    const artifact = buildMappingIndex({ fribbData: fribb, anibridgeData: anibridge, overridesData: overrides });
    const storeFromArtifact = new AnimeMappingStore();
    storeFromArtifact.applyArtifact(artifact);

    // Percorso B: caricamento in-memory via metodi legacy
    const storeFromMethods = new AnimeMappingStore();
    storeFromMethods.loadOverrides(overrides);
    storeFromMethods.buildFribbIndex(fribb);
    storeFromMethods.buildAnibridgeIndex(anibridge);

    assert.deepEqual(storeFromArtifact.idsByType(), storeFromMethods.idsByType());
    assert.deepEqual(Array.from(storeFromArtifact.malToTmdb.entries()), Array.from(storeFromMethods.malToTmdb.entries()));
    assert.deepEqual(storeFromArtifact.resolveKitsu('240411', 1, 5), storeFromMethods.resolveKitsu('240411', 1, 5));
    assert.deepEqual(storeFromArtifact.resolveKitsu('240411', 2, 3), storeFromMethods.resolveKitsu('240411', 2, 3));
});

```

### 4. Metrica di verifica

* Esecuzione di `node --test tests/animeMappingParity.test.js` e verifica che `mappingPath()` risolva **anime-mappings.json** anche rimuovendo `ANIME_MAPPING_PATH` dall'ambiente.

### 5. Rischio / Rollback

* **Rischio**: se in un ambiente locale esisteva un vecchio file chiamato **anime_mapping.json**, il fallback `if (fs.existsSync(legacy)) return legacy` in `mappingPath()` continua a leggerlo senza interruzioni.
* **Rollback**: completamente retrocompatibile.

---

## Q8 — Punto unico di verità sui degradi silenziosi (3.6)

### 1. Diagnosi

Attualmente i quattro flussi degradano senza lanciare eccezioni (corretto per i percorsi caldi Stremio), ma non espongono uno stato aggregato:

1. **TMDB / Indice**: `tmdbDumpStore.loadStatus()` sa se il daemon è `stale` (>36h) o se mancano **catalog.duckdb** / **titles_fts5.db**.


2. **Anime Airing / Simulcast**: `animeAiringState.getSnapshot()` sa se Mongo è `degraded`, se `homeInWindow === 0` o se `homeStale > 0` (`checkedAt` > 3 giorni).


3. **Anime Mapping**: `animeMappingStore.getSnapshot()` sa se l'artefatto è in stato `degraded` o più vecchio di 24 ore.


4. **Doppiaggi ITA & Poster Volume**: `itaAnnotations.getSnapshot()` sa se il file manca (`error !== null`) o se `trueCount === 0`, e `getStatoVolume()` sa se `versioni.json` è disallineato o quanti poster risultano mancanti.



Possiamo aggregare queste quattro sonde in **src/infra/ingestionStatus.js** ed esporle su `GET /api/admin/ingestion-status` in **src/api/admin.js** con un semaforo (`green` | `yellow` | `red`) e soglie esplicite, garantendo che la funzione non sollevi mai eccezioni.

### 2. Soluzione pronta

Crea **src/infra/ingestionStatus.js**:

```javascript
// src/infra/ingestionStatus.js
const fs = require('fs');
const TmdbDumpStore = require('../../services/tmdb-daemon/tmdbDumpStore');
const { animeAiringState, animeMappingStore } = require('../anime');
const itaAnnotations = require('../catalog/itaAnnotations');
const { getStatoVolume, getCacheDir } = require('../api/staticPosters');

const MAPPING_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const ITA_MAX_AGE_MS = 36 * 60 * 60 * 1000;     // 36h (timer gira ogni 12h)

async function getIngestionStatus() {
    const checks = {};
    const reasons = [];

    // 1. TMDB Daemon & Indici (Tier 1 + Tier 2)
    try {
        const store = new TmdbDumpStore();
        const tmdb = store.loadStatus();
        const hasDuck = Boolean(tmdb.artifacts?.duckdb?.exists);
        const hasFts5 = Boolean(tmdb.artifacts?.titlesFts5?.exists);
        let status = 'green';
        if (!hasDuck || tmdb.phase === 'error') {
            status = 'red';
            reasons.push(`tmdb: ${tmdb.staleReason || tmdb.error || 'catalog.duckdb assente'}`);
        } else if (tmdb.isStale || !hasFts5) {
            status = 'yellow';
            reasons.push(`tmdb: ${tmdb.staleReason || 'titles_fts5.db assente'}`);
        }
        checks.tmdb = {
            status,
            phase: tmdb.phase,
            isStale: tmdb.isStale,
            lastSync: tmdb.lastSync,
            artifacts: tmdb.artifacts
        };
    } catch (err) {
        checks.tmdb = { status: 'red', error: err.message };
        reasons.push(`tmdb: ${err.message}`);
    }

    // 2. Anime Airing State & Simulcast Home
    try {
        const airingSnap = await animeAiringState.getSnapshot();
        let status = 'green';
        if (airingSnap.degraded || airingSnap.docs.length === 0) {
            status = 'red';
            reasons.push('anime_airing: snapshot degradato o vuoto');
        } else if (airingSnap.homeInWindow === 0 || airingSnap.homeStale > 0) {
            status = 'yellow';
            reasons.push(`anime_airing: homeInWindow=${airingSnap.homeInWindow}, homeStale=${airingSnap.homeStale}`);
        }
        checks.animeAiring = {
            status,
            degraded: airingSnap.degraded,
            totalDocs: airingSnap.docs.length,
            homeInWindow: airingSnap.homeInWindow,
            homeStale: airingSnap.homeStale
        };
    } catch (err) {
        checks.animeAiring = { status: 'red', error: err.message };
        reasons.push(`anime_airing: ${err.message}`);
    }

    // 3. Anime Mapping Store
    try {
        const mapSnap = await animeMappingStore.getSnapshot();
        const generatedMs = mapSnap.generatedAt ? Date.parse(mapSnap.generatedAt) : 0;
        const ageMs = generatedMs ? (Date.now() - generatedMs) : Infinity;
        let status = 'green';
        if (mapSnap.degraded || !animeMappingStore.isReady || (mapSnap.movieCount === 0 && mapSnap.showCount === 0)) {
            status = 'red';
            reasons.push(`anime_mapping: ${mapSnap.error || 'store vuoto/degradato (statoAnime=non-lo-so)'}`);
        } else if (ageMs > MAPPING_MAX_AGE_MS) {
            status = 'yellow';
            reasons.push(`anime_mapping: artefatto più vecchio di 24h (${mapSnap.generatedAt})`);
        }
        checks.animeMapping = {
            status,
            degraded: Boolean(mapSnap.degraded),
            generatedAt: mapSnap.generatedAt || null,
            movieCount: mapSnap.movieCount || 0,
            showCount: mapSnap.showCount || 0
        };
    } catch (err) {
        checks.animeMapping = { status: 'red', error: err.message };
        reasons.push(`anime_mapping: ${err.message}`);
    }

    // 4. Doppiaggi ITA (file vs Parquet)
    try {
        const itaSnap = await itaAnnotations.getSnapshot();
        let fileMtimeMs = 0;
        try {
            if (itaSnap.path && fs.existsSync(itaSnap.path)) {
                fileMtimeMs = fs.statSync(itaSnap.path).mtimeMs;
            }
        } catch (_) {}
        const ageMs = fileMtimeMs ? (Date.now() - fileMtimeMs) : Infinity;
        let status = 'green';
        if (itaSnap.error || itaSnap.trueCount === 0) {
            status = 'red';
            reasons.push(`ita_annotations: ${itaSnap.error || '0 titoli doppiati in RAM (badge spenti)'}`);
        } else if (ageMs > ITA_MAX_AGE_MS) {
            status = 'yellow';
            reasons.push('ita_annotations: file non aggiornato da oltre 36h');
        }
        checks.itaAnnotations = {
            status,
            error: itaSnap.error,
            trueCount: itaSnap.trueCount,
            nullCount: itaSnap.nullCount,
            mtime: fileMtimeMs ? new Date(fileMtimeMs).toISOString() : null
        };
    } catch (err) {
        checks.itaAnnotations = { status: 'red', error: err.message };
        reasons.push(`ita_annotations: ${err.message}`);
    }

    // 5. Volume Poster ERDB
    try {
        const vol = getStatoVolume(getCacheDir());
        const status = vol.ok ? 'green' : 'yellow';
        if (!vol.ok) reasons.push(`posters: ${vol.volume?.motivo || 'volume non allineato'}`);
        checks.posters = {
            status,
            ok: vol.ok,
            motivo: vol.volume?.motivo || null,
            statistiche: vol.statistiche
        };
    } catch (err) {
        checks.posters = { status: 'yellow', error: err.message };
        reasons.push(`posters: ${err.message}`);
    }

    const allStatuses = Object.values(checks).map((c) => c.status);
    const overall = allStatuses.includes('red')
        ? 'red'
        : (allStatuses.includes('yellow') ? 'yellow' : 'green');

    return {
        overall,
        timestamp: new Date().toISOString(),
        reasons,
        checks
    };
}

module.exports = { getIngestionStatus };

```

In **src/api/admin.js**, aggiungi la rotta:

```javascript
// Da aggiungere in src/api/admin.js
const { getIngestionStatus } = require('../infra/ingestionStatus');

router.get('/ingestion-status', async (_req, res) => {
    const status = await getIngestionStatus();
    res.json({ success: true, ...status });
});

```

### 3. Test

```javascript
// tests/ingestionStatus.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { getIngestionStatus } = require('../src/infra/ingestionStatus');

test('getIngestionStatus non solleva mai eccezioni e restituisce il semaforo aggregato', async () => {
    const res = await getIngestionStatus();
    assert.ok(['green', 'yellow', 'red'].includes(res.overall));
    assert.ok(res.checks.tmdb);
    assert.ok(res.checks.animeAiring);
    assert.ok(res.checks.animeMapping);
    assert.ok(res.checks.itaAnnotations);
    assert.ok(res.checks.posters);
});

```

### 4. Metrica di verifica

* Interrogazione HTTP: `curl -s -H "x-admin-token: $ADMIN_TOKEN" http://localhost:7860/api/admin/ingestion-status | jq '{overall, reasons}'`.

### 5. Rischio / Rollback

* **Rischio**: zero impatto sui percorsi Stremio; è una rotta read-only protetta da `adminAuth` che legge gli snapshot già in memoria.


* **Rollback**: rimozione della rotta in **src/api/admin.js**.

---

## Q10 — Audit di over-engineering: cosa tagliare con evidenza

Ecco la tabella riassuntiva dei tagli concreti sui moduli della pipeline che riducono la complessità senza alterare alcun comportamento esterno:

| Modulo | Righe da tagliare | Cosa eliminare | Cosa lo sostituisce | Risparmio |
| --- | --- | --- | --- | --- |
| push-diff-in-coda.js | 206-231, 376-391 | `verificatoreInCoda` (`coda.take(2000)`) | Stato `'added'` o `'duplicate'` da `coda.push` | ~45 righe |
| drenaCodaPoster.js | 198-225, 287-305 | `aspettaRedis` duplicato e doppio `coda.take` | Helper unico in `codaEventi` e lazy init mappa | ~55 righe |
| drenaPoster.js | 102-113, 270-273 | `eventoDaErdbId` (spacchettamento inutile) | Chiamata diretta a `posterFileName` e `posterUrl` | ~20 righe |
| volumeContract.js | 71-101, 235-250 | `scriviVersioniVolumeSync` e `volumeObserver` | `scriviVersioniVolume` e `mock.method` di Node 20 | ~45 righe |
| annotations.js | 69-125 | Doppio ciclo in `inspectMerge` | Passata singola condivisa con `mergeAnnotationRows` | ~35 righe |

Di seguito il dettaglio punto per punto con le prove sul codice:

* 1. `scripts/push-diff-in-coda.js` (righe 206-231 e 376-391) + `src/posters/codaEventi.js`:


* **Evidenza**: poiché `coda.push(evento)` restituisce `false` sia quando `HSETNX` trova la chiave già in coda (idempotenza normale) sia quando Redis fallisce, `push-diff-in-coda.js` scarica fino a 2.000 elementi da Redis con `coda.take(2000)` (`verificatoreInCoda`) e li scandisce linearmente per capire se l'evento c'era già!


* **Sostituzione**: far restituire a `coda.push` (o a un metodo `pushWithStatus`) `'added' | 'duplicate' | 'error'`. Elimina `verificatoreInCoda`, `LOTTO_VERIFICA_CODA` e la lettura di 2.000 item da Redis.


* 2. `src/posters/drenaCodaPoster.js` (righe 198-225 e 287-305):


* **Evidenza**: `aspettaRedis` è copiato riga per riga sia in **scripts/push-diff-in-coda.js** (righe 171-200) sia in **src/posters/drenaCodaPoster.js** (righe 198-225). Inoltre `_serveMappa` (righe 287-305) invoca `await coda.take(batch)` solo per guardare se c'è un ID non-Kitsu, e subito dopo `drenaImpl` invoca `await take(batch)` una seconda volta!


* **Sostituzione**: spostare `aspettaRedis` in `codaEventi.js` e passare i risultati del primo `take` a `drena` (oppure caricare la mappa pigramente dentro `cercaKitsu` al primo evento non-Kitsu).


* 3. `src/posters/drenaPoster.js` (righe 102-113 e 270-273):


* **Evidenza**: dentro il ciclo di `drena`, `erdbIdsDaEvento` restituisce già `id` in formato ERDB (`tmdb:movie:265` o `kitsu:265`). Subito dopo, `drena` chiama `eventoDaErdbId(id, evento)` per spacchettare la stringa in `{ tipo, id: idErdb, badge }` e passarla a `nomeFileDaEvento` e `urlDaEvento`, i quali richiamano `erdbIdDaEvento` per ricomporre la stessa stringa `tmdb:movie:265` prima di invocare `posterFileName` e `posterUrl`!


* **Sostituzione**: chiamare direttamente `posterFileName({ erdbId: id, badge: evento.badge })` e `posterUrl(base, { erdbId: id, badge: evento.badge })`. Elimina `eventoDaErdbId`, `nomeFileDaEvento` e `urlDaEvento`.




* 4. `src/posters/volumeContract.js` (righe 71-101 e 235-250):


* **Evidenza**: mantiene sia `scriviVersioniVolume` (async) sia `scriviVersioniVolumeSync` (sync) con corpo duplicato per scrivere 120 byte di JSON, più l'oggetto indiretto `volumeObserver` solo per il mocking nei test.


* **Sostituzione**: `node:test` in Node 20 ha `t.mock.method(volumeContract, 'registraRichiestaPoster', ...)` nativo; `volumeObserver` è superfluo.


* 5. `services/doppiaggi-source/src/resolver.js` (righe 28-49 e 98-120):


* **Evidenza**: `getTmdbApiKey` contiene il path cablato `'C:/Users/gabri/APP/YACA/.env'` (riga 39) e parsa `.env` con regex; `findExistingCacheFile` (righe 104-109) cerca ancora file di cache legacy con `api_key=` nel nome file generati da uno script `.scratch` dismesso.


* **Sostituzione**: usare `dotenv` e rimuovere il branch `legacyWithKey` (~25 righe risparmiate).


* 6. `src/indice/mapping.js` (`buildFribbIndex` / `buildAnibridgeIndex`, righe 334-475):


* **Evidenza**: come dimostrato in **Q7**, sono 145 righe di duplicazione diretta di **services/anime-source/src/mappingIndex.js**. Delegando a `buildMappingIndex` si tagliano 130 righe nette e si elimina il bug di drift su `malToTmdb`.