/**
 * Giro di prove generale su YACA: rotte Stremio, sintassi di ricerca, cataloghi, API web,
 * robustezza e injection. Non modifica niente: solo GET (e POST di sola lettura) su dati di prova.
 *
 * Uso:  BASE=http://127.0.0.1:7860 node .scratch/verifica-generale/probe-generale.js
 *       BASE=https://mate.hyena-alphard.ts.net node ...        (dall'esterno)
 *
 * Scrive esiti.json accanto a sé e stampa un riassunto: una riga per caso anomalo.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:7860';
const UTENTE = process.env.UTENTE || 'REOZrGNRr3';
const CONFIG = process.env.CONFIG || 'BauPSauk';
const SIM_UTENTE = 'sim-uuid-yaca';
const SIM_CONFIG = 'VHcE03mN';

const esiti = [];
let seq = 0;

function registra(gruppo, nome, esito) {
    esiti.push({ gruppo, nome, ...esito });
    const segno = esito.ok ? '·' : '✗';
    if (!esito.ok) {
        console.log(`${segno} [${gruppo}] ${nome} — ${esito.nota || ''}`);
    }
}

async function chiama(gruppo, nome, url, opzioni = {}) {
    const t0 = Date.now();
    let risposta;
    let testo = '';
    try {
        risposta = await fetch(url.startsWith('http') ? url : BASE + url, {
            redirect: 'manual',
            signal: AbortSignal.timeout(opzioni.timeoutMs || 45000),
            ...opzioni
        });
        testo = await risposta.text();
    } catch (err) {
        registra(gruppo, nome, { ok: false, nota: `errore di rete: ${err.message}`, ms: Date.now() - t0, url });
        return { errore: err.message, ms: Date.now() - t0 };
    }
    const ms = Date.now() - t0;
    let json = null;
    try { json = JSON.parse(testo); } catch { /* non è JSON */ }
    return { risposta, testo, json, ms, url, bytes: Buffer.byteLength(testo) };
}

const metasValide = (metas) =>
    Array.isArray(metas) && metas.every(m => m && typeof m.id === 'string' && typeof m.type === 'string' && typeof m.name === 'string');

const ids = (metas) => (metas || []).map(m => m.id);

// ———————————————————————————————————————————————————————————————
// A. Manifest e forme delle rotte
// ———————————————————————————————————————————————————————————————
async function giroManifest() {
    const attesoPrimaDiTutto = [
        ['manifest radice', '/manifest.json', r => r.json && r.json.behaviorHints && r.json.behaviorHints.configurable === true && Array.isArray(r.json.catalogs)],
        ['manifest utente', `/${UTENTE}/manifest.json`, r => r.json && Array.isArray(r.json.catalogs) && r.json.catalogs.length > 0],
        ['manifest con config', `/${UTENTE}/${CONFIG}/manifest.json`, r => r.json && typeof r.json.version === 'string' && Array.isArray(r.json.catalogs) && r.json.catalogs.length > 0],
        ['manifest utente inesistente', '/utente-che-non-esiste/manifest.json', r => r.risposta.status === 200 && r.json && r.json.behaviorHints && r.json.behaviorHints.configurationRequired === true],
        ['manifest config inesistente', `/${UTENTE}/CONFIGCHE NON ESISTE/manifest.json`, r => r.risposta.status === 200],
        ['configure', `/${UTENTE}/${CONFIG}/configure`, r => r.risposta.status === 200],
        ['rotta inesistente', `/${UTENTE}/catalog/movie/non_esiste.json`, r => r.risposta.status === 200 || r.risposta.status === 404]
    ];
    let manifest = null;
    for (const [nome, url, buono] of attesoPrimaDiTutto) {
        const r = await chiama('A. manifest', nome, encodeURI(url.includes(' ') ? url.replace(' ', '%20') : url));
        const ok = buono(r);
        registra('A. manifest', nome, {
            ok, nota: ok ? '' : `status ${r.risposta?.status}, body ${String(r.testo).slice(0, 160)}`,
            ms: r.ms, url, status: r.risposta?.status, bytes: r.bytes
        });
        if (url === `/${UTENTE}/${CONFIG}/manifest.json` && r.json) manifest = r.json;
    }

    // Ogni catalogo dichiarato deve rispondere con metas valide.
    if (manifest) {
        for (const cat of manifest.catalogs) {
            const extra = (cat.extra || []);
            const richiestaSearch = extra.find(e => e.name === 'search');
            if (richiestaSearch) continue; // le ricerche le proviamo a parte
            const coda = cat.id.replace(/^.*?\./, '');
            const url = `/${UTENTE}/${CONFIG}/catalog/${cat.type}/${cat.id}.json`;
            const r = await chiama('A. catalogs', `catalogo ${cat.type}/${coda}`, url);
            const metas = r.json?.metas;
            const vivo = r.risposta?.status === 200 && (metas === undefined || metasValide(metas));
            registra('A. catalogs', `catalogo ${cat.type}/${coda}`, {
                ok: vivo, nota: vivo ? '' : `status ${r.risposta?.status}, metas non valide: ${String(r.testo).slice(0, 120)}`,
                ms: r.ms, titoli: Array.isArray(metas) ? metas.length : null, bytes: r.bytes
            });
        }
    }
    return manifest;
}

