/**
 * fetch-serializd.js — Scraper per le cronologie di visione di Serializd (https://www.serializd.com).
 * 
 * Obiettivo: raccogliere gli show guardati dagli utenti per costruire grafi di co-visione.
 * 
 * Strategia:
 * 1. Ispezione sito web: www.serializd.com è protetto da Cloudflare WAF/Turnstile (restituisce 403 con
 *    challenge JS non-interattivo 'cf-mitigated: challenge').
 * 2. Backend API: Serializd espone un'API interna diretta REST/JSON (backend Django/Gunicorn su Render
 *    all'indirizzo https://serializd.onrender.com/api/), accessibile con header client
 *    'X-Requested-With: serializd_vercel'.
 * 3. Scoperta: endpoint `/api/review/recent?page=<p>` restituisce le recensioni recenti (24 per pagina)
 *    con l'autore (`review.author`).
 * 4. Visioni: endpoint `/api/user/<username>/watchedpage_v2/<page>?sort_by=date_added_desc` restituisce
 *    la lista paginata di show guardati con TMDB ID (`showId`), titolo (`showName`) e data prima TV (`premiereDate`).
 * 
 * Uso:
 *   N=20 node services/graph/fetch/fetch-serializd.js
 *   PAGES=5 N=500 node services/graph/fetch/fetch-serializd.js
 * 
 * Output:
 *   .cache/serializd/users/<username>.json — array di ID show (TMDB id se presente, altrimenti "Titolo (Anno)")
 */

const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '../../../.cache/serializd/users');
const API_BASE = process.env.SERIALIZD_API_BASE || 'https://serializd.onrender.com/api';
const WEB_BASE = 'https://www.serializd.com';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'serializd_vercel',
    'Origin': WEB_BASE,
    'Referer': `${WEB_BASE}/`
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomSleep = (min = 800, max = 1200) => {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return sleep(ms);
};

/** Esegue una fetch HTTP con gestione di retry, backoff e 429 */
async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const resp = await fetch(url, {
                ...options,
                headers: { ...HEADERS, ...(options.headers || {}) }
            });

            if (resp.status === 429) {
                console.warn(`    [429] Rate limit hit su ${url}. Attendo 60s (tentativo ${attempt}/${retries})...`);
                await sleep(3000);
                continue;
            }

            return resp;
        } catch (err) {
            if (attempt === retries) throw err;
            console.warn(`    [Network Error] ${err.message} su ${url}. Riprovo tra 2s...`);
            await sleep(2000);
        }
    }
    throw new Error(`Exceeded max retries for ${url}`);
}

