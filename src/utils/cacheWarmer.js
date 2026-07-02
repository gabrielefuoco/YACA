const UserConfig = require('../models/UserConfig');
const UserAccount = require('../db/models/UserAccount');
const { catalogHandler } = require('../handlers/catalogHandler');
const { rateLimitedMap } = require('./rateLimiter');

// La coda dei task andati in errore nel ciclo precedente
let retryQueue = [];
let isWarmingUp = false;

/**
 * Determina il livello di priorità di un catalogo (1 = Alta, 3 = Bassa).
 */
function getCatalogPriority(catalogId, isUserInstalled) {
    if (catalogId.includes('simulcast') || catalogId.includes('new_episodes') || catalogId.includes('airing')) {
        return 1; // Tier 1: Uscite giornaliere
    }
    if (isUserInstalled) {
        return 2; // Tier 2: Cataloghi utente
    }
    return 3; // Tier 3: Esplora generale
}

/**
 * Genera l'elenco massivo di tutti i cataloghi e le loro pagine da scaldare.
 */
async function buildTaskQueue() {
    const catalogTasks = [];
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

    for (const account of accounts) {
        const user = await UserConfig.resolveUserConfig(account.userId);
        if (!user || !user.profiles) continue;
        
        for (const profile of user.profiles) {
            // 1. Processa gli Hero Catalogs (Tier 3) -> fino a pagina 2 (skip: 0, 20)
            const selectedPresets = profile.raw_ui_state?.selectedPresets;
            const activeHeroCatalogs = Array.isArray(selectedPresets)
                ? heroCatalogs.filter(c => selectedPresets.includes(c.id))
                : heroCatalogs;

            for (const hero of activeHeroCatalogs) {
                const priority = getCatalogPriority(hero.id, false);
                const maxPages = priority === 1 ? 6 : 2; // Se un hero è stranamente tier1 (es airing), spingiamo a 6
                for (let page = 0; page < maxPages; page++) {
                    catalogTasks.push({
                        user,
                        profileId: profile.id,
                        catalogId: hero.id,
                        type: hero.type,
                        skip: page * 20,
                        priority,
                        retryCount: 0
                    });
                }
            }

            // 2. Processa i cataloghi utente (Tier 1 & Tier 2) -> fino a pagina 6 (skip: 0..100)
            if (profile.catalogs && Array.isArray(profile.catalogs)) {
                for (const cat of profile.catalogs) {
                    if (cat.isActive !== false) {
                        const priority = getCatalogPriority(cat.id, true);
                        const maxPages = 6;
                        for (let page = 0; page < maxPages; page++) {
                            catalogTasks.push({
                                user,
                                profileId: profile.id,
                                catalogId: cat.id,
                                type: cat.type === 'series' ? 'series' : 'movie',
                                skip: page * 20,
                                priority,
                                retryCount: 0
                            });
                        }
                    }
                }
            }
        }
    }

    // Ordina per priorità crescente (1 = prima, 3 = dopo)
    catalogTasks.sort((a, b) => a.priority - b.priority);
    return catalogTasks;
}

/**
 * Loop Principale Asincrono e Continuo
 */
async function runCacheWarmerDaemon(hostUrl) {
    if (isWarmingUp) return;
    isWarmingUp = true;

    try {
        console.log('[CacheWarmer] Starting Daemon Sweep Cycle...');
        
        // Costruisci la nuova coda base
        const newQueue = await buildTaskQueue();
        
        // Prependi la coda dei retry (hanno priorità assoluta)
        const executionQueue = [...retryQueue, ...newQueue];
        retryQueue = []; // Svuotata. Eventuali fallimenti in questo ciclo riempiranno la coda per il prossimo.

        console.log(`[CacheWarmer] Daemon executing ${executionQueue.length} catalog permutations (including retries).`);

        await rateLimitedMap(
            executionQueue,
            async (task) => {
                try {
                    const taskUser = {
                        ...task.user,
                        activeProfileId: task.profileId
                    };
                    await catalogHandler(
                        { 
                            id: task.catalogId, 
                            type: task.type, 
                            extra: { warmupMode: true, skip: task.skip } 
                        }, 
                        taskUser, 
                        hostUrl
                    );
                } catch (e) {
                    // Accoda per retry se non ha superato i 3 tentativi
                    if (task.retryCount < 3) {
                        task.retryCount++;
                        retryQueue.push(task);
                    }
                }
            },
            { batchSize: 1, delayMs: 250 } // Rate Limit molto gentile (4 fetch al sec) per salvaguardare TMDB
        );

        console.log('[CacheWarmer] Sweep Cycle Completed.');

        // Eseguiamo il processamento della coda video in background per gli streaming pendenti
        try {
            const { processPendingScans } = require('./queueProcessor');
            await processPendingScans(hostUrl);
        } catch (queueErr) {
            console.error('[CacheWarmer] Error running queueProcessor:', queueErr.message);
        }
    } catch (e) {
        console.error('[CacheWarmer] Fatal error in daemon:', e);
    } finally {
        isWarmingUp = false;
        
        // Loop perpetuo: Riavvia il demone dopo un minuscolo breath-delay (1 secondo)
        setTimeout(() => runCacheWarmerDaemon(hostUrl).catch(() => {}), 1000);
    }
}

// Manteniamo il nome per retrocompatibilità in giro
module.exports = { runCacheWarmer: runCacheWarmerDaemon };
