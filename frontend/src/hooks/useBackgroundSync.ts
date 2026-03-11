import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

const MAX_CONCURRENT = 5;
const DELAY_BETWEEN_BATCHES_MS = 10000; // 10s wait if queue is empty
const DELAY_BETWEEN_REQUESTS_MS = 250;  // 4 req/sec maximum to respect TMDB rate limits

export function useBackgroundSync(globalTmdbKey: string | undefined, userId: string | undefined) {
    const isRunningRef = useRef(false);

    useEffect(() => {
        // We only contribute to the global network if the user has provided a personal TMDB key
        if (!globalTmdbKey || isRunningRef.current) return;

        let isMounted = true;
        isRunningRef.current = true;

        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        const fetchTmdbDetails = async (idStr: string, type: 'movie' | 'tv') => {
            const tmdbId = idStr.replace(/^tmdb:/, '');
            const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${globalTmdbKey}&append_to_response=credits,keywords`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
            return await res.json();
        };

        const processQueue = async () => {
            // Give the app some time to initialize before starting background work
            await sleep(5000); 

            while (isMounted) {
                try {
                    // Fetch global queue of orphans (Priority B)
                    // TODO: Once Phase 10 implements deep local sync, Priority A (Personal Delta) will go here.
                    const { queue } = await api.getGlobalSyncQueue(20);

                    if (!queue || queue.length === 0) {
                        await sleep(DELAY_BETWEEN_BATCHES_MS);
                        continue;
                    }

                    // Process queue in chunks respecting concurrency limits
                    let i = 0;
                    while (i < queue.length && isMounted) {
                        const batch = queue.slice(i, i + MAX_CONCURRENT);
                        i += MAX_CONCURRENT;

                        await Promise.allSettled(batch.map(async (item: any) => {
                            // Stagger requests slightly to avoid sudden bursts
                            await sleep(Math.random() * DELAY_BETWEEN_REQUESTS_MS);
                            try {
                                const rawTMDB = await fetchTmdbDetails(item.id, item.type);
                                await api.enrichSyncItem({
                                    tmdbId: item.id,
                                    type: item.type,
                                    rawTMDB,
                                    userId // Passing userId earns them immediate DNA credit
                                });
                            } catch (err) {
                                console.error(`[BackgroundSync] Failed to process ${item.id}`, err);
                            }
                        }));
                        
                        await sleep(DELAY_BETWEEN_REQUESTS_MS);
                    }

                } catch (err) {
                    console.error('[BackgroundSync] Queue error', err);
                    await sleep(DELAY_BETWEEN_BATCHES_MS);
                }
            }
        };

        processQueue();

        return () => {
            isMounted = false;
            isRunningRef.current = false;
        };
    }, [globalTmdbKey, userId]);
}
