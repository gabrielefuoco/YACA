const fs = require('fs');
const path = require('path');
const { estraiTokenSorgente } = require('../stremio/formatters/posterBadgeVersion');

const SORGENTI_FILE_NAME = 'sorgenti.json';
const MAX_SORGENTI_KEYS = 200000;
const CHECK_INTERVAL_MS = 60000;

function _dir(dir) {
    return dir || process.env.ERDB_CACHE_DIR || '/data/erdb-cache';
}

// In-memory cache per directory: { map: Map, mtimeMs: number, lastCheckMs: number }
const _cachePerDir = new Map();

function resetCache() {
    _cachePerDir.clear();
}

function caricaMappa(dir, options = {}) {
    const target = path.join(dir, SORGENTI_FILE_NAME);
    const ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : CHECK_INTERVAL_MS;
    const now = Date.now();

    let entry = _cachePerDir.get(dir);
    if (entry && !options.force && (now - entry.lastCheckMs < ttlMs)) {
        return entry.map;
    }

    if (!entry) {
        entry = { map: new Map(), mtimeMs: 0, lastCheckMs: 0 };
        _cachePerDir.set(dir, entry);
    }
    entry.lastCheckMs = now;

    let stat;
    try {
        stat = fs.statSync(target);
    } catch {
        entry.map = new Map();
        entry.mtimeMs = 0;
        return entry.map;
    }

    if (stat.mtimeMs === entry.mtimeMs && entry.map.size > 0) {
        return entry.map;
    }

    try {
        const raw = fs.readFileSync(target, 'utf8');
        const parsed = JSON.parse(raw);
        const map = new Map();
        if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
                map.set(k, v);
            }
        }
        entry.map = map;
        entry.mtimeMs = stat.mtimeMs;
    } catch {
        entry.map = new Map();
        entry.mtimeMs = 0;
    }

    return entry.map;
}

function leggiMappa(dir, options = {}) {
    const resolvedDir = _dir(dir);
    const map = caricaMappa(resolvedDir, options);
    return Object.fromEntries(map);
}

function leggiToken(erdbId, dir, options = {}) {
    if (!erdbId) return '';
    const resolvedDir = _dir(dir);
    const map = caricaMappa(resolvedDir, options);
    return map.get(erdbId) || '';
}

let _tmpCounter = 0;
function scriviToken(erdbId, tokenOrSource, options = {}) {
    const token = estraiTokenSorgente(tokenOrSource);
    if (!erdbId || !token) return;
    return scriviMappa({ [erdbId]: token }, options);
}

function scriviMappa(nuoveVoci, options = {}) {
    if (!nuoveVoci || typeof nuoveVoci !== 'object') return;
    const customDir = typeof options === 'string' ? options : options.cacheDir;
    const dir = _dir(customDir);
    const isExplicitCustomDir = customDir && customDir !== '/data/erdb-cache';
    if (!isExplicitCustomDir && !process.env.ERDB_CACHE_DIR && !fs.existsSync(dir)) return;

    const maxKeys = (typeof options === 'object' && options.maxKeys) || MAX_SORGENTI_KEYS;
    const target = path.join(dir, SORGENTI_FILE_NAME);

    let currentObj = {};
    try {
        if (fs.existsSync(target)) {
            currentObj = JSON.parse(fs.readFileSync(target, 'utf8'));
        }
    } catch {}

    if (Object.keys(currentObj).length >= maxKeys) currentObj = {};
    for (const [id, val] of Object.entries(nuoveVoci)) {
        const token = estraiTokenSorgente(val);
        if (id && token) currentObj[id] = token;
    }

    const tmp = `${target}.${process.pid}-${Date.now()}-${++_tmpCounter}.tmp`;
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(tmp, JSON.stringify(currentObj), 'utf8');
        fs.renameSync(tmp, target);

        // Aggiorna la cache in RAM direttamente
        const stat = fs.statSync(target);
        const map = new Map(Object.entries(currentObj));
        _cachePerDir.set(dir, { map, mtimeMs: stat.mtimeMs, lastCheckMs: Date.now() });
    } catch {
        try { fs.unlinkSync(tmp); } catch {}
    }
}

module.exports = {
    SORGENTI_FILE_NAME,
    MAX_SORGENTI_KEYS,
    CHECK_INTERVAL_MS,
    leggiMappa,
    leggiToken,
    scriviToken,
    scriviMappa,
    resetCache
};
