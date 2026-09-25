/**
 * libraryIdentity.js
 *
 * Identità canonica degli item di libreria.
 *
 * Nella libreria Stremio lo stesso titolo può comparire con id diversi
 * (`tt0095327` e `tmdb: 12477`, `kitsu:7278` e `tt2575684`, …): YACA li copia
 * fedelmente e la griglia mostrava due card identiche.
 *
 * Qui si risolve l'entità reale (TMDB / IMDb) usando il parquet locale — le stesse
 * tabelle di catalogo, nessuna chiamata esterna — e si decide quale documento è il
 * primario (preferendo l'id IMDb, quello che Stremio apre meglio) e quali sono
 * duplicati da nascondere.
 *
 * I duplicati non vengono cancellati: Stremio è la fonte e al sync successivo
 * tornerebbero. Il documento secondario riceve un marcatore `duplicateOf` e le
 * letture (dashboard e cataloghi watchlist) lo escludono.
 */

const duckDbStore = require('../db/duckDbStore');
const UserLibraryItem = require('../db/models/UserLibraryItem');
let animeMappingStore = null;
try {
    animeMappingStore = require('../data/animeMappingStore');
} catch (_e) {
    animeMappingStore = null;
}

/** Host di vecchie installazioni che non servono più le immagini (HF Space, dev locale). */
const LEGACY_APP_HOSTS = [
    'gabriele-fuoco-yaca.hf.space',
    'http://localhost:7000',
    'https://localhost:7000'
];

/** Normalizza un itemId: `tmdb: 12477 ` → `tmdb:12477`, `TT0111161` → `tt0111161`. */
function normalizeLibraryId(rawId) {
    const raw = String(rawId ?? '').trim();
    if (!raw) return '';
    const imdb = raw.match(/tt\d{5,}/i);
    if (imdb) return imdb[0].toLowerCase();
    const tmdb = raw.match(/^tmdb:\s*(\d+)$/i);
    if (tmdb) return `tmdb:${tmdb[1]}`;
    const kitsu = raw.match(/^kitsu:\s*(\d+)$/i);
    if (kitsu) return `kitsu:${kitsu[1]}`;
    const numeric = raw.match(/^(\d+)$/);
    if (numeric) return `tmdb:${numeric[1]}`;
    return raw.toLowerCase();
}

