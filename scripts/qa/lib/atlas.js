/**
 * scripts/qa/lib/atlas.js
 *
 * Materializzazione e teardown dei dati di simulazione su MongoDB Atlas.
 * Regole (ticket 07): solo documenti con prefissi sim_*; mai toccare REOZrGnr3;
 * nessun token Trakt/Stremio negli account di test.
 */

const {
    REAL_PROFILE,
    HERO_SET,
    fail,
    writeJson,
    ATLAS_STATE_PATH
} = require('./common');

let mongooseRef = null;

async function connectDb() {
    if (!mongooseRef) mongooseRef = require('mongoose');
    if (mongooseRef.connection.readyState === 1) return mongooseRef.connection.db;
    if (!process.env.MONGODB_URI) fail('MONGODB_URI mancante: impossibile contattare Atlas.');
    await mongooseRef.connect(process.env.MONGODB_URI);
    return mongooseRef.connection.db;
}

async function closeDb() {
    if (!mongooseRef) return;
    if (mongooseRef.connection.readyState === 1) await mongooseRef.disconnect();
}

function buildCatalogEntry(preset) {
    return {
        id: `yaca_preset_${preset.id}`,
        name: preset.name,
        type: preset.type,
        emoji: preset.emoji,
        category: preset.category,
        where: preset.where || [],
        orderBy: preset.orderBy || null,
        _provider: preset._provider || null,
        sortable: preset.sortable !== false,
        queries: preset.queries || [],
        isAnime: preset.isAnime || false
    };
}

function resolveColdScenario(spec, coldFlag) {
    if (coldFlag && !['absent', 'empty', 'cold_absent', 'cold_empty'].includes(coldFlag)) {
        fail(`--cold accetta solo absent|empty (ricevuto "${coldFlag}").`);
    }
    const coldProfiles = spec.profiles.filter(p => String(p.dna?.source || '').startsWith('cold_'));
    if (coldProfiles.length === 0) return null;
    if (coldFlag) return coldFlag.replace('cold_', '');
    const first = String(coldProfiles[0].dna.source);
    return first.replace('cold_', '');
}

/**
 * Clona un TasteProfile reale (REOZrGNRr3/context) su owner/context di test.
 * lastUpdated NON viene ereditato: viene riportato a now() così il ramo "stale"
 * di hybridRecommendations non scatta (l'intento di ticket 07/10).
 */
async function cloneTasteProfile(db, sourceContext, targetOwner, targetContext, sourceOwner) {
    const src = await db.collection('tasteprofiles').findOne({ owner: sourceOwner, context: sourceContext });
    if (!src) fail(`DNA sorgente non trovato: ${sourceOwner}/${sourceContext}`);
    const now = new Date();
    const doc = {
        owner: targetOwner,
        context: targetContext,
        compiledVectors: {
            V_static: src.compiledVectors?.V_static || {},
            V_active: src.compiledVectors?.V_active || {},
            V_final: src.compiledVectors?.V_final || {},
            lastComputed: src.compiledVectors?.lastComputed || null
        },
        idNames: src.idNames || {},
        syncStatus: { isSyncing: false, total: 0, current: 0, lastSync: null },
        onboardingCompleted: true,
        signatureTitles: src.signatureTitles || { core: null, blend: null, star: null },
        lastUpdated: now,
        createdAt: now,
        updatedAt: now
    };
    await db.collection('tasteprofiles').updateOne(
        { owner: targetOwner, context: targetContext },
        { $set: doc },
        { upsert: true }
    );
    return { sourceKeys: Object.keys(doc.compiledVectors.V_final).length };
}

async function writeColdProfile(db, targetOwner, targetContext, mode) {
    const now = new Date();
    if (mode === 'absent') {
        await db.collection('tasteprofiles').deleteOne({ owner: targetOwner, context: targetContext });
        return { mode: 'absent', keys: 0 };
    }
    const doc = {
        owner: targetOwner,
        context: targetContext,
        compiledVectors: { V_static: {}, V_active: {}, V_final: {}, lastComputed: null },
        idNames: {},
        syncStatus: { isSyncing: false, total: 0, current: 0, lastSync: null },
        onboardingCompleted: false,
        signatureTitles: { core: null, blend: null, star: null },
        lastUpdated: now,
        createdAt: now,
        updatedAt: now
    };
    await db.collection('tasteprofiles').updateOne(
        { owner: targetOwner, context: targetContext },
        { $set: doc },
        { upsert: true }
    );
    return { mode: 'empty', keys: 0 };
}

