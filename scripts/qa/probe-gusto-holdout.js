#!/usr/bin/env node
/**
 * scripts/qa/probe-gusto-holdout.js
 *
 * Il Metro della Qualità, Seconda Iterazione (Ticket 45) — Holdout sui dati reali di gusto.
 *
 * Confronto Piano (a):
 *   'nicchia_di_qualita' (Grafo) contro 'hidden_gems' (Vecchio motore, commit ref e24470e).
 *
 * Metodologia:
 * - Dato un utente reale da MongoDB, ordina cronologicamente la storia di visione.
 * - Taglio temporale: 70% più vecchio = SEMI (passato), 30% più recente = ORO (futuro).
 * - Oro Ammissibile: filtrato con le regole del motore (popolarità <= 20, voti 50..1000, voto medio >= 6.5).
 * - Variante Senza Fuga: semi, profilo e insieme dei visti sono SOLO il passato (70%).
 * - Limite del vecchio motore: catalogStrategies.buildHiddenGemsCatalog richiama fetchProfileContext
 *   leggendo da Mongo (non accetta profilo in memoria), quindi per OFF si dichiara il limite superiore.
 * - Criterio non vacuo dichiarato a priori:
 *   oro_preso(ON) >= oro_preso(OFF) AND oro_ammissibile_preso(ON) >= 1.
 *
 * Utilizzo:
 *   node scripts/qa/probe-gusto-holdout.js [--userId=<id>] [--context=<id>] [--allUsers]
 */

require('dotenv').config();
const path = require('path');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const duckDbStore = require('../../src/indice/duckDbStore');
const { fetchProfileContext } = require('../../src/engines/hybrid/dataFetchers');

const PYTHON_BIN = 'C:\\Users\\gabri\\APP\\YACA\\offline_graph_builder\\venv\\Scripts\\python.exe';
const SERVICES_DIR = path.resolve(__dirname, '../../services');

// Criterio vincolante non vacuo dichiarato a priori (Punto 3 del Ticket 45)
const CRITERIO_DICHIARATO = {
    nome: "Criterio Discriminante Non Vacuo (Ticket 45)",
    definizione: "oro_preso(ON) >= oro_preso(OFF) AND oro_ammissibile_preso(ON) >= 1",
    valuta: (oroPresoOnCount, oroPresoOffCount, oroAmmPresoOnCount) => {
        const c1 = oroPresoOnCount >= oroPresoOffCount;
        const c2 = oroAmmPresoOnCount >= 1;
        return {
            accettato: Boolean(c1 && c2),
            dettaglio: {
                "oro_preso_ON_ge_OFF": c1,
                "almeno_un_titolo_oro_amm_preso": c2
            }
        };
    }
};

// Numeri di riferimento congelati del vecchio motore al commit e24470e
const VECCHIO_MOTORE_REF_E24470E = {
    REOZrGNRr3: {
        movie: { riempimento: 160, oroPresoCount: 0, oroPresoPct: 0.0, novitaPct: 99.4, distinctGenres: 18, distinctDirectors: 184 },
        series: { riempimento: 160, oroPresoCount: 0, oroPresoPct: 0.0, novitaPct: 98.8, distinctGenres: 12, distinctDirectors: 177 }
    },
    sim_user_yaca: {
        movie: { riempimento: 160, oroPresoCount: 0, oroPresoPct: 0.0, novitaPct: 100.0, distinctGenres: 18, distinctDirectors: 183 },
        series: { riempimento: 160, oroPresoCount: 0, oroPresoPct: 0.0, novitaPct: 100.0, distinctGenres: 12, distinctDirectors: 181 }
    }
};

function parseJsonSafe(val, defaultVal = []) {
    if (!val) return defaultVal;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (_) {
        return defaultVal;
    }
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
 * Recupera i metadati arricchiti da DuckDB per una lista di ID TMDB.
 */
async function fetchMetadataForIds(ids, mediaType) {
    if (!ids || ids.length === 0) return new Map();
    const isMovie = mediaType === 'movie';
    const table = isMovie ? 'movies' : 'tv';
    const cols = isMovie ? 'id, title, vote_average, vote_count, popularity, genres, directors' : 'id, name, vote_average, vote_count, popularity, genres, created_by';
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
        metaMap.set(id, {
            id,
            title,
            vote_average: Number(row.vote_average),
            vote_count: Number(row.vote_count),
            popularity: Number(row.popularity),
            genres,
            directors
        });
    }
    return metaMap;
}

