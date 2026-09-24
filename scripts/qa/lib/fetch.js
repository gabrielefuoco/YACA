/**
 * scripts/qa/lib/fetch.js
 *
 * Comando `fetch`: scarica manifest + cataloghi (2 pagine = 40 item) dal server
 * di produzione (read-only) per ogni profilo di test, salvando i payload grezzi
 * nella run dir. Riusa il loop HTTP/paginazione/_nocache di scripts/fetch_catalogs.js.
 */

const axios = require('axios');
const path = require('path');
const { execSync } = require('child_process');
const { connectDb, closeDb } = require('./atlas');
const {
    HERO_SET,
    log,
    warn,
    fail,
    writeJson,
    safeFileName,
    resolveOrCreateRunDir,
    loadSpec,
    sleep
} = require('./common');

const DEFAULT_BASE_URL = (process.env.YACA_BASE_URL || 'https://mate.taild24589.ts.net').replace(/\/+$/, '');
const SEARCH_CATALOG_IDS = new Set(['yaca_search_standard', 'yaca_search_ai']);
const DEFAULT_TIMEOUT_MS = 15000;

function gitRev() {
    try {
        return execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..', '..', '..'), stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return null;
    }
}

async function httpGetJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2 } = {}) {
    let attempt = 0;
    for (;;) {
        try {
            const res = await axios.get(url, { timeout: timeoutMs, validateStatus: () => true });
            if (res.status >= 200 && res.status < 300) {
                return { status: res.status, data: res.data };
            }
            if ((res.status === 502 || res.status === 504 || res.status === 429) && attempt < retries) {
                attempt++;
                await sleep(1000 * attempt);
                continue;
            }
            return { status: res.status, data: res.data, error: `HTTP ${res.status}` };
        } catch (err) {
            if (attempt < retries) {
                attempt++;
                await sleep(1000 * attempt);
                continue;
            }
            throw err;
        }
    }
}

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));
    const workers = Array.from({ length: workerCount }, async () => {
        for (;;) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await fn(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

async function setActiveProfile(db, addonUuid, profileId) {
    await db.collection('addonconfigs').updateOne(
        { uuid: addonUuid },
        { $set: { 'config.activeProfileId': profileId, updatedAt: new Date() } }
    );
}

function matchesCatalogFilter(catalog, onlyList) {
    if (!onlyList) return true;
    const baseId = catalog.id?.startsWith('yaca_preset_') ? catalog.id.replace('yaca_preset_', '') : catalog.id;
    return onlyList.some(entry =>
        entry === catalog.id ||
        entry === baseId ||
        entry === `yaca_preset_${baseId}`
    );
}

function buildCatalogFileName(catalog) {
    const id = safeFileName(catalog?.id || 'catalog');
    const type = safeFileName(catalog?.type || 'unknown');
    return `${id}-${type}.json`;
}

/**
 * Con `--only` è possibile chiedere fetch DIRETTE di preset/hero non presenti nel
 * manifest del profilo (piano di copertura 160/160, profiles-proposal §C):
 * il catalogHandler risolve comunque qualsiasi preset di presets.js, purché
 * conforme ai typeSelectors del profilo attivo.
 */
function resolveDirectCatalogs(profile, manifestCatalogs, onlyList) {
    if (!onlyList) return { extra: [], skipped: [] };
    const { getPresets } = require('../../../src/data/presets');
    const { isCatalogConformant } = require('../../../src/catalog/catalogKind');
    const presetMap = new Map(getPresets().map(p => [p.id, p]));
    const inManifest = new Set(manifestCatalogs.map(c => c.id));
    const extra = [];
    const skipped = [];
    for (const entry of onlyList) {
        const baseId = entry.startsWith('yaca_preset_') ? entry.replace('yaca_preset_', '') : entry;
        const fullPresetId = `yaca_preset_${baseId}`;
        if (inManifest.has(entry) || inManifest.has(fullPresetId)) continue;
        const preset = presetMap.get(baseId);
        if (preset) {
            const catalog = { id: fullPresetId, type: preset.type, name: preset.name, baseId: preset.id };
            if (isCatalogConformant(preset, profile.typeSelectors)) extra.push(catalog);
            else skipped.push({ id: catalog.id, reason: 'preset non conforme ai typeSelectors del profilo' });
            continue;
        }
        if (HERO_SET.has(entry)) {
            const type = entry.endsWith('_movies') ? 'movie' : 'series';
            const catalog = { id: entry, type, name: entry, baseId: entry };
            if (isCatalogConformant(entry, profile.typeSelectors)) extra.push(catalog);
            else skipped.push({ id: entry, reason: 'hero non conforme ai typeSelectors del profilo' });
            continue;
        }
        skipped.push({ id: entry, reason: 'id sconosciuto (né preset né hero)' });
    }
    return { extra, skipped };
}

async function fetchCatalogPages({ baseUrl, addonUuid, catalog, pages, mode, timeoutMs, pacingMs }) {
    const pageMeta = [];
    const rawPages = [];
    for (let page = 0; page < pages; page++) {
        const skip = page * 20;
        const skipPath = skip > 0 ? `/skip=${skip}` : '';
        const cacheBuster = mode === 'fresh' ? `?_nocache=${Date.now()}` : '';
        const url = `${baseUrl}/${addonUuid}/catalog/${catalog.type}/${catalog.id}${skipPath}.json${cacheBuster}`;
        await sleep(pacingMs);
        const startedAt = Date.now();
        try {
            const res = await httpGetJson(url, { timeoutMs });
            const metas = Array.isArray(res.data?.metas) ? res.data.metas : [];
            pageMeta.push({ skip, url, httpStatus: res.status, count: metas.length, elapsedMs: Date.now() - startedAt, error: res.error || null });
            rawPages.push({ skip, url, data: res.data });
            if (metas.length < 20) break; // pagina corta: il catalogo è finito
        } catch (err) {
            pageMeta.push({ skip, url, httpStatus: null, count: 0, elapsedMs: Date.now() - startedAt, error: err.message });
            break;
        }
    }
    return { pageMeta, rawPages };
}

/**
 * Comando `fetch`.
 */
async function runFetch(opts = {}) {
    const spec = loadSpec(opts.spec);
    const baseUrl = String(opts.url || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const mode = opts.cached ? 'cached' : 'fresh';
    const pages = Number.parseInt(opts.pages, 10) || 2;
    const concurrency = Math.max(1, Math.min(Number.parseInt(opts.concurrency, 10) || 3, 5));
    const pacingMs = Number.parseInt(opts.pacing, 10) >= 0 ? Number.parseInt(opts.pacing, 10) : 60;
    const timeoutMs = Number.parseInt(opts.timeout, 10) || DEFAULT_TIMEOUT_MS;
    const runDir = resolveOrCreateRunDir(opts.run);
    const onlyList = opts.only && opts.only !== true
        ? String(opts.only).split(',').map(s => s.trim()).filter(Boolean)
        : null;
    const profileFilter = opts.profiles && opts.profiles !== true
        ? String(opts.profiles).split(',').map(s => s.trim()).filter(Boolean)
        : null;

    const selectedProfiles = spec.profiles.filter(p => {
        if (!profileFilter) return true;
        return profileFilter.includes(p.id) || profileFilter.some(f => f.toLowerCase() === String(p.name).toLowerCase());
    });
    if (selectedProfiles.length === 0) fail(`Nessun profilo selezionato con --profiles=${opts.profiles}`);

    const db = await connectDb();
    const run = {
        runDir,
        createdAt: new Date().toISOString(),
        baseUrl,
        mode,
        pages,
        concurrency,
        pacingMs,
        timeoutMs,
        only: onlyList,
        profilesRequested: selectedProfiles.map(p => p.id),
        specPath: spec._path,
        gitRev: gitRev(),
        profiles: [],
        totals: { catalogs: 0, items: 0, errors: 0, manifestErrors: 0, catalogErrors: 0 }
    };

    log(`Run dir: ${runDir}`);
    log(`Target: ${baseUrl} | mode=${mode} | pages=${pages} | concorrenza=${concurrency}`);

    for (const profile of selectedProfiles) {
        const profileEntry = { id: profile.id, manifestCatalogs: 0, catalogsFetched: 0, items: 0, errors: [], skippedCatalogs: [], catalogs: [] };
        await setActiveProfile(db, spec.target.addonUuid, profile.id);
        const manifestUrl = `${baseUrl}/${spec.target.addonUuid}/manifest.json`;
        let manifest;
        try {
            manifest = await httpGetJson(manifestUrl, { timeoutMs });
            if (manifest.error || !manifest.data?.catalogs) throw new Error(manifest.error || 'manifest senza catalogs');
        } catch (err) {
            profileEntry.errors.push(`manifest: ${err.message}`);
            run.totals.errors++;
            run.totals.manifestErrors++;
            warn(`[${profile.id}] manifest fallito: ${err.message}`);
            run.profiles.push(profileEntry);
            continue;
        }
        const manifestCatalogs = manifest.data.catalogs || [];
        profileEntry.manifestCatalogs = manifestCatalogs.length;
        writeJson(path.join(runDir, 'raw', profile.id, '_manifest.json'), {
            profileId: profile.id,
            activeProfileId: profile.id,
            fetchedAt: new Date().toISOString(),
            url: manifestUrl,
            manifest: manifest.data
        });

        let catalogs = manifestCatalogs;
        if (!opts['include-search']) {
            catalogs = catalogs.filter(c => !SEARCH_CATALOG_IDS.has(c.id));
        }
        catalogs = catalogs.filter(c => matchesCatalogFilter(c, onlyList));
        const direct = resolveDirectCatalogs(profile, manifestCatalogs, onlyList);
        const directIds = new Set(direct.extra.map(c => c.id));
        if (direct.extra.length > 0) {
            log(`[${profile.id}] fetch dirette (non nel manifest): ${direct.extra.map(c => c.id).join(', ')}`);
            catalogs = [...catalogs, ...direct.extra];
        }
        if (direct.skipped.length > 0) {
            direct.skipped.forEach(s => warn(`[${profile.id}] skip ${s.id}: ${s.reason}`));
        }
        profileEntry.skippedCatalogs = direct.skipped;
        if (catalogs.length === 0) warn(`[${profile.id}] nessun catalogo selezionato dal manifest.`);

        log(`[${profile.id}] manifest ok: ${manifestCatalogs.length} cataloghi, ${catalogs.length} da scaricare`);

        await mapLimit(catalogs, concurrency, async (catalog) => {
            const { pageMeta, rawPages } = await fetchCatalogPages({
                baseUrl,
                addonUuid: spec.target.addonUuid,
                catalog,
                pages,
                mode,
                timeoutMs,
                pacingMs
            });
            const metas = rawPages.flatMap(p => (Array.isArray(p.data?.metas) ? p.data.metas : []));
            const file = path.join(runDir, 'raw', profile.id, buildCatalogFileName(catalog));
            writeJson(file, {
                profileId: profile.id,
                catalog: {
                    id: catalog.id,
                    type: catalog.type,
                    name: catalog.name || null,
                    baseId: catalog.id?.startsWith('yaca_preset_') ? catalog.id.replace('yaca_preset_', '') : catalog.id
                },
                mode,
                fetchedAt: new Date().toISOString(),
                baseUrl,
                pages: pageMeta,
                rawPages
            });
            const errored = pageMeta.some(p => p.error);
            profileEntry.catalogsFetched++;
            profileEntry.items += metas.length;
            run.totals.catalogs++;
            run.totals.items += metas.length;
            profileEntry.catalogs.push({
                id: catalog.id,
                type: catalog.type,
                count: metas.length,
                pages: pageMeta.length,
                direct: directIds.has(catalog.id),
                error: errored ? pageMeta.filter(p => p.error).map(p => p.error).join('; ') : null
            });
            if (errored) {
                profileEntry.errors.push(`${catalog.id}: ${pageMeta.filter(p => p.error).map(p => p.error).join('; ')}`);
                run.totals.errors++;
                run.totals.catalogErrors++;
            }
            log(`[${profile.id}] ${catalog.id} (${catalog.type}): ${metas.length} item`);
        });
        run.profiles.push(profileEntry);
    }

    // Stato deterministico: riporta il profilo attivo al default della spec.
    const restoreProfileId = spec.target.defaultProfileId || spec.profiles[0].id;
    await setActiveProfile(db, spec.target.addonUuid, restoreProfileId);
    run.restoredActiveProfileId = restoreProfileId;

    writeJson(path.join(runDir, 'run.json'), run);
    await closeDb();

    log(`Fetch completato: ${run.totals.catalogs} cataloghi, ${run.totals.items} item, ${run.totals.errors} errori (${run.totals.manifestErrors} manifest, ${run.totals.catalogErrors} cataloghi).`);
    log(`Artefatti in ${runDir}`);
    if (run.totals.catalogErrors > 0) {
        warn('Alcuni cataloghi hanno riportato errori: vedi run.json.');
    }
    return run;
}

module.exports = {
    DEFAULT_BASE_URL,
    SEARCH_CATALOG_IDS,
    buildCatalogFileName,
    httpGetJson,
    mapLimit,
    setActiveProfile,
    runFetch
};
