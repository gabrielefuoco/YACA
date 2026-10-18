#!/usr/bin/env node
/**
 * scripts/qa/probe-gusto-holdout.js
 *
 * Il Metro della Qualità (Ticket 43) — Holdout sui dati reali di gusto.
 *
 * Metodologia (mutuata da services/graph/measure/ricetta.py):
 * - Dato un utente reale da MongoDB, ordina cronologicamente la sua storia di visione.
 * - Taglio temporale: 70% più vecchio = SEMI (passato), 30% più recente = ORO (futuro).
 * - Costruisce la riga hidden_gems con switch OFF (vecchio motore) e ON (nuovo candidate provider).
 * - Misura le 4 metriche:
 *   1. oro_preso: quanti titoli dell'oro finiscono nella riga raccomandata
 *   2. riempimento: quanti titoli produce la riga
 *   3. novità: quanti titoli NON sono già nella libreria dell'utente (UserLibraryItem)
 *   4. diversità: dispersione per genere e regista/autore
 * - Dichiara esplicitamente la fuga (live profile = limite superiore con fuga vs profilo solo semi = senza fuga).
 *
 * Utilizzo:
 *   node scripts/qa/probe-gusto-holdout.js [--userId=<id>] [--context=<id>] [--allUsers]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const duckDbStore = require('../../src/indice/duckDbStore');
const {
    HERO_STRATEGIES,
    setFlagNewHiddenGems,
    getRecommendationId
} = require('../../src/pool');
const { fetchProfileContext } = require('../../src/engines/hybrid/dataFetchers');

function parseJsonSafe(val, defaultVal = []) {
    if (!val) return defaultVal;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (_) {
        return defaultVal;
    }
}

function extractIds(result) {
    const items = Array.isArray(result) ? result : (result?.ids || []);
    return items.map(item => getRecommendationId(item)).filter(Boolean);
}

function computeJaccard(listA, listB) {
    const setA = new Set(listA);
    const setB = new Set(listB);
    const intersection = [...setA].filter(id => setB.has(id)).length;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = union > 0 ? (intersection / union) : 0;
    return { intersection, union, jaccard: Number(jaccard.toFixed(4)) };
}

/**
 * Recupera i metadati arricchiti (generi, registi/creatori) da DuckDB per una lista di ID TMDB.
 */
async function fetchMetadataForIds(ids, mediaType) {
    if (!ids || ids.length === 0) return new Map();
    const isMovie = mediaType === 'movie';
    const table = isMovie ? 'movies' : 'tv';
    const cols = isMovie ? 'id, title, genres, directors' : 'id, name, genres, created_by';
    const cleanIds = ids.map(id => String(id).replace(/\D/g, '')).filter(Boolean);
    if (cleanIds.length === 0) return new Map();

    const sql = `SELECT ${cols} FROM ${table} WHERE id IN (${cleanIds.join(',')})`;
    const rows = await duckDbStore.query(sql);
    const metaMap = new Map();

    for (const row of rows) {
        const id = String(row.id);
        const title = isMovie ? row.title : row.name;
        const rawGenres = parseJsonSafe(row.genres);
        const genres = rawGenres.map(g => (typeof g === 'object' && g !== null ? (g.name || String(g.id)) : String(g))).filter(Boolean);
        const rawCrew = isMovie ? parseJsonSafe(row.directors) : parseJsonSafe(row.created_by);
        const directors = rawCrew.map(d => (typeof d === 'object' && d !== null ? (d.name || String(d.id)) : String(d))).filter(Boolean);
        metaMap.set(id, { id, title, genres, directors });
    }
    return metaMap;
}

/**
 * Calcola le statistiche di diversità per generi e registi.
 */