/**
 * Comando `profiles`: crea/aggiorna i documenti di test in Atlas.
 */
async function materializeProfiles(spec, opts = {}) {
    const db = await connectDb();
    const { getPresets } = require('../../../src/data/presets');
    const presetMap = new Map(getPresets().map(p => [p.id, p]));

    const target = spec.target;
    const coldScenario = resolveColdScenario(spec, opts.cold);
    const report = {
        generatedAt: new Date().toISOString(),
        specPath: spec._path,
        specVersion: spec.version,
        coldScenario,
        target: {
            userId: target.userId,
            addonUuid: target.addonUuid,
            email: target.email,
            defaultProfileId: target.defaultProfileId || spec.profiles[0].id
        },
        account: {},
        addonConfig: {},
        profiles: [],
        watchlist: {},
        lists: {},
        warnings: []
    };

    // ── 1. UserAccount (vault) ───────────────────────────────────────────────
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) report.warnings.push('TMDB_API_KEY assente in .env: gli hero con TMDB falliranno.');
    const now = new Date();
    await db.collection('useraccounts').updateOne(
        { userId: target.userId },
        {
            $set: {
                userId: target.userId,
                email: target.email,
                passwordHash: 'sim-not-a-login',
                addonUuid: target.addonUuid,
                // Solo tmdb: MAI copiare i token Trakt/Stremio del profilo reale.
                apiKeys: tmdbKey ? { tmdb: tmdbKey } : {},
                updatedAt: now
            },
            $setOnInsert: { createdAt: now }
        },
        { upsert: true }
    );
    report.account = {
        userId: target.userId,
        addonUuid: target.addonUuid,
        email: target.email,
        apiKeys: tmdbKey ? ['tmdb'] : [],
        tmdbKeyPresent: Boolean(tmdbKey)
    };

    // ── 2. AddonConfig (profili + cataloghi risolti) ─────────────────────────
    const builtProfiles = [];
    const activeProfileId = target.defaultProfileId || spec.profiles[0].id;
    for (const profile of spec.profiles) {
        const presetIds = profile.catalogs.filter(id => !HERO_SET.has(id));
        const heroIds = profile.catalogs.filter(id => HERO_SET.has(id));
        const catalogs = presetIds.map(pid => buildCatalogEntry(presetMap.get(pid)));
        builtProfiles.push({
            id: profile.id,
            name: profile.name,
            catalogs,
            settings: {
                kidsMode: Boolean(profile.kidsMode),
                fastPresetRefresh: false,
                tmdbKey: '',
                manualDNA: [],
                suggestedDNA: [],
                typeSelectors: {
                    film: Boolean(profile.typeSelectors.film),
                    serie: Boolean(profile.typeSelectors.serie),
                    anime: profile.typeSelectors.anime ?? null
                }
            },
            raw_ui_state: {
                selectedPresets: [...presetIds, ...heroIds],
                catalogOrder: [...presetIds, ...heroIds],
                newPrompts: [],
                heroPresetsInitialized: true
            }
        });
    }
    await db.collection('addonconfigs').updateOne(
        { uuid: target.addonUuid },
        {
            $set: {
                uuid: target.addonUuid,
                profiles: builtProfiles,
                customCatalogs: [],
                config: {
                    activeProfileId,
                    configVersion: target.configVersion || 'sim-1.0.0'
                },
                syncStatus: {
                    isSyncing: false,
                    total: 0,
                    current: 0,
                    lastSync: null,
                    // fresco: LibrarySyncService non tenta sync di rete
                    lastLibrarySync: now
                },
                updatedAt: now
            },
            $setOnInsert: { createdAt: now }
        },
        { upsert: true }
    );
    report.addonConfig = {
        uuid: target.addonUuid,
        activeProfileId,
        configVersion: target.configVersion || 'sim-1.0.0',
        profiles: builtProfiles.length
    };

    // ── 3. TasteProfile (DNA caldo clonato / freddo) ─────────────────────────
    const profileIds = new Set(spec.profiles.map(p => p.id));
    const staleContexts = await db.collection('tasteprofiles')
        .find({ owner: target.userId }, { projection: { context: 1 } })
        .toArray();
    for (const doc of staleContexts) {
        if (!profileIds.has(doc.context)) {
            await db.collection('tasteprofiles').deleteOne({ owner: target.userId, context: doc.context });
            report.warnings.push(`Rimosso TasteProfile sim_* orfano: context=${doc.context}`);
        }
    }

    for (const profile of spec.profiles) {
        const source = String(profile.dna.source);
        let dna;
        if (source === 'cold_absent' || source === 'cold_empty') {
            const mode = coldScenario || source.replace('cold_', '');
            dna = await writeColdProfile(db, target.userId, profile.id, mode);
            dna.source = source;
        } else {
            const cloned = await cloneTasteProfile(db, source, target.userId, profile.id, REAL_PROFILE.userId);
            dna = { source, mode: 'clone', keys: cloned.sourceKeys };
        }
        const presetIds = profile.catalogs.filter(id => !HERO_SET.has(id));
        const heroIds = profile.catalogs.filter(id => HERO_SET.has(id));
        report.profiles.push({
            id: profile.id,
            name: profile.name,
            role: profile.role || null,
            kidsMode: Boolean(profile.kidsMode),
            typeSelectors: profile.typeSelectors,
            dna,
            presets: presetIds.length,
            heroes: heroIds.length,
            catalogsTotal: profile.catalogs.length,
            historyRows: Array.isArray(profile.history) ? profile.history.length : 0
        });
    }

    // ── 4. Watchlist sintetica (userlibraryitems, account-level) ─────────────
    const watchlist = spec.syntheticWatchlist?.items || [];
    await db.collection('userlibraryitems').deleteMany({ addonUuid: target.addonUuid });
    if (watchlist.length > 0) {
        const rows = watchlist.map((item, i) => {
            const t = new Date(Date.now() - i * 1000);
            const { _id, ...rest } = item;
            // `_id` è globalmente unico in userlibraryitems: mai riusare gli id Stremio
            // reali (es. kitsu:142 esiste già per l'utente reale). La query del
            // WatchlistProvider usa `itemId`, quindi l'_id può essere un segnaposto sim_.
            const safeId = String(_id || '').startsWith('sim:') ? _id : `sim:watchlist:${i}`;
            return {
                _id: safeId,
                ...rest,
                addonUuid: target.addonUuid,
                _ctime: item._ctime || t,
                _mtime: item._mtime || t,
                createdAt: t,
                updatedAt: t
            };
        });
        await db.collection('userlibraryitems').insertMany(rows);
    }
    report.watchlist = {
        rows: watchlist.length,
        legacyNullItemId: watchlist.filter(i => i.itemId === null).length,
        movie: watchlist.filter(i => i.type === 'movie').length,
        series: watchlist.filter(i => i.type === 'series').length,
        anime: watchlist.filter(i => i.type === 'anime').length,
        queryable: {
            movie: watchlist.filter(i => i.type === 'movie' && i.itemId).length,
            series: watchlist.filter(i => i.type === 'series' && i.itemId).length,
            anime: watchlist.filter(i => i.type === 'anime' && i.itemId).length
        }
    };

    // ── 5. Liste custom sintetiche (userlists) ───────────────────────────────
    const lists = spec.syntheticLists?.items || [];
    await db.collection('userlists').deleteMany({ owner: target.userId });
    if (lists.length > 0) {
        const rows = lists.map(l => ({
            ...l,
            owner: target.userId,
            createdAt: now,
            updatedAt: now
        }));
        await db.collection('userlists').insertMany(rows);
    }
    report.lists = { rows: lists.length };

    // ── 6. Cronologia sintetica (watchhistories, per context) ────────────────
    await db.collection('watchhistories').deleteMany({ owner: target.userId });
    const historyRows = [];
    for (const profile of spec.profiles) {
        for (const h of (profile.history || [])) {
            historyRows.push({
                owner: target.userId,
                context: profile.id,
                tmdbId: h.tmdbId,
                type: h.type,
                episodesWatched: h.episodesWatched ?? 1,
                lastWatchedAt: new Date(Date.now() - (h.daysAgo ?? 30) * 24 * 60 * 60 * 1000),
                source: h.source || 'trakt',
                createdAt: now,
                updatedAt: now
            });
        }
    }
    if (historyRows.length > 0) await db.collection('watchhistories').insertMany(historyRows);
    report.history = { rows: historyRows.length };

    const reportPath = opts.report || ATLAS_STATE_PATH;
    writeJson(reportPath, report);
    report.reportPath = reportPath;
    return report;
}