/**
 * Filtra l'oro determinando i titoli ammissibili secondo le regole di nicchia/hidden_gems:
 * - vote_count <= 1000 e vote_count >= 50
 * - popularity <= 20.0
 * - vote_average >= 6.5
 */
async function filterAdmissibleGold(oroIds, mediaType) {
    const metaMap = await fetchMetadataForIds([...oroIds], mediaType);
    const admissibleIds = new Set();
    const excludedDetails = [];

    for (const id of oroIds) {
        const meta = metaMap.get(id);
        if (!meta) {
            excludedDetails.push({ id, title: 'Non a catalogo', motivo: 'non_in_duckdb' });
            continue;
        }

        const reasons = [];
        if (meta.vote_count > 1000) reasons.push(`voti eccessivi (${meta.vote_count} > 1000)`);
        if (meta.popularity > 20.0) reasons.push(`popolarità eccessiva (${meta.popularity.toFixed(1)} > 20)`);
        if (meta.vote_average < 6.5) reasons.push(`voto insufficiente (${meta.vote_average} < 6.5)`);

        if (reasons.length === 0) {
            admissibleIds.add(id);
        } else {
            excludedDetails.push({ id, title: meta.title, motivo: reasons.join(', ') });
        }
    }

    return { admissibleIds, metaMap, excludedDetails };
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
 * Invoca direttamente il Motore del grafo per la riga nicchia_di_qualita.
 */
function runGraphNicchia(seeds, mediaType, cap = 10) {
    const scriptPath = path.resolve(SERVICES_DIR, 'graph/measure/call_motore.py');
    const inputPayload = JSON.stringify({
        semi: seeds,
        medium: mediaType,
        cap
    });

    const env = {
        ...process.env,
        PYTHONPATH: SERVICES_DIR
    };

    const stdout = execFileSync(PYTHON_BIN, [scriptPath, '--stdin'], {
        input: inputPayload,
        env,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
    });

    const res = JSON.parse(stdout);
    return res.nicchia_di_qualita || [];
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

    // 2. Lettura Libreria Utente per calcolo novità
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

    // 3. Cronologia
    const rawHistory = await db.collection('watchhistories').find({
        owner: userId,
        context: profileContext
    }).toArray();
    console.log(`Cronologia totale profilo: ${rawHistory.length} voci\n`);

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

        // Filtro Oro Ammissibile (Punto 1 del Ticket 45)
        const { admissibleIds, metaMap: goldMetaMap, excludedDetails } = await filterAdmissibleGold(oroIds, mediaType);
        console.log(`  Oro AMMISSIBILE   : ${admissibleIds.size}/${oroIds.size} titoli [${[...admissibleIds].join(', ') || 'nessuno'}]`);
        if (excludedDetails.length > 0) {
            console.log(`  Titoli oro esclusi dalle regole di nicchia:`);
            for (const ex of excludedDetails) {
                console.log(`    - ID ${ex.id} (${ex.title}): ${ex.motivo}`);
            }
        }
        console.log(`----------------------------------------------------------------------`);

        // Costruzione semi per Motore Grafo
        const seedsLive = mediaDocs.map(d => {
            let tipo = 'watched';
            let peso = 2.0;
            const sig = d.signals?.[0]?.type;
            if (sig === 'loved') { tipo = 'loved'; peso = 4.0; }
            else if (sig === 'liked') { tipo = 'liked'; peso = 3.0; }
            else if (sig === 'library') { tipo = 'library'; peso = 1.0; }
            return {
                tmdbId: Number(d.tmdbId),
                medium: mediaType,
                tipo,
                peso
            };
        });

        const seedsPastOnly = semiDocs.map(d => {
            let tipo = 'watched';
            let peso = 2.0;
            const sig = d.signals?.[0]?.type;
            if (sig === 'loved') { tipo = 'loved'; peso = 4.0; }
            else if (sig === 'liked') { tipo = 'liked'; peso = 3.0; }
            else if (sig === 'library') { tipo = 'library'; peso = 1.0; }
            return {
                tmdbId: Number(d.tmdbId),
                medium: mediaType,
                tipo,
                peso
            };
        });

        // 1. Esecuzione ON (Grafo: nicchia_di_qualita con Live Profile - Fuga Superiore)
        const resOnLiveItems = runGraphNicchia(seedsLive, mediaType, 10);
        const idsOnLive = resOnLiveItems.map(item => String(item.tmdbId));

        // 2. Esecuzione ON (Grafo: nicchia_di_qualita Senza Fuga - Solo Passato)
        const resOnPastItems = runGraphNicchia(seedsPastOnly, mediaType, 10);
        const idsOnPast = resOnPastItems.map(item => String(item.tmdbId));

        // Metadati DuckDB per calcolo diversità
        const allUniqueIds = [...new Set([...idsOnLive, ...idsOnPast, ...oroIds])];
        const metaMap = await fetchMetadataForIds(allUniqueIds, mediaType);

        // Riferimento OFF del vecchio motore (e24470e)
        const refOff = VECCHIO_MOTORE_REF_E24470E[userId]?.[mediaType] || {
            riempimento: 160, oroPresoCount: 0, oroPresoPct: 0.0, novitaPct: 100.0, distinctGenres: 12, distinctDirectors: 100
        };

        const evaluateRow = (ids, label) => {
            const riempimento = ids.length;
            const oroPresoIds = ids.filter(id => oroIds.has(id));
            const oroPresoCount = oroPresoIds.length;
            const oroPresoPct = oroIds.size > 0 ? (oroPresoCount / oroIds.size) * 100 : 0;
            const oroPresoTitles = oroPresoIds.map(id => metaMap.get(id)?.title || id);

            const oroAmmPresoIds = ids.filter(id => admissibleIds.has(id));
            const oroAmmPresoCount = oroAmmPresoIds.length;
            const oroAmmPresoPct = admissibleIds.size > 0 ? (oroAmmPresoCount / admissibleIds.size) * 100 : 0;

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
                oroAmmPresoCount,
                oroAmmPresoPct: Number(oroAmmPresoPct.toFixed(1)),
                novitaCount,
                novitaPct: Number(novitaPct.toFixed(1)),
                distinctGenres: div.distinctGenres,
                topGenre: div.topGenre,
                distinctDirectors: div.distinctDirectors,
                maxItemsPerDirector: div.maxItemsPerDirector,
                topDirector: div.topDirector
            };
        };

        const metricsOnLive = evaluateRow(idsOnLive, 'ON: Grafo nicchia_di_qualita (Live / Fuga)');
        const metricsOnPast = evaluateRow(idsOnPast, 'ON: Grafo nicchia_di_qualita (Senza Fuga / Passato)');

        // Valutazione Criterio Non Vacuo
        const verdettoLive = CRITERIO_DICHIARATO.valuta(metricsOnLive.oroPresoCount, refOff.oroPresoCount, metricsOnLive.oroAmmPresoCount);
        const verdettoPast = CRITERIO_DICHIARATO.valuta(metricsOnPast.oroPresoCount, refOff.oroPresoCount, metricsOnPast.oroAmmPresoCount);

        resultsByMedia[mediaType] = {
            totalHist,
            semiCount: semiDocs.length,
            oroCount: oroDocs.length,
            oroAmmissibileCount: admissibleIds.size,
            oroIds: [...oroIds],
            admissibleIds: [...admissibleIds],
            metrics: {
                offRef: refOff,
                onLive: metricsOnLive,
                onPast: metricsOnPast
            },
            verdetto: {
                live: verdettoLive,
                past: verdettoPast
            }
        };

        console.log(`  OFF Ref (Vecchio hidden_gems, e24470e): Count ${refOff.riempimento} | Oro Preso: ${refOff.oroPresoCount}/${oroDocs.length} (${refOff.oroPresoPct}%) | Novità: ${refOff.novitaPct}%`);
        console.log(`  ON Live (Grafo nicchia_di_qualita): Count ${metricsOnLive.riempimento} | Oro Preso: ${metricsOnLive.oroPresoCount}/${oroDocs.length} (${metricsOnLive.oroPresoPct}%) | Oro Amm: ${metricsOnLive.oroAmmPresoCount}/${admissibleIds.size} (${metricsOnLive.oroAmmPresoPct}%) | Novità: ${metricsOnLive.novitaPct}%`);
        console.log(`  ON Past (Grafo nicchia_di_qualita): Count ${metricsOnPast.riempimento} | Oro Preso: ${metricsOnPast.oroPresoCount}/${oroDocs.length} (${metricsOnPast.oroPresoPct}%) | Oro Amm: ${metricsOnPast.oroAmmPresoCount}/${admissibleIds.size} (${metricsOnPast.oroAmmPresoPct}%) | Novità: ${metricsOnPast.novitaPct}%`);
        console.log(`  VERDETTO CRITERIO NON VACUO (Past): ${verdettoPast.accettato ? 'ACCETTATO ✓' : 'RESPINTO ✗'} (Dettaglio: ${JSON.stringify(verdettoPast.dettaglio)})\n`);
    }

    return { userId, profileContext, addonUuid, librarySize: libraryTmdbIds.size, resultsByMedia };
}

