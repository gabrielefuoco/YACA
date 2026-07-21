const hierarchicalGraph = require('../src/engines/graph/HierarchicalGraph');

function calculateVectorDotProduct(vec1, vec2) {
    let score = 0;
    for (const key in vec1) {
        if (vec2[key]) {
            score += vec1[key] * vec2[key];
        }
    }
    return score;
}

function testDistance() {
    hierarchicalGraph.loadData();

    // 1. Definiamo i film
    const lotr = ["elves", "dwarf", "orc", "magic", "wizard", "quest", "ring", "epic"];
    const hobbit = ["dwarf", "dragon", "wizard", "quest", "magic"];
    const harryPotter = ["magic", "wizard", "witch", "school of witchcraft", "owl", "chosen one"];

    // 2. Vettorizziamo
    const vecLOTR = hierarchicalGraph.vectorizeKeywords(lotr);
    const vecHobbit = hierarchicalGraph.vectorizeKeywords(hobbit);
    const vecHP = hierarchicalGraph.vectorizeKeywords(harryPotter);

    console.log(`\n======================================================`);
    console.log(`📏 TEST DISTANZA: LOTR vs HOBBIT vs HARRY POTTER`);
    console.log(`======================================================\n`);

    // LOTR vs HOBBIT
    const scoreHobbit = calculateVectorDotProduct(vecLOTR, vecHobbit);
    console.log(`Il Signore degli Anelli ⚔️  Lo Hobbit:`);
    console.log(`Punteggio di Affinità Pura: ${scoreHobbit.toFixed(2)}`);
    
    let overlapHobbit = [];
    for(const key in vecLOTR) { if(vecHobbit[key]) overlapHobbit.push(`${key}(${(vecLOTR[key]*vecHobbit[key]).toFixed(2)})`); }
    console.log(`Principali punti di contatto: ${overlapHobbit.sort((a,b)=>parseFloat(b.split('(')[1])-parseFloat(a.split('(')[1])).slice(0,5).join(', ')}`);
    console.log(`------------------------------------------------------`);

    // LOTR vs HP
    const scoreHP = calculateVectorDotProduct(vecLOTR, vecHP);
    console.log(`Il Signore degli Anelli ⚔️  Harry Potter:`);
    console.log(`Punteggio di Affinità Pura: ${scoreHP.toFixed(2)}`);
    
    let overlapHP = [];
    for(const key in vecLOTR) { if(vecHP[key]) overlapHP.push(`${key}(${(vecLOTR[key]*vecHP[key]).toFixed(2)})`); }
    console.log(`Principali punti di contatto: ${overlapHP.sort((a,b)=>parseFloat(b.split('(')[1])-parseFloat(a.split('(')[1])).slice(0,5).join(', ')}`);
    console.log(`\n======================================================\n`);
}

testDistance();