/** Verifica preliminare dello stato del sito pubblico www.serializd.com */
async function checkPublicWebsite() {
    console.log(`[Check] Ispezione pagina pubblica: ${WEB_BASE}/reviews/recent ...`);
    try {
        const resp = await fetch(`${WEB_BASE}/reviews/recent`, {
            headers: {
                'User-Agent': HEADERS['User-Agent'],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        const status = resp.status;
        const cfHeader = resp.headers.get('cf-mitigated') || resp.headers.get('server');
        if (status === 403) {
            const html = await resp.text();
            const isChallenge = html.includes('challenges.cloudflare.com') || html.includes('Just a moment...');
            console.log(`  -> Stato HTTP: ${status} Forbidden`);
            console.log(`  -> Header Cloudflare: cf-mitigated=${resp.headers.get('cf-mitigated') || 'n/a'}, server=${resp.headers.get('server') || 'n/a'}`);
            if (isChallenge) {
                console.log(`  -> Rilevato blocco Cloudflare Turnstile/JS Challenge (richiede esecuzione browser JS o token clearance).`);
            }
            console.log(`  -> Utilizzo backend API interno: ${API_BASE}\n`);
            return { blocked: true, status, html: html.slice(0, 300) };
        } else if (resp.ok) {
            console.log(`  -> Sito pubblico accessibile direttamente (HTTP ${status}).\n`);
            return { blocked: false, status };
        } else {
            console.log(`  -> Risposta inattesa (HTTP ${status}). Fallback su API backend.\n`);
            return { blocked: true, status };
        }
    } catch (e) {
        console.log(`  -> Errore connessione ${WEB_BASE}: ${e.message}. Uso API backend: ${API_BASE}\n`);
        return { blocked: true, error: e.message };
    }
}

/** Estrae showId TMDB se disponibile, altrimenti "NomeShow (Anno)" */
function extractShowId(item) {
    if (!item) return null;
    if (item.showId !== undefined && item.showId !== null && item.showId !== '') {
        return item.showId;
    }
    const name = (item.showName || '').trim();
    const year = (item.premiereDate || '').slice(0, 4).trim();
    if (name && year) return `${name} (${year})`;
    return name || null;
}

/** Scopre utenti dalle recensioni recenti */
async function discoverUsers(targetCount, maxPages) {
    const usersFile = path.join(CACHE, '_users.json');
    const discovered = new Set();

    if (fs.existsSync(usersFile)) {
        try {
            const saved = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
            for (const u of saved) if (u) discovered.add(u);
            console.log(`[Discovery] Ripresi ${discovered.size} utenti già salvati in _users.json`);
        } catch (e) {
            console.warn(`[Discovery] Impossibile leggere ${usersFile}: ${e.message}`);
        }
    }

    console.log(`[Discovery] Scansione recensioni recenti (max ${maxPages} pagine, target ${targetCount} utenti)...`);
    for (let page = 1; page <= maxPages; page++) {
        if (discovered.size >= targetCount * 2) {
            console.log(`[Discovery] Pool utenti sufficiente (${discovered.size} trovati), termino scansione.`);
            break;
        }

        const url = `${API_BASE}/review/recent?page=${page}`;
        const resp = await fetchWithRetry(url);

        if (!resp.ok) {
            console.warn(`  [Discovery] Pagina ${page}: HTTP ${resp.status}`);
            if (resp.status === 404) break;
            await randomSleep();
            continue;
        }

        const data = await resp.json();
        const reviews = data.reviews || [];
        let addedThisPage = 0;

        for (const r of reviews) {
            const author = (r.author || '').trim();
            if (author && !discovered.has(author)) {
                discovered.add(author);
                addedThisPage++;
            }
        }

        console.log(`  Pagina ${page}/${maxPages} · +${addedThisPage} nuovi utenti (totale: ${discovered.size})`);
        fs.writeFileSync(usersFile, JSON.stringify([...discovered], null, 2));

        if (page < maxPages) {
            await randomSleep(800, 1200);
        }
    }

    console.log(`[Discovery] Completata: ${discovered.size} utenti unici scoperti.\n`);
    return [...discovered];
}

/** Scarica gli show guardati di un singolo utente */
async function fetchUserWatched(username, maxUserPages = 5) {
    const safeUser = username.replace(/[<>:"/\\|?*]/g, '_');
    const outFile = path.join(CACHE, `${safeUser}.json`);

    if (fs.existsSync(outFile)) {
        return { status: 'cached', count: null };
    }

    const encodedUser = encodeURIComponent(username);
    const showIds = [];
    const seenShowIds = new Set();
    let totalPages = 1;

    for (let p = 1; p <= Math.min(totalPages, maxUserPages); p++) {
        const url = `${API_BASE}/user/${encodedUser}/watchedpage_v2/${p}?sort_by=date_added_desc`;
        const resp = await fetchWithRetry(url);

        if (resp.status === 401 || resp.status === 403) {
            return { status: 'private', error: `HTTP ${resp.status} (Account privato o protetto)` };
        }

        if (resp.status === 404) {
            return { status: 'not_found', error: 'HTTP 404 (Utente non trovato)' };
        }

        if (!resp.ok) {
            return { status: 'error', error: `HTTP ${resp.status}` };
        }

        const json = await resp.json();
        if (p === 1 && typeof json.totalPages === 'number') {
            totalPages = json.totalPages;
        }

        const items = json.items || [];
        for (const item of items) {
            const id = extractShowId(item);
            if (id !== null && !seenShowIds.has(id)) {
                seenShowIds.add(id);
                showIds.push(id);
            }
        }

        if (p < Math.min(totalPages, maxUserPages)) {
            await randomSleep(800, 1200);
        }
    }

    fs.writeFileSync(outFile, JSON.stringify(showIds));
    return { status: 'ok', count: showIds.length, totalPages };
}

(async () => {
    fs.mkdirSync(CACHE, { recursive: true });

    const N = Number(process.env.N || 500);
    const PAGES = process.env.PAGES ? Number(process.env.PAGES) : Math.max(5, Math.ceil(N / 20));
    const USER_PAGES = Number(process.env.USER_PAGES || 5);

    console.log('='.repeat(60));
    console.log(`SERIALIZD SCRAPER`);
    console.log(`  Target utenti (N)  : ${N}`);
    console.log(`  Pagine review      : ${PAGES}`);
    console.log(`  Max pagine/utente  : ${USER_PAGES}`);
    console.log(`  Cache dir          : ${CACHE}`);
    console.log('='.repeat(60) + '\n');

    // 1) Verifica stato del sito pubblico e segnalazione evidenze
    await checkPublicWebsite();

    // 2) Scoperta degli utenti da /review/recent
    const userPool = await discoverUsers(N, PAGES);

    if (userPool.length === 0) {
        console.error('Nessun utente scoperto. Interruzione.');
        process.exit(1);
    }

    // 3) Raccolta cronologie per ciascun utente
    const targetUsers = userPool.slice(0, N);
    let ok = 0;
    let cached = 0;
    let skipped = 0;
    let totalShows = 0;

    console.log(`[Fetch] Inizio estrazione liste watched per ${targetUsers.length} utenti...`);

    for (let i = 0; i < targetUsers.length; i++) {
        const username = targetUsers[i];
        const idxStr = `[${i + 1}/${targetUsers.length}]`;

        try {
            const res = await fetchUserWatched(username, USER_PAGES);

            if (res.status === 'cached') {
                cached++;
                console.log(`  ${idxStr} ${username}: già in cache (skip)`);
            } else if (res.status === 'ok') {
                ok++;
                totalShows += res.count;
                console.log(`  ${idxStr} ${username}: OK (${res.count} show, ${res.totalPages} pag.)`);
            } else {
                skipped++;
                console.log(`  ${idxStr} ${username}: ${res.status.toUpperCase()} — ${res.error}`);
            }
        } catch (err) {
            skipped++;
            console.error(`  ${idxStr} ${username}: ERRORE — ${err.message}`);
        }

        // Rispetta intervallo 800-1200 ms tra utenti
        if (i < targetUsers.length - 1) {
            await randomSleep(800, 1200);
        }

        if ((i + 1) % 10 === 0 || i === targetUsers.length - 1) {
            console.log(`  --- Avanzamento: ${ok} salvati, ${cached} da cache, ${skipped} saltati | ${totalShows} show totali ---`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`FINE: ${ok} nuovi file scritti · ${cached} da cache · ${skipped} saltati`);
    console.log(`Totale show estratti: ${totalShows}`);
    console.log(`Directory salvataggio: ${CACHE}`);
    console.log('='.repeat(60));
})().catch((err) => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
