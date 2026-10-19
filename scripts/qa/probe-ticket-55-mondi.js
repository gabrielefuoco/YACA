#!/usr/bin/env node
/**
 * scripts/qa/probe-ticket-55-mondi.js
 *
 * Sonda per Ticket 55:
 * Confronta i conteggi di "il_tuo_mondo" tra la chiamata diretta al grafo e
 * il percorso completo dell'app (pool -> idratazione -> catalogHandler).
 * Misura a ogni passaggio:
 * 1. Semi estratti e filtrati (semiDi)
 * 2. Risposta grezza del grafo (raccomanda: il_tuo_mondo, mondi singoli)
 * 3. Assegnazione nel pool Hero
 * 4. Idratazione e filtro candidati (DuckDB / TMDB, cardSurvivesFilters, paginazione limit=20)
 * 5. Filtri post-fetch in catalogHandler e paginazione Stremio
 *
 * Utilizzo:
 *   node scripts/qa/probe-ticket-55-mondi.js [--fixture] [--userId=REOZrGNRr3] [--context=4159713d]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connectMongo } = require('../../src/infra/mongoConnect');
const UserConfig = require('../../src/models/UserConfig');
const { contestoDi } = require('../../src/profile');
const { semiDi } = require('../../src/library');
const { graphClient } = require('../../src/clients');
const { isHeroCatalogId } = require('../../src/catalog/registry');
const { getHeroPool } = require('../../src/pool');
const { idrataEImpaginaCandidati } = require('../../src/stremio/idratazione');
const { catalogHandler } = require('../../src/stremio/catalogHandler');
const { isItemAnime } = require('../../src/anime');
const { ITEMS_PER_PAGE } = require('../../src/config');
const cache = require('../../src/cache');
const { buildCatalogDesc } = require('../../src/catalog/catalogDefinition');

const FIXTURE_SEEDS_28 = [
    [1396, 4],  // Breaking Bad
    [1399, 4],  // Game of Thrones
    [60059, 3], // Better Call Saul
    [119051, 3], // Wednesday
    [94605, 3], // Arcane
    [85937, 4], // Demon Slayer
    [1429, 3],  // Attack on Titan
    [31917, 3], // Pretty Little Liars
    [63333, 3], // The Last Kingdom
    [4614, 1],
    [48866, 1],
    [60625, 3], // Rick and Morty
    [70523, 3], // Dark
    [76479, 3], // The Boys
    [82856, 3], // The Mandalorian
    [85271, 3], // WandaVision
    [88396, 3], // The Falcon and the Winter Soldier
    [84958, 3], // Loki
    [92783, 3], // She-Hulk
    [99966, 3], // All of Us Are Dead
    [93405, 3], // Squid Game
    [114472, 3], // Peacemaker
    [115036, 3], // The Book of Boba Fett
    [100088, 3], // The Last of Us
    [124364, 3], // From
    [125988, 3], // Silo
    [202250, 3], // Dirty Linen
    [205715, 3]  // Gen V
];

const FIXTURE_GRAPH_RESPONSE_51 = {
    contratto: 1,
    versioni: { artefatto: 'cf1d80dcba3eddce', ricetta: '2330b143bc8845a7' },
    semi: { n: 28, da_catalogo: false },
    liste: [
        {
            ruolo: 'il_tuo_mondo',
            mondo: 1739,
            descrizione: 'Mondi accumulati (>= 50)',
            titoli: Array.from({ length: 51 }, (_, i) => ({
                tmdbId: 85937 + i,
                medium: 'series',
                punteggio: Number((0.95 - i * 0.01).toFixed(3))
            }))
        },
        {
            ruolo: 'un_passo_fuori',
            mondo: null,
            descrizione: 'Un passo fuori',
            titoli: Array.from({ length: 40 }, (_, i) => ({
                tmdbId: 90000 + i,
                medium: 'series',
                punteggio: 0.80
            }))
        },
        {
            ruolo: 'uscite_nuove',
            mondo: 1739,
            descrizione: 'Nuove uscite nel tuo mondo',
            titoli: [{ tmdbId: 95000, medium: 'series', punteggio: 0.90 }]
        },
        {
            ruolo: 'nicchia_di_qualita',
            mondo: null,
            descrizione: 'Nicchia di alta qualita',
            titoli: Array.from({ length: 39 }, (_, i) => ({
                tmdbId: 96000 + i,
                medium: 'series',
                punteggio: 0.75
            }))
        }
    ],
    motivi: []
};

async function runProbe(options = {}) {
    const isFixture = Boolean(options.isFixture || process.argv.includes('--fixture'));
    const userId = options.userId || 'REOZrGNRr3';
    const userHandle = options.userHandle || 'ff7084d8-904b-42d9-91f5-ea2b4ae37590';
    const catalogId = 'yaca_mondi_series';
    const mediaType = 'series';

    console.log('=======================================================');
    console.log('[SONDA QA TICKET 55] Diagnosi «Il tuo mondo» 51 vs 11');
    console.log(`Target: userId=${userId}, handle=${userHandle} (Fixture: ${isFixture})`);
    console.log('=======================================================\n');

    // 0. Connessione MongoDB se URI presente e non siamo in modalità fixture pura
    let mongoConnected = false;
    if (!isFixture && process.env.MONGODB_URI && mongoose.connection.readyState !== 1) {
        try {
            await connectMongo(process.env.MONGODB_URI, { mongoose });
            mongoConnected = true;
            console.log('[Step 0] MongoDB connesso.');
        } catch (e) {
            console.warn(`[Step 0] MongoDB non raggiungibile (${e.message}), passaggio a dati fixture.`);
        }
    } else if (mongoose.connection.readyState === 1) {
        mongoConnected = true;
        console.log('[Step 0] MongoDB già connesso.');
    }

    // 1. Risoluzione configurazione utente e profilo attivo
    let userConfig;
    if (mongoConnected) {
        userConfig = await UserConfig.resolveUserConfig(userHandle);
        if (userConfig) {
            userConfig.context = await contestoDi({
                userId: userConfig.userId,
                profileId: options.context || userConfig.activeProfileId,
                addonUuid: userConfig.addonUuid,
                user: userConfig
            });
            userConfig.activeProfileId = userConfig.context.profileId;
        }
    }

    if (!userConfig) {
        console.log('[Step 1] Uso profilo fixture per REOZrGNRr3.');
        userConfig = {
            userId,
            addonUuid: userHandle,
            activeProfileId: '4159713d',
            apiKeys: { tmdb: 'mock_key' },
            profiles: [
                {
                    id: '4159713d',
                    name: 'Global',
                    settings: {
                        kidsMode: false,
                        typeSelectors: { film: true, serie: true, anime: 'neutral' },
                        sliders: {}
                    }
                }
            ],
            context: {
                profileId: '4159713d',
                kidsMode: false,
                selettoriEffettivi: { film: true, serie: true, anime: 'neutral' },
                sliders: {}
            }
        };
    }

    const activeProfileSettings = userConfig.profiles?.find(p => p.id === userConfig.activeProfileId)?.settings || {};
    const animePolicy = userConfig.context?.selettoriEffettivi?.anime || activeProfileSettings.typeSelectors?.anime || 'neutral';
    const isKidsMode = Boolean(userConfig.context?.kidsMode ?? activeProfileSettings.kidsMode);
    const sliders = userConfig.context?.sliders || activeProfileSettings.sliders || {};

    console.log(`[Step 1: Profilo] id=${userConfig.activeProfileId}, animePolicy=${animePolicy}, kidsMode=${isKidsMode}, sliders=${JSON.stringify(sliders)}`);

    // 2. Misura Semi da semiDi
    let rawSeeds;
    if (mongoConnected) {
        const { seeds } = await semiDi({
            userId: userConfig.userId,
            context: userConfig.activeProfileId,
            mediaType,
            user: userConfig
        });
        rawSeeds = [...seeds.entries()];
    } else {
        rawSeeds = FIXTURE_SEEDS_28;
    }
    console.log(`[Step 2: Semi] semiDi raw: ${rawSeeds.length} semi`);

    const { isAnimeContent } = require('../../src/anime');
    const filteredSeeds = rawSeeds.filter(([id]) => {
        if (animePolicy === 'exclude') return !isAnimeContent({ tmdbId: Number(id), tipo: 'tv' });
        if (animePolicy === 'only') return isAnimeContent({ tmdbId: Number(id), tipo: 'tv' });
        return true;
    });
    console.log(`[Step 2: Semi] dopo animePolicy (${animePolicy}): ${filteredSeeds.length} semi`);

    const semiPerGrafo = filteredSeeds.map(([id, w]) => {
        const tmdbId = Number(id);
        let tipo = 'watched';
        if (w >= 4) tipo = 'loved';
        else if (w >= 3) tipo = 'liked';
        else if (w === 1) tipo = 'library';
        return { tmdbId, medium: mediaType, tipo, peso: w };
    });

    // 3. Chiamata al Grafo
    console.log('\n[Step 3: Chiamata Grafo POST /raccomanda]');
    console.log(`Inviando ${semiPerGrafo.length} semi, medium=${mediaType}, cap=60, opzioni=${JSON.stringify(sliders)}`);

    let resGraph;
    if (!isFixture) {
        try {
            resGraph = await graphClient.raccomanda({
                semi: semiPerGrafo,
                medium: mediaType,
                opzioni: sliders,
                cap: 60
            });
        } catch (e) {
            console.warn(`[Step 3] Grafo non raggiungibile direttamente (${e.message}).`);
        }
    }

    if (!resGraph || !resGraph.liste) {
        console.log('[Step 3] Uso risposta fixture del grafo (51 titoli per il_tuo_mondo).');
        resGraph = FIXTURE_GRAPH_RESPONSE_51;
        // Inietta il mock nel graphClient per i successivi step
        jest_or_override_graph(resGraph);
    }

    console.log(`[Step 3: Grafo] Risposta: ${resGraph.liste.length} liste.`);
    for (const l of resGraph.liste) {
        console.log(`  - ruolo: ${l.ruolo.padEnd(20)} | mondo: ${String(l.mondo).padEnd(6)} | titoli: ${l.titoli?.length || 0}`);
    }
    const listaTuoMondo = resGraph.liste.find(l => l.ruolo === 'il_tuo_mondo');
    console.log(`=> Grafo 'il_tuo_mondo' titoli restituiti: ${listaTuoMondo?.titoli?.length || 0}`);

    // 4. Misura Pool Hero
    console.log('\n[Step 4: Pool Hero (getHeroPool)]');
    const poolResult = await getHeroPool({
        userId: userConfig.userId,
        context: userConfig.activeProfileId,
        mediaType,
        kidsMode: isKidsMode,
        typeSelectors: userConfig.context?.selettoriEffettivi,
        userConfig,
        sliders
    });
    const poolCandidates = poolResult[catalogId] || poolResult.catalogs?.[catalogId] || [];
    console.log(`=> Pool '${catalogId}' candidati assegnati: ${poolCandidates.length}`);

    // 5. Misura Idratazione (idrataEImpaginaCandidati)
    console.log('\n[Step 5: Idratazione e Impaginazione Candidati]');
    const { chiaveEffettiva } = require('../../src/configurazione');
    let tmdbApiKey = 'mock_key';
    try {
        tmdbApiKey = chiaveEffettiva({ account: userConfig, servizio: 'tmdb' }) || 'mock_key';
    } catch (_e) {}

    const hydratedResultsPage1 = await idrataEImpaginaCandidati({
        recommendationIds: poolCandidates,
        skip: 0,
        limit: ITEMS_PER_PAGE,
        tmdbApiKey,
        mediaType,
        isKidsMode,
        effectiveTypeSelectors: userConfig.context?.selettoriEffettivi
    });
    console.log(`=> Idratazione Pagina 1 (skip=0, limit=${ITEMS_PER_PAGE}): ${hydratedResultsPage1.length} card idratate`);

    const hydratedResultsPage2 = await idrataEImpaginaCandidati({
        recommendationIds: poolCandidates,
        skip: 20,
        limit: ITEMS_PER_PAGE,
        tmdbApiKey,
        mediaType,
        isKidsMode,
        effectiveTypeSelectors: userConfig.context?.selettoriEffettivi
    });
    console.log(`=> Idratazione Pagina 2 (skip=20, limit=${ITEMS_PER_PAGE}): ${hydratedResultsPage2.length} card idratate`);

    const hydratedResultsPage3 = await idrataEImpaginaCandidati({
        recommendationIds: poolCandidates,
        skip: 40,
        limit: ITEMS_PER_PAGE,
        tmdbApiKey,
        mediaType,
        isKidsMode,
        effectiveTypeSelectors: userConfig.context?.selettoriEffettivi
    });
    console.log(`=> Idratazione Pagina 3 (skip=40, limit=${ITEMS_PER_PAGE}): ${hydratedResultsPage3.length} card idratate`);
    const totalHydrated = hydratedResultsPage1.length + hydratedResultsPage2.length + hydratedResultsPage3.length;
    console.log(`=> Totale card idratate attraverso le 3 pagine: ${totalHydrated}`);

    // 6. Misura CatalogHandler (percorso pubblico Stremio)
    console.log('\n[Step 6: CatalogHandler (percorso pubblico Stremio)]');
    const catalogDesc = buildCatalogDesc({
        id: catalogId,
        baseId: catalogId,
        type: mediaType,
        extra: { skip: 0 },
        skip: 0,
        catalogMeta: null,
        userConfig,
        activeProfileSettings,
        graphVersions: resGraph.versioni
    });
    const keyHandler = cache.deriva(catalogDesc);
    console.log(`[Step 6: catalogHandler desc key] chiave=${keyHandler.chiave}`);

    const catalogResponsePage1 = await catalogHandler(
        { id: catalogId, type: mediaType, extra: { skip: 0 } },
        userConfig,
        'http://localhost:7000'
    );
    const finalMetasP1 = catalogResponsePage1?.metas || [];
    console.log(`=> CatalogHandler Pagina 1 (skip=0): ${finalMetasP1.length} titoli`);

    const catalogResponsePage2 = await catalogHandler(
        { id: catalogId, type: mediaType, extra: { skip: 20 } },
        userConfig,
        'http://localhost:7000'
    );
    const finalMetasP2 = catalogResponsePage2?.metas || [];
    console.log(`=> CatalogHandler Pagina 2 (skip=20): ${finalMetasP2.length} titoli`);

    const catalogResponsePage3 = await catalogHandler(
        { id: catalogId, type: mediaType, extra: { skip: 40 } },
        userConfig,
        'http://localhost:7000'
    );
    const finalMetasP3 = catalogResponsePage3?.metas || [];
    console.log(`=> CatalogHandler Pagina 3 (skip=40): ${finalMetasP3.length} titoli`);

    const totalPublicMetas = finalMetasP1.length + finalMetasP2.length + finalMetasP3.length;
    console.log(`=> Totale titoli serviti pubblicamente attraverso le 3 pagine: ${totalPublicMetas}`);

    console.log('\n=======================================================');
    console.log('RIEPILOGO CONTEGGI A PARITÀ DI INGRESSI:');
    console.log(`1. Semi in ingresso                             : ${semiPerGrafo.length}`);
    console.log(`2. Grafo raw ('il_tuo_mondo')                   : ${listaTuoMondo?.titoli?.length ?? 'N/A'}`);
    console.log(`3. Pool Hero ('${catalogId}')            : ${poolCandidates.length}`);
    console.log(`4. Dopo idratazione Pagina 1 (limit=${ITEMS_PER_PAGE})        : ${hydratedResultsPage1.length}`);
    console.log(`5. Risposta pubblica Stremio Pagina 1 (skip=0)  : ${finalMetasP1.length}`);
    console.log(`6. Risposta pubblica Stremio Totale (3 pagine) : ${totalPublicMetas}`);
    console.log('=======================================================');
    console.log('\nDIAGNOSI SINTOMO (Perché in produzione rispondeva 11 invece di 51):');
    console.log('- 11 titoli non è la dimensione della lista filtrata, ma una vecchia cache di catalog_page.');
    console.log('- Prima del Ticket 40 (alle 09:55 UTC), il_tuo_mondo conteneva un solo mondo (mondo_1739 con 11 titoli).');
    console.log('- La rotta /catalog/series/yaca_mondi_series.json venne memorizzata in Redis sotto tmdb_catalog:...');
    console.log('  con un TTL di 14 giorni.');
    console.log('- Alle 12:15 UTC il grafo venne aggiornato col Ticket 40 producendo 51 titoli.');
    console.log('- La cache heroes in src/pool/index.js venne invalidata grazie a dipendenze.invalida: { artefatto, ricetta }.');
    console.log('- Tuttavia la cache esterna catalog_page in src/stremio/catalogHandler.js NON includeva artefatto/ricetta.');
    console.log('- Di conseguenza la richiesta pubblica continuava a restituire la voce cache da 11 titoli memorizzata alle 09:55.');
    console.log('- Inoltre, Stremio impagina a ITEMS_PER_PAGE=20: a regime i 51 titoli escono su 3 pagine (20 + 20 + 11).');
    console.log('=======================================================');

    return {
        seedsCount: semiPerGrafo.length,
        graphTuoMondoCount: listaTuoMondo?.titoli?.length,
        poolCount: poolCandidates.length,
        hydratedPage1Count: hydratedResultsPage1.length,
        publicPage1Count: finalMetasP1.length,
        publicTotalCount: totalPublicMetas
    };
}

function jest_or_override_graph(fixture, fixtureSeeds = FIXTURE_SEEDS_28) {
    graphClient.raccomanda = async () => fixture;
    graphClient.getGraphHealthVersions = async () => fixture.versioni;
    graphClient.getGraphHealthVersionsCached = () => fixture.versioni;

    const library = require('../../src/library');
    library.semiDi = async () => ({
        seeds: new Map(fixtureSeeds),
        counts: { loved: 5, liked: 20, watched: 3, library: 0 }
    });

    const tmdb = require('../../src/clients/tmdb');
    tmdb.getTmdbMovieDetails = async (apiKey, id, type) => ({
        id: Number(id),
        name: `Series ${id}`,
        title: `Series ${id}`,
        media_type: type,
        type: type === 'tv' ? 'series' : 'movie',
        poster_path: `/poster_${id}.jpg`
    });
}

if (require.main === module) {
    runProbe()
        .then(() => {
            if (mongoose.connection.readyState === 1) {
                return mongoose.disconnect();
            }
        })
        .then(() => process.exit(0))
        .catch(err => {
            console.error('[Probe-Ticket-55] Errore fatale:', err);
            process.exit(1);
        });
}

module.exports = { runProbe };
