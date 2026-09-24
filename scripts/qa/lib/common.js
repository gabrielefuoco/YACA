/**
 * scripts/qa/lib/common.js
 *
 * Utility condivise dall'harness di simulazione profili (ticket 10):
 * percorsi, caricamento spec, run dir, normalizzazione id, piccoli helper CLI.
 */

const fs = require('fs');
const path = require('path');

// .env vive nella root del repo; i lib stanno in scripts/qa/lib → 3 livelli su.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
require('dotenv').config({ path: path.join(REPO_ROOT, '.env'), quiet: true });

const SCRATCH_DIR = path.join(REPO_ROOT, '.scratch', 'simulazione-profili');
const RUNS_DIR = path.join(SCRATCH_DIR, 'runs');
const DEFAULT_SPEC_PATH = path.join(REPO_ROOT, 'scripts', 'qa', 'profiles.spec.json');
const ATLAS_STATE_PATH = path.join(SCRATCH_DIR, 'atlas-state.json');

const HERO_CATALOGS = [
    'yaca_true_blend_movies',
    'yaca_true_blend_series',
    'yaca_seed_network_movies',
    'yaca_seed_network_series',
    'yaca_hidden_gems_movies',
    'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies',
    'yaca_trakt_filtered_series'
];
const HERO_SET = new Set(HERO_CATALOGS);

const REAL_PROFILE = {
    userId: 'REOZrGNRr3',
    addonUuid: 'ff7084d8-904b-42d9-91f5-ea2b4ae37590',
    expectedTasteProfiles: 17
};

const SIM_PREFIXES = {
    userId: '^sim_user_',
    uuid: '^sim-uuid-',
    profileId: '^sim_prof_'
};

function log(...args) {
    console.log('[simulate]', ...args);
}

function warn(...args) {
    console.warn('[simulate]', ...args);
}

function fail(message) {
    const err = new Error(message);
    err.isCliError = true;
    throw err;
}

/**
 * Parser minimale: --flag valore | --flag | posizionali.
 */
function parseArgs(argv) {
    const positional = [];
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else {
            positional.push(arg);
        }
    }
    return { positional, flags };
}

