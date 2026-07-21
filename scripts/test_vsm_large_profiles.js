const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../secrets.env') });
const mongoose = require('mongoose');
const { createTmdbClient } = require('../src/clients/tmdb');
const graph = require('../src/engines/graph/HierarchicalGraph');
const ProfileScorer = require('../src/profile/ProfileScorer');

const PROFILES_DATA = {
    "1_LARGE_GENERAL": [
        24428, 597, 105, 120, 354912, 11, 155, 671, 38, 862, 12, 28, 238, 13, 680, 157336, 118340, 808, 10138, 550, 27205, 348, 278, 603, 22, 78, 329, 646389, 7451, 60625 // Mix: Marvel, Lotr, Pixar, Classics, Action, Comedy
    ],
    "2_LARGE_PARTICULAR_HORROR": [
        274, 11906, 23827, 310131, 5595, 4194, 280180, 474350, 493922, 530385, 170, 74849, 176, 814, 245, 9552, 11324, 764, 49026, 4232  // Horror, Slasher, Gore, Psychological
    ],
    "3_ANIME_ONLY": [
        129, 372058, 31754, 4935, 164, 10515, 378064, 156022, 241855, 12477, 558066, 568160, 45243, 63808, 34433 // Anime, Studio Ghibli, Makoto Shinkai, Sci-Fi Anime
    ]
};

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
        return null; // Skip if invalid
    }
}

async function buildMockProfile(client, movieIds, name) {
    console.log(`\nCostruzione DNA per [${name}] (${movieIds.length} film)...`);
    let totalVector = {};
    let totalGenres = {};
    let validCount = 0;

    const promises = movieIds.map(id => fetchMovieDetails(client, id));
    const movies = await Promise.all(promises);

    for (const movie of movies) {
        if (!movie) continue;
        validCount++;
        
        const vector = graph.vectorizeKeywords(movie.keywords?.results || []);
        for (const [k, v] of Object.entries(vector)) {
            totalVector[k] = (totalVector[k] || 0) + v;
        }
        for (const gId of movie.genre_ids) {
            totalGenres[gId] = (totalGenres[gId] || 0) + 1;
        }
    }
    
    for (const k in totalVector) totalVector[k] /= validCount;
    for (const [gId, count] of Object.entries(totalGenres)) {
        totalVector['g:' + gId] = count / validCount;
    }
    
    console.log(`[${name}] DNA Generato. Top 5 Generi:`, 
        Object.entries(totalGenres).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => `g:${x[0]} (${x[1]})`)
    );

    return {
        context: name,
        compiledVectors: { V_final: totalVector },
        preferences: {}
    };
}

async function runTest() {
    console.log('🔄 Inizializzazione MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'yaca' });
    
    while (!graph.isLoaded) await new Promise(r => setTimeout(r, 100));
    console.log('✅ Grafo gerarchico caricato.');

    const tmdbClient = createTmdbClient(process.env.TMDB_API_KEY);

    // 1. Costruiamo i profili
    const profiles = {};
    for (const [name, ids] of Object.entries(PROFILES_DATA)) {
        profiles[name] = await buildMockProfile(tmdbClient, ids, name);
    }

    // 2. Scaricamento Bacino di 200 film misti (Popular + Anime + Horror)
    console.log('\n=============================================');
    console.log('🎬 FASE 2: RECUPERO BACINO 150 FILM ETEROGENEI');
    console.log('=============================================');
    
    const pool = [];
    // 3 Pagine di Popular
    for (let page = 1; page <= 3; page++) {
        const { data } = await tmdbClient.get('/movie/popular', { params: { page } });
        pool.push(...data.results);
    }
    // 2 Pagine Anime
    for (let page = 1; page <= 2; page++) {
        const { data } = await tmdbClient.get('/discover/movie', { params: { page, with_genres: '16', with_original_language: 'ja' } });
        pool.push(...data.results);
    }
    // 2 Pagine Horror
    for (let page = 1; page <= 2; page++) {
        const { data } = await tmdbClient.get('/discover/movie', { params: { page, with_genres: '27' } });
        pool.push(...data.results);
    }
    
    const uniquePool = Array.from(new Map(pool.map(item => [item.id, item])).values());
    console.log(`Trovati ${uniquePool.length} film unici. Arricchimento in corso...`);
    
    const enrichedPool = [];
    for (let i = 0; i < uniquePool.length; i += 15) {
        const batch = uniquePool.slice(i, i + 15);
        const results = await Promise.all(batch.map(m => fetchMovieDetails(tmdbClient, m.id)));
        enrichedPool.push(...results.filter(Boolean));
        process.stdout.write('.');
    }
    console.log('\nArricchimento completato.');

    // 3. Test Scoring
    for (const [name, profile] of Object.entries(profiles)) {
        console.log('\n=============================================');
        console.log(`📊 RISULTATI PER PROFILO: ${name}`);
        console.log('=============================================');
        
        const scored = enrichedPool.map(movie => {
            const score = ProfileScorer.calculateItemMatch(movie, profile, { globalProfile: profile });
            return { title: movie.title, score };
        });
        
        scored.sort((a, b) => b.score - a.score);
        
        console.log('🏆 TOP 15 MATCH (Più affini):');
        scored.slice(0, 15).forEach((m, i) => {
            console.log(` ${String(i+1).padStart(2, ' ')}. ${m.title.padEnd(45)} | Score: ${m.score.toFixed(2)} (${((m.score/10)*100).toFixed(0)}%)`);
        });

        console.log('\n🗑️ BOTTOM 10 MATCH (Scartati / Penalità Genere):');
        scored.slice(-10).forEach((m, i) => {
            console.log(` ${String(scored.length - 9 + i).padStart(2, ' ')}. ${m.title.padEnd(45)} | Score: ${m.score.toFixed(2)} (${((m.score/10)*100).toFixed(0)}%)`);
        });
    }

    console.log('\n✅ Tutti i test completati.');
    process.exit(0);
}

runTest().catch(console.error);
