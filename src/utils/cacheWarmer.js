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
        
        const heroCatalogs = [
            { id: 'yaca_true_blend_movies', type: 'movie' },
            { id: 'yaca_true_blend_series', type: 'series' },
            { id: 'yaca_seed_network_movies', type: 'movie' },
            { id: 'yaca_seed_network_series', type: 'series' },
            { id: 'yaca_hidden_gems_movies', type: 'movie' },
            { id: 'yaca_hidden_gems_series', type: 'series' },
            { id: 'yaca_trakt_filtered_movies', type: 'movie' },
            { id: 'yaca_trakt_filtered_series', type: 'series' }
        ];

        // Estraiamo tutti i cataloghi da processare per tutti i profili di tutti gli utenti
        const catalogTasks = [];
        for (const account of accounts) {
            const user = await UserConfig.resolveUserConfig(account.userId);
            if (!user || !user.profiles) continue;
            
            for (const profile of user.profiles) {
                const selectedPresets = profile.raw_ui_state?.selectedPresets;
                const activeHeroCatalogs = Array.isArray(selectedPresets)
                    ? heroCatalogs.filter(c => selectedPresets.includes(c.id))
                    : heroCatalogs;

                for (const hero of activeHeroCatalogs) {
                    catalogTasks.push({
                        user,
                        profileId: profile.id,
                        catalogId: hero.id,
                        type: hero.type
                    });
                }

                if (profile.catalogs && Array.isArray(profile.catalogs)) {
                    for (const cat of profile.catalogs) {
                        if (cat.isActive !== false) {
                            catalogTasks.push({
                                user,
                                profileId: profile.id,
                                catalogId: cat.id,
                                type: cat.type === 'series' ? 'series' : 'movie'
                            });
                        }
                    }
                }
            }
        }

        console.log(`[CacheWarmer] Found ${catalogTasks.length} catalog permutations to check.`);

        // Eseguiamo il map lento. Se ci sono richieste utente, il Node event loop le servirà comunque tra un async e l'altro.
        // delayMs a 2000 per garantire che le operazioni siano dilazionate su un arco di tempo morbido.
        await rateLimitedMap(
            catalogTasks,
            async (task) => {
                try {
                    const taskUser = {
                        ...task.user,
                        activeProfileId: task.profileId
                    };
                    await catalogHandler(
                        { id: task.catalogId, type: task.type, extra: { warmupMode: true } }, 
                        taskUser, 
                        hostUrl
                    );
                } catch (e) {
                    // Ignoriamo gli errori silenziosamente per non bloccare il ciclo
                }
            },
            { batchSize: 1, delayMs: 200 }
        );

        console.log('[CacheWarmer] Sweeping completed.');

        // Eseguiamo il processamento della coda in background per gli streaming pendenti
        try {
            const { processPendingScans } = require('./queueProcessor');
            await processPendingScans(hostUrl);
        } catch (queueErr) {
            console.error('[CacheWarmer] Error running queueProcessor:', queueErr.message);
        }
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