/**
 * Cancella tutte le chiavi Redis riconducibili alla simulazione.
 * Best-effort: se Redis non è raggiungibile riporta l'errore senza fallire.
 * MAI flushdb.
 */
async function clearSimRedisKeys({ redisUrl, dryRun = false } = {}) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    let Redis;
    try {
        Redis = require('ioredis');
    } catch (e) {
        return { url, skipped: true, reason: `ioredis non disponibile: ${e.message}`, deleted: 0 };
    }
    const client = new Redis(url, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        connectTimeout: 3000
    });
    client.on('error', () => {});
    try {
        await client.connect();
        const patterns = ['*sim_user_yaca*', '*sim-uuid-yaca*', '*sim_prof_*'];
        const matched = new Set();
        for (const pattern of patterns) {
            const keys = await client.keys(pattern);
            for (const k of keys) matched.add(k);
        }
        if (dryRun) {
            return { url, matched: matched.size, deleted: 0, dryRun: true, keys: [...matched] };
        }
        let deleted = 0;
        for (const key of matched) deleted += await client.del(key);
        return { url, matched: matched.size, deleted };
    } catch (e) {
        return { url, error: e.message, deleted: 0, note: 'Redis non raggiungibile: chiavi sim_* non pulite (TTL naturale).' };
    } finally {
        try { client.disconnect(); } catch { /* ignore */ }
    }
}

