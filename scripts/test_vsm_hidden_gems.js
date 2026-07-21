const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../secrets.env') });
const mongoose = require('mongoose');
const { createTmdbClient } = require('../src/clients/tmdb');
const graph = require('../src/engines/graph/HierarchicalGraph');
const ProfileScorer = require('../src/profile/ProfileScorer');

// 10 Film per costruire il DNA (Tema: Sci-Fi / Cyberpunk / Mind-Bending)
const DNA_SOURCE_MOVIES = [
    603,    // The Matrix
    78,     // Blade Runner
    9313,   // Ghost in the Shell
    27205,  // Inception
    158,    // Minority Report
    280,    // Terminator 2: Judgment Day
    149,    // Akira
    348,    // Alien
    97,     // Tron
    264660  // Ex Machina
];

async function fetchMovieDetails(client, id) {
    try {
        const { data } = await client.get(`/movie/${id}`, { params: { append_to_response: 'keywords' } });
        const kws = data.keywords || data.results || [];
        const kwResults = kws.keywords || kws.results || kws;
        return {
            ...data,
            genre_ids: data.genres.map(g => g.id),
            keywords: { results: kwResults }
        };
    } catch (e) {
        console.error(`Errore fetch TMDB per ID ${id}:`, e.message);
        return null;
    }
}

async function runTest() {
    console.log('🔄 Inizializzazione...');
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'yaca' });
    
    // Attendi caricamento grafo
    while (!graph.isLoaded) {
        await new Promise(r => setTimeout(r, 100));
    }
    console.log('✅ Grafo gerarchico caricato.');

    const tmdbClient = createTmdbClient(process.env.TMDB_API_KEY);

    console.log('\n=============================================');
    console.log('🧬 FASE 1: COSTRUZIONE DNA (10 Film Sci-Fi)');
    console.log('=============================================');
    
    let totalVector = {};
    let totalGenres = {};
    
    for (const id of DNA_SOURCE_MOVIES) {
        const movie = await fetchMovieDetails(tmdbClient, id);
        if (!movie) continue;
        
        const vector = graph.vectorizeKeywords(movie.keywords?.results || []);
        
        for (const [k, v] of Object.entries(vector)) {
            totalVector[k] = (totalVector[k] || 0) + v;
        }
        
        for (const gId of movie.genre_ids) {
            totalGenres[gId] = (totalGenres[gId] || 0) + 1;
        }
    }
    
    const N = DNA_SOURCE_MOVIES.length;
    for (const k in totalVector) totalVector[k] /= N;
    
    for (const [gId, count] of Object.entries(totalGenres)) {
        totalVector['g:' + gId] = count / N;
    }
    
    const mockProfile = {
        context: 'CyberpunkLover_Test',
        compiledVectors: { V_final: totalVector },
        preferences: {
            genreFootprint: Object.fromEntries(
                Object.entries(totalGenres)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([k, v]) => [k, { score: v / N, lastInteraction: new Date() }])
            ),
            keywordFootprint: {}
        }
    };

    console.log('\n=============================================');
    console.log('🎬 FASE 2: RECUPERO BACINO 100 HIDDEN GEMS');
    console.log('=============================================');
    
    const pool = [];
    console.log('Scaricamento film indipendenti/di nicchia da TMDB...');
    for (let page = 1; page <= 5; page++) {
        const { data } = await tmdbClient.get('/discover/movie', { 
            params: { 
                page,
                'vote_count.gte': 50,
                'vote_count.lte': 800,
                'vote_average.gte': 6.0,
                sort_by: 'popularity.desc'
            } 
        });
        pool.push(...data.results);
    }
    
    const uniquePool = Array.from(new Map(pool.map(item => [item.id, item])).values()).slice(0, 100);
    console.log(`Trovati ${uniquePool.length} film unici (Hidden Gems).`);
    
    console.log('Arricchimento con keywords (Batching di 10)...');
    const enrichedPool = [];
    for (let i = 0; i < uniquePool.length; i += 10) {
        const batch = uniquePool.slice(i, i + 10);
        const promises = batch.map(m => fetchMovieDetails(tmdbClient, m.id));
        const results = await Promise.all(promises);
        enrichedPool.push(...results.filter(Boolean));
        process.stdout.write('.');
    }
    console.log('\nArricchimento completato.');

    console.log('\n=============================================');
    console.log('📊 FASE 3: SCORING E RISULTATI (HIDDEN GEMS)');
    console.log('=============================================');
    
    const scored = enrichedPool.map(movie => {
        // Applichiamo la formula completa (base + bayesian) e mostriamo i risultati
        const score = ProfileScorer.calculateItemMatch(movie, mockProfile, { globalProfile: mockProfile, catalogContext: 'hidden_gems' });
        return { title: movie.title, score, vote_count: movie.vote_count };
    });
    
    scored.sort((a, b) => b.score - a.score);
    
    console.log('\n🏆 TOP 15 HIDDEN GEMS (I più affini al DNA Sci-Fi/Cyberpunk):');
    scored.slice(0, 15).forEach((m, i) => {
        const p = (m.score / 10) * 100;
        console.log(` ${String(i+1).padStart(2, ' ')}. ${m.title.padEnd(45)} | Score: ${m.score.toFixed(2)} (${p.toFixed(0)}%) [Voti: ${m.vote_count}]`);
    });

    console.log('\n🗑️ BOTTOM 15 HIDDEN GEMS (Scartati dal motore):');
    const bottom = scored.slice(-15);
    bottom.forEach((m, i) => {
        const p = (m.score / 10) * 100;
        console.log(` ${String(scored.length - 14 + i).padStart(2, ' ')}. ${m.title.padEnd(45)} | Score: ${m.score.toFixed(2)} (${p.toFixed(0)}%) [Voti: ${m.vote_count}]`);
    });

    console.log('\n✅ Test completato.');
    process.exit(0);
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