function computeDiversity(ids, metaMap) {
    const genreCounts = new Map();
    const directorCounts = new Map();

    for (const id of ids) {
        const meta = metaMap.get(id);
        const genres = meta?.genres || [];
        const directors = meta?.directors || [];

        for (const g of genres) {
            genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
        }
        for (const d of directors) {
            directorCounts.set(d, (directorCounts.get(d) || 0) + 1);
        }
    }

    const totalItems = ids.length || 1;
    let topGenre = null;
    let maxGenreCount = 0;
    for (const [g, count] of genreCounts.entries()) {
        if (count > maxGenreCount) {
            maxGenreCount = count;
            topGenre = g;
        }
    }

    let topDirector = null;
    let maxDirectorCount = 0;
    for (const [d, count] of directorCounts.entries()) {
        if (count > maxDirectorCount) {
            maxDirectorCount = count;
            topDirector = d;
        }
    }

    return {
        distinctGenres: genreCounts.size,
        topGenre: topGenre ? `${topGenre} (${((maxGenreCount / totalItems) * 100).toFixed(1)}%)` : 'N/A',
        distinctDirectors: directorCounts.size,
        maxItemsPerDirector: maxDirectorCount,
        topDirector: topDirector ? `${topDirector} (${maxDirectorCount})` : 'N/A'
    };
}

/**
 * Costruisce in memoria un TasteProfile basato ESCLUSIVAMENTE sui semi passati (70% oldest),
 * escludendo completamente i titoli del futuro (oro) per la variante SENZA FUGA.
 */
async function buildPastOnlyTasteProfile(semiDocs, baseProfile) {
    if (!semiDocs || semiDocs.length === 0 || !baseProfile) return baseProfile;

    const semiMovieIds = semiDocs.filter(d => d.type === 'movie').map(d => Number(d.tmdbId)).filter(Boolean);
    const semiTvIds = semiDocs.filter(d => d.type !== 'movie').map(d => Number(d.tmdbId)).filter(Boolean);

    let rows = [];
    if (semiMovieIds.length > 0) {
        const mRows = await duckDbStore.query(`SELECT id, genres, keywords FROM movies WHERE id IN (${semiMovieIds.join(',')})`);
        rows.push(...(Array.isArray(mRows) ? mRows : []));
    }
    if (semiTvIds.length > 0) {
        const tRows = await duckDbStore.query(`SELECT id, genres, keywords FROM tv WHERE id IN (${semiTvIds.join(',')})`);
        rows.push(...(Array.isArray(tRows) ? tRows : []));
    }

    const vPast = {};
    for (const row of rows) {
        const gList = parseJsonSafe(row.genres);
        for (const g of gList) {
            const gid = typeof g === 'object' && g !== null ? (g.id || g.name) : g;
            if (gid) vPast[`g:${gid}`] = (vPast[`g:${gid}`] || 0) + 1.0;
        }
        const kList = parseJsonSafe(row.keywords);
        for (const k of kList) {
            const kid = typeof k === 'object' && k !== null ? (k.id || k.name) : k;
            if (kid) vPast[`k:${kid}`] = (vPast[`k:${kid}`] || 0) + 1.0;
        }
    }

    // Normalizzazione vettoriale [0.0 - 1.0]
    const maxVal = Math.max(...Object.values(vPast), 1.0);
    for (const k of Object.keys(vPast)) {
        vPast[k] = Number((vPast[k] / maxVal).toFixed(3));
    }

    const vStatic = baseProfile.compiledVectors?.V_static || {};

    return {
        ...baseProfile,
        compiledVectors: {
            V_static: vStatic,
            V_active: vPast,
            V_final: Object.keys(vPast).length > 0 ? vPast : (baseProfile.compiledVectors?.V_final || {})
        }
    };
}

/**
 * Esegue il protocollo holdout per un utente specifico.
 */