function parseList(value) {
    if (!value || value === true) return null;
    return String(value)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, 'utf8');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeFileName(id) {
    return String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function timestampSlug(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function newRunDir() {
    const dir = path.join(RUNS_DIR, timestampSlug());
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function listRunDirs() {
    if (!fs.existsSync(RUNS_DIR)) return [];
    return fs.readdirSync(RUNS_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => {
            const dir = path.join(RUNS_DIR, e.name);
            let mtimeMs = 0;
            try { mtimeMs = fs.statSync(dir).mtimeMs; } catch { /* ignore */ }
            return { dir, mtimeMs };
        })
        .sort((a, b) => (b.mtimeMs - a.mtimeMs) || b.dir.localeCompare(a.dir))
        .map(e => e.dir);
}

function resolveRunDir(value, { latest = false } = {}) {
    if (!value) {
        if (!latest) return null;
        const dirs = listRunDirs();
        if (dirs.length === 0) fail(`Nessuna run trovata in ${RUNS_DIR}: esegui prima "fetch".`);
        return dirs[0];
    }
    const asIs = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
    if (fs.existsSync(asIs) && fs.statSync(asIs).isDirectory()) return asIs;
    const inRuns = path.join(RUNS_DIR, value);
    if (fs.existsSync(inRuns)) return inRuns;
    fail(`Run dir non trovata: ${value} (cercata in ${RUNS_DIR})`);
}

function resolveOrCreateRunDir(value) {
    if (!value) return newRunDir();
    const asIs = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
    if (fs.existsSync(asIs)) return asIs;
    if (value.includes('/') || value.includes('\\') || path.isAbsolute(value)) {
        fs.mkdirSync(asIs, { recursive: true });
        return asIs;
    }
    const inRuns = path.join(RUNS_DIR, value);
    fs.mkdirSync(inRuns, { recursive: true });
    return inRuns;
}

function loadSpec(specPath = DEFAULT_SPEC_PATH) {
    const abs = path.isAbsolute(specPath) ? specPath : path.resolve(process.cwd(), specPath);
    if (!fs.existsSync(abs)) fail(`Spec non trovata: ${abs}`);
    const spec = readJson(abs);

    if (!spec.target?.userId || !spec.target?.addonUuid) fail('Spec: target.userId e target.addonUuid sono obbligatori.');
    if (!SIM_PREFIXES.userId || !new RegExp(SIM_PREFIXES.userId).test(spec.target.userId)) {
        fail(`Spec: target.userId deve rispettare il prefisso sim_user_ (trovato "${spec.target.userId}").`);
    }
    if (!/^sim-uuid-/.test(spec.target.addonUuid)) {
        fail(`Spec: target.addonUuid deve rispettare il prefisso sim-uuid- (trovato "${spec.target.addonUuid}").`);
    }
    if (!Array.isArray(spec.profiles) || spec.profiles.length === 0) fail('Spec: profiles deve essere un array non vuoto.');

    const { getPresets } = require('../../../src/data/presets');
    const presetIds = new Set(getPresets().map(p => p.id));

    const seen = new Set();
    for (const profile of spec.profiles) {
        if (!profile.id || !/^sim_prof_/.test(profile.id)) fail(`Spec: profilo con id non valido "${profile.id}" (serve prefisso sim_prof_).`);
        if (seen.has(profile.id)) fail(`Spec: id profilo duplicato "${profile.id}".`);
        seen.add(profile.id);
        if (!profile.name) fail(`Spec: profilo ${profile.id} senza name.`);
        if (typeof profile.kidsMode !== 'boolean') fail(`Spec: profilo ${profile.id} senza kidsMode booleano.`);
        if (!profile.typeSelectors || typeof profile.typeSelectors !== 'object') fail(`Spec: profilo ${profile.id} senza typeSelectors.`);
        const ts = profile.typeSelectors;
        if (typeof ts.film !== 'boolean' || typeof ts.serie !== 'boolean') fail(`Spec: profilo ${profile.id}: typeSelectors.film/serie devono essere booleani (false = nessun vincolo).`);
        if (![null, 'only', 'exclude'].includes(ts.anime)) fail(`Spec: profilo ${profile.id}: typeSelectors.anime deve essere null|'only'|'exclude'.`);
        if (!profile.dna?.source) fail(`Spec: profilo ${profile.id} senza dna.source.`);
        if (!Array.isArray(profile.catalogs) || profile.catalogs.length === 0) fail(`Spec: profilo ${profile.id} senza cataloghi.`);

        const dup = new Set();
        for (const catId of profile.catalogs) {
            if (dup.has(catId)) fail(`Spec: profilo ${profile.id}: catalogo duplicato "${catId}".`);
            dup.add(catId);
            if (!HERO_SET.has(catId) && !presetIds.has(catId)) {
                fail(`Spec: profilo ${profile.id}: "${catId}" non è né un hero noto né un preset di src/data/presets.js.`);
            }
        }
        if (Array.isArray(profile.history)) {
            for (const h of profile.history) {
                if (typeof h.tmdbId !== 'number') fail(`Spec: profilo ${profile.id}: history.tmdbId deve essere numerico.`);
                if (!['movie', 'tv'].includes(h.type)) fail(`Spec: profilo ${profile.id}: history.type deve essere movie|tv.`);
            }
        }
    }
    spec._path = abs;
    return spec;
}

function isHero(catalogId) {
    return HERO_SET.has(catalogId);
}

/**
 * Normalizzazione namespace-aware degli id contenuto:
 *  - tmdb:movie:123 / tmdb:tv:123 / "tmdb: 123 " / tmdb123 → tmdb:123
 *  - tt1234567 → imdb:tt1234567
 *  - kitsu:123 / anilist:123 / hanime:slug → namespace preservato
 *  - suffisso _ita_offset rimosso
 */
function normalizeId(raw) {
    let s = String(raw ?? '').trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/_ita_offset$/, '').replace(/\s+/g, '');
    let m = s.match(/^tmdb:(?:(?:movie|tv|series|anime|show):)?(\d+)$/);
    if (m) return `tmdb:${m[1]}`;
    m = s.match(/^tmdb(\d+)$/);
    if (m) return `tmdb:${m[1]}`;
    m = s.match(/^tt(\d+)$/);
    if (m) return `imdb:tt${m[1]}`;
    m = s.match(/^(kitsu|anilist|hanime|mal|imdb):(.+)$/);
    if (m) return `${m[1]}:${m[2]}`;
    return s;
}

function namespaceOf(normalizedId) {
    const idx = String(normalizedId).indexOf(':');
    return idx === -1 ? 'raw' : String(normalizedId).slice(0, idx);
}

function extractYear(value) {
    const m = String(value ?? '').match(/(19|20)\d{2}/);
    return m ? m[0] : '';
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    REPO_ROOT,
    SCRATCH_DIR,
    RUNS_DIR,
    DEFAULT_SPEC_PATH,
    ATLAS_STATE_PATH,
    HERO_CATALOGS,
    HERO_SET,
    REAL_PROFILE,
    SIM_PREFIXES,
    log,
    warn,
    fail,
    parseArgs,
    parseList,
    writeJson,
    writeText,
    readJson,
    safeFileName,
    timestampSlug,
    newRunDir,
    listRunDirs,
    resolveRunDir,
    resolveOrCreateRunDir,
    loadSpec,
    isHero,
    normalizeId,
    namespaceOf,
    extractYear,
    escapeMd,
    sleep
};
