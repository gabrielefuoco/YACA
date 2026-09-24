/**
 * scripts/qa/lib/review.js
 *
 * Comando `review`: trasforma i payload grezzi di una run in artefatti di
 * revisione (JSON + MD) per profilo×catalogo e in un summary con le metriche
 * STRUTTURALI (conteggi, vuoti, duplicati, tipo sbagliato, overlap hero).
 * I verdetti P/B/N restano manuali: qui i campi sono vuoti (vedi rubric.md).
 *
 * Nota di protocollo: la rubric si applica ai PRIMI 40 RISULTATI (skip 0 e 20).
 * Alcuni cataloghi (preset DuckDB) restituiscono fino a 100 item per pagina:
 * il review prende quindi i primi 40 item unici in ordine di pagina e misura a
 * parte la sovrapposizione fra pagine (che la ricerca 04 richiede essere zero).
 */

const fs = require('fs');
const path = require('path');
const {
    log,
    fail,
    writeJson,
    writeText,
    readJson,
    resolveRunDir,
    loadSpec,
    HERO_SET,
    normalizeId,
    namespaceOf,
    extractYear,
    escapeMd
} = require('./common');

const REVIEW_LIMIT = 40;

function extractBadges(meta) {
    const poster = meta.poster;
    let tlBadge = null;
    let trBadge = null;
    if (poster && poster.includes('/images/poster/')) {
        try {
            const pUrl = new URL(poster);
            const pathParts = pUrl.pathname.split('/');
            const epBadge = decodeURIComponent(pathParts[5] || '_');
            const tl = pUrl.searchParams.get('tlBadge');
            // 'ITA' nel path è il marker della card doppiata, non un badge episodio.
            if (epBadge && epBadge !== '_' && !/^ita$/i.test(epBadge)) trBadge = epBadge;
            if (tl) tlBadge = decodeURIComponent(tl);
        } catch { /* poster non parsabile */ }
    }
    if (meta._itaBadge === true && !tlBadge) tlBadge = 'ITA';
    return { tlBadge, trBadge };
}

function toReviewItem(meta, position, pageIndex, skip) {
    const { tlBadge, trBadge } = extractBadges(meta);
    return {
        position,
        page: pageIndex + 1,
        skip,
        id: meta.id,
        title: meta.name || meta.title || '',
        year: extractYear(meta.releaseInfo || meta.year),
        type: meta.type || '',
        genres: Array.isArray(meta.genres) ? meta.genres : [],
        imdbRating: meta.imdbRating ?? null,
        runtime: meta.runtime || null,
        poster: meta.poster || null,
        tlBadge,
        trBadge,
        verdict: '',
        reason: '',
        evidence: ''
    };
}

/**
 * Costruisce la lista dei primi `limit` item unici (ordine di pagina) e le
 * metriche di paginazione: duplicati intra-pagina e sovrapposizione fra pagine.
 */
function collectItems(rawPages, limit = REVIEW_LIMIT) {
    const items = [];
    const seen = new Map(); // normalizedId -> { pages:Set, positions:[], rawIds:Set }
    const withinPageDuplicates = [];
    let rawCount = 0;
    let sequence = 0;

    const pages = Array.isArray(rawPages) ? rawPages : [];
    pages.forEach((page, pageIndex) => {
        const metas = Array.isArray(page.data?.metas) ? page.data.metas : [];
        const pageSeen = new Map();
        for (const meta of metas) {
            rawCount++;
            const nid = normalizeId(meta.id);
            if (!nid) continue;
            if (!seen.has(nid)) seen.set(nid, { id: nid, pages: new Set(), positions: [], rawIds: new Set() });
            const entry = seen.get(nid);
            entry.pages.add(pageIndex + 1);
            entry.positions.push(++sequence);
            entry.rawIds.add(meta.id);
            if (pageSeen.has(nid)) {
                const dup = pageSeen.get(nid);
                dup.count++;
                withinPageDuplicates.push({ id: nid, page: pageIndex + 1, rawId: meta.id, occurrences: dup.count });
            } else {
                pageSeen.set(nid, { count: 1 });
            }
            if (items.length < limit) {
                items.push(toReviewItem(meta, items.length + 1, pageIndex, page.skip ?? pageIndex * 20));
            }
        }
    });

    const pageOverlap = [...seen.values()]
        .filter(entry => entry.pages.size > 1)
        .map(entry => ({
            id: entry.id,
            rawIds: [...entry.rawIds],
            pages: [...entry.pages],
            positions: entry.positions
        }));

    return {
        items,
        rawCount,
        uniqueCount: seen.size,
        reviewedCount: items.length,
        withinPageDuplicates,
        pageOverlap
    };
}