async function probeUser(userId, profileContextArg) {
    console.log('\n' + '='.repeat(80));
    console.log(`  UTENTE: ${userId}`);
    console.log('='.repeat(80));

    const db = mongoose.connection.db;

    // 1. Risoluzione contesto e account
    const userAccount = await db.collection('useraccounts').findOne({ userId });
    const profileContext = profileContextArg || (userId === 'sim_user_yaca' ? 'sim_prof_ocean_global' : 'global');
    const addonUuid = userAccount?.addonUuid || null;

    console.log(`Contesto profilo: ${profileContext}`);
    console.log(`Addon UUID      : ${addonUuid || 'nessuno (account simulato/senza addon)'}`);

    // 2. Lettura Libreria Utente (UserLibraryItem) per calcolo novità
    const libraryTmdbIds = new Set();
    if (addonUuid) {
        const libDocs = await db.collection('userlibraryitems').find({
            addonUuid,
            removed: { $ne: true }
        }).toArray();
        for (const doc of libDocs) {
            if (doc.tmdbId) libraryTmdbIds.add(String(doc.tmdbId));
        }
    }
    console.log(`Titoli attivi in libreria: ${libraryTmdbIds.size}`);

    // 3. Lettura Profilo di Gusto Live (con fuga)
    const { profile: liveProfile } = await fetchProfileContext(userId, profileContext);
    const vFinalKeysCount = Object.keys(liveProfile?.compiledVectors?.V_final || {}).length;
    console.log(`Vettore live V_final     : ${vFinalKeysCount} chiavi`);

    // 4. Lettura cronologia e split cronologico holdout (70% semi, 30% oro)
    const rawHistory = await db.collection('watchhistories').find({
        owner: userId,
        context: profileContext
    }).toArray();

    console.log(`Cronologia totale profilo: ${rawHistory.length} voci\n`);

    const strat = HERO_STRATEGIES.find(s => s.slug === 'hidden_gems');
    if (!strat) {
        throw new Error('Strategia hidden_gems non trovata in HERO_STRATEGIES');
    }

    const resultsByMedia = {};

    for (const mediaType of ['movie', 'series']) {
        const isMovie = mediaType === 'movie';
        const historyType = isMovie ? 'movie' : 'tv';
        const mediaDocs = rawHistory.filter(d => d.type === historyType);

        // Ordinamento CRONOLOGICO deterministico: oldest first
        mediaDocs.sort((a, b) => {
            const timeA = new Date(a.signals?.[0]?.at || a.lastWatchedAt || a.createdAt).getTime();
            const timeB = new Date(b.signals?.[0]?.at || b.lastWatchedAt || b.createdAt).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return String(a._id).localeCompare(String(b._id));
        });

        const totalHist = mediaDocs.length;
        const cutIndex = Math.floor(totalHist * 0.70);
        const semiDocs = mediaDocs.slice(0, cutIndex);
        const oroDocs = mediaDocs.slice(cutIndex);

        const semiIds = new Set(semiDocs.map(d => String(d.tmdbId)));
        const oroIds = new Set(oroDocs.map(d => String(d.tmdbId)));

        console.log(`----------------------------------------------------------------------`);
        console.log(`MEDIA: ${mediaType.toUpperCase()} (totale cronologia: ${totalHist})`);
        console.log(`  Semi (passato 70%): ${semiDocs.length} titoli [${[...semiIds].join(', ')}]`);
        console.log(`  Oro  (futuro  30%): ${oroDocs.length} titoli [${[...oroIds].join(', ')}]`);
        console.log(`----------------------------------------------------------------------`);

        // Profilo solo semi (senza fuga)
        const pastOnlyProfile = await buildPastOnlyTasteProfile(semiDocs, liveProfile);

        const ctxCommon = {
            userId,
            context: profileContext,
            mediaType,
            heroCandidateLimit: 160,
            kidsMode: false,
            effectiveSelectors: { anime: 'neutral' },
            tmdbApiKey: null
        };

        // 1. Esecuzione OFF con Live Profile (Vecchio motore - Limite Superiore con Fuga)
        setFlagNewHiddenGems(false);
        const resOff = await strat.run({
            ...ctxCommon,
            tasteProfile: liveProfile,
            profile: liveProfile
        });
        const idsOff = extractIds(resOff);

        // 2. Esecuzione ON con Live Profile (Nuova catena - Limite Superiore con Fuga)
        setFlagNewHiddenGems(true);
        const resOnLive = await strat.run({
            ...ctxCommon,
            tasteProfile: liveProfile,
            profile: liveProfile
        });
        const idsOnLive = extractIds(resOnLive);

        // 3. Esecuzione ON senza Fuga (Nuova catena - Profilo solo semi passati)
        const resOnPast = await strat.run({
            ...ctxCommon,
            tasteProfile: pastOnlyProfile,
            profile: pastOnlyProfile
        });
        const idsOnPast = extractIds(resOnPast);

        // Metadati DuckDB per calcolo diversità
        const allUniqueIds = [...new Set([...idsOff, ...idsOnLive, ...idsOnPast, ...oroIds])];
        const metaMap = await fetchMetadataForIds(allUniqueIds, mediaType);

        // Helper calcolo metriche
        const evaluateRow = (ids, label) => {
            const riempimento = ids.length;
            const oroPresoIds = ids.filter(id => oroIds.has(id));
            const oroPresoCount = oroPresoIds.length;
            const oroPresoPct = oroIds.size > 0 ? (oroPresoCount / oroIds.size) * 100 : 0;
            const oroPresoTitles = oroPresoIds.map(id => metaMap.get(id)?.title || id);

            const novelIds = ids.filter(id => !libraryTmdbIds.has(id));
            const novitaCount = novelIds.length;
            const novitaPct = riempimento > 0 ? (novitaCount / riempimento) * 100 : 100;

            const div = computeDiversity(ids, metaMap);

            return {
                label,
                riempimento,
                oroPresoCount,
                oroPresoPct: Number(oroPresoPct.toFixed(1)),
                oroPresoTitles,
                novitaCount,
                novitaPct: Number(novitaPct.toFixed(1)),
                distinctGenres: div.distinctGenres,
                topGenre: div.topGenre,
                distinctDirectors: div.distinctDirectors,
                maxItemsPerDirector: div.maxItemsPerDirector,
                topDirector: div.topDirector
            };
        };

        const metricsOff = evaluateRow(idsOff, 'OFF (Live / Limite Superiore)');
        const metricsOnLive = evaluateRow(idsOnLive, 'ON (Live / Limite Superiore)');
        const metricsOnPast = evaluateRow(idsOnPast, 'ON (Senza Fuga / Solo Passato)');

        const jaccardLive = computeJaccard(idsOff, idsOnLive);
        const jaccardPast = computeJaccard(idsOff, idsOnPast);

        resultsByMedia[mediaType] = {
            totalHist,
            semiCount: semiDocs.length,
            oroCount: oroDocs.length,
            oroIds: [...oroIds],
            jaccardLive,
            jaccardPast,
            metrics: {
                off: metricsOff,
                onLive: metricsOnLive,
                onPast: metricsOnPast
            }
        };

        console.log(`  OFF Count    : ${metricsOff.riempimento} | Oro Preso: ${metricsOff.oroPresoCount}/${oroDocs.length} (${metricsOff.oroPresoPct}%) | Novità: ${metricsOff.novitaPct}% | Generi: ${metricsOff.distinctGenres} | Registi: ${metricsOff.distinctDirectors}`);
        console.log(`  ON Live Count: ${metricsOnLive.riempimento} | Oro Preso: ${metricsOnLive.oroPresoCount}/${oroDocs.length} (${metricsOnLive.oroPresoPct}%) | Novità: ${metricsOnLive.novitaPct}% | Generi: ${metricsOnLive.distinctGenres} | Registi: ${metricsOnLive.distinctDirectors}`);
        console.log(`  ON Past Count: ${metricsOnPast.riempimento} | Oro Preso: ${metricsOnPast.oroPresoCount}/${oroDocs.length} (${metricsOnPast.oroPresoPct}%) | Novità: ${metricsOnPast.novitaPct}% | Generi: ${metricsOnPast.distinctGenres} | Registi: ${metricsOnPast.distinctDirectors}`);
        console.log(`  Jaccard OFF vs ON (Live): ${jaccardLive.jaccard} (int: ${jaccardLive.intersection}, uni: ${jaccardLive.union})`);
        console.log(`  Jaccard OFF vs ON (Past): ${jaccardPast.jaccard} (int: ${jaccardPast.intersection}, uni: ${jaccardPast.union})\n`);
    }

    return { userId, profileContext, addonUuid, librarySize: libraryTmdbIds.size, resultsByMedia };
}

