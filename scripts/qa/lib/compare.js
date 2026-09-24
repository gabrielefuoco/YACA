/**
 * scripts/qa/lib/compare.js
 *
 * Comando `compare <runA> <runB>`: diff tra due run sugli stessi profili.
 * Rileva item spariti/aggiunti/cambiati, variazioni di overlap hero e
 * transizioni vuoto↔pieno. Base per la verifica post-fix (ticket 19).
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
    normalizeId,
    escapeMd
} = require('./common');
const { buildCatalogArtifact, computeHeroOverlap } = require('./review');

const MAX_LIST = 30;

function loadRunArtifacts(runDir) {
    const reviewDir = path.join(runDir, 'review');
    const rawDir = path.join(runDir, 'raw');
    const artifacts = [];
    const source = fs.existsSync(reviewDir) && fs.existsSync(path.join(reviewDir, 'summary.json')) ? 'review' : 'raw';
    const baseDir = source === 'review' ? reviewDir : rawDir;
    if (!fs.existsSync(baseDir)) fail(`Run ${runDir}: né review/ né raw/ presenti.`);

    const profileDirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
    for (const profileId of profileDirs) {
        const dir = path.join(baseDir, profileId);
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_manifest.json');
        for (const file of files) {
            const doc = readJson(path.join(dir, file));
            if (source === 'review') {
                artifacts.push(doc);
            } else {
                artifacts.push(buildCatalogArtifact(doc, {}));
            }
        }
    }
    return { artifacts, source };
}

function indexArtifacts(artifacts) {
    const map = new Map();
    for (const a of artifacts) {
        map.set(`${a.profileId}::${a.catalog.id}::${a.catalog.type || 'unknown'}`, a);
    }
    return map;
}

function diffCatalog(a, b) {
    const aItems = a?.items || [];
    const bItems = b?.items || [];
    const aById = new Map(aItems.map(i => [normalizeId(i.id), i]));
    const bById = new Map(bItems.map(i => [normalizeId(i.id), i]));

    const removed = [];
    const changed = [];
    const moved = [];
    for (const [id, item] of aById.entries()) {
        if (!bById.has(id)) {
            removed.push({ id, title: item.title, position: item.position });
            continue;
        }
        const other = bById.get(id);
        if (item.title !== other.title || item.year !== other.year || item.type !== other.type) {
            changed.push({
                id,
                from: { title: item.title, year: item.year, type: item.type },
                to: { title: other.title, year: other.year, type: other.type }
            });
        }
        if (item.position !== other.position) {
            moved.push({ id, title: other.title, from: item.position, to: other.position, delta: other.position - item.position });
        }
    }
    const added = [];
    for (const [id, item] of bById.entries()) {
        if (!aById.has(id)) added.push({ id, title: item.title, position: item.position });
    }

    const aCount = aItems.length;
    const bCount = bItems.length;
    const transitions = [];
    if (aCount === 0 && bCount > 0) transitions.push('riempito');
    if (aCount > 0 && bCount === 0) transitions.push('svuotato');
    if (aCount >= 10 && bCount > 0 && bCount < 10) transitions.push('semi-svuotato');
    if (aCount > 0 && aCount < 10 && bCount >= 10) transitions.push('semi-riempito');

    return {
        aCount,
        bCount,
        removed,
        added,
        changed,
        moved,
        transitions,
        unchanged: aCount - removed.length - changed.length
    };
}

function heroOverlapFromArtifacts(artifacts) {
    const byProfile = {};
    for (const a of artifacts) {
        if (!byProfile[a.profileId]) byProfile[a.profileId] = [];
        byProfile[a.profileId].push(a);
    }
    const out = {};
    for (const [profileId, list] of Object.entries(byProfile)) {
        out[profileId] = computeHeroOverlap(list);
    }
    return out;
}

function compareMarkdown(report) {
    const lines = [];
    lines.push(`# Compare run`);
    lines.push('');
    lines.push(`- **Run A**: \`${report.runA.name}\` (${report.runA.dir})`);
    lines.push(`- **Run B**: \`${report.runB.name}\` (${report.runB.dir})`);
    lines.push(`- **Generato**: ${report.generatedAt}`);
    lines.push(`- **Sorgente dati**: ${report.sourceA} / ${report.sourceB}`);
    lines.push('');
    lines.push('## Totali');
    lines.push('');
    lines.push('| Metrica | Run A | Run B | Delta |');
    lines.push('|---------|-------|-------|-------|');
    lines.push(`| Cataloghi | ${report.totals.a.catalogs} | ${report.totals.b.catalogs} | ${report.totals.b.catalogs - report.totals.a.catalogs} |`);
    lines.push(`| Item | ${report.totals.a.items} | ${report.totals.b.items} | ${report.totals.b.items - report.totals.a.items} |`);
    lines.push(`| Item spariti | - | ${report.totals.removed} | - |`);
    lines.push(`| Item aggiunti | - | ${report.totals.added} | - |`);
    lines.push(`| Item cambiati | - | ${report.totals.changed} | - |`);
    lines.push(`| Item spostati | - | ${report.totals.moved} | - |`);
    lines.push('');

    if (report.catalogsOnlyInA.length > 0 || report.catalogsOnlyInB.length > 0) {
        lines.push('## Cataloghi presenti in una sola run');
        lines.push('');
        for (const id of report.catalogsOnlyInA) lines.push(`- **solo A**: \`${id}\``);
        for (const id of report.catalogsOnlyInB) lines.push(`- **solo B**: \`${id}\``);
        lines.push('');
    }

    const changedCatalogs = report.catalogs.filter(c => c.removed.length || c.added.length || c.changed.length || c.moved.length || c.transitions.length);
    lines.push(`## Cataloghi con differenze (${changedCatalogs.length})`);
    lines.push('');
    if (changedCatalogs.length === 0) {
        lines.push('Nessuna differenza sugli item confrontati.');
        lines.push('');
    }
    for (const cat of changedCatalogs) {
        lines.push(`### \`${cat.key}\` — ${cat.aCount} → ${cat.bCount} item${cat.transitions.length ? ` (${cat.transitions.join(', ')})` : ''}`);
        lines.push('');
        if (cat.removed.length) {
            lines.push(`**Spariti (${cat.removed.length})**: ${cat.removed.slice(0, MAX_LIST).map(i => `\`${i.id}\` ${escapeMd(i.title)}`).join(' · ')}${cat.removed.length > MAX_LIST ? ' …' : ''}`);
            lines.push('');
        }
        if (cat.added.length) {
            lines.push(`**Aggiunti (${cat.added.length})**: ${cat.added.slice(0, MAX_LIST).map(i => `\`${i.id}\` ${escapeMd(i.title)}`).join(' · ')}${cat.added.length > MAX_LIST ? ' …' : ''}`);
            lines.push('');
        }
        if (cat.changed.length) {
            lines.push(`**Cambiati (${cat.changed.length})**:`);
            for (const c of cat.changed.slice(0, MAX_LIST)) {
                lines.push(`- \`${c.id}\`: "${escapeMd(c.from.title)}" (${c.from.year}, ${c.from.type}) → "${escapeMd(c.to.title)}" (${c.to.year}, ${c.to.type})`);
            }
            lines.push('');
        }
        if (cat.moved.length) {
            lines.push(`**Spostati (${cat.moved.length})**, top per |Δ|: ${cat.moved.slice().sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 10).map(m => `\`${m.id}\` ${m.from}→${m.to}`).join(' · ')}`);
            lines.push('');
        }
    }

    lines.push('## Overlap hero (invariante: zero)');
    lines.push('');
    lines.push('| Profilo | Tipo | A | B | Delta |');
    lines.push('|---------|------|---|---|-------|');
    const profiles = new Set([...Object.keys(report.heroOverlapA), ...Object.keys(report.heroOverlapB)]);
    for (const profileId of [...profiles].sort()) {
        for (const type of ['movie', 'series']) {
            const a = report.heroOverlapA[profileId]?.[type]?.totalOverlap ?? null;
            const b = report.heroOverlapB[profileId]?.[type]?.totalOverlap ?? null;
            if (a === null && b === null) continue;
            lines.push(`| \`${profileId}\` | ${type} | ${a ?? '-'} | ${b ?? '-'} | ${(a !== null && b !== null) ? b - a : '-'} |`);
        }
    }
    lines.push('');
    return lines.join('\n');
}

/**
 * Comando `compare`.
 */
