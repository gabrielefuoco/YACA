const { preWarmRedisFromMongo } = require('./preWarm');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let warmupInFlight = false;
let lastWarmupAt = 0;

function getWarmupStatus(now = Date.now()) {
    return {
        warmupInFlight,
        lastWarmupAt,
        cooldownMs: SIX_HOURS_MS,
        nextWarmupAt: lastWarmupAt > 0 ? lastWarmupAt + SIX_HOURS_MS : 0,
        remainingMs: lastWarmupAt > 0 ? Math.max(0, (lastWarmupAt + SIX_HOURS_MS) - now) : 0
    };
}

async function triggerWarmupIfStale(now = Date.now()) {
    if (warmupInFlight) {
        return { triggered: false, reason: 'in_flight', status: getWarmupStatus(now) };
    }

    const withinCooldown = lastWarmupAt > 0 && (now - lastWarmupAt) < SIX_HOURS_MS;
    if (withinCooldown) {
        return { triggered: false, reason: 'cooldown', status: getWarmupStatus(now) };
    }

    warmupInFlight = true;
    setImmediate(async () => {
        try {
            await preWarmRedisFromMongo();
            lastWarmupAt = Date.now();
        } catch (err) {
            console.error('[WarmupScheduler] Warmup failed:', err.message);
        } finally {
            warmupInFlight = false;
        }
    });

    return { triggered: true, reason: 'stale', status: getWarmupStatus(now) };
}

function __resetWarmupScheduler() {
    warmupInFlight = false;
    lastWarmupAt = 0;
}

module.exports = {
    SIX_HOURS_MS,
    getWarmupStatus,
    triggerWarmupIfStale,
    __resetWarmupScheduler
};

