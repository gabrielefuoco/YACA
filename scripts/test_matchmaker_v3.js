const mongoose = require('mongoose');
require('dotenv').config();

const { initMatchmakerSession, analyzeMatchmakerSession, finishMatchmakerSession } = require('../src/handlers/matchmakerHandler');

function printUsage() {
    console.log(`
🍿 YACA Matchmaker v3 - Local Simulator
---------------------------------------------------
Simula l'esperienza completa del Buffer Mistral e Batch da riga di comando.

Uso:
  node scripts/test_matchmaker_v3.js <userId> <profileId> [type]

Esempio:
  node scripts/test_matchmaker_v3.js "gabriele29" "default" "movie"
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) printUsage();

const userId = args[0];
const profileId = args[1];
const type = args[2] || 'movie';

if (!process.env.MONGODB_URI) {
    console.error("❌ ERRORE: MONGODB_URI non trovato in .env");
    process.exit(1);
}

// Mock Res builder
const createMockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.data = null;
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    res.send = (data) => { res.data = data; return res; };
    return res;
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Funzione helper per simulare Swipe Casuali
function simulateSwipes(cards) {
    console.log(`\n🤖 [Simulazione] Inizio Swiping automatico di ${cards.length} carte...`);
    const swipes = [];
    cards.forEach((c, idx) => {
        // 20% like, 10% watchlist, 70% dislike
        const rand = Math.random();
        let action = 'dislike';
        if (rand > 0.9) action = 'watchlist';
        else if (rand > 0.7) action = 'like';
        
        const actionSymbol = action === 'like' ? '❤️ ' : action === 'watchlist' ? '🔖' : '❌';
        console.log(`   ${(idx + 1).toString().padStart(2, '0')}. ${actionSymbol} - ${c.title}`);
        
        swipes.push({
            id: c.id,
            action: action,
            title: c.title,
            genre_ids: c.genre_ids
        });
    });
    return swipes;
}

async function runSimulation() {
    try {
        console.log(`🔌 Connessione a MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`✅ Connesso. Inizializzo Profilo: [${userId} - ${profileId}]\n`);

        let globalSessionId = null;
        let lastReceivedCards = [];

        // ----------------------------------------------------
        // STEP 1: INIT
        // ----------------------------------------------------
        console.log(`=========================================`);
        console.log(`🔄 STEP 1: INIZIALIZZAZIONE SESSIONE`);
        console.log(`=========================================`);
        const reqInit = {
            params: { id: profileId },
            body: { userId, type, seed: 'random' }
        };
        const resInit = createMockRes();
        
        console.log(`⏳ Richiamando Mistral (potrebbe impiegare qualche secondo per generare il buffer 4-5 query)...`);
        const t0 = Date.now();
        await initMatchmakerSession(reqInit, resInit);
        const initData = resInit.data;
        
        if (!initData || !initData.success) {
            console.error('❌ Inizializzazione fallita:', initData);
            process.exit(1);
        }

        console.log(`⏱️ Tempo di init: ${((Date.now() - t0)/1000).toFixed(1)}s`);
        console.log(`✅ Sessione creata: ${initData.sessionId}`);
        console.log(`✅ Carte restituite nel Batch 1: ${initData.cards.length}`);
        
        globalSessionId = initData.sessionId;
        lastReceivedCards = initData.cards;

        // ----------------------------------------------------
        // STEP 2: BATCH 1 (SWIPE E ANALYZE)
        // ----------------------------------------------------
        console.log(`\n=========================================`);
        console.log(`🎯 STEP 2: SWIPE BATCH 1 E ANALISI`);
        console.log(`=========================================`);
        const swipesBatch1 = simulateSwipes(lastReceivedCards);

        const reqAnalyze1 = {
            params: { id: profileId },
            body: {
                userId,
                sessionId: globalSessionId,
                swipes: swipesBatch1,
                iteration: 1,
                maxIterations: 8
            }
        };
        const resAnalyze1 = createMockRes();
        
        console.log(`\n⏳ Richiesta Analyze (dovrebbe consumare il BUFFER senza chiamare Mistral)...`);
        const t1 = Date.now();
        await analyzeMatchmakerSession(reqAnalyze1, resAnalyze1);
        const data1 = resAnalyze1.data;

        if (data1.cards) {
            console.log(`⏱️ Tempo di refill dal Buffer: ${((Date.now() - t1)/1000).toFixed(1)}s (Molto più veloce di Mistral!)`);
            console.log(`✅ Carte restituite nel Batch 2: ${data1.cards.length}`);
            lastReceivedCards = data1.cards;
        }

        // ----------------------------------------------------
        // STEP 3: BATCH 2 (SWIPE E ANALYZE)
        // ----------------------------------------------------
        console.log(`\n=========================================`);
        console.log(`🎯 STEP 3: SWIPE BATCH 2 E ANALISI (o Refill)`);
        console.log(`=========================================`);
        const swipesBatch2 = simulateSwipes(lastReceivedCards);

        const reqAnalyze2 = {
            params: { id: profileId },
            body: {
                userId,
                sessionId: globalSessionId,
                swipes: swipesBatch2,
                iteration: 2,
                maxIterations: 8
            }
        };
        const resAnalyze2 = createMockRes();
        
        console.log(`\n⏳ Richiesta Analyze (Se buffer vuoto = Mistral, se pieno = Buffer)...`);
        const t2 = Date.now();
        await analyzeMatchmakerSession(reqAnalyze2, resAnalyze2);
        const data2 = resAnalyze2.data;

        if (data2.cards) {
            console.log(`⏱️ Tempo elaborazione: ${((Date.now() - t2)/1000).toFixed(1)}s`);
            console.log(`✅ Carte restituite nel Batch 3: ${data2.cards.length}`);
            lastReceivedCards = data2.cards;
        }


        // ----------------------------------------------------
        // STEP 4: FINISH (Generazione Catalogo VSM)
        // ----------------------------------------------------
        console.log(`\n=========================================`);
        console.log(`🏁 STEP 4: FINISH - GENERAZIONE CATALOGO MATCHMAKER`);
        console.log(`=========================================`);
        
        const reqFinish = {
            params: { id: profileId },
            body: {
                userId,
                sessionId: globalSessionId,
                swipes: simulateSwipes(lastReceivedCards.slice(0, 3)), // Simulo lo stop anticipato dell'utente dopo 3 carte
                saveToConfig: false // Evito di scrivere il catalogo sul profilo reale dell'utente
            }
        };
        const resFinish = createMockRes();
        
        console.log(`\n⏳ Generazione catalogo finale Mix...`);
        const t3 = Date.now();
        await finishMatchmakerSession(reqFinish, resFinish);
        const finalData = resFinish.data;

        console.log(`⏱️ Tempo chiusura e aggregazione (0 API Calls): ${((Date.now() - t3)/1000).toFixed(1)}s`);
        
        if (finalData.matchedCards) {
            console.log(`\n🎉 Catalogo Matchmaker (Mix Storico/Like + VSM) pronto! Elementi totali: ${finalData.matchedCards.length}`);
            console.log(`   Top 5 elementi in ordine:`);
            finalData.matchedCards.slice(0, 5).forEach((c, i) => {
                console.log(`   ${i + 1}. [${c.type.toUpperCase()}] ${c.title}`);
            });
        }

        console.log(`\n🚀 Simulazione conclusa con successo!`);
        process.exit(0);

    } catch (err) {
        console.error('❌ Errore irreversibile nella simulazione:', err);
        process.exit(1);
    }
}

runSimulation();