function printSummaryMarkdownTable(userReports) {
    console.log('='.repeat(100));
    console.log('  TABELLA GENERALE MARKDOWN PER ## Esito (Ticket 43)');
    console.log('='.repeat(100) + '\n');

    for (const report of userReports) {
        console.log(`### Utente: \`${report.userId}\` (contesto: \`${report.profileContext}\`, libreria: ${report.librarySize} titoli)\n`);

        console.log('| Media | Variante / Fuga | Riempimento | Oro Preso (su Oro) | Novità vs Lib | Generi Distinti (Top Genre) | Registi Distinti (Max/Reg) |');
        console.log('|---|---|---|---|---|---|---|');

        for (const [media, r] of Object.entries(report.resultsByMedia)) {
            const mediaLabel = media === 'movie' ? 'Film (`movie`)' : 'Serie (`series`)';
            const m = r.metrics;

            console.log(`| **${mediaLabel}** | OFF (Live Profile - Vecchio) | **${m.off.riempimento}** | ${m.off.oroPresoCount}/${r.oroCount} (${m.off.oroPresoPct}%) | ${m.off.novitaCount}/${m.off.riempimento} (${m.off.novitaPct}%) | ${m.off.distinctGenres} (${m.off.topGenre}) | ${m.off.distinctDirectors} (max ${m.off.maxItemsPerDirector}) |`);
            console.log(`| | ON (Live Profile - Fuga Sup.) | **${m.onLive.riempimento}** | ${m.onLive.oroPresoCount}/${r.oroCount} (${m.onLive.oroPresoPct}%) | ${m.onLive.novitaCount}/${m.onLive.riempimento} (${m.onLive.novitaPct}%) | ${m.onLive.distinctGenres} (${m.onLive.topGenre}) | ${m.onLive.distinctDirectors} (max ${m.onLive.maxItemsPerDirector}) |`);
            console.log(`| | ON (Senza Fuga - Solo Passato) | **${m.onPast.riempimento}** | ${m.onPast.oroPresoCount}/${r.oroCount} (${m.onPast.oroPresoPct}%) | ${m.onPast.novitaCount}/${m.onPast.riempimento} (${m.onPast.novitaPct}%) | ${m.onPast.distinctGenres} (${m.onPast.topGenre}) | ${m.onPast.distinctDirectors} (max ${m.onPast.maxItemsPerDirector}) |`);
        }
        console.log('\n');
    }
}