/** Titolo confrontabile: senza accenti, punteggiatura e maiuscole. */
function normalizeTitle(raw) {
    return String(raw ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Riscrive i poster serviti da host non più raggiungibili (es. il vecchio HF Space,
 * che ora restituisce una pagina HTML invece dell'immagine) verso l'host corrente.
 */
function normalizeLegacyPosterHost(poster, currentHost) {
    const value = String(poster ?? '').trim();
    if (!value) return poster;

    const target = String(currentHost || '').replace(/\/+$/, '');
    if (!target) return poster;

    // Il confronto ignora lo schema: il poster salvato è `https://host/...` mentre
    // l'elenco degli host legacy è per host (`host` o `http://host`).
    const stripped = value.replace(/^https?:\/\//i, '');

    for (const legacy of LEGACY_APP_HOSTS) {
        const legacyHost = String(legacy).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        if (!legacyHost || !stripped.startsWith(legacyHost)) continue;
        const path = stripped.slice(legacyHost.length);
        return `${target}${path.startsWith('/') ? path : `/${path}`}`;
    }
    return poster;
}

function extractLookupKeys(itemId) {
    const normalized = normalizeLibraryId(itemId);
    if (!normalized) return null;

    const imdb = normalized.match(/^(tt\d+)$/);
    if (imdb) return { kind: 'imdb', value: imdb[1] };

    const tmdb = normalized.match(/^tmdb:(\d+)$/);
    if (tmdb) return { kind: 'id', value: tmdb[1] };

    const kitsu = normalized.match(/^kitsu:(\d+)$/);
    if (kitsu) {
        const mapped = animeMappingStore?.kitsuToTmdb?.get(kitsu[1]);
        return mapped ? { kind: 'id', value: String(mapped) } : null;
    }

    return null;
}

async function fetchRows(table, { ids = [], imdbIds = [] }) {
    if (ids.length === 0 && imdbIds.length === 0) return [];

    const quote = (list) => list.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
    const where = [];
    if (ids.length > 0) where.push(`CAST(id AS VARCHAR) IN (${quote(ids)})`);
    if (imdbIds.length > 0) where.push(`imdb_id IN (${quote(imdbIds)})`);

    try {
        return await duckDbStore.query(`SELECT CAST(id AS VARCHAR) AS id, imdb_id FROM ${table} WHERE ${where.join(' OR ')}`);
    } catch (err) {
        return [];
    }
}

/**
 * Chiave canonica per ogni itemId risolvibile.
 * Ordine: `tt<imdb>` (id preferito da Stremio) → `tmdb:<id>` → null se irrisolvibile.
 *
 * @param {string[]} itemIds
 * @returns {Promise<Map<string, string|null>>}
 */
async function resolveCanonicalKeys(itemIds) {
    const keys = new Map();
    const lookups = [];

    for (const itemId of itemIds) {
        const key = extractLookupKeys(itemId);
        lookups.push({ itemId, key });
        keys.set(itemId, null);
    }

    const idValues = Array.from(new Set(lookups.filter(l => l.key?.kind === 'id').map(l => l.key.value)));
    const imdbValues = Array.from(new Set(lookups.filter(l => l.key?.kind === 'imdb').map(l => l.key.value)));

    const [movieRows, tvRows] = await Promise.all([
        fetchRows('movies', { ids: idValues, imdbIds: imdbValues }),
        fetchRows('tv', { ids: idValues, imdbIds: imdbValues })
    ]);

    const byId = new Map();
    const byImdb = new Map();
    for (const row of [...(movieRows || []), ...(tvRows || [])]) {
        if (!row) continue;
        const canonical = row.imdb_id ? String(row.imdb_id).toLowerCase() : (row.id ? `tmdb:${row.id}` : null);
        if (!canonical) continue;
        if (row.id !== undefined && row.id !== null) byId.set(String(row.id), canonical);
        if (row.imdb_id) byImdb.set(String(row.imdb_id).toLowerCase(), canonical);
    }

    for (const { itemId, key } of lookups) {
        if (!key) continue;
        const canonical = key.kind === 'imdb' ? byImdb.get(key.value) : byId.get(key.value);
        if (canonical) keys.set(itemId, canonical);
    }

    return keys;
}

/**
 * Pianifica i duplicati di una libreria.
 *
 * @param {Array} items documenti con `itemId`, `type`, `name`, `year`, `_mtime`, `removed`
 * @returns {Promise<Map<string, string|null>>} itemId → itemId primario (null = nessun duplicato)
 */
async function planDuplicateMarks(items = []) {
    const plan = new Map();
    const active = items.filter(item => {
        const itemId = String(item?.itemId || '').trim();
        return itemId && item.removed !== true;
    });

    // Chiave interna: itemId ripulito dagli spazi ("tmdb: 12477 " → "tmdb: 12477").
    // Valore: l'itemId *così com'è in archivio*, che serve al filtro di scrittura.
    const storedByKey = new Map();
    for (const item of active) {
        const key = String(item.itemId).trim();
        storedByKey.set(key, String(item.itemId));
        plan.set(key, null);
    }
    if (active.length === 0) return plan;

    const canonicalKeys = await resolveCanonicalKeys(Array.from(storedByKey.keys()));

    // Gruppi per chiave canonica; se un id non è risolvibile si prova col titolo+anno
    // (l'anno deve coincidere quando entrambi sono presenti).
    const groups = new Map();
    for (const item of active) {
        const itemKey = String(item.itemId).trim();
        const canonical = canonicalKeys.get(itemKey);
        const title = normalizeTitle(item.name);
        const year = item.year ? String(item.year).slice(0, 4) : '';
        const fallback = title ? `title:${title}|${year}` : null;
        const key = canonical || fallback;
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ itemKey, canonical: Boolean(canonical), item });
    }

    for (const entries of groups.values()) {
        if (entries.length < 2) continue;

        const scored = entries.map(entry => {
            const isImdb = /^tt\d+/i.test(entry.itemKey);
            // `_ctime`/`_mtime` arrivano da Stremio e non vengono toccati da YACA:
            // servono come spareggio stabile, altrimenti il primario cambierebbe ad
            // ogni sync e i titoli "saltellerebbero".
            const timestamp = new Date(entry.item._ctime || entry.item._mtime || entry.item.updatedAt || 0).getTime() || 0;
            return {
                itemKey: entry.itemKey,
                preference: (entry.canonical ? 1 : 0) + (isImdb ? 1 : 0),
                timestamp
            };
        });

        scored.sort((a, b) => (
            (b.preference - a.preference)
            || (b.timestamp - a.timestamp)
            || a.itemKey.localeCompare(b.itemKey)
        ));
        const [primary, ...duplicates] = scored;
        for (const duplicate of duplicates) {
            plan.set(duplicate.itemKey, storedByKey.get(primary.itemKey) || primary.itemKey);
        }
    }

    return plan;
}

/**
 * Applica (o rimuove) i marcatori `duplicateOf` sui documenti della libreria.
 *
 * @param {string} addonUuid
 * @returns {Promise<{ duplicates: number, cleared: number }>}
 */
async function applyDuplicateMarks(addonUuid) {
    if (!addonUuid) return { duplicates: 0, cleared: 0 };

    const items = await UserLibraryItem.collection
        .find({ addonUuid }, { projection: { itemId: 1, type: 1, name: 1, year: 1, _mtime: 1, _ctime: 1, removed: 1, duplicateOf: 1 } })
        .toArray();

    const plan = await planDuplicateMarks(items);
    const raw = UserLibraryItem.collection;

    const toMark = [];
    const toClear = [];
    for (const item of items) {
        const storedId = String(item?.itemId || '');
        const itemKey = storedId.trim();
        if (!itemKey) continue;
        const target = plan.has(itemKey) ? plan.get(itemKey) : null;
        const current = item.duplicateOf || null;
        if (target && target !== current) toMark.push({ itemId: storedId, primary: target });
        else if (!target && current) toClear.push(storedId);
    }

    if (toMark.length > 0) {
        await Promise.all(toMark.map(({ itemId, primary }) => raw.updateOne(
            { addonUuid, itemId },
            // NIENTE aggiornamento di `_mtime`: è lo spareggio della scelta del primario,
            // scriverlo farebbe "saltare" il titolo da un id all'altro al sync successivo.
            { $set: { duplicateOf: primary } }
        )));
    }
    if (toClear.length > 0) {
        await raw.updateMany({ addonUuid, itemId: { $in: toClear } }, { $unset: { duplicateOf: '' } });
    }

    if (toMark.length > 0 || toClear.length > 0) {
        console.log(`[LibraryIdentity] Duplicati marcati per ${addonUuid}: ${toMark.length} nuovi, ${toClear.length} rimossi`);
    }

    return { duplicates: toMark.length, cleared: toClear.length };
}

module.exports = {
    normalizeLibraryId,
    normalizeTitle,
    normalizeLegacyPosterHost,
    resolveCanonicalKeys,
    planDuplicateMarks,
    applyDuplicateMarks,
    LEGACY_APP_HOSTS
};
