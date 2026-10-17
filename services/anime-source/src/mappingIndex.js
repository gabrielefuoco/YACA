/**
 * mappingIndex.js
 * Producer del file di mapping anime per YACA (Ticket 32).
 * 
 * Il servizio anime-source scarica i dump ufficiali (AniBridge mappings.min.json
 * e Fribb anime-list-mini.json), applica gli override manuali (anime-overrides.json
 * con certify ed exclude) e scrive atomicamente un singolo file JSON.
 * L'app YACA consuma questo artefatto invece di scaricare e parsare i dump da sé.
 */

const fs = require('fs');
const path = require('path');
const { loadAnimeOverrides, getEmptyOverrides, resolveDefaultOverridesPath } = require('./overrides');

const ANIBRIDGE_URL = 'https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json';
const FRIBB_MINI_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';
const DEFAULT_FILENAME = 'anime-mappings.json';
const SCHEMA_VERSION = 1;

/**
 * Risolve il percorso di destinazione per l'artefatto JSON.
 * Precedenza:
 *  1. customPath esplicito
 *  2. ANIME_MAPPINGS_PATH (o ANIME_MAPPING_PATH)
 *  3. Default all'interno di cacheDir (precedente: ITA_ANNOTATIONS_PATH)
 *
 * @param {string} [customPath]
 * @param {string} [cacheDir]
 * @returns {string}
 */
function resolveMappingIndexPath(customPath, cacheDir) {
    if (customPath) return customPath;
    if (process.env.ANIME_MAPPINGS_PATH) return process.env.ANIME_MAPPINGS_PATH;
    if (process.env.ANIME_MAPPING_PATH) return process.env.ANIME_MAPPING_PATH;
    const baseDir = cacheDir || (fs.existsSync('/data') ? '/data/tmdb' : path.join(__dirname, '../.cache'));
    return path.join(baseDir, DEFAULT_FILENAME);
}

/**
 * Costruisce l'indice di mapping anime a partire dai dati raw dei dump
 * e degli override.
 * 
 * @param {Object} params
 * @param {Array<Object>} [params.fribbData]
 * @param {Object} [params.anibridgeData]
 * @param {Object} [params.overridesData]
 * @param {Object} [params.sources] Metadati di provenienza opzionali
 * @returns {Object} Struttura serializzabile per l'artefatto
 */
