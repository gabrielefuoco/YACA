const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../secrets.env') });

const mongoose = require('mongoose');
const duckDbStore = require('../src/db/duckDbStore');
const graph = require('../src/engines/graph/HierarchicalGraph');
const TasteProfile = require('../src/models/TasteProfile');
const ProfileScorer = require('../src/profile/ProfileScorer');
const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { getMatchmakerInitCards, getMatchmakerNextCards } = require('../src/engines/hybrid/MatchmakerGraphEngine');

const TARGET_MOVIES = [
    { id: '120', title: "The Lord of the Rings: The Fellowship of the Ring" },
    { id: '671', title: "Harry Potter and the Philosopher's Stone" },
    { id: '411', title: "The Chronicles of Narnia: The Lion, the Witch and the Wardrobe" },
    { id: '19995', title: "Avatar" },
    { id: '1399', title: "Game of Thrones" }, // TV series
    { id: '155', title: "The Dark Knight" },
    { id: '603', title: "The Matrix" },
    { id: '8966', title: "Twilight" },
    { id: '24428', title: "The Avengers" },
    { id: '129', title: "Spirited Away" }
];

async function runTests() {
    console.log('🔄 Connessione a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'yaca' });
    
    console.log('🔄 Inizializzazione DuckDB...');
    await duckDbStore.init();

    // Attendi caricamento grafo
    while (!graph.isLoaded) {
        await new Promise(r => setTimeout(r, 100));
    }
    console.log('✅ Grafo gerarchico caricato.');

    // 1. DIVERSE USER PROFILES
    console.log('\n=============================================');
    console.log('🧪 TEST 1: VALUTAZIONE VSM SU FILM TARGET');
    console.log('=============================================');
    
    // Cerchiamo 3 profili casuali con V_final popolato
    const profiles = await TasteProfile.find({ 'compiledVectors.V_final': { $exists: true } }).limit(3).lean();
    
    for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];
        console.log(`\n👤 PROFILO ${i + 1} (Context: ${profile.context})`);
        
        // Estrai Top 3 L2
        const l2s = Object.entries(profile.compiledVectors.V_final)
            .filter(([k]) => k.startsWith('L2:'))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
            
        console.log(`   Top Topoi L2: ${l2s.map(l => l[0]).join(', ')}`);
        
        const { createTmdbClient } = require('../src/clients/tmdb');
        const tmdbClient = createTmdbClient(process.env.TMDB_API_KEY);
        // Ottieni i meta completi da DuckDB o TMDB
        for (const target of TARGET_MOVIES) {
            const table = target.id === '1399' ? 'tv' : 'movies';
            const rows = await duckDbStore.query(`SELECT * FROM ${table} WHERE id = 'tmdb:${target.id}'`);
            let rawTMDB = null;
            
            if (rows.length === 0) {
                console.log(`   [⚠️] ${target.title} non trovato nel DB locale. Lo recupero da TMDB...`);
                try {
                    const endpoint = target.id === '1399' ? 'tv' : 'movie';
                    const { data } = await tmdbClient.get(`/${endpoint}/${target.id}`, { params: { append_to_response: 'keywords' } });
                    
                    const kws = data.keywords || data.results || [];
                    const kwResults = kws.keywords || kws.results || kws;
                    rawTMDB = {
                        ...data,
                        genre_ids: data.genres.map(g => g.id),
                        keywords: { results: kwResults }
                    };
                } catch (err) {
                    console.log(`   [❌] Fallito il fetch TMDB per ${target.title}`);
                    continue;
                }
            } else {
                rawTMDB = rows[0];
                // Format come richiesto da ProfileScorer
                if (rawTMDB.genre_ids && typeof rawTMDB.genre_ids === 'string') {
                    rawTMDB.genre_ids = JSON.parse(rawTMDB.genre_ids);
                } else if (!rawTMDB.genre_ids && rawTMDB.genres) {
                    const g = typeof rawTMDB.genres === 'string' ? JSON.parse(rawTMDB.genres) : rawTMDB.genres;
                    rawTMDB.genre_ids = g.map(x => x.id);
                }
                if (!rawTMDB.keywords) rawTMDB.keywords = { results: [] };
                else if (typeof rawTMDB.keywords === 'string') rawTMDB.keywords = { results: JSON.parse(rawTMDB.keywords) };
            }

            const score = ProfileScorer.calculateItemMatch(rawTMDB, profile, { globalProfile: profile });
            const p = (score / 10) * 100;
            console.log(`   🎬 ${target.title.padEnd(60)} -> Score: ${score.toFixed(2)} / 10.0 (${p.toFixed(0)}%)`);
        }
    }

    // 2. TEST DUCKDB DINAMICO (Scelti per te)
    console.log('\n=============================================');
    console.log('🧪 TEST 2: GENERAZIONE CATALOGHI DA DUCKDB');
    console.log('=============================================');
    
    if (profiles.length > 0) {
        const profile = profiles[0];
        console.log(`Generazione 'Gemme Nascoste' per Profilo ${profile.context}`);
        
        // Helper simulato per il test
        const topL2Ids = Object.entries(profile.compiledVectors.V_final)
            .filter(([k]) => k.startsWith('L2:'))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([k]) => k.split(':')[1]);
            
        const kwIds = new Set();
        for (const l2Id of topL2Ids) {
            const l1s = graph.data.L2[l2Id]?.children_L1 || [];
            for (const l1 of l1s) {
                for (const [kwId, targetL1] of Object.entries(graph.data.kw_to_L1 || {})) {
                    if (targetL1 === l1) kwIds.add(kwId);
                }
            }
        }
        let kwArray = Array.from(kwIds).slice(0, 50);
        
        const filters = {
            with_keywords: kwArray.join('|'),
            'vote_count.gte': 50,
            'vote_count.lte': 1000, // Gemme nascoste
            sort_by: 'popularity.desc'
        };
        
        console.time('DuckDbQuery');
        const lightMetas = await getDuckDbCatalogFromFilters(filters, 'movie', 0, 10, {});
        console.timeEnd('DuckDbQuery');
        
        console.log(`Trovati ${lightMetas.length} risultati. Top 3:`);
        lightMetas.slice(0, 3).forEach(m => {
            console.log(`- ${m.name} (Pop: ${m.popularity})`);
        });
    }

    // 3. TEST MATCHMAKER GRAFO
    console.log('\n=============================================');
    console.log('🧪 TEST 3: MATCHMAKER DETERMINISTICO (L4 -> L3)');
    console.log('=============================================');
    
    console.log('Inizializzazione sessione (L4)...');
    console.time('MatchmakerInit');
    const initCards = await getMatchmakerInitCards('movie');
    console.timeEnd('MatchmakerInit');
    
    console.log(`Ottenute ${initCards.length} carte L4. Esempio nodi:`);
    const uniqueL4s = [...new Set(initCards.map(c => c._graphNodeId))];
    console.log(`L4 Nodes: ${uniqueL4s.join(', ')}`);
    
    if (initCards.length > 0) {
        // Simuliamo un like sulla prima carta
        const likedCard = initCards[0];
        console.log(`\nSimulazione LIKE su nodo ${likedCard._graphNodeId} (${likedCard.title})...`);
        
        const history = [{
            id: likedCard.id,
            action: 'like',
            _graphNodeId: likedCard._graphNodeId
        }];
        
        console.time('MatchmakerNext');
        const nextRes = await getMatchmakerNextCards('movie', history, 'L4');
        console.timeEnd('MatchmakerNext');
        
        console.log(`Discesa a livello: ${nextRes.nextLevel}`);
        console.log(`Ottenute ${nextRes.cards.length} carte L3 figlie.`);
        
        const uniqueL3s = [...new Set(nextRes.cards.map(c => c._graphNodeId))];
        console.log(`L3 Nodes estratti: ${uniqueL3s.join(', ')}`);
    }

    console.log('\n✅ Tutti i test completati.');
    process.exit(0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
