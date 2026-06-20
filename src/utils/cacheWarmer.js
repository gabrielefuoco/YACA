const UserConfig = require('../models/UserConfig');
const UserAccount = require('../db/models/UserAccount');
const { catalogHandler } = require('../handlers/catalogHandler');
const { rateLimitedMap } = require('./rateLimiter');

let isWarmingUp = false;
let queueNext = false;

async function runCacheWarmer(hostUrl) {
    if (isWarmingUp) {
        queueNext = true;
        console.log('[CacheWarmer] Warmup already in progress. Queued next execution.');
        return;
    }
    
    isWarmingUp = true;
    queueNext = false;

    try {
        console.log('[CacheWarmer] Started sweeping all users...');
        const accounts = await UserAccount.find({}).lean();
        
        // Estraiamo tutti i cataloghi da processare
        const catalogTasks = [];
        for (const account of accounts) {
            const user = await UserConfig.resolveUserConfig(account.userId);
            if (!user) continue;
            const activeProfile = user.profiles?.find(p => p.id === user.activeProfileId);
            if (!activeProfile || !activeProfile.catalogs) continue;
            
            for (const cat of activeProfile.catalogs) {
                // Aggiungiamo sia movie che series. Il catalogHandler filtrerà o risponderà vuoto se non supportato.
                catalogTasks.push({ user, catalogId: cat.id, type: 'movie' });
                catalogTasks.push({ user, catalogId: cat.id, type: 'series' });
            }
        }

        console.log(`[CacheWarmer] Found ${catalogTasks.length} catalog permutations to check.`);

        // Eseguiamo il map lento. Se ci sono richieste utente, il Node event loop le servirà comunque tra un async e l'altro.
        // delayMs a 2000 per garantire che le operazioni siano dilazionate su un arco di tempo morbido.
        await rateLimitedMap(
            catalogTasks,
            async (task) => {
                try {
                    await catalogHandler(
                        { id: task.catalogId, type: task.type, extra: { warmupMode: true } }, 
                        task.user, 
                        hostUrl
                    );
                } catch (e) {
                    // Ignoriamo gli errori silenziosamente per non bloccare il ciclo, molti cataloghi potrebbero non avere il tipo richiesto
                }
            },
            { batchSize: 1, delayMs: 2000 }
        );

        console.log('[CacheWarmer] Sweeping completed.');
    } catch (e) {
        console.error('[CacheWarmer] Fatal error:', e);
    } finally {
        isWarmingUp = false;
        if (queueNext) {
            console.log('[CacheWarmer] A queued request was found. Starting again...');
            // Eseguiamo il prossimo in modo asincrono per evitare loop sincroni infiniti
            setTimeout(() => runCacheWarmer(hostUrl).catch(() => {}), 5000);
        }
    }
}

module.exports = { runCacheWarmer };
