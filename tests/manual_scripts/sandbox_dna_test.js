const mongoose = require('mongoose');
require('dotenv').config();
const TasteProfile = require('../src/models/TasteProfile');
const AddonConfig = require('../src/db/models/AddonConfig');
const { computeTopGenres, computeTopKeywords } = require('../src/engines/hybrid/scoringEngine');
const { F, S, G } = require('../src/data/filters');
const graph = require('../src/engines/graph/HierarchicalGraph');
const tmdb = require('../src/clients/tmdb');
const { rateLimitedMap } = require('../src/utils/rateLimiter');
const ProfileScorer = require('../src/profile/ProfileScorer');

// Instead of hitting DuckDb (which might hang in scripts due to worker threads), we just fetch TMDB discover using the generated keywords!
async function fetchTmdbResultsDirect(aiQuery, tmdbApiKey, types) {
    const params = { ...aiQuery, api_key: tmdbApiKey, language: 'it-IT' };
    try {
        const res = await require('axios').get(`https://api.themoviedb.org/3/discover/${types}`, { params });
        return res.data.results || [];
    } catch (e) {
        return [];
    }
}

function getTopNodeIds(profile, level = 'L2', limit = 2) {
    if (!profile || !profile.compiledVectors || !profile.compiledVectors.V_final) return [];
    return Object.entries(profile.compiledVectors.V_final)
        .filter(([k]) => k.startsWith(`${level}:`))
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k]) => k.split(':')[1]);
}

function getKeywordsForNodeIds(nodeIds, level = 'L2') {
    if (!graph.isLoaded || !graph.data || !graph.data[level]) return [];
    const kwIds = new Set();
    for (const nodeId of nodeIds) {
        const l1s = level === 'L1' ? [nodeId] : (graph.data[level][nodeId]?.children_L1 || []);
        for (const l1 of l1s) {
            for (const [kwId, targetL1] of Object.entries(graph.data.kw_to_L1 || {})) {
                if (targetL1 === l1) kwIds.add(kwId);
            }
        }
    }
    return Array.from(kwIds);
}

const USER_ID = 'REOZrGNRr3';
const UUID = 'ff7084d8-904b-42d9-91f5-ea2b4ae37590';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    const config = await AddonConfig.findOne({ uuid: UUID }).lean();
    
    const contexts = ['1c1da0af', '3f2f4afd'];

    for (const ctx of contexts) {
        const profile = await TasteProfile.findOne({ owner: USER_ID, context: ctx }).lean();
        const profileInfo = config.profiles.find(p => p.id === ctx);
        console.log(`\n======================================================`);
        console.log(`Analisi Profilo: ${profileInfo?.name || ctx}`);
        
        let isAnimeProfile = false;
        if (profileInfo) {
            console.log(`=> Catalogs: ${profileInfo.catalogs.map(c=>c.id).join(', ')}`);
            const animeCatalogs = profileInfo.catalogs.filter(c => c.id.includes('anime') || c.id.includes('otaku'));
            if (profileInfo.catalogs.length > 0 && animeCatalogs.length === profileInfo.catalogs.length) {
                isAnimeProfile = true;
                console.log(`=> Profilo riconosciuto come PURE ANIME (100% cataloghi anime)`);
            } else if (animeCatalogs.length > 0) {
                console.log(`=> Profilo MISTO (${Math.round((animeCatalogs.length/profileInfo.catalogs.length)*100)}% anime)`);
            }
        }

        if (!profile) continue;

        const vFinal = profile.compiledVectors?.V_final || {};
        const topGenres = computeTopGenres(profile, 3, null, ctx);
        const topL2Ids = getTopNodeIds(profile, 'L2', 3);
        const directKwIds = computeTopKeywords(profile, 10, null, ctx);

        console.log(`Top Genres:`, topGenres);
        console.log(`Top L2 Topoi:`, topL2Ids);
        console.log(`Top Keywords:`, directKwIds);

        console.log(`\n[Simulazione Query - SMART AND strategy per True Blend (su TMDB via Discover)]`);
        
        for (const l2Id of topL2Ids) {
            const toposKwIds = getKeywordsForNodeIds([l2Id], 'L2');
            if (toposKwIds.length > 0) {
                console.log(`\n-> Fetching TMDB per Topos: ${l2Id}`);
                
                // Smart AND: (TopGenres) AND (Topos Kw OR Direct Kw)
                const thematicIds = [...toposKwIds.map(Number), ...directKwIds.map(Number)];
                
                const params = {
                    sort_by: 'popularity.desc',
                    'vote_count.gte': 1000,
                    with_keywords: thematicIds.join('|') // OR
                };
                
                if (topGenres.length > 0) {
                    params.with_genres = topGenres.join('|'); // OR
                }
                
                if (isAnimeProfile) {
                    params.with_keywords += ',210024'; // AND Anime
                }

                console.log(`   TMDB Params:`, params);

                const results = await fetchTmdbResultsDirect(params, process.env.TMDB_API_KEY, 'tv');
                console.log(`   Trovati ${results.length} risultati TV. Esempi:`);
                results.slice(0, 5).forEach(r => console.log(`    - TMDB:${r.id}: ${r.name} (Generi: ${r.genre_ids.join(',')})`));
            }
        }
    }

    await mongoose.disconnect();
    process.exit(0);
}
run();