function buildMappingIndex({ fribbData = [], anibridgeData = {}, overridesData, sources = {} } = {}) {
    // 1. Overrides: certify ed exclude con regola di conflitto (exclude vince)
    const normOverrides = overridesData && typeof overridesData === 'object'
        ? overridesData
        : getEmptyOverrides();

    const rawExclude = Array.isArray(normOverrides.exclude) ? normOverrides.exclude : [];
    const rawCertify = Array.isArray(normOverrides.certify) ? normOverrides.certify : [];

    const excludedTmdbIds = new Set();
    const validExclude = [];
    for (const item of rawExclude) {
        if (!item || item.tmdbId == null || item.tmdbId === '') continue;
        const clean = String(item.tmdbId).trim();
        if (!clean) continue;
        if (!excludedTmdbIds.has(clean)) {
            excludedTmdbIds.add(clean);
            validExclude.push({
                tmdbId: clean,
                title: item.title ? String(item.title) : null,
                note: item.note ? String(item.note) : null
            });
        }
    }

    const certifiedTmdbIds = new Set();
    const validCertify = [];
    for (const item of rawCertify) {
        if (!item || item.tmdbId == null || item.tmdbId === '') continue;
        const clean = String(item.tmdbId).trim();
        if (!clean) continue;
        // Regola ticket 32: se un id compare sia in certify che in exclude, exclude vince
        if (excludedTmdbIds.has(clean)) continue;
        if (!certifiedTmdbIds.has(clean)) {
            certifiedTmdbIds.add(clean);
            validCertify.push({
                tmdbId: clean,
                title: item.title ? String(item.title) : null,
                note: item.note ? String(item.note) : null
            });
        }
    }

    // 2. Fribb Index
    const fribbIndex = { anidb: new Map(), anilist: new Map(), mal: new Map() };
    const kitsuToTmdb = new Map();
    const kitsuToTmdbType = new Map();
    const tmdbToKitsuMovie = new Map();
    const tmdbToKitsu = new Map();
    const malToTmdb = new Map();

    const safeFribb = Array.isArray(fribbData) ? fribbData : [];
    for (const item of safeFribb) {
        if (!item || typeof item !== 'object') continue;
        if (item.kitsu_id) {
            const kitsuIdStr = String(item.kitsu_id);
            if (item.anidb_id) fribbIndex.anidb.set(String(item.anidb_id), item.kitsu_id);
            if (item.anilist_id) fribbIndex.anilist.set(String(item.anilist_id), item.kitsu_id);
            if (item.mal_id) fribbIndex.mal.set(String(item.mal_id), item.kitsu_id);

            if (item.themoviedb_id) {
                const rawTmdb = item.themoviedb_id;
                let detectedType = null;
                let tmdbVal = null;

                if (typeof rawTmdb === 'object' && rawTmdb !== null) {
                    if (rawTmdb.tv !== undefined && rawTmdb.tv !== null && rawTmdb.tv !== '') {
                        detectedType = 'tv';
                        tmdbVal = rawTmdb.tv;
                    } else if (rawTmdb.movie !== undefined && rawTmdb.movie !== null && rawTmdb.movie !== '') {
                        detectedType = 'movie';
                        tmdbVal = rawTmdb.movie;
                    } else {
                        tmdbVal = rawTmdb;
                    }
                } else if (rawTmdb) {
                    tmdbVal = rawTmdb;
                }

                if (!detectedType) {
                    const itemType = String(item.type || '').toUpperCase();
                    if (itemType === 'MOVIE') {
                        detectedType = 'movie';
                    } else if (['TV', 'OVA', 'ONA', 'SPECIAL'].includes(itemType)) {
                        detectedType = 'tv';
                    }
                }

                const tmdbIds = Array.isArray(tmdbVal)
                    ? tmdbVal.filter(id => id !== null && id !== undefined && id !== '')
                    : (tmdbVal ? [tmdbVal] : []);

                if (tmdbIds.length > 0) {
                    const primaryTmdb = String(tmdbIds[0]);
                    kitsuToTmdb.set(kitsuIdStr, primaryTmdb);
                    if (detectedType) {
                        kitsuToTmdbType.set(kitsuIdStr, detectedType);
                    }
                    if (item.mal_id) {
                        malToTmdb.set(String(item.mal_id), primaryTmdb);
                    }

                    if (detectedType === 'movie') {
                        for (const tmdbId of tmdbIds) {
                            tmdbToKitsuMovie.set(String(tmdbId), item.kitsu_id);
                        }
                    } else {
                        for (const tmdbId of tmdbIds) {
                            tmdbToKitsu.set(String(tmdbId), item.kitsu_id);
                        }
                    }
                }
            }
        }
    }

    // 3. AniBridge Index
    const tmdbToAnimeNode = new Map();
    const anibridgeTmdbIds = new Set();
    const anibridgeShowTmdbIds = new Set();
    const anibridgeMovieTmdbIds = new Set();

    const parseRange = (str) => {
        const [start, end] = String(str).split('-').map(Number);
        return { start, end: end || start };
    };

    const safeAnibridge = (anibridgeData && typeof anibridgeData === 'object' && !Array.isArray(anibridgeData))
        ? anibridgeData
        : {};

    for (const [clusterKey, mappings] of Object.entries(safeAnibridge)) {
        if (clusterKey === '$meta' || !mappings || typeof mappings !== 'object') continue;

        let bridgeNode = null;
        const allNodes = [clusterKey, ...Object.keys(mappings)];

        for (const node of allNodes) {
            if (node.startsWith('anidb:')) { bridgeNode = { p: 'anidb', id: node.split(':')[1] }; break; }
            if (node.startsWith('anilist:')) { bridgeNode = { p: 'anilist', id: node.split(':')[1] }; break; }
            if (node.startsWith('mal:')) { bridgeNode = { p: 'mal', id: node.split(':')[1] }; break; }
        }

        if (!bridgeNode) continue;

        for (const [providerKey, episodesMap] of Object.entries(mappings)) {
            if (providerKey.startsWith('tmdb_show:') || providerKey.startsWith('tmdb_movie:')) {
                const parts = providerKey.split(':');
                const tmdbId = parts[1];
                let season = '1';
                if (parts.length > 2) {
                    season = parts[2].replace('s', '');
                }

                if (tmdbId) {
                    const cleanTmdbId = String(tmdbId);
                    anibridgeTmdbIds.add(cleanTmdbId);
                    if (providerKey.startsWith('tmdb_show:')) {
                        anibridgeShowTmdbIds.add(cleanTmdbId);
                    } else if (providerKey.startsWith('tmdb_movie:')) {
                        anibridgeMovieTmdbIds.add(cleanTmdbId);
                    }
                }

                const key = `${tmdbId}:${season}`;
                const rules = [];
                if (episodesMap && typeof episodesMap === 'object') {
                    for (const [animeRange, tmdbRange] of Object.entries(episodesMap)) {
                        const anime = parseRange(animeRange);
                        const tmdb = parseRange(tmdbRange);
                        const offset = anime.start - tmdb.start;
                        rules.push({ start: tmdb.start, end: tmdb.end, offset });
                    }
                }

                if (!tmdbToAnimeNode.has(key)) {
                    tmdbToAnimeNode.set(key, []);
                }
                tmdbToAnimeNode.get(key).push({ bridgeNode, rules });
            }
        }
    }

    // 4. Insiemi TMDB id (Movie e Show separati)
    const movieSet = new Set();
    const showSet = new Set();

    for (const id of anibridgeMovieTmdbIds) movieSet.add(String(id));
    for (const id of tmdbToKitsuMovie.keys()) movieSet.add(String(id));

    for (const id of anibridgeShowTmdbIds) showSet.add(String(id));
    for (const id of tmdbToKitsu.keys()) showSet.add(String(id));

    for (const id of certifiedTmdbIds) {
        movieSet.add(id);
        showSet.add(id);
    }

    // Gli esclusi (Decision 6) vincono ed eliminano l'ID da entrambi i namespace
    for (const id of excludedTmdbIds) {
        movieSet.delete(id);
        showSet.delete(id);
    }

    // 5. Composizione Provenance per fonte
    const anibridgeRowCount = Object.keys(safeAnibridge).filter(k => k !== '$meta').length;
    const fribbRowCount = safeFribb.length;
    const overridesRowCount = (normOverrides.identities?.length || 0) + validCertify.length + validExclude.length;

    const provenance = {
        anibridge: {
            url: sources?.anibridge?.url || ANIBRIDGE_URL,
            fetchedAt: sources?.anibridge?.fetchedAt || new Date().toISOString(),
            rowCount: sources?.anibridge?.rowCount ?? anibridgeRowCount
        },
        fribb: {
            url: sources?.fribb?.url || FRIBB_MINI_URL,
            fetchedAt: sources?.fribb?.fetchedAt || new Date().toISOString(),
            rowCount: sources?.fribb?.rowCount ?? fribbRowCount
        },
        overrides: {
            path: sources?.overrides?.path || null,
            fetchedAt: sources?.overrides?.fetchedAt || new Date().toISOString(),
            rowCount: sources?.overrides?.rowCount ?? overridesRowCount
        }
    };

    return {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        sources: provenance,
        provenance,
        animeTmdbIdsMovie: Array.from(movieSet),
        animeTmdbIdsShow: Array.from(showSet),
        anibridgeTmdbIds: Array.from(anibridgeTmdbIds),
        anibridgeShowTmdbIds: Array.from(anibridgeShowTmdbIds),
        anibridgeMovieTmdbIds: Array.from(anibridgeMovieTmdbIds),
        certifiedTmdbIds: Array.from(certifiedTmdbIds),
        excludedTmdbIds: Array.from(excludedTmdbIds),
        certify: validCertify,
        exclude: validExclude,
        tmdbToKitsu: Array.from(tmdbToKitsu.entries()),
        tmdbToKitsuMovie: Array.from(tmdbToKitsuMovie.entries()),
        kitsuToTmdb: Array.from(kitsuToTmdb.entries()),
        kitsuToTmdbType: Array.from(kitsuToTmdbType.entries()),
        malToTmdb: Array.from(malToTmdb.entries()),
        tmdbToAnimeNode: Array.from(tmdbToAnimeNode.entries()),
        fribbIndex: {
            anidb: Array.from(fribbIndex.anidb.entries()),
            anilist: Array.from(fribbIndex.anilist.entries()),
            mal: Array.from(fribbIndex.mal.entries())
        }
    };
}