/**
 * Comando `teardown`: elimina tutti i documenti sim_* e verifica il profilo reale.
 */
async function teardownSimData(opts = {}) {
    const db = await connectDb();
    const dryRun = Boolean(opts.dryRun);
    const regexUserId = /^sim_user_/;
    const regexUuid = /^sim-uuid-/;

    const targets = [
        { collection: 'useraccounts', filter: { $or: [{ userId: regexUserId }, { addonUuid: regexUuid }] } },
        { collection: 'addonconfigs', filter: { uuid: regexUuid } },
        { collection: 'tasteprofiles', filter: { owner: regexUserId } },
        { collection: 'recommendationimpressions', filter: { owner: regexUserId } },
        { collection: 'userlists', filter: { owner: regexUserId } },
        { collection: 'userlibraryitems', filter: { addonUuid: regexUuid } },
        { collection: 'watchhistories', filter: { owner: regexUserId } }
    ];

    const collections = {};
    for (const target of targets) {
        const count = await db.collection(target.collection).countDocuments(target.filter);
        let deleted = 0;
        if (!dryRun && count > 0) {
            const res = await db.collection(target.collection).deleteMany(target.filter);
            deleted = res.deletedCount || 0;
        }
        collections[target.collection] = { matched: count, deleted, dryRun };
    }

    const redis = await clearSimRedisKeys({ redisUrl: opts.redisUrl, dryRun });

    // Verifica finale: profilo reale intatto.
    const realUser = await db.collection('useraccounts').findOne({ userId: REAL_PROFILE.userId });
    const realConfig = await db.collection('addonconfigs').findOne({ uuid: REAL_PROFILE.addonUuid });
    const realTasteProfiles = await db.collection('tasteprofiles').countDocuments({ owner: REAL_PROFILE.userId });
    const realIntact = Boolean(realUser) && Boolean(realConfig) && realTasteProfiles === REAL_PROFILE.expectedTasteProfiles;

    const leftovers = {
        useraccounts: await db.collection('useraccounts').countDocuments({ $or: [{ userId: regexUserId }, { addonUuid: regexUuid }] }),
        addonconfigs: await db.collection('addonconfigs').countDocuments({ uuid: regexUuid }),
        tasteprofiles: await db.collection('tasteprofiles').countDocuments({ owner: regexUserId }),
        userlibraryitems: await db.collection('userlibraryitems').countDocuments({ addonUuid: regexUuid }),
        watchhistories: await db.collection('watchhistories').countDocuments({ owner: regexUserId })
    };

    const report = {
        generatedAt: new Date().toISOString(),
        dryRun,
        collections,
        redis,
        realProfile: {
            userId: REAL_PROFILE.userId,
            addonUuid: REAL_PROFILE.addonUuid,
            userFound: Boolean(realUser),
            configFound: Boolean(realConfig),
            tasteProfiles: realTasteProfiles,
            expectedTasteProfiles: REAL_PROFILE.expectedTasteProfiles,
            intact: realIntact
        },
        leftovers
    };
    return report;
}

module.exports = {
    connectDb,
    closeDb,
    buildCatalogEntry,
    materializeProfiles,
    teardownSimData,
    clearSimRedisKeys
};
