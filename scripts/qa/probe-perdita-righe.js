#!/usr/bin/env node
/**
 * scripts/qa/probe-perdita-righe.js
 *
 * Sonda per Ticket 01 — La sonda della perdita: dove si perde l'oro, stadio per stadio.
 * Misura a sei stadi nell'ordine reale (spec.md §0.1):
 * 1. semi (per tipo: loved / liked / watched / library)
 * 2. grezzo (/raccomanda per ruolo)
 * 3. sovrapposizione inter-riga (quanti titoli in più di una riga, e doppioni totali)
 * 4. idratazione (quanti si idratano, e quali no con motivo es. TMDB 404, medium sbagliato)
 * 5. filtri (cardSurvivesFilters: kidsMode, animePolicy, e quanto toglie ciascuno)
 * 6. pagine servite (impaginazione Stremio cap ITEMS_PER_PAGE=20)
 *
 * Vincoli tassativi:
 * 1. Mai chiamare catalogHandler né toccare DuckDB su disco o la rete.
 * 2. Strumentare (resolveCardDetails, cardSurvivesFilters), non duplicare.
 * 3. Il mock deve mordere: chiamata via oggetto library.semiDi.
 * 4. La tabella porta i dettagli richiesti (semi per tipo, titoli falliti con motivo).
 * 5. Dimensione contenuta a livello della sonda di riferimento.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const library = require('../../src/library');
const seedsModule = require('../../src/library/seeds');
const { graphClient } = require('../../src/clients');
const { resolveCardDetails, cardSurvivesFilters } = require('../../src/stremio/idratazione');
const { isAnimeContent } = require('../../src/anime');
const { ITEMS_PER_PAGE } = require('../../src/config');
const duckDbProvider = require('../../src/indice/duckDbProvider');
const tmdb = require('../../src/clients/tmdb');

const ROLES = ['il_tuo_mondo', 'un_passo_fuori', 'uscite_nuove', 'nicchia_di_qualita'];
const ROLE_COUNTS = { il_tuo_mondo: 51, un_passo_fuori: 40, uscite_nuove: 1, nicchia_di_qualita: 39 };

const FIXTURE_SEEDS = {
    series: {
        seeds: [
            [1396, 4], [1399, 4], [85937, 4], [1429, 4], [60059, 4],
            [119051, 3], [94605, 3], [31917, 3], [63333, 3], [60625, 3],
            [70523, 3], [76479, 3], [82856, 3], [85271, 3], [88396, 3],
            [84958, 3], [92783, 3], [99966, 3], [93405, 3], [114472, 3],
            [115036, 3], [100088, 3], [124364, 3],
            [125988, 2], [202250, 2], [205715, 2], [4614, 2], [48866, 2]
        ],
        counts: { loved: 5, liked: 18, watched: 5, library: 0 } // Totale: 28
    },
    movie: {
        seeds: [
            [27205, 4], [157336, 4], [155, 4], [550, 4],
            [680, 3], [13, 3], [122, 3], [120, 3], [121, 3], [603, 3],
            [597, 3], [769, 3], [1891, 3], [1892, 3], [24428, 3], [299536, 3],
            [299534, 3], [271110, 3], [1726, 3], [105, 3],
            [19995, 2], [244786, 2], [284054, 2], [324857, 2],
            [335984, 1]
        ],
        counts: { loved: 4, liked: 16, watched: 4, library: 1 } // Totale: 25
    }
};

const ID_FIXTURE = {
    nonTrovato: 991,      // TMDB 404 (non trovato nei metadati)
    mediumSbagliato: 992, // Medium discorde rispetto al catalogo servito
    adultoKids: 993,      // Contenuto per soli adulti bloccato da kidsMode
    animeExclude: 995     // Contenuto anime bloccato da animePolicy: exclude
};

function generateFixtureGraph(medium) {
    const base = medium === 'series' ? 80000 : 50000;
    const shared1 = base + 900, shared2 = base + 901;
    return {
        contratto: 1,
        versioni: { artefatto: 'cf1d80dcba3eddce', ricetta: '2330b143bc8845a7' },
        liste: ROLES.map(ruolo => ({
            ruolo,
            titoli: Array.from({ length: ROLE_COUNTS[ruolo] }, (_, i) => {
                let tmdbId = base + (ROLES.indexOf(ruolo) * 100) + i;
                let medItem = medium;
                if ((ruolo === 'il_tuo_mondo' || ruolo === 'un_passo_fuori') && i === 0) tmdbId = shared1;
                if ((ruolo === 'il_tuo_mondo' || ruolo === 'un_passo_fuori') && i === 1) tmdbId = shared2;
                if (ruolo === 'il_tuo_mondo') {
                    if (i === 2) tmdbId = base + ID_FIXTURE.nonTrovato;
                    if (i === 3) { tmdbId = base + ID_FIXTURE.mediumSbagliato; medItem = medium === 'series' ? 'movie' : 'series'; }
                    if (i === 4 || i === 5) tmdbId = base + ID_FIXTURE.adultoKids;
                    if (i === 6 || i === 7) tmdbId = base + ID_FIXTURE.animeExclude;
                }
                if (ruolo === 'nicchia_di_qualita' && i === 2) tmdbId = base + ID_FIXTURE.nonTrovato;
                return { tmdbId, medium: medItem, punteggio: Number((0.95 - i * 0.01).toFixed(3)) };
            })
        }))
    };
}

function setupFixtureMocks() {
    duckDbProvider.getDuckDbMetaDetails = async () => null;
    const mockSemiDi = async ({ mediaType }) => {
        const d = FIXTURE_SEEDS[mediaType === 'movie' ? 'movie' : 'series'];
        return { seeds: new Map(d.seeds), counts: { ...d.counts } };
    };
    library.semiDi = mockSemiDi;
    seedsModule.semiDi = mockSemiDi;
    graphClient.raccomanda = async ({ medium }) => generateFixtureGraph(medium === 'movie' ? 'movie' : 'series');
    tmdb.getTmdbMovieDetails = async (k, id, type) => {
        const s = String(id), num = Number(id);
        if (s.endsWith(String(ID_FIXTURE.nonTrovato))) return null;
        if (s.endsWith(String(ID_FIXTURE.mediumSbagliato))) {
            const opp = s.startsWith('8') ? 'movie' : 'tv';
            return { id: num, name: `Mismatch ${num}`, media_type: opp, type: opp === 'tv' ? 'series' : 'movie', genre_ids: [18] };
        }
        if (s.endsWith(String(ID_FIXTURE.adultoKids))) return { id: num, name: `Adult ${num}`, media_type: type, genre_ids: [27, 53], keywords: [{ id: 10292, name: 'gore' }] };
        if (s.endsWith(String(ID_FIXTURE.animeExclude)) || num === 85937) return { id: num, name: `Anime ${num}`, media_type: type, genre_ids: [16, 28], original_language: 'ja', keywords: [{ id: 210024, name: 'anime' }] };
        return { id: num, name: `Title ${num}`, media_type: type, genre_ids: [18, 35], keywords: [] };
    };
}

async function measureMediumPipeline(medium, userConfig) {
    const med = medium === 'movie' ? 'movie' : 'series';
    const tipoSeed = med === 'movie' ? 'movie' : 'tv';
    const activeSettings = userConfig.profiles?.find(p => p.id === userConfig.activeProfileId)?.settings || {};
    const animePolicy = userConfig.context?.selettoriEffettivi?.anime || activeSettings.typeSelectors?.anime || 'neutral';
    const isKidsMode = Boolean(userConfig.context?.kidsMode ?? activeSettings.kidsMode);
    const sliders = userConfig.context?.sliders || activeSettings.sliders || {};
    const tmdbApiKey = userConfig.apiKeys?.tmdb || 'mock_key';

    // === 1. SEMI (per tipo) ===
    const { seeds, counts } = await library.semiDi({
        userId: userConfig.userId,
        context: userConfig.activeProfileId,
        mediaType: med,
        user: userConfig
    });

    if (!seeds || seeds.size === 0) {
        throw new Error(`[ERRORE FATALE] Stadio 1: Semi per medium ${med} sono 0. Il fixture non è entrato.`);
    }

    // -------------------------------------------------------------------------
    // DEBITO TECNICO DICHIARATO (Vincolo 2 vs Divieto di toccare il prodotto):
    // La conversione Map seeds -> semiPerGrafo qui sotto duplica la logica inline
    // di `src/pool/index.js` (righe 188–207).
    // Oggi non può essere importata perché vive inline dentro `HERO_STRATEGIES[0].run`
    // e questo ticket (01) ha divieto esplicito di modificare src/pool/ o il prodotto.
    // DA ELIMINARE e sostituire con la funzione condivisa appena il Ticket 02 toccherà il pool.
    // -------------------------------------------------------------------------
    const filteredSeeds = [...seeds.entries()].filter(([id]) => {
        if (animePolicy === 'exclude') return !isAnimeContent({ tmdbId: Number(id), tipo: tipoSeed });
        if (animePolicy === 'only') return isAnimeContent({ tmdbId: Number(id), tipo: tipoSeed });
        return true;
    });

    const semiPerGrafo = filteredSeeds.map(([id, w]) => ({
        tmdbId: Number(id),
        medium: med,
        tipo: w >= 4 ? 'loved' : (w >= 3 ? 'liked' : (w === 1 ? 'library' : 'watched')),
        peso: w
    }));

    // === 2. GREZZO (/raccomanda per ruolo) ===
    const resGraph = await graphClient.raccomanda({ semi: semiPerGrafo, medium: med, opzioni: sliders, cap: 60 });
    const liste = resGraph?.liste || [];

    // === 3. SOVRAPPOSIZIONE INTER-RIGA ===
    const titleFrequencies = new Map();
    for (const l of liste) {
        for (const t of (l.titoli || [])) {
            titleFrequencies.set(t.tmdbId, (titleFrequencies.get(t.tmdbId) || 0) + 1);
        }
    }
    const allTitlesCount = liste.reduce((acc, l) => acc + (l.titoli?.length || 0), 0);
    const totalDuplicates = allTitlesCount - titleFrequencies.size;
    const overlappingDistinctCount = [...titleFrequencies.values()].filter(c => c > 1).length;

    // === 4. IDRATAZIONE, 5. FILTRI, 6. PAGINE PER OGNI RIGA ===
    const rowsMetrics = [];
    for (const role of ROLES) {
        const rawItems = liste.find(l => l.ruolo === role)?.titoli || [];
        const rowOverlapCount = rawItems.filter(t => (titleFrequencies.get(t.tmdbId) || 0) > 1).length;

        // Stadio 4: Idratazione strumentata
        const hydratedCards = [];
        const failedTitles = [];
        for (const item of rawItems) {
            const itemDeclaredMed = item.medium || item.media_type;
            const resolvedMediaType = itemDeclaredMed === 'movie' ? 'movie' : (itemDeclaredMed === 'series' || itemDeclaredMed === 'tv' ? 'tv' : (med === 'movie' ? 'movie' : 'tv'));
            const card = await resolveCardDetails({ tmdbId: item.tmdbId, media_type: resolvedMediaType, medium: itemDeclaredMed }, tmdbApiKey, med);

            if (!card) {
                failedTitles.push({ tmdbId: item.tmdbId, motivo: 'TMDB 404 (non trovato nei metadati)' });
            } else if ((med === 'series' && card.type !== 'series') || (med === 'movie' && card.type !== 'movie')) {
                failedTitles.push({ tmdbId: item.tmdbId, motivo: `medium errato (card risolta come '${card.type}' in catalogo '${med}')` });
            } else {
                hydratedCards.push(card);
            }
        }

        // Stadio 5: Filtri strumentati (cardSurvivesFilters)
        let removedByKids = 0, removedByAnime = 0;
        const filterSurvivors = [];
        for (const card of hydratedCards) {
            const kSafe = cardSurvivesFilters(card, { isKidsMode, effectiveTypeSelectors: { anime: 'neutral' } });
            const aSafe = cardSurvivesFilters(card, { isKidsMode: false, effectiveTypeSelectors: { anime: animePolicy } });
            const bothSafe = cardSurvivesFilters(card, { isKidsMode, effectiveTypeSelectors: { anime: animePolicy } });
            if (!kSafe) removedByKids++;
            if (!aSafe) removedByAnime++;
            if (bothSafe) filterSurvivors.push(card);
        }

        // Stadio 6: Pagine servite (ITEMS_PER_PAGE=20)
        const totalSurvivors = filterSurvivors.length;
        const pages = [];
        let remaining = totalSurvivors;
        while (remaining > 0) {
            const pageTake = Math.min(remaining, ITEMS_PER_PAGE);
            pages.push(pageTake);
            remaining -= pageTake;
        }
        const pagesString = pages.length > 0 ? `${pages.join(' + ')} = ${totalSurvivors} (${pages.length} pag.)` : '0 (0 pag.)';

        rowsMetrics.push({
            role,
            stage1SeedsCount: seeds.size,
            stage1Counts: counts,
            stage2RawCount: rawItems.length,
            stage3OverlapCount: rowOverlapCount,
            stage4HydratedCount: hydratedCards.length,
            stage4Failed: failedTitles,
            stage5SurvivorsCount: totalSurvivors,
            stage5RemovedKids: removedByKids,
            stage5RemovedAnime: removedByAnime,
            stage6PagesString: pagesString,
            stage6TotalServed: totalSurvivors
        });
    }

    return { medium, seeds, counts, totalDuplicates, overlappingDistinctCount, rowsMetrics, isKidsMode, animePolicy };
}

function printSixStageTable(result) {
    const med = result.medium.toUpperCase();
    console.log(`\n========================================================================================================================`);
    console.log(`  TABELLA A SEI STADI — MISURA PERDITA RIGHE [${med}] (kidsMode: ${result.isKidsMode}, animePolicy: ${result.animePolicy})`);
    console.log(`========================================================================================================================`);
    console.log(`| Riga (Ruolo)         | 1. Semi         | 2. Grezzo | 3. Sovrapp. | 4. Idratazione | 5. Filtri (kids/anime)  | 6. Pagine (cap 20)      |`);
    console.log(`|----------------------|-----------------|-----------|-------------|----------------|-------------------------|-------------------------|`);
    for (const r of result.rowsMetrics) {
        const role = r.role.padEnd(20);
        const s1 = `${r.stage1SeedsCount} (${r.stage1Counts.loved}L/${r.stage1Counts.liked}l/${r.stage1Counts.watched}w)`.padEnd(15);
        const s2 = String(r.stage2RawCount).padEnd(9);
        const s3 = `${r.stage3OverlapCount} sovrapp.`.padEnd(11);
        const s4 = `${r.stage4HydratedCount} (err: ${r.stage4Failed.length})`.padEnd(14);
        const s5 = `${r.stage5SurvivorsCount} (-${r.stage5RemovedKids}k/-${r.stage5RemovedAnime}a)`.padEnd(23);
        const s6 = r.stage6PagesString.padEnd(23);
        console.log(`| ${role} | ${s1} | ${s2} | ${s3} | ${s4} | ${s5} | ${s6} |`);
    }
    console.log(`========================================================================================================================`);

    // Dettagli richiesti da Vincolo 4
    console.log(`\n--- Dettagli diagnostici [${med}] ---`);
    console.log(`[Stadio 1: Semi per tipo] Totale: ${result.seeds.size} -> loved: ${result.counts.loved}, liked: ${result.counts.liked}, watched: ${result.counts.watched}, library: ${result.counts.library}`);
    console.log(`[Stadio 3: Sovrapposizioni inter-riga] Titoli duplicati complessivi: ${result.totalDuplicates} (su ${result.overlappingDistinctCount} titoli distinti condivisi da più righe).`);
    for (const r of result.rowsMetrics) {
        if (r.stage4Failed.length > 0) {
            console.log(`[Stadio 4: Fallimenti idratazione su '${r.role}']`);
            for (const f of r.stage4Failed) console.log(`   - ID tmdb:${f.tmdbId} -> Motivo: ${f.motivo}`);
        }
    }
    console.log(`[Stadio 5: Dettaglio filtri per riga]`);
    for (const r of result.rowsMetrics) {
        console.log(`   - ${r.role.padEnd(20)}: ${r.stage4HydratedCount} idratati -> ${r.stage5SurvivorsCount} sopravvissuti (-${r.stage5RemovedKids} kidsMode, -${r.stage5RemovedAnime} animePolicy)`);
    }
}

async function runProbe(options = {}) {
    const isLive = Boolean(options.live || process.argv.includes('--live'));
    const isFixture = !isLive;
    const isDemo = Boolean(options.demo || process.argv.includes('--demo'));
    const disableFilter = options.disableFilter || (process.argv.find(a => a.startsWith('--disable-filter='))?.split('=')[1]);
    const targetMedia = options.media ? [options.media] : ['series', 'movie'];

    console.log('========================================================================================================');
    console.log('  SONDA QA TICKET 01 — LA SONDA DELLA PERDITA RIGHE (MISURA A SEI STADI)');
    console.log('========================================================================================================');
    console.log(`Modalità: ${isFixture ? 'FIXTURE (isolata su memoria, zero DB/rete)' : 'LIVE (profilo reale)'}`);
    if (disableFilter) console.log(`Override filtro attivo: disattivazione ${disableFilter}`);
    console.log('========================================================================================================\n');

    let userConfig = null;
    if (isLive) {
        const userId = options.userId || (process.argv.find(a => a.startsWith('--userId='))?.split('=')[1]) || process.env.YACA_USER_ID;
        const userHandle = options.userHandle || (process.argv.find(a => a.startsWith('--userHandle='))?.split('=')[1]) || process.env.YACA_USER_HANDLE;
        if (!userId && !userHandle) {
            console.error('[BLOCCO LIVE] Identificativi utente assenti (richiesti YACA_USER_ID o YACA_USER_HANDLE).');
            process.exit(1);
        }
        if (process.env.MONGODB_URI && mongoose.connection.readyState !== 1) {
            const { connectMongo } = require('../../src/infra/mongoConnect');
            await connectMongo(process.env.MONGODB_URI, { mongoose });
        }
        if (mongoose.connection.readyState !== 1) {
            console.error('[BLOCCO PREMESSA 1] MongoDB non è connesso (readyState !== 1).');
            process.exit(1);
        }
        const UserConfig = require('../../src/models/UserConfig');
        const { contestoDi } = require('../../src/profile');
        userConfig = userHandle ? await UserConfig.resolveUserConfig(userHandle) : await UserConfig.findOne({ userId });
        if (!userConfig) {
            console.error(`[ERRORE] Profilo non trovato per handle=${userHandle} / userId=${userId}`);
            process.exit(1);
        }
        userConfig.context = await contestoDi({ userId: userConfig.userId, profileId: options.context || userConfig.activeProfileId, addonUuid: userConfig.addonUuid, user: userConfig });
        userConfig.activeProfileId = userConfig.context.profileId;
    } else {
        setupFixtureMocks();
        const animePolicy = disableFilter === 'anime' ? 'neutral' : 'exclude';
        const isKidsMode = disableFilter !== 'kids';
        userConfig = {
            userId: 'fixture_user_01',
            addonUuid: 'fixture-handle-01',
            activeProfileId: 'fixture_profile_01',
            apiKeys: { tmdb: 'mock_key' },
            profiles: [{ id: 'fixture_profile_01', settings: { kidsMode: isKidsMode, typeSelectors: { film: true, serie: true, anime: animePolicy } } }],
            context: { profileId: 'fixture_profile_01', kidsMode: isKidsMode, selettoriEffettivi: { film: true, serie: true, anime: animePolicy } }
        };
    }

    const results = {};
    for (const med of targetMedia) {
        const metrics = await measureMediumPipeline(med, userConfig);
        results[med] = metrics;
        printSixStageTable(metrics);
    }

    // Prova di sensibilità obbligatoria in fixture
    if (isFixture && (isDemo || !disableFilter)) {
        console.log('\n========================================================================================================');
        console.log('  PROVA DIMOSTRATIVA DI SENSIBILITÀ: DISATTIVAZIONE FILTRO ANIME (exclude -> neutral)');
        console.log('========================================================================================================');
        const userConfigPatched = {
            ...userConfig,
            context: { ...userConfig.context, selettoriEffettivi: { film: true, serie: true, anime: 'neutral' } }
        };
        for (const med of targetMedia) {
            const patchedMetrics = await measureMediumPipeline(med, userConfigPatched);
            const baseRow = results[med].rowsMetrics.find(r => r.role === 'il_tuo_mondo');
            const patchedRow = patchedMetrics.rowsMetrics.find(r => r.role === 'il_tuo_mondo');
            const delta5 = patchedRow.stage5SurvivorsCount - baseRow.stage5SurvivorsCount;
            const delta6 = patchedRow.stage6TotalServed - baseRow.stage6TotalServed;
            console.log(`Medium ${med.toUpperCase()} [il_tuo_mondo]:`);
            console.log(`  - Stadio 5 (Sopravvissuti filtri): ${baseRow.stage5SurvivorsCount} -> ${patchedRow.stage5SurvivorsCount} (Delta: +${delta5})`);
            console.log(`  - Stadio 6 (Titoli serviti Stremio): ${baseRow.stage6TotalServed} -> ${patchedRow.stage6TotalServed} (Delta: +${delta6})`);
            if (delta5 > 0 && delta5 === delta6) {
                console.log(`  => DIMOSTRAZIONE RIUSCITA: Lo stadio 5 e lo stadio 6 variano coerentemente (+${delta5} anime ammessi).`);
            } else {
                console.warn(`  => ANOMALIA: I delta non variano coerentemente.`);
            }
        }
        console.log('========================================================================================================\n');
    }

    return results;
}

if (require.main === module) {
    runProbe()
        .then(async () => {
            if (mongoose.connection.readyState === 1) await mongoose.disconnect();
            process.exit(0);
        })
        .catch(err => {
            console.error('[probe-perdita-righe] Errore:', err.message || err);
            process.exit(1);
        });
}

module.exports = { runProbe, measureMediumPipeline, setupFixtureMocks };