async function main() {
    console.log('================================================================================');
    console.log('  YACA QA PROBE — Misura Qualitativa Holdout di Gusto (Ticket 43)');
    console.log('  Metrica: Oro Preso (70% semi / 30% oro) · Riempimento · Novità · Diversità');
    console.log('================================================================================\n');

    await duckDbStore.init();

    if (process.env.MONGODB_URI) {
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
        }
    } else {
        console.error('ERRORE: MONGODB_URI non configurato in .env');
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const userIdArg = args.find(a => a.startsWith('--userId='))?.split('=')[1];
    const contextArg = args.find(a => a.startsWith('--context=') || a.startsWith('--profileId='))?.split('=')[1];
    const allUsers = args.includes('--allUsers');

    const usersToProbe = [];
    if (allUsers) {
        usersToProbe.push({ userId: 'REOZrGNRr3', context: contextArg || 'global' });
        usersToProbe.push({ userId: 'sim_user_yaca', context: contextArg || 'sim_prof_ocean_global' });
    } else {
        const uid = userIdArg || 'REOZrGNRr3';
        const ctx = contextArg || (uid === 'sim_user_yaca' ? 'sim_prof_ocean_global' : 'global');
        usersToProbe.push({ userId: uid, context: ctx });
    }

    const reports = [];
    for (const u of usersToProbe) {
        const rep = await probeUser(u.userId, u.context);
        reports.push(rep);
    }

    printSummaryMarkdownTable(reports);

    // Pulizia e chiusura risorse
    setFlagNewHiddenGems(null);
    if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
    }
    await duckDbStore.close();

    console.log('Misurazione completata con successo.');
    process.exit(0);
}

main().catch(err => {
    console.error('Errore irreversibile durante l\'esecuzione della sonda holdout:', err);
    process.exit(1);
});