function expectedItemTypes(catalogType) {
    switch (catalogType) {
        case 'movie': return ['movie'];
        case 'series': return ['series'];
        case 'anime': return ['anime', 'series', 'movie'];
        default: return null; // 'other' o ignoto: nessun vincolo
    }
}

function isWrongType(item, catalogType) {
    const allowed = expectedItemTypes(catalogType);
    if (!allowed) return false;
    if (!item.type) return false;
    if (!['movie', 'series', 'anime'].includes(item.type)) return false;
    return !allowed.includes(item.type);
}

function computeStatus({ empty, semiEmpty, withinPageDuplicates, wrongType, pageOverlap }) {
    const flags = [];
    if (empty) flags.push('vuoto');
    if (semiEmpty) flags.push('semi-vuoto');
    if (wrongType.length > 0) flags.push('tipo-sbagliato');
    if (withinPageDuplicates.length > 0) flags.push('duplicati');
    if (pageOverlap.length > 0) flags.push('pagine-sovrapposte');
    let status = 'ok';
    if (pageOverlap.length > 0) status = 'pagine-sovrapposte';
    if (withinPageDuplicates.length > 0) status = 'duplicati';
    if (wrongType.length > 0) status = 'tipo-sbagliato';
    if (semiEmpty) status = 'semi-vuoto';
    if (empty) status = 'vuoto';
    return { status, flags };
}

function buildCatalogArtifact(rawDoc, { profileName, limit = REVIEW_LIMIT } = {}) {
    const collected = collectItems(rawDoc.rawPages, limit);
    const catalogType = rawDoc.catalog?.type || null;
    const wrongType = collected.items
        .filter(item => isWrongType(item, catalogType))
        .map(item => ({ position: item.position, id: item.id, title: item.title, type: item.type, expected: catalogType }));
    const empty = collected.reviewedCount === 0;
    const semiEmpty = !empty && collected.reviewedCount < 10;
    const { status, flags } = computeStatus({
        empty,
        semiEmpty,
        withinPageDuplicates: collected.withinPageDuplicates,
        wrongType,
        pageOverlap: collected.pageOverlap
    });

    const namespaces = {};
    for (const item of collected.items) {
        const ns = namespaceOf(normalizeId(item.id));
        namespaces[ns] = (namespaces[ns] || 0) + 1;
    }

    return {
        profileId: rawDoc.profileId,
        profileName: profileName || null,
        catalog: {
            id: rawDoc.catalog?.id,
            baseId: rawDoc.catalog?.baseId,
            type: catalogType,
            name: rawDoc.catalog?.name || null
        },
        run: {
            mode: rawDoc.mode || null,
            baseUrl: rawDoc.baseUrl || null,
            fetchedAt: rawDoc.fetchedAt || null
        },
        pages: rawDoc.pages || [],
        reviewLimit: limit,
        rawCount: collected.rawCount,
        uniqueCount: collected.uniqueCount,
        count: collected.reviewedCount,
        metrics: {
            status,
            flags,
            empty,
            semiEmpty,
            duplicateCount: collected.withinPageDuplicates.length,
            wrongTypeCount: wrongType.length,
            pageOverlapCount: collected.pageOverlap.length,
            withinPageDuplicates: collected.withinPageDuplicates,
            pageOverlap: collected.pageOverlap,
            wrongType,
            namespaces
        },
        items: collected.items
    };
}

