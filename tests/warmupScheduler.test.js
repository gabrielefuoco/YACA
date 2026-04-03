describe('warmup scheduler semaphore', () => {
    let triggerWarmupIfStale;
    let __resetWarmupScheduler;
    let preWarmRedisFromMongo;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        jest.doMock('../src/cache/preWarm', () => ({
            preWarmRedisFromMongo: jest.fn().mockResolvedValue(undefined)
        }));

        ({ preWarmRedisFromMongo } = require('../src/cache/preWarm'));
        ({ triggerWarmupIfStale, __resetWarmupScheduler } = require('../src/cache/warmupScheduler'));
        __resetWarmupScheduler();
    });

    it('triggers warmup when stale', async () => {
        const out = await triggerWarmupIfStale(1_700_000_000_000);
        expect(out.triggered).toBe(true);
        expect(out.reason).toBe('stale');
        await new Promise(resolve => setImmediate(resolve));
        expect(preWarmRedisFromMongo).toHaveBeenCalledTimes(1);
    });

    it('skips trigger while warmup is already in flight', async () => {
        let release;
        preWarmRedisFromMongo.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));

        const first = await triggerWarmupIfStale(1_700_000_000_000);
        await new Promise(resolve => setImmediate(resolve));
        const second = await triggerWarmupIfStale(1_700_000_000_001);
        expect(first.triggered).toBe(true);
        expect(second.triggered).toBe(false);
        expect(second.reason).toBe('in_flight');

        release();
        await new Promise(resolve => setImmediate(resolve));
    });

    it('skips trigger within six-hour cooldown after a successful run', async () => {
        const t0 = 1_700_000_000_000;
        await triggerWarmupIfStale(t0);
        await new Promise(resolve => setImmediate(resolve));
        preWarmRedisFromMongo.mockClear();

        const out = await triggerWarmupIfStale(t0 + (60 * 60 * 1000)); // +1h
        expect(out.triggered).toBe(false);
        expect(out.reason).toBe('cooldown');
        expect(preWarmRedisFromMongo).not.toHaveBeenCalled();
    });

    it('re-triggers after six-hour cooldown window', async () => {
        const t0 = Date.now();
        await triggerWarmupIfStale(t0);
        await new Promise(resolve => setImmediate(resolve));
        preWarmRedisFromMongo.mockClear();

        const out = await triggerWarmupIfStale(t0 + (6 * 60 * 60 * 1000) + 1);
        expect(out.triggered).toBe(true);
        expect(out.reason).toBe('stale');
        await new Promise(resolve => setImmediate(resolve));
        expect(preWarmRedisFromMongo).toHaveBeenCalledTimes(1);
    });
});
