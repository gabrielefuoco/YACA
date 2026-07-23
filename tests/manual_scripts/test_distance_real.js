const axios = require('axios');
const hierarchicalGraph = require('../src/engines/graph/HierarchicalGraph');

const TMDB_KEY = "c916a92d370eafd58eed86dd73e3dca0";

async function getKeywords(movieId) {
    const res = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}/keywords?api_key=${TMDB_KEY}`);
    return res.data.keywords.map(k => k.id);
}

function calculateVectorDotProduct(vec1, vec2) {
    let score = 0;
    for (const key in vec1) {
        if (vec2[key]) {
            score += vec1[key] * vec2[key];
        }
    }
    return score;
}

async function testRealMovies() {
    hierarchicalGraph.loadData();

    // 1. Fetch
    const lotrIds = await getKeywords(120); // Fellowship
    const hobbitIds = await getKeywords(49051); // Unexpected Journey
    const hpIds = await getKeywords(672); // Chamber of Secrets
    const narniaIds = await getKeywords(411); // The Lion, the Witch and the Wardrobe

    // Convert to name just for printing
    const getName = (ids) => ids.map(id => hierarchicalGraph.data.L1[hierarchicalGraph.data.kw_to_L1[id]]?.keywords[0] || id);

    console.log(`\n======================================================`);
    console.log(`🎬 TEST DISTANZA REALE (TMDB API)`);
    console.log(`======================================================\n`);
    console.log(`🔑 Keyword LOTR:`, lotrIds.length, `trovate.`);
    console.log(`🔑 Keyword Hobbit:`, hobbitIds.length, `trovate.`);
    console.log(`🔑 Keyword Harry Potter:`, hpIds.length, `trovate.`);
    console.log(`🔑 Keyword Narnia:`, narniaIds.length, `trovate.`);

    // 2. Vectorize
    const vecLOTR = hierarchicalGraph.vectorizeKeywords(lotrIds);
    const vecHobbit = hierarchicalGraph.vectorizeKeywords(hobbitIds);
    const vecHP = hierarchicalGraph.vectorizeKeywords(hpIds);
    const vecNarnia = hierarchicalGraph.vectorizeKeywords(narniaIds);

    // LOTR vs HOBBIT
    const scoreHobbit = calculateVectorDotProduct(vecLOTR, vecHobbit);
    console.log(`\nIl Signore degli Anelli ⚔️  Lo Hobbit:`);
    console.log(`Punteggio di Affinità Pura: ${scoreHobbit.toFixed(2)}`);
    
    let overlapHobbit = [];
    for(const key in vecLOTR) { if(vecHobbit[key]) overlapHobbit.push(`${key}(${(vecLOTR[key]*vecHobbit[key]).toFixed(2)})`); }
    console.log(`Principali punti di contatto: ${overlapHobbit.sort((a,b)=>parseFloat(b.split('(')[1])-parseFloat(a.split('(')[1])).slice(0,5).join(', ')}`);

    // LOTR vs HP
    const scoreHP = calculateVectorDotProduct(vecLOTR, vecHP);
    console.log(`\nIl Signore degli Anelli ⚔️  Harry Potter 2:`);
    console.log(`Punteggio di Affinità Pura: ${scoreHP.toFixed(2)}`);
    
    let overlapHP = [];
    for(const key in vecLOTR) { if(vecHP[key]) overlapHP.push(`${key}(${(vecLOTR[key]*vecHP[key]).toFixed(2)})`); }
    console.log(`Principali punti di contatto: ${overlapHP.sort((a,b)=>parseFloat(b.split('(')[1])-parseFloat(a.split('(')[1])).slice(0,5).join(', ')}`);

    // NARNIA vs LOTR
    const scoreNarniaLotr = calculateVectorDotProduct(vecNarnia, vecLOTR);
    console.log(`\nLe Cronache di Narnia 🦁  Il Signore degli Anelli ⚔️:`);
    console.log(`Punteggio di Affinità Pura: ${scoreNarniaLotr.toFixed(2)}`);
    
    let overlapNarniaLotr = [];
    for(const key in vecNarnia) { if(vecLOTR[key]) overlapNarniaLotr.push(`${key}(${(vecNarnia[key]*vecLOTR[key]).toFixed(2)})`); }
    console.log(`Principali punti di contatto: ${overlapNarniaLotr.sort((a,b)=>parseFloat(b.split('(')[1])-parseFloat(a.split('(')[1])).slice(0,5).join(', ')}`);

    // NARNIA vs HP
    const scoreNarniaHP = calculateVectorDotProduct(vecNarnia, vecHP);
    console.log(`\nLe Cronache di Narnia 🦁  Harry Potter 2 🧙‍♂️:`);
    console.log(`Punteggio di Affinità Pura: ${scoreNarniaHP.toFixed(2)}`);
    
    let overlapNarniaHP = [];
    for(const key in vecNarnia) { if(vecHP[key]) overlapNarniaHP.push(`${key}(${(vecNarnia[key]*vecHP[key]).toFixed(2)})`); }
    console.log(`Principali punti di contatto: ${overlapNarniaHP.sort((a,b)=>parseFloat(b.split('(')[1])-parseFloat(a.split('(')[1])).slice(0,5).join(', ')}`);
    console.log(`\n======================================================\n`);
}

testRealMovies();
