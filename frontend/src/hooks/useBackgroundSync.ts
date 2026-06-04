import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

const MAX_CONCURRENT = 5;
const DELAY_BETWEEN_BATCHES_MS = 10000; // 10s wait if queue is empty
const DELAY_BETWEEN_REQUESTS_MS = 250;  // 4 req/sec maximum to respect TMDB rate limits

export function useBackgroundSync(globalTmdbKey: string | undefined, userId: string | undefined) {
    const isRunningRef = useRef(false);

    useEffect(() => {
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

        const runCycle = async () => {
            if (!isMounted) return;

            try {
                // Fetch global queue of orphans
                const { queue } = await api.getGlobalSyncQueue(20);

                if (!queue || queue.length === 0) {
                    if (isMounted) setTimeout(runCycle, DELAY_BETWEEN_BATCHES_MS);
                    return;
                }

                // Process queue in chunks respecting concurrency limits
                for (let i = 0; i < queue.length && isMounted; i += MAX_CONCURRENT) {
                    const batch = queue.slice(i, i + MAX_CONCURRENT);

                    await Promise.allSettled(batch.map(async (item: any) => {
                        await sleep(Math.random() * DELAY_BETWEEN_REQUESTS_MS);
                        if (!isMounted) return; // double check after sleep
                        try {
                            const rawTMDB = await fetchTmdbDetails(item.id, item.type);
                            if (isMounted) {
                                await api.enrichSyncItem({
                                    tmdbId: item.id,
                                    type: item.type,
                                    rawTMDB,
                                    userId
                                });
                            }
                        } catch (err) {
                            console.error(`[BackgroundSync] Failed to process ${item.id}`, err);
                        }
                    }));
                    
                    if (isMounted) await sleep(DELAY_BETWEEN_REQUESTS_MS);
                }
            } catch (err) {
                console.error('[BackgroundSync] Queue error', err);
            }

            if (isMounted) {
                setTimeout(runCycle, DELAY_BETWEEN_BATCHES_MS);
            }
        };

        // Initial delay before starting the background work
        setTimeout(runCycle, 5000);

        return () => {
            isMounted = false;
            isRunningRef.current = false;
        };
    }, [globalTmdbKey, userId]);
}
