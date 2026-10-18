#!/usr/bin/env node
/**
 * scripts/qa/probe-hero-counts.js
 *
 * Sonda per la misura e verifica dei conteggi delle righe Hero (Ticket 41 - Step 7).
 * Esegue getHeroPool per mediaType 'movie' e 'series' e verifica:
 * - Conteggi per ciascun catalogo hero (yaca_mondi, yaca_passo_fuori, yaca_uscite_nuove, yaca_nicchia_di_qualita)
 * - Invariante di disgiunzione (zero duplicati fra righe concorrenti)
 * - Coerenza dei metadati (nessuna stringa scalare, presenza di id e tmdbId)
 *
 * Utilizzo:
 *   node scripts/qa/probe-hero-counts.js [--userId=<id>] [--context=<profileId>]
 */

require('dotenv').config();
const { getHeroPool } = require('../../src/pool');

async function runHeroProbe(mediaType = 'movie', options = {}) {
    const userId = options.userId || 'qa_user';
    const context = options.context || 'global';

    const poolResult = await getHeroPool({
        userId,
        context,
        mediaType,
        kidsMode: options.kidsMode || false,
        traktToken: options.traktToken || null,
        tmdbApiKey: options.tmdbApiKey || null,
        userConfig: {
            userId,
            activeProfileId: context,
            profiles: [{ id: context, name: 'QA Profile', settings: {} }]
        }
    }).catch(err => {
        console.warn(`[Probe-Hero] Avviso getHeroPool (${mediaType}):`, err.message);
        return { catalogs: {} };
    });

    const catalogs = poolResult?.catalogs || poolResult || {};
    const catMondi = `yaca_mondi_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const catPasso = `yaca_passo_fuori_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const catUscite = `yaca_uscite_nuove_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const catNicchia = `yaca_nicchia_di_qualita_${mediaType === 'movie' ? 'movies' : 'series'}`;

    const itemsMondi = catalogs[catMondi] || [];
    const itemsPasso = catalogs[catPasso] || [];
    const itemsUscite = catalogs[catUscite] || [];
    const itemsNicchia = catalogs[catNicchia] || [];

    const allItems = [...itemsMondi, ...itemsPasso, ...itemsUscite, ...itemsNicchia];
    const uniqueIds = new Set(allItems.map(it => it?.id || it?.tmdbId || it));
    const isDisjoint = uniqueIds.size === allItems.length;

    return {
        mediaType,
        counts: {
            [catMondi]: itemsMondi.length,
            [catPasso]: itemsPasso.length,
            [catUscite]: itemsUscite.length,
            [catNicchia]: itemsNicchia.length,
            total: allItems.length
        },
        invariants: {
            disjoint: isDisjoint,
            noScalarStrings: allItems.every(it => typeof it === 'object' && it !== null),
            allHaveIds: allItems.every(it => it && (it.id || it.tmdbId))
        }
    };
}

async function main() {
    const args = process.argv.slice(2);
    const userIdArg = args.find(a => a.startsWith('--userId='))?.split('=')[1] || 'qa_probe_user';
    const contextArg = args.find(a => a.startsWith('--context='))?.split('=')[1] || 'global';
    const isFixture = args.includes('--fixture');

    if (isFixture) {
        const graphClient = require('../../src/clients').graphClient;
        const library = require('../../src/library');
        library.semiDi = async () => ({
            seeds: new Map([['603', 3], ['314', 4]]),
            counts: { loved: 1, liked: 1, watched: 0, library: 0 }
        });
        graphClient.raccomanda = async ({ medium }) => ({
            contratto: 1,
            versioni: { artefatto: 'art-fixture', ricetta: 'ric-fixture' },
            semi: { n: 2, da_catalogo: false },
            liste: [
                {
                    ruolo: 'il_tuo_mondo',
                    mondo: 1084,
                    descrizione: 'Mondo 1084',
                    titoli: [
                        { tmdbId: 603, medium, punteggio: 0.95 },
                        { tmdbId: 604, medium, punteggio: 0.90 }
                    ]
                },
                {
                    ruolo: 'un_passo_fuori',
                    mondo: null,
                    descrizione: 'Passo fuori',
                    titoli: [
                        { tmdbId: 605, medium, punteggio: 0.85 },
                        { tmdbId: 606, medium, punteggio: 0.80 }
                    ]
                },
                {
                    ruolo: 'uscite_nuove',
                    mondo: null,
                    descrizione: 'Uscite nuove',
                    titoli: [
                        { tmdbId: 607, medium, punteggio: 0.75 },
                        { tmdbId: 608, medium, punteggio: 0.70 },
                        { tmdbId: 609, medium, punteggio: 0.65 }
                    ]
                },
                {
                    ruolo: 'nicchia_di_qualita',
                    mondo: null,
                    descrizione: 'Nicchia di qualità',
                    titoli: [
                        { tmdbId: 610, medium, punteggio: 0.60 },
                        { tmdbId: 611, medium, punteggio: 0.55 }
                    ]
                }
            ],
            motivi: []
        });
    }

    console.log(`=======================================================`);
    console.log(`[SONDA QA] Misura Conteggi Righe Hero (Ticket 41)`);
    console.log(`Target: userId=${userIdArg}, context=${contextArg} (Fixture: ${isFixture})`);
    console.log(`=======================================================\n`);

    const movieResult = await runHeroProbe('movie', { userId: userIdArg, context: contextArg });
    const seriesResult = await runHeroProbe('series', { userId: userIdArg, context: contextArg });

    const summary = {
        movie: movieResult,
        series: seriesResult,
        timestamp: new Date().toISOString()
    };

    console.log(JSON.stringify(summary, null, 2));
    console.log(`\n=======================================================`);
    console.log(`Esito Sonda:`);
    console.log(`- Film : ${movieResult.counts.total} titoli (Disgiunti: ${movieResult.invariants.disjoint})`);
    console.log(`- Serie: ${seriesResult.counts.total} titoli (Disgiunti: ${seriesResult.invariants.disjoint})`);
    console.log(`=======================================================`);

    process.exit(0);
}

if (require.main === module) {
    main().catch(err => {
        console.error('[Probe-Hero-Counts] Errore fatale:', err);
        process.exit(1);
    });
}

module.exports = { runHeroProbe };