function catalogMarkdown(artifact) {
    const lines = [];
    lines.push(`# ${artifact.catalog.id} — ${artifact.catalog.name || ''}`.trim());
    lines.push('');
    lines.push(`- **Profilo**: \`${artifact.profileId}\`${artifact.profileName ? ` (${artifact.profileName})` : ''}`);
    lines.push(`- **Tipo catalogo**: \`${artifact.catalog.type}\``);
    lines.push(`- **Pagine**: ${artifact.pages.map(p => `skip=${p.skip} (${p.count} item${p.error ? `, errore: ${p.error}` : ''})`).join(' · ') || 'nessuna'}`);
    lines.push(`- **Item restituiti**: ${artifact.rawCount} · unici: ${artifact.uniqueCount} · revisionati (primi ${artifact.reviewLimit}): ${artifact.count}`);
    lines.push(`- **Stato strutturale**: \`${artifact.metrics.status}\`${artifact.metrics.flags.length ? ` — flags: ${artifact.metrics.flags.join(', ')}` : ''}`);
    lines.push(`- **Duplicati intra-pagina**: ${artifact.metrics.duplicateCount} · **Tipo sbagliato**: ${artifact.metrics.wrongTypeCount} · **Sovrapposizione pagine**: ${artifact.metrics.pageOverlapCount}`);
    lines.push('');
    lines.push('I verdetti P/B/N vanno compilati a mano secondo `.scratch/simulazione-profili/rubric.md`.');
    lines.push('');
    lines.push('| # | id | Titolo | Anno | Tipo | Rating | Badge | Verdetto | Motivo | Evidenza |');
    lines.push('|---|----|--------|------|------|--------|-------|----------|--------|----------|');
    for (const item of artifact.items) {
        const badge = [item.tlBadge, item.trBadge].filter(Boolean).join(' / ');
        lines.push(`| ${item.position} | \`${escapeMd(item.id)}\` | ${escapeMd(item.title)} | ${item.year} | ${item.type} | ${item.imdbRating ?? ''} | ${escapeMd(badge)} | ${item.verdict} | ${item.reason} | ${item.evidence} |`);
    }
    if (artifact.metrics.withinPageDuplicates.length > 0) {
        lines.push('');
        lines.push('## Duplicati nella stessa pagina');
        for (const d of artifact.metrics.withinPageDuplicates) {
            lines.push(`- \`${d.id}\` → pagina ${d.page}, occorrenza ${d.occurrences}`);
        }
    }
    if (artifact.metrics.wrongType.length > 0) {
        lines.push('');
        lines.push('## Item di tipo sbagliato');
        for (const w of artifact.metrics.wrongType) {
            lines.push(`- pos ${w.position} \`${w.id}\` "${w.title}" type=${w.type} (atteso ${w.expected})`);
        }
    }
    if (artifact.metrics.pageOverlap.length > 0) {
        lines.push('');
        lines.push('## Sovrapposizione fra pagine (skip=0 vs skip=20)');
        lines.push('Il server restituisce più di 20 item per pagina: la stessa entità compare in entrambe le pagine.');
        lines.push('');
        for (const o of artifact.metrics.pageOverlap.slice(0, 20)) {
            lines.push(`- \`${o.id}\` → pagine ${o.pages.join(', ')}`);
        }
        if (artifact.metrics.pageOverlap.length > 20) lines.push(`- … e altri ${artifact.metrics.pageOverlap.length - 20}`);
    }
    lines.push('');
    return lines.join('\n');
}

function heroTypeOf(catalogId) {
    if (!HERO_SET.has(catalogId)) return null;
    return catalogId.endsWith('_movies') ? 'movie' : catalogId.endsWith('_series') ? 'series' : null;
}

function computeHeroOverlap(artifacts) {
    const heroes = artifacts.filter(a => HERO_SET.has(a.catalog.id));
    const result = { movie: null, series: null };
    for (const type of ['movie', 'series']) {
        const group = heroes.filter(a => heroTypeOf(a.catalog.id) === type);
        if (group.length === 0) continue;
        const sets = group.map(a => ({
            catalogId: a.catalog.id,
            ids: new Set(a.items.map(i => normalizeId(i.id)).filter(Boolean))
        }));
        const pairs = [];
        let totalOverlap = 0;
        for (let i = 0; i < sets.length; i++) {
            for (let j = i + 1; j < sets.length; j++) {
                const shared = [...sets[i].ids].filter(id => sets[j].ids.has(id));
                totalOverlap += shared.length;
                pairs.push({ a: sets[i].catalogId, b: sets[j].catalogId, count: shared.length, shared: shared.slice(0, 20) });
            }
        }
        result[type] = {
            catalogs: group.map(a => a.catalog.id),
            expectedCatalogs: 4,
            complete: group.length === 4,
            pairs,
            totalOverlap,
            distinctIds: new Set(group.flatMap(a => a.items.map(i => normalizeId(i.id)))).size
        };
    }
    return result;
}