/**
 * Scrittura atomica su file JSON: scrive su percorso temporaneo e rinomina
 * (stesso pattern di services/doppiaggi-source/src/diff.js e duckDbStore).
 * 
 * @param {string} targetPath Percorso finale del file
 * @param {Object} artifact Dati JSON da serializzare
 * @returns {{ path: string, size: number, generatedAt: string }}
 */
function writeMappingIndexAtomic(targetPath, artifact) {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = `${targetPath}.tmp.${Date.now()}.${process.pid}`;
    const content = `${JSON.stringify(artifact, null, 1)}\n`;

    fs.writeFileSync(tmpPath, content, 'utf8');

    try {
        fs.renameSync(tmpPath, targetPath);
    } catch (err) {
        // Fallback per ambienti Windows se targetPath esiste ed è bloccato
        if (err.code === 'EEXIST' || err.code === 'EPERM') {
            try { fs.unlinkSync(targetPath); } catch (_) {}
            fs.renameSync(tmpPath, targetPath);
        } else {
            throw err;
        }
    }

    return {
        path: targetPath,
        size: Buffer.byteLength(content, 'utf8'),
        generatedAt: artifact.generatedAt
    };
}

/**
 * Orchestratore: costruisce l'indice e lo scrive atomicamente su disco.
 * 
 * @param {Object} params
 * @param {Array<Object>} [params.fribbData]
 * @param {Object} [params.anibridgeData]
 * @param {Object|string} [params.overridesDataOrPath]
 * @param {Object} [params.sources]
 * @param {string} [params.targetPath]
 * @param {string} [params.cacheDir]
 * @returns {{ artifact: Object, meta: { path: string, size: number, generatedAt: string } }}
 */
