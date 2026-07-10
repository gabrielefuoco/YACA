import { useState, useCallback } from 'react';

export type MatchmakerCard = {
    id: string;
    title: string;
    poster: string | null;
    year: string;
    overview: string;
    genre_ids: number[];
    type: 'movie' | 'series';
};

export type SwipeAction = 'like' | 'dislike' | 'watchlist';

export function useMatchmaker(userId: string | null, profileId: string | null) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [cards, setCards] = useState<MatchmakerCard[]>([]);
    const [swipesQueue, setSwipesQueue] = useState<{id: string, action: SwipeAction}[]>([]);
    const [iteration, setIteration] = useState(0);
    const [maxIterations, setMaxIterations] = useState(8);

    const initMatchmaker = useCallback(async (type: 'movie' | 'series' = 'movie', vibeOrRandom: string = 'random') => {
        if (!userId || !profileId) return;
        setIsLoading(true);
        setIsOpen(true);
        try {
            const res = await fetch(`/api/profiles/${profileId}/matchmaker/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, type, vibeOrRandom })
            });
            const data = await res.json();
            if (data.success) {
                setSessionId(data.sessionId);
                setCards(data.cards || []);
                setIteration(data.iteration);
                setMaxIterations(data.maxIterations);
                setSwipesQueue([]);
            }
        } catch (error) {
            console.error('Failed to init matchmaker', error);
        } finally {
            setIsLoading(false);
        }
    }, [userId, profileId]);

    const handleSwipe = useCallback(async (cardId: string, action: SwipeAction) => {
        if (!userId || !profileId) return;
        setCards(prev => prev.filter(c => c.id !== cardId));
        const newQueue = [...swipesQueue, { id: cardId, action }];
        setSwipesQueue(newQueue);

        // Analyze after 8 swipes or if running out of cards
        if (newQueue.length >= 8 && sessionId && iteration < maxIterations) {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/profiles/${profileId}/matchmaker/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, sessionId, swipes: newQueue })
                });
                const data = await res.json();
                if (data.success) {
                    if (data.endOfGame) {
                        setSessionId(null); // Force close
                    } else {
                        setCards(prev => [...prev, ...(data.cards || [])]);
                        setIteration(data.iteration);
                        setSwipesQueue([]);
                    }
                }
            } catch (error) {
                console.error('Analyze error', error);
            } finally {
                setIsLoading(false);
            }
        }
    }, [userId, profileId, sessionId, swipesQueue, iteration, maxIterations]);

    const closeAndSave = useCallback(async () => {
        if (!userId || !profileId || !sessionId) {
            setIsOpen(false);
            return;
        }
        setIsLoading(true);
        try {
            // Invio finish per flushare e chiudere
            const res = await fetch(`/api/profiles/${profileId}/matchmaker/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, sessionId, pendingSwipes: swipesQueue })
            });
            const data = await res.json();
            if (data.success) {
                console.log('Catalogo customMatchmaker salvato globalmente!');
                // Potremmo emettere un evento per far refreshare l'ExplorePanel
                window.dispatchEvent(new Event('yaca-custom-catalogs-updated'));
            }
        } catch (error) {
            console.error('Finish matchmaker error', error);
        } finally {
            setIsOpen(false);
            setSessionId(null);
            setCards([]);
            setSwipesQueue([]);
            setIsLoading(false);
        }
    }, [userId, profileId, sessionId, swipesQueue]);

    return {
        isOpen,
        isLoading,
        cards,
        iteration,
        maxIterations,
        initMatchmaker,
        handleSwipe,
        closeAndSave,
        setIsOpen
    };
}