function summaryMarkdown(summary, runDir) {
    const lines = [];
    lines.push('# Summary simulazione profili');
    lines.push('');
    lines.push(`- **Run**: \`${path.basename(runDir)}\` (${runDir})`);
    lines.push(`- **Generato**: ${summary.generatedAt}`);
    lines.push(`- **Mode fetch**: ${summary.run?.mode || 'n/d'} · baseUrl: ${summary.run?.baseUrl || 'n/d'} · git: ${summary.run?.gitRev || 'n/d'}`);
    lines.push(`- **Profili**: ${summary.totals.profiles} · **Cataloghi**: ${summary.totals.catalogs} · **Item revisionati**: ${summary.totals.items}`);
    lines.push(`- **Vuoti**: ${summary.totals.empty} · **Semi-vuoti (<10)**: ${summary.totals.semiEmpty} · **Duplicati intra-pagina**: ${summary.totals.duplicateCatalogs} · **Tipo sbagliato**: ${summary.totals.wrongTypeCatalogs} · **Pagine sovrapposte**: ${summary.totals.pageOverlapCatalogs}`);
    lines.push('');
    lines.push('Metriche **strutturali**: i verdetti di pertinenza restano manuali secondo `.scratch/simulazione-profili/rubric.md`.');
    lines.push('');

    for (const [profileId, profile] of Object.entries(summary.profiles)) {
        lines.push(`## ${profileId}${profile.name ? ` — ${profile.name}` : ''}`);
        lines.push('');
        lines.push(`Manifest: ${profile.manifestCatalogs} cataloghi · revisionati: ${profile.catalogs} · item: ${profile.items}${profile.missingCatalogs?.length ? ` · non scaricati: ${profile.missingCatalogs.length}` : ''}${profile.directCatalogs?.length ? ` · fetch dirette: ${profile.directCatalogs.length}` : ''}`);
        lines.push('');
        lines.push('| Catalogo | Tipo | Item | Stato | Note |');
        lines.push('|----------|------|------|-------|------|');
        for (const cat of profile.catalogIndex) {
            const notes = [];
            if (cat.duplicateCount) notes.push(`${cat.duplicateCount} duplicati intra-pagina`);
            if (cat.wrongTypeCount) notes.push(`${cat.wrongTypeCount} tipo sbagliato`);
            if (cat.pageOverlapCount) notes.push(`${cat.pageOverlapCount} item su più pagine`);
            if (cat.error) notes.push(`errore: ${cat.error}`);
            lines.push(`| \`${cat.catalogId}\` | ${cat.type} | ${cat.count} | ${cat.status} | ${notes.join(' · ')} |`);
        }
        lines.push('');
        for (const type of ['movie', 'series']) {
            const overlap = profile.heroOverlap?.[type];
            if (!overlap) continue;
            lines.push(`### Overlap hero ${type}${overlap.complete ? '' : ' (parziale)'}`);
            lines.push('');
            lines.push(`Invariante rubric: zero overlap. Totale overlap: **${overlap.totalOverlap}** · id distinti: ${overlap.distinctIds}`);
            lines.push('');
            lines.push('| A | B | Overlap |');
            lines.push('|---|---|---------|');
            for (const pair of overlap.pairs) {
                lines.push(`| \`${pair.a}\` | \`${pair.b}\` | ${pair.count}${pair.count ? ` → ${pair.shared.map(s => `\`${s}\``).join(', ')}` : ''} |`);
            }
            lines.push('');
        }
    }
    return lines.join('\n');
}

/**
 * Comando `review`.
 */
