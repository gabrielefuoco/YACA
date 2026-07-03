require('dotenv').config();
const axios = require('axios');

const tmdbApiKey = process.env.TMDB_API_KEY;
const tmdbClient = axios.create({
    baseURL: 'https://api.themoviedb.org/3',
    params: { api_key: tmdbApiKey },
    timeout: 10000
});

async function runSustainedStressTest(name, client, endpoint, reqPerSec, durationSeconds) {
    console.log(`\n--- INIZIO TEST SOSTENUTO: ${name} ---`);
    console.log(`Target: ${reqPerSec} req/sec per ${durationSeconds} secondi (Totale: ${reqPerSec * durationSeconds} richieste)\n`);
    
    let totalSuccess = 0;
    let totalErrors = 0;
    let total429 = 0;
    let totalTimeouts = 0;

    for (let second = 1; second <= durationSeconds; second++) {
        const promises = [];
        const startSec = Date.now();
        
        for (let i = 0; i < reqPerSec; i++) {
            // Un po' di randomizzazione sulle pagine per evitare che TMDB ci banni per flood identico
            const randomPage = Math.floor(Math.random() * 1000) + 1;
            promises.push(
                client.get(`${endpoint}?page=${randomPage}`)
                .then(() => totalSuccess++)
                .catch(err => {
                    totalErrors++;
                    if (err.response && err.response.status === 429) total429++;
                    else if (err.code === 'ECONNABORTED') totalTimeouts++;
                })
            );
        }

        await Promise.all(promises);
        
        // Calcoliamo quanto tempo ci ha messo la batch
        const elapsed = Date.now() - startSec;
        // console.log(`[Sec ${second}/${durationSeconds}] Inviate ${reqPerSec} req. Completate in ${elapsed}ms`);
        
        // Aspetta il tempo residuo per far durare il ciclo esattamente 1 secondo
        if (elapsed < 1000) {
            await new Promise(r => setTimeout(r, 1000 - elapsed));
        }
    }

    console.log(`\n=== RISULTATO FINALE ${name} ===`);
    console.log(`- Successi Totali: ${totalSuccess}`);
    console.log(`- Fallimenti Totali: ${totalErrors}`);
    console.log(`  - 429 (Rate Limit): ${total429}`);
    console.log(`  - Timeouts: ${totalTimeouts}`);
}

async function run() {
    // TMDB a 50 req/sec per 60 secondi
    await runSustainedStressTest('TMDB', tmdbClient, '/discover/movie', 50, 60);
}

run();
