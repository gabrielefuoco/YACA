import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

export type MatchmakerCard = {
    id: string;
    title: string;
    poster: string | null;
    year: string;
    overview: string;
    genre_ids: number[];
    type: 'movie' | 'series' | 'anime' | 'question';
    is_question?: boolean;
    question_text?: string;
    question_options?: { label: string; genre_ids: number[] }[];
};

export type SwipeAction = 'like' | 'dislike' | 'watchlist' | 'answered';

export type SwipeItem = {
    id: string;
    action: SwipeAction;
    title: string;
    genre_ids: number[];
    question_text?: string;
    discarded_options?: string[];
};

export type MatchmakerPhase = 'choosing' | 'playing' | 'results';

export function useMatchmaker(userId: string | null, profileId: string | null) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [phase, setPhase] = useState<MatchmakerPhase>('choosing');
    
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [cards, setCards] = useState<MatchmakerCard[]>([]);
    const [swipesQueue, setSwipesQueue] = useState<SwipeItem[]>([]);
    const [matchedCards, setMatchedCards] = useState<MatchmakerCard[]>([]);
    
    const [iteration, setIteration] = useState(0);
    const [maxIterations, setMaxIterations] = useState(8);
    const isAnalyzingRef = useRef(false);

    const openMatchmaker = useCallback(() => {
        setPhase('choosing');
        setIsOpen(true);
        setSessionId(null);
        setCards([]);
        setSwipesQueue([]);
        setMatchedCards([]);
        setIteration(0);
        isAnalyzingRef.current = false;
    }, []);

    const initMatchmaker = useCallback(async (type: 'movie' | 'series' | 'anime' = 'movie', vibeOrRandom: string = 'random', initialGenres?: number[]) => {
        if (!userId || !profileId) return;
        setIsLoading(true);
        setPhase('playing');
        setMatchedCards([]);
        isAnalyzingRef.current = false;
        try {
            const res = await fetch(`/api/profiles/${profileId}/matchmaker/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, type, vibeOrRandom, initialGenres })
            });
            const data = await res.json();
            if (data.success) {
                setSessionId(data.sessionId);
                setCards(data.cards || []);
                setIteration(data.iteration);
                setMaxIterations(data.maxIterations);
                setSwipesQueue([]);
            } else {
                setPhase('choosing');
            }
        } catch (error) {
            console.error('Failed to init matchmaker', error);
            setPhase('choosing');
        } finally {
            setIsLoading(false);
        }
    }, [userId, profileId]);

    const handleSwipe = useCallback(async (cardId: string | null, action: SwipeAction, overrideTitle?: string, overrideGenres?: number[], questionText?: string, discardedOptions?: string[]) => {
        if (!userId || !profileId) return;
        
        const card = cardId ? cards.find(c => c.id === cardId) : null;
        if (!card && action !== 'steer') return;

        if (cardId) {
            setCards(prev => prev.filter(c => c.id !== cardId));
        }
        
        const newQueue = [...swipesQueue, { 
            id: cardId || 'steer', 
            action, 
            title: overrideTitle || card?.title || 'Steer', 
            genre_ids: overrideGenres || card?.genre_ids || [],
            question_text: questionText,
            discarded_options: discardedOptions
        }];
        setSwipesQueue(newQueue);

        if (action === 'like' || action === 'watchlist') {
            setMatchedCards(prev => [...prev, card]);
        }

        if (action === 'watchlist') {
            api.addToLibrary(profileId, userId, {
                id: `tmdb:${card.id}`,
                type: card.type,
                name: card.title,
                poster: card.poster
            }).catch(err => console.error('Library add failed:', err));
        }

        const remainingCards = cards.length - 1;

        // Analyze after 12 swipes, running out of cards, or explicit steering
        const shouldAnalyze = newQueue.length >= 12 || remainingCards <= 1 || action === 'answered' || action === 'steer';
        
        if (shouldAnalyze && sessionId) {
            if (isAnalyzingRef.current) return;
            isAnalyzingRef.current = true;
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
                        setPhase('results');
                    } else {
                        if (action === 'steer' || action === 'answered') {
                            setCards(data.cards || []);
                        } else {
                            setCards(prev => [...prev, ...(data.cards || [])]);
                        }
                        setIteration(data.iteration);
                        setSwipesQueue([]);
                    }
                }
            } catch (error) {
                console.error('Analyze error', error);
            } finally {
                setIsLoading(false);
                isAnalyzingRef.current = false;
            }
        } else if (remainingCards === 0) {
             setPhase('results'); // fallback (should rarely hit now)
        }

    }, [userId, profileId, sessionId, swipesQueue, iteration, cards]);

    const fetchTrailer = useCallback(async (type: 'movie' | 'series' | 'anime', id: string) => {
        if (!userId || !profileId) return null;
        try {
            const res = await fetch(`/api/profiles/${profileId}/matchmaker/trailer/${type}/${id}?userId=${userId}`);
            const data = await res.json();
            if (data.success && data.trailerUrl) {
                return data.trailerUrl;
            }
            return null;
        } catch (err) {
            console.error('[Matchmaker] Error fetching trailer:', err);
            return null;
        }
    }, [userId, profileId]);

    const transitionToResults = useCallback(() => {
        setPhase('results');
    }, []);

    const closeAndSave = useCallback(async (saveCatalog: boolean = true) => {
        if (!userId || !profileId || !sessionId) {
            setIsOpen(false);
            return;
        }
        
        if (!saveCatalog) {
            setIsOpen(false);
            setSessionId(null);
            setCards([]);
            setSwipesQueue([]);
            setMatchedCards([]);
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/profiles/${profileId}/matchmaker/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, sessionId, pendingSwipes: swipesQueue })
            });
            const data = await res.json();
            if (data.success) {
                console.log('Catalogo customMatchmaker salvato globalmente!');
                window.dispatchEvent(new Event('yaca-custom-catalogs-updated'));
            }
        } catch (error) {
            console.error('Finish matchmaker error', error);
        } finally {
            setIsOpen(false);
            setSessionId(null);
            setCards([]);
            setSwipesQueue([]);
            setMatchedCards([]);
            setIsLoading(false);
        }
    }, [userId, profileId, sessionId, swipesQueue]);

    return {
        isOpen,
        isLoading,
        phase,
        cards,
        matchedCards,
        iteration,
        maxIterations,
        openMatchmaker,
        initMatchmaker,
        handleSwipe,
        transitionToResults,
        fetchTrailer,
        closeAndSave,
        setIsOpen
    };
}