function runCompare(runARef, runBRef, opts = {}) {
    const runADir = resolveRunDir(runARef);
    const runBDir = resolveRunDir(runBRef);
    const loadedA = loadRunArtifacts(runADir);
    const loadedB = loadRunArtifacts(runBDir);
    const indexA = indexArtifacts(loadedA.artifacts);
    const indexB = indexArtifacts(loadedB.artifacts);

    const keys = new Set([...indexA.keys(), ...indexB.keys()]);
    const catalogs = [];
    let removedTotal = 0;
    let addedTotal = 0;
    let changedTotal = 0;
    let movedTotal = 0;

    for (const key of [...keys].sort()) {
        const a = indexA.get(key);
        const b = indexB.get(key);
        if (!a || !b) continue;
        const diff = diffCatalog(a, b);
        removedTotal += diff.removed.length;
        addedTotal += diff.added.length;
        changedTotal += diff.changed.length;
        movedTotal += diff.moved.length;
        catalogs.push({ key, profileId: b.profileId, catalogId: b.catalog.id, ...diff });
    }

    const report = {
        generatedAt: new Date().toISOString(),
        runA: { dir: runADir, name: path.basename(runADir) },
        runB: { dir: runBDir, name: path.basename(runBDir) },
        sourceA: loadedA.source,
        sourceB: loadedB.source,
        totals: {
            a: { catalogs: indexA.size, items: loadedA.artifacts.reduce((s, x) => s + x.count, 0) },
            b: { catalogs: indexB.size, items: loadedB.artifacts.reduce((s, x) => s + x.count, 0) },
            removed: removedTotal,
            added: addedTotal,
            changed: changedTotal,
            moved: movedTotal
        },
        catalogsOnlyInA: [...indexA.keys()].filter(k => !indexB.has(k)).sort(),
        catalogsOnlyInB: [...indexB.keys()].filter(k => !indexA.has(k)).sort(),
        catalogs,
        heroOverlapA: heroOverlapFromArtifacts(loadedA.artifacts),
        heroOverlapB: heroOverlapFromArtifacts(loadedB.artifacts)
    };

    const outBase = path.join(runBDir, `compare_${path.basename(runADir)}`);
    const outMd = opts.out ? path.resolve(process.cwd(), opts.out) : `${outBase}.md`;
    writeJson(`${outBase}.json`, report);
    writeText(outMd, compareMarkdown(report));

    log(`Compare A=${report.runA.name} B=${report.runB.name}: spariti=${removedTotal}, aggiunti=${addedTotal}, cambiati=${changedTotal}, spostati=${movedTotal}`);
    log(`Report: ${outMd}`);
    return { report, outMd };
}

module.exports = {
    runCompare
};