function runReview(opts = {}) {
    const runDir = resolveRunDir(opts.run, { latest: true });
    const rawDir = path.join(runDir, 'raw');
    if (!fs.existsSync(rawDir)) fail(`Nessun dato grezzo in ${rawDir}: esegui prima "fetch".`);
    let spec = null;
    try { spec = loadSpec(opts.spec); } catch { spec = null; }
    const profileName = id => spec?.profiles?.find(p => p.id === id)?.name || null;
    const profileFilter = opts.profiles && opts.profiles !== true
        ? String(opts.profiles).split(',').map(s => s.trim()).filter(Boolean)
        : null;
    const limit = Number.parseInt(opts.limit, 10) || REVIEW_LIMIT;

    const runMetaPath = path.join(runDir, 'run.json');
    const runMeta = fs.existsSync(runMetaPath) ? readJson(runMetaPath) : {};

    const summary = {
        generatedAt: new Date().toISOString(),
        runDir,
        reviewLimit: limit,
        run: { mode: runMeta.mode || null, baseUrl: runMeta.baseUrl || null, createdAt: runMeta.createdAt || null, gitRev: runMeta.gitRev || null },
        totals: {
            profiles: 0,
            catalogs: 0,
            items: 0,
            rawItems: 0,
            empty: 0,
            semiEmpty: 0,
            duplicateCatalogs: 0,
            wrongTypeCatalogs: 0,
            pageOverlapCatalogs: 0,
            catalogsWithErrors: 0
        },
        profiles: {}
    };

    const profileDirs = fs.readdirSync(rawDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .filter(id => !profileFilter || profileFilter.includes(id))
        .sort();

    for (const profileId of profileDirs) {
        const dir = path.join(rawDir, profileId);
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_manifest.json').sort();
        const manifestPath = path.join(dir, '_manifest.json');
        const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
        const manifestCatalogList = manifest?.manifest?.catalogs || [];
        const manifestCatalogIds = new Set(manifestCatalogList.map(c => c.id));

        const artifacts = [];
        for (const file of files) {
            const rawDoc = readJson(path.join(dir, file));
            const artifact = buildCatalogArtifact(rawDoc, { profileName: profileName(profileId), limit });
            artifacts.push(artifact);
            writeJson(path.join(runDir, 'review', profileId, `${file}`), artifact);
            writeText(path.join(runDir, 'review', profileId, file.replace(/\.json$/, '.md')), catalogMarkdown(artifact));
        }

        const fetchedIds = new Set(artifacts.map(a => a.catalog.id));
        const missingCatalogs = [...manifestCatalogIds].filter(id => !fetchedIds.has(id));
        const directCatalogs = [...fetchedIds].filter(id => !manifestCatalogIds.has(id));
        const catalogIndex = artifacts.map(a => ({
            catalogId: a.catalog.id,
            baseId: a.catalog.baseId,
            type: a.catalog.type,
            count: a.count,
            rawCount: a.rawCount,
            status: a.metrics.status,
            flags: a.metrics.flags,
            duplicateCount: a.metrics.duplicateCount,
            wrongTypeCount: a.metrics.wrongTypeCount,
            pageOverlapCount: a.metrics.pageOverlapCount,
            error: a.pages.find(p => p.error)?.error || null
        }));

        const emptyCatalogs = catalogIndex.filter(c => c.status === 'vuoto').map(c => c.catalogId);
        const semiEmptyCatalogs = catalogIndex.filter(c => c.status === 'semi-vuoto').map(c => c.catalogId);
        const duplicateCatalogs = catalogIndex.filter(c => c.duplicateCount > 0).map(c => c.catalogId);
        const wrongTypeCatalogs = catalogIndex.filter(c => c.wrongTypeCount > 0).map(c => c.catalogId);
        const pageOverlapCatalogs = catalogIndex.filter(c => c.pageOverlapCount > 0).map(c => c.catalogId);

        summary.profiles[profileId] = {
            name: profileName(profileId),
            manifestCatalogs: manifestCatalogList.length,
            catalogs: artifacts.length,
            items: artifacts.reduce((sum, a) => sum + a.count, 0),
            rawItems: artifacts.reduce((sum, a) => sum + a.rawCount, 0),
            missingCatalogs,
            directCatalogs,
            emptyCatalogs,
            semiEmptyCatalogs,
            duplicateCatalogs,
            wrongTypeCatalogs,
            pageOverlapCatalogs,
            heroOverlap: computeHeroOverlap(artifacts),
            catalogIndex
        };

        summary.totals.profiles++;
        summary.totals.catalogs += artifacts.length;
        summary.totals.items += summary.profiles[profileId].items;
        summary.totals.rawItems += summary.profiles[profileId].rawItems;
        summary.totals.empty += emptyCatalogs.length;
        summary.totals.semiEmpty += semiEmptyCatalogs.length;
        summary.totals.duplicateCatalogs += duplicateCatalogs.length;
        summary.totals.wrongTypeCatalogs += wrongTypeCatalogs.length;
        summary.totals.pageOverlapCatalogs += pageOverlapCatalogs.length;
        summary.totals.catalogsWithErrors += catalogIndex.filter(c => c.error).length;

        log(`[${profileId}] ${artifacts.length} cataloghi, ${summary.profiles[profileId].items} item revisionati, vuoti=${emptyCatalogs.length}, semi-vuoti=${semiEmptyCatalogs.length}, pagine sovrapposte=${pageOverlapCatalogs.length}`);
    }

    writeJson(path.join(runDir, 'review', 'summary.json'), summary);
    writeText(path.join(runDir, 'review', 'summary.md'), summaryMarkdown(summary, runDir));
    log(`Review completata: ${summary.totals.catalogs} cataloghi, ${summary.totals.items} item revisionati (${summary.totals.rawItems} restituiti).`);
    log(`Summary: ${path.join(runDir, 'review', 'summary.md')}`);
    return summary;
}

module.exports = {
    buildCatalogArtifact,
    computeHeroOverlap,
    runReview,
    REVIEW_LIMIT
};
