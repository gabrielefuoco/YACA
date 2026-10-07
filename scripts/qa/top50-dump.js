#!/usr/bin/env node
/**
 * scripts/qa/top50-dump.js
 *
 * Estrae la top-N (default 50) di ogni preset curato con la STESSA query e lo
 * STESSO orderBy che il router usa in produzione (DuckDbProvider), per il
 * giudizio manuale della campagna QC.
 *
 * Offline: legge i Parquet di produzione da .cache/tmdb (o --dump-dir), nessuna
 * chiamata di rete, nessuna connessione ad Atlas/Redis, nessun LLM.
 *
 * Riferimenti:
 * - Spec: .scratch/qc-cataloghi/issues/01-campagna-qc-cataloghi.md (D2)
 * - Baseline meccanica: scripts/qa/catalog-audit.js (--audit <audit.json> la fonde nel dump)
 *
 * Uso:
 *   node scripts/qa/top50-dump.js [--out <dir>] [--audit <audit.json>] [--limit 50] [--only id1,id2]
 *
 * Artefatti (in <out>, default .scratch/qc-cataloghi/runs/top50-<timestamp>):
 *   index.json                 catalogo dei dump + esclusi + configurazione
 *   top50/<preset>.json        macchina: promessa, contesto audit, item
 *   by-category/<NN>-<slug>.md leggibile: un file per categoria, tabelle per catalogo
 *   overlap.json               coppie J@40 per tipo (distintività, stessa definizione dell'audit)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const store = require('../../src/db/duckDbStore');
const { getPresets } = require('../../src/data/presets');
const { getDuckDbCatalogFromPreset } = require('../../src/catalog/providers/DuckDbProvider');
const { G } = require('../../src/data/filters');

const num = v => {
    const n = Number(typeof v === 'bigint' ? Number(v) : v);
    return Number.isFinite(n) ? n : null;
};
const slug = s => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// --- Vocabolario leggibile per la promessa ---
const GENRE_IT = {
    Action: 'Azione', Adventure: 'Avventura', Animation: 'Animazione', Comedy: 'Commedia', Crime: 'Crimine',
    Documentary: 'Documentario', Drama: 'Dramma', Family: 'Famiglia', Fantasy: 'Fantasy', History: 'Storia',
    Horror: 'Horror', Music: 'Musica', Mystery: 'Mistero', Romance: 'Romantico', SciFi: 'Fantascienza',
    Thriller: 'Thriller', War: 'Guerra', Western: 'Western', TVMovie: 'Film TV', ActionAdventure: 'Azione&Avventura',
    Kids: 'Kids', News: 'News', Reality: 'Reality', SciFiFantasy: 'Sci-Fi&Fantasy', Soap: 'Soap', Talk: 'Talk',
    WarPolitics: 'Guerra&Politica'
};
const GENRE_BY_ID = (() => {
    const m = new Map();
    for (const table of [G.Movie, G.TV]) {
        for (const [name, id] of Object.entries(table)) {
            if (!m.has(id)) m.set(id, GENRE_IT[name] || name);
        }
    }
    return m;
})();
// I nomi che il parquet porta nei metadati sono quelli TMDB in inglese: "Action & Adventure", "Sci-Fi & Fantasy".
const GENRE_NAME_IT = {
    'Action': 'Azione', 'Adventure': 'Avventura', 'Action & Adventure': 'Azione&Avventura',
    'Animation': 'Animazione', 'Comedy': 'Commedia', 'Crime': 'Crimine', 'Documentary': 'Documentario',
    'Drama': 'Dramma', 'Family': 'Famiglia', 'Fantasy': 'Fantasy', 'History': 'Storia', 'Horror': 'Horror',
    'Music': 'Musica', 'Mystery': 'Mistero', 'Romance': 'Romantico', 'Science Fiction': 'Fantascienza',
    'Sci-Fi': 'Fantascienza', 'Sci-Fi & Fantasy': 'Sci-Fi&Fantasy', 'TV Movie': 'Film TV',
    'Thriller': 'Thriller', 'War': 'Guerra', 'War & Politics': 'Guerra&Politica', 'Western': 'Western',
    'Kids': 'Kids', 'News': 'News', 'Reality': 'Reality', 'Soap': 'Soap', 'Talk': 'Talk'
};
const genreLabel = g => GENRE_NAME_IT[g] || g;
const LANG_IT = {
    ja: 'giapponese', ko: 'coreano', zh: 'cinese', en: 'inglese', it: 'italiano', fr: 'francese', de: 'tedesco',
    es: 'spagnolo', pt: 'portoghese', sv: 'svedese', da: 'danese', no: 'norvegese', fi: 'finlandese', nl: 'olandese',
    pl: 'polacco', tr: 'turco', hi: 'hindi', th: 'thai', ru: 'russo', is: 'islandese', ar: 'arabo', he: 'ebraico',
    ta: 'tamil', te: 'telugu', ml: 'malayalam', id: 'indonesiano', tl: 'tagalog', cs: 'ceco', hu: 'ungherese',
    el: 'greco', uk: 'ucraino', fa: 'persiano', vi: 'vietnamita', nb: 'norvegese'
};
const COUNTRY_IT = {
    JP: 'Giappone', KR: 'Corea del Sud', HK: 'Hong Kong', CN: 'Cina', TW: 'Taiwan', TH: 'Thailandia',
    IN: 'India', US: 'USA', GB: 'Regno Unito', IT: 'Italia', FR: 'Francia', DE: 'Germania', ES: 'Spagna',
    SE: 'Svezia', DK: 'Danimarca', NO: 'Norvegia', FI: 'Finlandia', IS: 'Islanda', PL: 'Polonia',
    TR: 'Turchia', BR: 'Brasile', MX: 'Messico', AR: 'Argentina', CA: 'Canada', AU: 'Australia', IE: 'Irlanda',
    BE: 'Belgio', NL: 'Paesi Bassi', RU: 'Russia', UA: 'Ucraina'
};

const KEY_LABEL = {
    with_genres: 'Generi', without_genres: 'Generi esclusi',
    with_keywords: 'Keyword', without_keywords: 'Keyword escluse',
    with_crew: 'Regia/sceneggiatura (id TMDB)', with_cast: 'Cast (id TMDB)',
    with_companies: 'Case di produzione (id TMDB)', with_networks: 'Network (id TMDB)',
    with_collections: 'Collection TMDB', with_original_language: 'Lingua originale',
    with_origin_country: 'Paese d\'origine', without_tmdbIds: 'Esclusi (TMDB id)',
    'vote_count.gte': 'Voti minimi', 'vote_count.lte': 'Voti massimi',
    'vote_average.gte': 'Voto minimo', 'vote_average.lte': 'Voto massimo',
    'popularity.gte': 'Popolarità minima', 'popularity.lte': 'Popolarità massima',
    'primary_release_date.gte': 'Uscita dal', 'primary_release_date.lte': 'Uscita al',
    'first_air_date.gte': 'Prima messa in onda dal', 'first_air_date.lte': 'Prima messa in onda al',
    'air_date.gte': 'Episodio dal', 'air_date.lte': 'Episodio al',
    'with_runtime.gte': 'Durata minima (min)', 'with_runtime.lte': 'Durata massima (min)',
    sort_by: 'Ordinamento dichiarato', strategy: 'Strategia'
};

function describeValue(key, raw) {
    const values = String(raw).split('|');
    if (key === 'with_genres' || key === 'without_genres') {
        return values.map(v => v.split(',').map(x => {
            const id = Number(x);
            return Number.isFinite(id) && GENRE_BY_ID.has(id) ? `${GENRE_BY_ID.get(id)} (${id})` : x;
        }).join(', ')).join(' | ');
    }
    if (key === 'with_original_language') return values.map(v => LANG_IT[v] ? `${LANG_IT[v]} (${v})` : v).join(' | ');
    if (key === 'with_origin_country') return values.map(v => COUNTRY_IT[v] ? `${COUNTRY_IT[v]} (${v})` : v).join(' | ');
    return String(raw);
}

function describePromise(preset) {
    const q = (preset.queries && preset.queries[0]) || {};
    const parts = [];
    for (const [key, value] of Object.entries(q)) {
        if (value === undefined || value === null || value === '') continue;
        const label = KEY_LABEL[key] || key;
        parts.push({ chiave: key, etichetta: label, valore: Array.isArray(value) ? value.join(' | ') : String(value), valoreLeggibile: Array.isArray(value) ? value.join(' | ') : describeValue(key, value) });
    }
    return parts;
}

function orderByLabel(orderBy) {
    if (!orderBy) return null;
    if (/vote_average/.test(orderBy)) return 'VOTO MEDIO (con tie-break su voti)';
    if (/revenue/.test(orderBy)) return 'INCASSI';
    if (/release_date/.test(orderBy) && /DESC/.test(orderBy)) return 'PIÙ RECENTI';
    if (/first_air_date/.test(orderBy) && /DESC/.test(orderBy)) return 'PIÙ RECENTI (prima messa in onda)';
    if (/popularity/.test(orderBy)) return 'POPOLARITÀ';
    if (/_mtime/.test(orderBy)) return 'AGGIUNTA IN LIBRERIA';
    return orderBy.slice(0, 80);
}

function mdEscape(s) {
    return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

// --- CLI ---
function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { out: null, audit: null, dumpDir: null, limit: 50, only: null, help: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--out' && args[i + 1]) opts.out = args[++i];
        else if (args[i] === '--audit' && args[i + 1]) opts.audit = args[++i];
        else if (args[i] === '--dump-dir' && args[i + 1]) opts.dumpDir = args[++i];
        else if (args[i] === '--limit' && args[i + 1]) opts.limit = Number(args[++i]) || 50;
        else if (args[i] === '--only' && args[i + 1]) opts.only = new Set(args[++i].split(',').map(s => s.trim()).filter(Boolean));
        else if (args[i] === '--help' || args[i] === '-h') opts.help = true;
    }
    return opts;
}

function gitCommit() {
    try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

function timestampTag(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function poolCount(preset) {
    const table = preset.type === 'movie' ? 'movies' : 'tv';
    const where = ['adult = false', ...(preset.where || [])].join(' AND ');
    const r = await store.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`);
    return num(r[0]?.n);
}

function compactItem(it, pos) {
    const raw = it.rawTMDB || {};
    const score = raw.vote_average !== undefined && raw.vote_average !== null
        ? Number(raw.vote_average)
        : (it.imdbRating ? Number(it.imdbRating) : null);
    return {
        pos,
        tmdbId: num(it._tmdbId ?? String(it.id || '').replace(/^tmdb:/i, '')),
        titolo: it.name || it.title || raw.title || raw.name || 'Unknown',
        anno: it.releaseInfo || (raw.release_date ? String(raw.release_date).slice(0, 4) : null) || (raw.first_air_date ? String(raw.first_air_date).slice(0, 4) : null),
        voto: score,
        voti: num(it.vote_count ?? raw.vote_count),
        popolarita: num(it.popularity ?? raw.popularity),
        generi: (it.genres || []).map(g => {
            if (g && typeof g === 'object') return genreLabel(GENRE_BY_ID.get(Number(g.id)) || g.name);
            const asNumber = Number(g);
            if (Number.isFinite(asNumber)) return GENRE_BY_ID.get(asNumber) || String(g);
            return genreLabel(String(g));
        }).filter(Boolean),
        lingua: raw.original_language || null,
        isAnime: it._isAnime === true,
        haPoster: Boolean(it.poster || raw.poster_path)
    };
}

function renderCatalogMd(cat, auditCtx, overlaps) {
    const p = cat;
    const lines = [];
    lines.push(`### ${p.promessa.emoji ? p.promessa.emoji + ' ' : ''}${p.name}  ·  \`${p.id}\``);
    lines.push('');
    lines.push(`- **Tipo**: ${p.type === 'movie' ? 'film' : 'serie'}  ·  **Categoria**: ${p.category}  ·  **Anime**: ${p.isAnime ? 'sì' : 'no'}`);
    const promessa = (p.promessa.descrizione || []).map(d => `${d.etichetta}: ${d.valoreLeggibile}`).join(' · ');
    lines.push(`- **Promessa**: ${promessa || '(nessun parametro dichiarato)'}`);
    lines.push(`- **Ordine dichiarato**: ${orderByLabel(p.orderBy) || 'non dichiarato'}`);
    lines.push(`- **Pool nel dump**: ${p.pool === null ? 'n/d' : p.pool} titoli  ·  **Restituiti**: ${p.items.length}`);
    if (auditCtx) {
        const q = auditCtx.quality || {};
        const bits = [];
        if (q.score) bits.push(`mediana voto ${q.score.med}`, `p10 ${q.score.p10}`, `p90 ${q.score.p90}`);
        if (q.lowScorePct !== undefined) bits.push(`sotto 6.0: ${q.lowScorePct}%`);
        if (q.kwEmptyPct !== undefined) bits.push(`senza keyword: ${q.kwEmptyPct}%`);
        if (bits.length) lines.push(`- **Audit meccanico (120 item)**: ${bits.join(' · ')}`);
        if (auditCtx.findings && auditCtx.findings.length) {
            lines.push(`- **Finding audit**: ${auditCtx.findings.map(f => `${f.level}/${f.code}: ${f.message}`).join(' · ')}`);
        }
    }
    if (overlaps && overlaps.length) {
        lines.push(`- **Overlap J@40**: ${overlaps.map(o => `${o.con} ${o.j40}${o.sameMedia && o.j40 >= 0.5 ? ' ⚠' : ''}`).join(' · ')}`);
    }
    lines.push('');
    lines.push('| # | Titolo (anno) | Voto | Voti | Pop | Generi | Lingua |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const it of p.items) {
        lines.push(`| ${it.pos} | ${mdEscape(it.titolo)}${it.anno ? ` (${it.anno})` : ''}${it.isAnime ? ' 🎌' : ''} | ${it.voto ?? ''} | ${it.voti ?? ''} | ${it.popolarita ?? ''} | ${mdEscape(it.generi.join(', '))} | ${it.lingua || ''} |`);
    }
    if (!p.items.length) lines.push('| — | (nessun titolo restituito) | | | | | |');
    lines.push('');
    return lines.join('\n');
}

async function main() {
    const opts = parseArgs();
    if (opts.help) {
        console.log('Uso: node scripts/qa/top50-dump.js [--out <dir>] [--audit <audit.json>] [--limit 50] [--only id1,id2] [--dump-dir <parquet dir>]');
        process.exit(0);
    }

    const runAt = new Date();
    const outDir = path.resolve(opts.out || path.join(__dirname, '..', '..', '.scratch', 'qc-cataloghi', 'runs', `top50-${timestampTag(runAt)}`));

    if (opts.dumpDir) {
        store.basePath = path.resolve(opts.dumpDir);
        store.moviesParquetPath = path.join(store.basePath, 'movies.parquet');
        store.tvParquetPath = path.join(store.basePath, 'tv.parquet');
    }

    const t0 = Date.now();
    await store.init();
    const initMs = Date.now() - t0;

    let auditJson = null;
    if (opts.audit) {
        auditJson = JSON.parse(fs.readFileSync(path.resolve(opts.audit), 'utf8'));
    }
    const auditById = new Map((auditJson?.catalogs || []).map(c => [c.id, c]));
    const findingsById = new Map();
    for (const f of auditJson?.findings || []) {
        if (!f.preset) continue;
        if (!findingsById.has(f.preset)) findingsById.set(f.preset, []);
        findingsById.get(f.preset).push({ level: f.level, code: f.code, message: f.message });
    }

    const presets = getPresets();
    const excluded = [];
    const target = [];
    for (const p of presets) {
        if (opts.only && !opts.only.has(p.id)) continue;
        if (p._provider) { excluded.push({ id: p.id, name: p.name, reason: `_provider=${p._provider} (non passa dal parquet)` }); continue; }
        if (!Array.isArray(p.where) || !p.where.length) { excluded.push({ id: p.id, name: p.name, reason: 'no where array' }); continue; }
        target.push(p);
    }

    const catalogs = [];
    for (const preset of target) {
        const t = Date.now();
        let items = [];
        let err = null;
        try {
            items = await getDuckDbCatalogFromPreset({ type: preset.type, where: preset.where, orderBy: preset.orderBy }, 0, opts.limit);
        } catch (e) {
            err = e.message;
        }
        const msQuery = Date.now() - t;
        let pool = null;
        if (!err) {
            try { pool = await poolCount(preset); } catch { pool = null; }
        }
        const compact = items.map((it, i) => compactItem(it, i + 1));
        catalogs.push({
            id: preset.id,
            name: `${preset.emoji || ''} ${preset.name}`.trim(),
            nameRaw: preset.name,
            emoji: preset.emoji || null,
            category: preset.category,
            type: preset.type,
            isAnime: preset.isAnime === true,
            pool,
            msQuery,
            error: err,
            itemsCount: compact.length,
            orderBy: preset.orderBy || null,
            orderByLabel: orderByLabel(preset.orderBy),
            promessa: { descrizione: describePromise(preset), queries: preset.queries || [], where: preset.where || [] },
            audit: auditById.get(preset.id) ? {
                pool: auditById.get(preset.id).pool,
                quality: auditById.get(preset.id).quality,
                findings: findingsById.get(preset.id) || []
            } : null,
            items: compact
        });
    }

    // Overlap J@40 (stessa definizione di catalog-audit.js), per tipo
    const sets = catalogs.map(c => ({ id: c.id, name: c.nameRaw, type: c.type, ids: new Set(c.items.slice(0, 40).map(i => i.tmdbId).filter(v => v !== null)) }));
    const overlapsById = new Map();
    const pairs = [];
    for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
            const a = sets[i], b = sets[j];
            const sameMedia = a.type === b.type;
            const inter = [...a.ids].filter(x => b.ids.has(x)).length;
            const union = new Set([...a.ids, ...b.ids]).size;
            const j40 = union ? +(inter / union).toFixed(3) : 0;
            const shared = inter;
            if (j40 < 0.20 && shared < 8) continue;
            const rec = { a: a.id, aName: a.name, b: b.id, bName: b.name, j40, shared, sameMedia };
            pairs.push(rec);
            // Il giudice vede tutti i peer ≥0.20, anche sull'altro tipo (un movie/series clone è un segnale utile)
            for (const [self, other] of [[a.id, b], [b.id, a]]) {
                if (!overlapsById.has(self)) overlapsById.set(self, []);
                overlapsById.get(self).push({ con: other.name, id: other.id, j40, shared, sameMedia });
            }
        }
    }
    pairs.sort((x, y) => y.j40 - x.j40);
    for (const list of overlapsById.values()) list.sort((x, y) => y.j40 - x.j40);

    // --- Scrittura artefatti ---
    const top50Dir = path.join(outDir, 'top50');
    const catDir = path.join(outDir, 'by-category');
    fs.mkdirSync(top50Dir, { recursive: true });
    fs.mkdirSync(catDir, { recursive: true });

    const byCategory = new Map();
    for (const cat of catalogs) {
        fs.writeFileSync(path.join(top50Dir, `${cat.id}.json`), JSON.stringify(cat, null, 1), 'utf8');
        if (!byCategory.has(cat.category)) byCategory.set(cat.category, []);
        byCategory.get(cat.category).push(cat);
    }

    let catIndex = 0;
    const categoryFiles = [];
    for (const [category, cats] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
        catIndex++;
        const file = `${String(catIndex).padStart(2, '0')}-${slug(category)}.md`;
        const header = [
            `# ${category}`,
            '',
            `${cats.length} cataloghi · top ${opts.limit} per catalogo · dump del ${runAt.toISOString()}`,
            '',
            'Come si legge: «Promessa» sono i parametri dichiarati nel preset, «Audit meccanico» i numeri di `catalog-audit.js` (senza giudizio), «Overlap J@40» la sovrapposizione dei primi 40 titoli con altri cataloghi dello stesso dump.',
            '',
            '---',
            ''
        ].join('\n');
        const body = cats.map(c => renderCatalogMd(c, c.audit, overlapsById.get(c.id))).join('\n---\n\n');
        fs.writeFileSync(path.join(catDir, file), header + body, 'utf8');
        categoryFiles.push({ file, category, catalogs: cats.map(c => c.id) });
    }

    const index = {
        generatedAt: runAt.toISOString(),
        gitCommit: gitCommit(),
        limit: opts.limit,
        parquetDir: store.basePath,
        duckDbInitMs: initMs,
        totalMs: Date.now() - t0,
        auditSource: opts.audit ? path.resolve(opts.audit) : null,
        catalogs: catalogs.map(c => ({
            id: c.id, name: c.name, category: c.category, type: c.type, isAnime: c.isAnime,
            pool: c.pool, itemsCount: c.itemsCount, msQuery: c.msQuery, error: c.error,
            orderByLabel: c.orderByLabel
        })),
        excluded,
        categoryFiles
    };
    fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, 'overlap.json'), JSON.stringify({ generatedAt: runAt.toISOString(), pairs }, null, 2), 'utf8');

    console.log(`[top50-dump] ${catalogs.length} cataloghi · ${catalogs.reduce((n, c) => n + c.itemsCount, 0)} titoli · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (excluded.length) console.log(`[top50-dump] esclusi: ${excluded.map(e => e.id).join(', ')}`);
    console.log(`[top50-dump] out: ${outDir}`);
    process.exit(0);
}

main().catch(e => { console.error('[top50-dump] errore fatale:', e); process.exit(1); });