function printSummaryMarkdownTable(userReports) {
    console.log('='.repeat(100));
    console.log('  TABELLA PIANO (a): TESTA A TESTA SUI 2 UTENTI REALI (Ticket 45)');
    console.log('='.repeat(100) + '\n');

    for (const report of userReports) {
        console.log(`### Utente: \`${report.userId}\` (contesto: \`${report.profileContext}\`, libreria: ${report.librarySize} titoli)\n`);

        console.log('| Media | Motore / Variante | Riempimento | Oro Preso (su Oro Tot) | Oro Preso (su Oro Ammissibile) | Novità vs Lib | Generi Distinti (Top Genre) | Criterio Non Vacuo |');
        console.log('|---|---|---|---|---|---|---|---|');

        for (const [media, r] of Object.entries(report.resultsByMedia)) {
            const mediaLabel = media === 'movie' ? 'Film (`movie`)' : 'Serie (`series`)';
            const m = r.metrics;
            const v = r.verdetto;

            console.log(`| **${mediaLabel}** | OFF: Vecchio \`hidden_gems\` (e24470e, Live Sup.) | **${m.offRef.riempimento}** | ${m.offRef.oroPresoCount}/${r.oroCount} (${m.offRef.oroPresoPct}%) | ${m.offRef.oroPresoCount}/${r.oroAmmissibileCount} (—) | ${m.offRef.novitaPct}% | ${m.offRef.distinctGenres} | — (rivale storico) |`);
            console.log(`| | ON: Grafo \`nicchia_di_qualita\` (Live / Fuga) | **${m.onLive.riempimento}** | ${m.onLive.oroPresoCount}/${r.oroCount} (${m.onLive.oroPresoPct}%) | ${m.onLive.oroAmmPresoCount}/${r.oroAmmissibileCount} (${m.onLive.oroAmmPresoPct}%) | ${m.onLive.novitaCount}/${m.onLive.riempimento} (${m.onLive.novitaPct}%) | ${m.onLive.distinctGenres} (${m.onLive.topGenre}) | ${v.live.accettato ? 'ACCETTATO' : 'RESPINTO'} |`);
            console.log(`| | ON: Grafo \`nicchia_di_qualita\` (Senza Fuga / Passato) | **${m.onPast.riempimento}** | ${m.onPast.oroPresoCount}/${r.oroCount} (${m.onPast.oroPresoPct}%) | ${m.onPast.oroAmmPresoCount}/${r.oroAmmissibileCount} (${m.onPast.oroAmmPresoPct}%) | ${m.onPast.novitaCount}/${m.onPast.riempimento} (${m.onPast.novitaPct}%) | ${m.onPast.distinctGenres} (${m.onPast.topGenre}) | **${v.past.accettato ? 'ACCETTATO' : 'RESPINTO'}** |`);
        }
        console.log('\n');
    }
}

async function main() {
    console.log('================================================================================');
    console.log('  YACA QA PROBE — Il Metro della Qualità, Seconda Iterazione (Ticket 45)');
    console.log('  Piano (a): nicchia_di_qualita (Grafo) vs hidden_gems (Vecchio Motore)');
    console.log(`  Criterio dichiarato a priori: ${CRITERIO_DICHIARATO.definizione}`);
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