// ———————————————————————————————————————————————————————————————
// B. Ricerca: bordi del protocollo (skip, encoding, metodi)
// ———————————————————————————————————————————————————————————————
async function giroBordiRicerca() {
    const base = `/${UTENTE}/${CONFIG}/catalog/movie/yaca_search_standard/search=`;
    const casi = [
        ['skip=0', `${base}tema%20horror&skip=0.json`, r => r.risposta.status === 200 && metasValide(r.json?.metas)],
        ['skip=20', `${base}tema%20horror&skip=20.json`, r => r.risposta.status === 200 && metasValide(r.json?.metas)],
        ['skip oltre la fine (12000)', `${base}tema%20horror&skip=12000.json`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['skip negativo', `${base}tema%20horror&skip=-5.json`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['skip non numerico', `${base}tema%20horror&skip=abc.json`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['skip decimale', `${base}tema%20horror&skip=1.5.json`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['skip enorme (9e15)', `${base}tema%20horror&skip=9000000000000000.json`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['skip duplicato', `${base}tema%20horror&skip=0&skip=20.json`, r => r.risposta.status === 200],
        ['skip come query string', `/${UTENTE}/${CONFIG}/catalog/movie/yaca_search_standard/search=tema%20horror.json?skip=20`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['skip prima della ricerca', `/${UTENTE}/${CONFIG}/catalog/movie/yaca_search_standard/skip=20&search=tema%20horror.json`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['ricerca vuota', `${base}.json`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['ricerca solo spazi', `${base}%20%20.json`, r => r.risposta.status === 200 && Array.isArray(r.json?.metas)],
        ['ricerca con e commerciale', `${base}anno%201990-1999%26genere=commedia.json`, r => r.risposta.status === 200],
        ['ricerca con uguale', `${base}voto=8.json`, r => r.risposta.status === 200],
        ['ricerca accentata', `${base}amelie.json`, r => r.risposta.status === 200],
        ['ricerca unicode (emoji)', `${base}%F0%9F%91%BB.json`, r => r.risposta.status === 200],
        ['ricerca con null byte', `${base}tema%00horror.json`, r => r.risposta.status === 200],
        ['ricerca lunghissima (600 char)', `${base}${'horror%20'.repeat(100)}.json`, r => r.risposta.status === 200],
        ['ricerca HTML', `${base}%3Cscript%3Ealert(1)%3C%2Fscript%3E.json`, r => r.risposta.status === 200],
        ['ricerca SQL', `${base}tema%20horror%27%20OR%201%3D1--.json`, r => r.risposta.status === 200],
        ['tipo serie', `/${UTENTE}/${CONFIG}/catalog/series/yaca_search_standard/search=drama.json`, r => r.risposta.status === 200 && (r.json?.metas || []).every(m => m.type === 'series')],
        ['tipo sconosciuto', `/${UTENTE}/${CONFIG}/catalog/boh/yaca_search_standard/search=drama.json`, r => r.risposta.status === 200],
        ['metodo HEAD', `${base}tema%20horror.json`, r => r.risposta.status < 500, { method: 'HEAD' }],
        ['metodo OPTIONS', `${base}tema%20horror.json`, r => r.risposta.status < 500, { method: 'OPTIONS' }]
    ];
    const pagine = {};
    for (const [nome, url, buono, extra] of casi) {
        const r = await chiama('B. bordi', nome, url, extra || {});
        const ok = buono(r);
        registra('B. bordi', nome, {
            ok, nota: ok ? '' : `status ${r.risposta?.status}, body ${String(r.testo).slice(0, 120)}`,
            ms: r.ms, titoli: Array.isArray(r.json?.metas) ? r.json.metas.length : null, bytes: r.bytes
        });
        if (nome.startsWith('skip=0') || nome.startsWith('skip=20')) pagine[nome] = ids(r.json?.metas);
    }
    if (pagine['skip=0'] && pagine['skip=20']) {
        const comuni = pagine['skip=0'].filter(id => pagine['skip=20'].includes(id));
        registra('B. bordi', 'pagine complementari', {
            ok: comuni.length === 0, nota: comuni.length ? `${comuni.length} doppioni: ${comuni.slice(0, 3).join(', ')}` : ''
        });
    }
}

// ———————————————————————————————————————————————————————————————
// C. Sintassi della ricerca: un caso per operatore e per gli scarti
// ———————————————————————————————————————————————————————————————
const CASI_SINTASSI = [
    ['tema', 'tema pirati'],
    ['tema composto', 'tema commedia, romantica, natalizia'],
    ['genere', 'genere horror'],
    ['genere multiplo', 'genere horror, thriller'],
    ['genere con accento', 'genere azione'],
    ['anno secco', 'anno 1994'],
    ['anno intervallo', 'anno 1990-1999'],
    ['anno intervallo al rovescio', 'anno 1999-1990'],
    ['anno futuro', 'anno 2099'],
    ['voto minimo', 'voto 8'],
    ['voto con confronto', 'voto > 8'],
    ['voto impossibile', 'voto 11'],
    ['durata', 'durata < 90'],
    ['eta', 'eta 0-6'],
    ['cast', 'cast leonardo dicaprio'],
    ['cast con refuso', 'cast leonardo dicapry'],
    ['regista', 'regista nolan'],
    ['regista nome completo', 'regista christopher nolan'],
    ['crew', 'crew hans zimmer'],
    ['provider', 'provider netflix'],
    ['lingua', 'lingua giapponese'],
    ['paese', 'paese francia'],
    ['anime', 'anime'],
    ['simili', 'simili interstellar'],
    ['simili con due semi', 'simili alien, prometheus'],
    ['simili titolo inesistente', 'simili filmche noneista'],
    ['titolo', 'titolo matrix'],
    ['senza genere', 'genere horror senza splatter'],
    ['ordina voto', 'tema guerra ordina voto'],
    ['combinata lunga', 'genere thriller anno 2000-2010 voto > 7 cast tom cruise'],
    ['contraddizione', 'anno 2030 genere horror voto > 9.5'],
    ['parola sola', 'matrix'],
    ['parola sola con refuso', 'matrx'],
    ['titolo con apostrofo', 'schindlers list'],
    ['titolo con accento', 'la citta incantata'],
    ['tre intenti (righe)', 'genere horror\ncast tom cruise'],
    ['operatore sconosciuto', 'colore rosso'],
    ['operatore senza valore', 'tema'],
    ['solo virgole', ',,,'],
    ['maiuscole', 'TEMA HORROR'],
    ['punteggiatura', 'tema: horror!'],
    ['due punti e virgola', 'genere: horror; anno: 1990']
];

async function giroSintassi() {
    for (const [nome, q] of CASI_SINTASSI) {
        for (const tipo of ['movie', 'series']) {
            const url = `/${UTENTE}/${CONFIG}/catalog/${tipo}/yaca_search_standard/search=${encodeURIComponent(q)}.json`;
            const r = await chiama('C. sintassi', `${tipo}: ${nome}`, url);
            const metas = r.json?.metas;
            const valide = r.risposta?.status === 200 && Array.isArray(metas) && metasValide(metas);
            registra('C. sintassi', `${tipo}: ${nome}`, {
                ok: valide,
                nota: valide ? '' : `status ${r.risposta?.status}, body ${String(r.testo).slice(0, 120)}`,
                ms: r.ms, titoli: Array.isArray(metas) ? metas.length : null, query: q
            });
        }
    }
}

// ———————————————————————————————————————————————————————————————
// D. Cataloghi: paginazione e extra
// ———————————————————————————————————————————————————————————————
async function giroCataloghi(manifest) {
    if (!manifest) return;
    for (const cat of manifest.catalogs) {
        if ((cat.extra || []).some(e => e.name === 'search')) continue;
        const coda = cat.id.replace(/^.*?\./, '');
        const p0 = await chiama('D. pagine', `${coda} p0`, `/${UTENTE}/${CONFIG}/catalog/${cat.type}/${cat.id}.json`);
        const p1 = await chiama('D. pagine', `${coda} p1`, `/${UTENTE}/${CONFIG}/catalog/${cat.type}/${cat.id}/skip=20.json`);
        const uno = ids(p0.json?.metas);
        const due = ids(p1.json?.metas);
        const doppioni = uno.filter(x => due.includes(x));
        registra('D. pagine', `${coda} paginazione`, {
            ok: p0.risposta?.status === 200 && p1.risposta?.status === 200 && doppioni.length === 0,
            nota: doppioni.length ? `${doppioni.length} doppioni fra pagina 1 e 2` : '',
            titoliP0: uno.length, titoliP1: due.length, msP0: p0.ms, msP1: p1.ms
        });
    }

    // Preset con extra di ordinamento e genere.
    const preset = manifest.catalogs.find(c => (c.extra || []).some(e => e.name === 'sortBy'));
    if (preset) {
        const coda = preset.id.replace(/^.*?\./, '');
        const opzioni = (preset.extra.find(e => e.name === 'sortBy').options || []).slice(0, 4);
        for (const o of opzioni) {
            const valore = typeof o === 'string' ? o : o.value;
            const r = await chiama('D. preset', `${coda} sortBy=${valore}`, `/${UTENTE}/${CONFIG}/catalog/${preset.type}/${preset.id}/sortBy=${encodeURIComponent(valore)}.json`);
            const metas = r.json?.metas;
            registra('D. preset', `${coda} sortBy=${valore}`, {
                ok: r.risposta?.status === 200 && Array.isArray(metas),
                nota: r.risposta?.status === 200 ? '' : `status ${r.risposta?.status}`,
                ms: r.ms, titoli: Array.isArray(metas) ? metas.length : null
            });
        }
    }
}

// ———————————————————————————————————————————————————————————————
// E. Meta
// ———————————————————————————————————————————————————————————————
async function giroMeta() {
    const casi = [
        ['film imdb', '/meta/movie/tt0111161.json'],
        ['film tmdb', '/meta/movie/278.json'],
        ['serie imdb', '/meta/series/tt0903747.json'],
        ['episodio stile stremio', '/meta/series/tt0903747:1:1.json'],
        ['id inesistente', '/meta/movie/tt999999999.json'],
        ['id spazzatura', '/meta/movie/abc.json'],
        ['percorso sospetto', '/meta/movie/..%2F..%2Fetc%2Fpasswd.json']
    ];
    for (const [nome, coda] of casi) {
        const r = await chiama('E. meta', nome, `/${UTENTE}/${CONFIG}${coda}`);
        const meta = r.json?.meta;
        registra('E. meta', nome, {
            ok: r.risposta?.status === 200 && (meta === undefined || meta === null || (typeof meta.id === 'string' && typeof meta.name === 'string')),
            nota: r.risposta?.status === 200 ? '' : `status ${r.risposta?.status}, body ${String(r.testo).slice(0, 100)}`,
            ms: r.ms, haMeta: Boolean(meta), bytes: r.bytes
        });
    }
}

// ———————————————————————————————————————————————————————————————
// F. API web
// ———————————————————————————————————————————————————————————————
async function giroApi() {
    const json = (oggetto) => ({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(oggetto)
    });
    const casi = [
        // La lista dei preset e' protetta dalla sessione: 401 e' la risposta giusta, non un guasto.
        ['preset', () => chiama('F. api', 'GET preset', '/api/configurazione/preset'), r => [200, 401].includes(r.risposta.status)],
        // Il contratto vero e' `{ id, type, filters }` (o `prompt`), non `query`.
        ['preview canonica', () => chiama('F. api', 'POST preview', '/api/preview-catalog', json({ id: 'anteprima', type: 'movie', filters: { with_genres: '27' } })), r => r.risposta.status === 200 && r.json],
        ['preview vuoto', () => chiama('F. api', 'POST preview vuoto', '/api/preview-catalog', json({})), r => r.risposta.status < 500],
        ['preview null', () => chiama('F. api', 'POST preview null', '/api/preview-catalog', json({ query: null })), r => r.risposta.status < 500],
        ['preview numero', () => chiama('F. api', 'POST preview numero', '/api/preview-catalog', json({ query: 42 })), r => r.risposta.status < 500],
        ['preview array', () => chiama('F. api', 'POST preview array', '/api/preview-catalog', json({ query: ['a', 'b'] })), r => r.risposta.status < 500],
        ['preview oggetto', () => chiama('F. api', 'POST preview oggetto', '/api/preview-catalog', json({ query: { a: 1 } })), r => r.risposta.status < 500],
        ['preview SQL', () => chiama('F. api', 'POST preview SQL', '/api/preview-catalog', json({ query: "tema horror' OR 1=1--" })), r => r.risposta.status < 500],
        ['preview XSS', () => chiama('F. api', 'POST preview XSS', '/api/preview-catalog', json({ query: '<img src=x onerror=alert(1)>' })), r => r.risposta.status < 500],
        ['preview corpo enorme', () => {
            const corpo = JSON.stringify({ query: 'horror', riempimento: 'x'.repeat(900000) });
            return chiama('F. api', 'POST preview corpo enorme', '/api/preview-catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: corpo });
        }, r => r.risposta.status < 500],
        ['admin senza password', () => chiama('F. api', 'GET /api/admin/metrics senza password', '/api/admin/metrics'), r => [401, 403, 503].includes(r.risposta.status)],
        ['admin password sbagliata', () => chiama('F. api', 'GET /api/admin/metrics password errata', '/api/admin/metrics', { headers: { 'x-admin-pass': 'sbagliata' } }), r => [401, 403].includes(r.risposta.status)],
        ['admin api senza password', () => chiama('F. api', 'GET /api/admin/metrics senza password', '/api/admin/metrics'), r => r.risposta.status !== 200],
        ['tmdb keyword senza q', () => chiama('F. api', 'GET tmdb keyword senza q', '/api/tmdb/search/keyword'), r => r.risposta.status < 500],
        ['tmdb person senza q', () => chiama('F. api', 'GET tmdb person senza q', '/api/tmdb/search/person'), r => r.risposta.status < 500],
        ['tmdb genre', () => chiama('F. api', 'GET tmdb genre', '/api/tmdb/search/genre?q=horror'), r => r.risposta.status < 500],
        ['profilo senza cookie', () => chiama('F. api', 'GET profilo senza cookie', '/api/profilo'), r => r.risposta.status !== 200],
        ['ricerca legacy', () => chiama('F. api', 'GET /api/ricerca?q=horror', '/api/ricerca?q=horror'), r => r.risposta.status < 500],
        ['prototype pollution', () => chiama('F. api', 'GET ?__proto__', '/api/configurazione/preset?__proto__[inquinato]=1'), r => r.risposta.status < 500],
        ['poster traversal', () => chiama('F. api', 'GET poster traversal', '/images/poster/movie/..%2F..%2Fpackage.json/1'), r => r.risposta.status < 500],
        ['sync-status senza auth', () => chiama('F. api', 'GET sync-status', '/sync-status/qualcuno'), r => r.risposta.status < 500]
    ];
    for (const [nome, esegui, buono] of casi) {
        const r = await esegui();
        const ok = buono(r);
        registra('F. api', nome, {
            ok, nota: ok ? '' : `status ${r.risposta?.status}, body ${String(r.testo).slice(0, 140)}`,
            ms: r.ms, bytes: r.bytes
        });
    }
}

// ———————————————————————————————————————————————————————————————
// G. Robustezza: carico concorrente
// ———————————————————————————————————————————————————————————————
async function giroCarico() {
    const ricerca = `/${UTENTE}/${CONFIG}/catalog/movie/yaca_search_standard/search=tema%20horror.json`;
    const t0 = Date.now();
    const risposte = await Promise.all(Array.from({ length: 15 }, () => fetch(BASE + ricerca).then(async r => ({ stato: r.status, testo: await r.text() })).catch(e => ({ stato: 0, testo: e.message }))));
    const ms = Date.now() - t0;
    const buone = risposte.filter(r => r.stato === 200 && r.testo.includes('"metas"')).length;
    registra('G. carico', '15 ricerche concorrenti', {
        ok: buone === 15, nota: buone === 15 ? '' : `solo ${buone}/15 hanno risposto bene`, ms, msPerRichiesta: Math.round(ms / 15)
    });

    const catalogo = `/${UTENTE}/${CONFIG}/catalog/movie/yaca_home.json`;
    const t1 = Date.now();
    const risposte2 = await Promise.all(Array.from({ length: 10 }, () => fetch(BASE + catalogo).then(async r => ({ stato: r.status, testo: await r.text() })).catch(e => ({ stato: 0, testo: e.message }))));
    const ms2 = Date.now() - t1;
    const buone2 = risposte2.filter(r => r.stato === 200 && r.testo.includes('"metas"')).length;
    registra('G. carico', '10 cataloghi concorrenti', {
        ok: buone2 === 10, nota: buone2 === 10 ? '' : `solo ${buone2}/10 hanno risposto bene`, ms: ms2, msPerRichiesta: Math.round(ms2 / 10)
    });

    // Un catalogo inesistente non deve mai dare 500.
    const r = await chiama('G. carico', 'catalogo inesistente', `/${UTENTE}/${CONFIG}/catalog/movie/catalogo_fantasma.json`);
    registra('G. carico', 'catalogo inesistente', {
        ok: r.risposta?.status === 200 && Array.isArray(r.json?.metas),
        nota: r.risposta?.status === 200 ? '' : `status ${r.risposta?.status}, body ${String(r.testo).slice(0, 120)}`, ms: r.ms
    });

    // Utente simulato (profilo di prova): le rotte devono reggere senza configurazione.
    const s = await chiama('G. carico', 'utente simulato manifest', `/${SIM_UTENTE}/${SIM_CONFIG}/manifest.json`);
    registra('G. carico', 'utente simulato manifest', {
        ok: s.risposta?.status === 200, nota: s.risposta?.status === 200 ? '' : `status ${s.risposta?.status}`, ms: s.ms
    });
    const s2 = await chiama('G. carico', 'utente simulato ricerca', `/${SIM_UTENTE}/${SIM_CONFIG}/catalog/movie/yaca_search_standard/search=tema%20horror.json`);
    registra('G. carico', 'utente simulato ricerca', {
        ok: s2.risposta?.status === 200 && Array.isArray(s2.json?.metas),
        nota: s2.risposta?.status === 200 ? '' : `status ${s2.risposta?.status}`, ms: s2.ms, titoli: s2.json?.metas?.length
    });
}

(async () => {
    console.log(`BASE = ${BASE}`);
    const manifest = await giroManifest();
    await giroBordiRicerca();
    await giroSintassi();
    await giroCataloghi(manifest);
    await giroMeta();
    await giroApi();
    await giroCarico();

    const perGruppo = {};
    for (const e of esiti) {
        perGruppo[e.gruppo] = perGruppo[e.gruppo] || { ok: 0, ko: 0 };
        perGruppo[e.gruppo][e.ok ? 'ok' : 'ko']++;
    }
    console.log('\n=== riassunto ===');
    for (const [g, c] of Object.entries(perGruppo)) console.log(`${g.padEnd(16)} ${c.ok} ok · ${c.ko} ko`);

    const tempi = esiti.filter(e => e.gruppo.startsWith('C.') && e.titoli !== undefined && e.ok).map(e => e.ms).sort((a, b) => a - b);
    if (tempi.length) {
        const q = p => tempi[Math.min(tempi.length - 1, Math.floor(tempi.length * p))];
        console.log(`tempi ricerca: p50 ${q(0.5)} ms · p90 ${q(0.9)} ms · max ${tempi[tempi.length - 1]} ms`);
    }

    const destinazione = path.join(__dirname, 'esiti.json');
    fs.writeFileSync(destinazione, JSON.stringify({ base: BASE, quando: new Date().toISOString(), esiti }, null, 2));
    console.log(`\nesiti completi: ${destinazione} (${esiti.filter(e => !e.ok).length} anomalie su ${esiti.length} prove)`);
    process.exit(0);
})();