function produceMappingIndex({
    fribbData = [],
    anibridgeData = {},
    overridesDataOrPath,
    sources = {},
    targetPath,
    cacheDir
} = {}) {
    let overridesData;
    let overridesPathResolved = null;

    if (overridesDataOrPath && typeof overridesDataOrPath === 'object') {
        overridesData = overridesDataOrPath;
    } else {
        overridesPathResolved = typeof overridesDataOrPath === 'string'
            ? overridesDataOrPath
            : resolveDefaultOverridesPath();
        overridesData = loadAnimeOverrides(overridesPathResolved);
    }

    const mergedSources = {
        ...sources,
        overrides: {
            path: overridesPathResolved || sources?.overrides?.path || null,
            fetchedAt: sources?.overrides?.fetchedAt || new Date().toISOString(),
            rowCount: sources?.overrides?.rowCount
        }
    };

    const artifact = buildMappingIndex({
        fribbData,
        anibridgeData,
        overridesData,
        sources: mergedSources
    });

    const destination = resolveMappingIndexPath(targetPath, cacheDir);
    const meta = writeMappingIndexAtomic(destination, artifact);

    return { artifact, meta };
}

module.exports = {
    SCHEMA_VERSION,
    DEFAULT_FILENAME,
    resolveMappingIndexPath,
    buildMappingIndex,
    writeMappingIndexAtomic,
    produceMappingIndex
};
